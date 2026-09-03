// GET /api/insight/evenement — la page dossier d'événement (spec docs/evenement-dossier-spec.md).
// Incrément 2b : `?create_context=1` sert le FORMULAIRE de création (types par MÉTIER du lieu,
// attendu par jour de semaine — le référentiel de la cible à deux lignes —, familles produits
// pour le KPI famille). `?list=1` : la LISTE des événements du lieu — premier consommateur de
// `semantic.vw_insight_event_user_events` (annexe de la spec : la vue naît avec lui).
// Le dossier (`?saved_item_id=`) : provider evenementFamily.
import type { APIRoute } from "astro";
import { makeBQClient } from "../../../lib/bq";
import { measureKpiCoverage, listSiteFamilies } from "../../../lib/kpiRegistry";
import { listPoles } from "../../../lib/poleReading";
import { requireLocationOwnership } from "../../../lib/requireLocationOwnership";
import { eventTypesFor, eventTypeLabelFr } from "../../../lib/eventTypes";
import { dispositifTypesFor, dispositifRolesFor } from "../../../lib/dispositifTypes";
import { evenementFamily } from "../../../lib/insightFamilies/evenement";
import { getDeclaredFamilyMargins, getDeclaredMarginPct, familySlug } from "../../../lib/ai/corrections";

const PROJECT = "muse-square-open-data";
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

export const GET: APIRoute = async ({ url, locals }) => {
  try {
    const location_id = String(url.searchParams.get("location_id") || "").trim();
    if (!location_id) return json(400, { ok: false, error: "location_id requis" });
    requireLocationOwnership(locals, location_id);
    const bq = makeBQClient(process.env.BQ_PROJECT_ID || PROJECT);

    // « Reprendre la consigne d'un autre événement » (automatisation inc. 7) : les consignes
    // déjà écrites sur ce lieu — réutiliser plutôt que réécrire.
    if (url.searchParams.get("consignes")) {
      const flat = (v: any): any => (v && typeof v === "object" && "value" in v ? v.value : v);
      const [rows] = await bq.query({
        query: `SELECT saved_item_id, title, consigne_store_info, consigne_arrival
                FROM \`${PROJECT}.raw.saved_items\`
                WHERE location_id = @location_id AND consigne_store_info IS NOT NULL
                ORDER BY updated_at DESC LIMIT 10`,
        params: { location_id }, location: "EU",
      });
      return json(200, { ok: true, consignes: (rows as any[]).map((r: any) => ({
        saved_item_id: String(flat(r.saved_item_id)), title: String(flat(r.title) ?? ""),
        consigne_store_info: String(flat(r.consigne_store_info) ?? ""),
        consigne_arrival: flat(r.consigne_arrival) != null ? String(flat(r.consigne_arrival)) : null,
      })) });
    }

    if (url.searchParams.get("create_context")) {
      // Lectures indépendantes — un seul lot parallèle (budget perf). Marges déclarées (24/08) :
      // débloque le KPI profit estimé du formulaire ; famille d'abord, globale en repli.
      const [[profRows], [dowRows], [famRows], [covRows], [poleRows], famMargins, globalMargin] = await Promise.all([
        bq.query({
          query: `SELECT company_activity_type FROM \`${PROJECT}.raw.insight_event_user_location_profile\`
                  WHERE location_id = @location_id LIMIT 1`,
          params: { location_id }, location: "EU",
        }),
        // L'attendu par jour de semaine = le modèle résiduel lui-même (90 j) — le même
        // référentiel que M'engager, jamais une moyenne réinventée.
        bq.query({
          query: `SELECT EXTRACT(DAYOFWEEK FROM date) AS dw, ROUND(AVG(expected_revenue), 0) AS expected_eur, COUNT(*) AS n
                  FROM \`${PROJECT}.semantic.vw_insight_event_day_residual\`
                  WHERE location_id = @location_id AND date >= DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY)
                  GROUP BY dw`,
          params: { location_id }, location: "EU",
        }),
        // Familles produits (KPI famille) : LE foyer kpiRegistry.listSiteFamilies (extrait le
        // 27/08 — même lecture que le résolveur d'entités, jamais recopiée).
        listSiteFamilies(bq, location_id).then((f) => [f] as any),
        // Couverture flux/conversion (27/08, audit menu KPI) : le menu n'offre un KPI que si le
        // SITE porte la donnée — même mécanisme que le KPI famille (fams.length). La lecture vit
        // dans kpiRegistry (measureKpiCoverage : foyer du mart PERF, cliquet frontière respecté).
        // Aujourd'hui : 1 site sur 6 (ff2aeb35, capteur, 125 j couverts) — le jour où
        // daily_visitors arrive ailleurs, les options apparaissent sans une ligne.
        measureKpiCoverage(bq, location_id).then((r) => [[r]]),
        // Pôles du site (héritage KPI pôle→opération) : LE foyer poleReading.listPoles.
        listPoles(bq, location_id).then((pl) => [pl] as any),
        getDeclaredFamilyMargins(location_id).catch(() => []),
        getDeclaredMarginPct(location_id).catch(() => null),
      ]);
      const flat = (v: any): any => (v && typeof v === "object" && "value" in v ? v.value : v);
      const industry = profRows?.[0] ? String(flat(profRows[0].company_activity_type) ?? "") || null : null;
      // BigQuery DAYOFWEEK : 1=dimanche … 7=samedi → 0-6 façon getUTCDay pour le client.
      const DOW_FR = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
      const dow_baseline = (dowRows as any[]).map((r) => {
        const dw0 = Number(flat(r.dw)) - 1;
        return { dow: dw0, label_fr: DOW_FR[dw0] || "", expected_eur: Number(flat(r.expected_eur) ?? 0), n_days: Number(flat(r.n) ?? 0) };
      }).sort((a, b) => a.dow - b.dow);
      const _cov: any = covRows?.[0] ?? {};
      // Profit estimé (K9, 24/08) : disponible si au moins une marge est déclarée. La moyenne
      // journalière = Σ avg_day famille × marge (familles déclarées, jointure par slug) — ou
      // avg_day total × marge globale — le référentiel de la cible du formulaire.
      // famRows vient du foyer listSiteFamilies ({category, avg_day_eur}), jamais recopié.
      const pctBySlug: Record<string, number> = {};
      for (const m of famMargins as Array<{ slug: string; pct: number }>) pctBySlug[m.slug] = m.pct;
      let profitAvgDay: number | null = null;
      if ((famMargins as any[]).length) {
        profitAvgDay = Math.round((famRows as any[]).reduce((a, f) => {
          const pct = pctBySlug[familySlug(f.category)];
          return pct != null ? a + f.avg_day_eur * (pct / 100) : a;
        }, 0));
      } else if (globalMargin) {
        profitAvgDay = Math.round((famRows as any[]).reduce((a, f) => a + f.avg_day_eur, 0) * ((globalMargin as any).pct / 100)) || null;
      }
      return json(200, {
        ok: true,
        industry_code: industry,
        kpi_available: {
          visitors: Number(_cov.visitors_days ?? 0) >= 30,
          conversion: Number(_cov.conversion_days ?? 0) >= 30,
        },
        event_types: eventTypesFor(industry),
        // Types de COMPOSANT proposés au formulaire de pôle (03/09, registre dispositifTypes) —
        // curatés par métier. Les libellés SANS mot owner (`provisoire`) ne sont PAS servis : le
        // lexique interdit de rendre un mot non arbitré ; ils apparaîtront quand le mot existera.
        component_types: dispositifTypesFor(industry)
          .filter((o) => !o.provisoire)
          .map((o) => ({
            value: o.value, label_fr: o.label_fr,
            roles: dispositifRolesFor(o.value).filter((r) => !r.provisoire).map((r) => ({ value: r.value, label_fr: r.label_fr })),
          })),
        dow_baseline,
        families: famRows as any[],
        poles: poleRows as any[],
        profit_estimated: {
          available: (famMargins as any[]).length > 0 || Boolean(globalMargin),
          avg_day_eur: profitAvgDay,
        },
      });
    }

    if (url.searchParams.get("list")) {
      // La liste du lieu — la vue (grain saved_item) + la prochaine occurrence à venir.
      const [rows] = await bq.query({
        query: `SELECT v.saved_item_id, v.title, v.event_type, v.recurrence, v.n_occurrences,
                       CAST(v.first_date AS STRING) AS first_date, CAST(v.last_date AS STRING) AS last_date,
                       CAST(v.selected_date AS STRING) AS selected_date,
                       v.kpi, v.kpi_family, v.kpi_target_pct, v.kpi_target_eur, v.author_person_name,
                       v.n_resolved, v.n_beat, v.sum_gap_eur,
                       CAST(nx.next_date AS STRING) AS next_date
                FROM \`${PROJECT}.semantic.vw_insight_event_user_events\` v
                LEFT JOIN (
                  SELECT saved_item_id, MIN(date) AS next_date
                  FROM \`${PROJECT}.raw.saved_item_dates\`
                  WHERE date >= CURRENT_DATE() GROUP BY 1
                ) nx ON nx.saved_item_id = v.saved_item_id
                WHERE v.location_id = @location_id
                ORDER BY (nx.next_date IS NULL), nx.next_date, v.last_date DESC
                LIMIT 100`,
        params: { location_id }, location: "EU",
      });
      const flat = (v: any): any => (v && typeof v === "object" && "value" in v ? v.value : v);
      const num = (v: any): number | null => (flat(v) == null ? null : Number(flat(v)));
      return json(200, {
        ok: true,
        events: (rows as any[]).map((r) => ({
          saved_item_id: String(flat(r.saved_item_id)),
          title: String(flat(r.title) ?? ""),
          event_type: flat(r.event_type) != null ? String(flat(r.event_type)) : null,
          type_label_fr: flat(r.event_type) != null ? eventTypeLabelFr(String(flat(r.event_type))) : null,
          recurring: flat(r.recurrence) != null && String(flat(r.recurrence)) !== "none",
          n_occurrences: num(r.n_occurrences),
          first_date: flat(r.first_date), last_date: flat(r.last_date),
          selected_date: flat(r.selected_date), next_date: flat(r.next_date),
          kpi: flat(r.kpi) != null ? String(flat(r.kpi)) : null,
          kpi_family: flat(r.kpi_family) != null ? String(flat(r.kpi_family)) : null,
          kpi_target_pct: num(r.kpi_target_pct), kpi_target_eur: num(r.kpi_target_eur),
          author_person_name: flat(r.author_person_name) != null ? String(flat(r.author_person_name)) : null,
          n_resolved: num(r.n_resolved), n_beat: num(r.n_beat), sum_gap_eur: num(r.sum_gap_eur),
        })),
      });
    }

    const saved_item_id = String(url.searchParams.get("saved_item_id") || "").trim();
    if (!saved_item_id) return json(400, { ok: false, error: "saved_item_id, list ou create_context requis" });
    const result = await evenementFamily(bq, location_id, saved_item_id);
    return json(200, { ok: true, ...result.data });
  } catch (err: any) {
    const forbidden = /FORBIDDEN/.test(String(err?.message || ""));
    return json(forbidden ? 403 : 500, { ok: false, error: err?.message || "Erreur" });
  }
};
