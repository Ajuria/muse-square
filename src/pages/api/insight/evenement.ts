// GET /api/insight/evenement — la page dossier d'événement (spec docs/evenement-dossier-spec.md).
// Incrément 2b : `?create_context=1` sert le FORMULAIRE de création (types par MÉTIER du lieu,
// attendu par jour de semaine — le référentiel de la cible à deux lignes —, familles produits
// pour le KPI famille). `?list=1` : la LISTE des événements du lieu — premier consommateur de
// `semantic.vw_insight_event_user_events` (annexe de la spec : la vue naît avec lui).
// Le dossier (`?saved_item_id=`) : provider evenementFamily.
import type { APIRoute } from "astro";
import { makeBQClient } from "../../../lib/bq";
import { requireLocationOwnership } from "../../../lib/requireLocationOwnership";
import { eventTypesFor, eventTypeLabelFr } from "../../../lib/eventTypes";
import { evenementFamily } from "../../../lib/insightFamilies/evenement";

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
      // Trois lectures indépendantes — un seul lot parallèle (budget perf).
      const [[profRows], [dowRows], [famRows]] = await Promise.all([
        bq.query({
          query: `SELECT company_activity_type FROM \`${PROJECT}.raw.insight_event_user_location_profile\`
                  WHERE location_id = @location_id LIMIT 1`,
          params: { location_id }, location: "EU",
        }),
        // L'attendu par jour de semaine = le modèle résiduel lui-même (90 j) — le même
        // référentiel que M'engager, jamais une moyenne réinventée.
        bq.query({
          query: `SELECT EXTRACT(DAYOFWEEK FROM date) AS dw, ROUND(AVG(expected_revenue), 0) AS expected_eur, COUNT(*) AS n
                  FROM \`${PROJECT}.mart.fct_client_day_residual\`
                  WHERE location_id = @location_id AND date >= DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY)
                  GROUP BY dw`,
          params: { location_id }, location: "EU",
        }),
        // Familles produits (KPI famille) : même référentiel que les movers — CA total de la
        // famille / jours de vente du lieu.
        bq.query({
          query: `WITH td AS (SELECT COUNT(DISTINCT transaction_date) AS n FROM \`${PROJECT}.raw.client_transactions\` WHERE location_id = @location_id)
                  SELECT item_category, ROUND(SUM(revenue) / (SELECT n FROM td), 0) AS avg_day_eur
                  FROM \`${PROJECT}.raw.client_transactions\`
                  WHERE location_id = @location_id AND item_category IS NOT NULL
                  GROUP BY 1 ORDER BY 2 DESC LIMIT 12`,
          params: { location_id }, location: "EU",
        }),
      ]);
      const flat = (v: any): any => (v && typeof v === "object" && "value" in v ? v.value : v);
      const industry = profRows?.[0] ? String(flat(profRows[0].company_activity_type) ?? "") || null : null;
      // BigQuery DAYOFWEEK : 1=dimanche … 7=samedi → 0-6 façon getUTCDay pour le client.
      const DOW_FR = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
      const dow_baseline = (dowRows as any[]).map((r) => {
        const dw0 = Number(flat(r.dw)) - 1;
        return { dow: dw0, label_fr: DOW_FR[dw0] || "", expected_eur: Number(flat(r.expected_eur) ?? 0), n_days: Number(flat(r.n) ?? 0) };
      }).sort((a, b) => a.dow - b.dow);
      return json(200, {
        ok: true,
        industry_code: industry,
        event_types: eventTypesFor(industry),
        dow_baseline,
        families: (famRows as any[]).map((r) => ({ category: String(flat(r.item_category)), avg_day_eur: Number(flat(r.avg_day_eur) ?? 0) })),
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
