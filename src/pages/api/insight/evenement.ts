// GET /api/insight/evenement — la page dossier d'événement (spec docs/evenement-dossier-spec.md).
// Incrément 2b : `?create_context=1` sert le FORMULAIRE de création (types par MÉTIER du lieu,
// attendu par jour de semaine — le référentiel de la cible à deux lignes —, familles produits
// pour le KPI famille). Le dossier (`?saved_item_id=`) arrive à l'incrément 3 (provider
// evenementFamily) — d'ici là : found:false honnête.
import type { APIRoute } from "astro";
import { makeBQClient } from "../../../lib/bq";
import { requireLocationOwnership } from "../../../lib/requireLocationOwnership";
import { eventTypesFor } from "../../../lib/eventTypes";

const PROJECT = "muse-square-open-data";
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

export const GET: APIRoute = async ({ url, locals }) => {
  try {
    const location_id = String(url.searchParams.get("location_id") || "").trim();
    if (!location_id) return json(400, { ok: false, error: "location_id requis" });
    requireLocationOwnership(locals, location_id);
    const bq = makeBQClient(process.env.BQ_PROJECT_ID || PROJECT);

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

    return json(200, { ok: true, found: false, reason: "Dossier d'événement : incrément 3 (provider evenementFamily) — à venir." });
  } catch (err: any) {
    const forbidden = /FORBIDDEN/.test(String(err?.message || ""));
    return json(forbidden ? 403 : 500, { ok: false, error: err?.message || "Erreur" });
  }
};
