// src/pages/api/cron/day-class-impacts.ts
//
// Nightly batch of the day-class registry (incrément 1 validé 24/07 — spec :
// docs/enjeu-day-class-registry.md + docs/kpi-enjeu-mapping.md).
// ONE statement: CREATE OR REPLACE TABLE analytics.day_class_impacts AS <raw aggregates for ALL
// locations × classes (météo 5 + competition_high + tourism_high terciles)>. RAW ONLY — the policy
// (gates, tiers, €/an, négatif-only) lives in lib/dayClassRegistry.rowsToImpacts and is applied at
// read time by monitor.ts, so a gate change never needs a re-run here.
// Auth: Bearer CRON_SECRET, soft (mirrors commitment-resolve.ts). Schedule: external pinger
// (cron.org — owner registers), daily. Deterministic, no AI, idempotent (full rebuild).
import "dotenv/config";
import type { APIRoute } from "astro";
import { makeBQClient } from "../../../lib/bq";
import { waitUntil } from "@vercel/functions";
import { dayClassAggregateSql, catchmentHypothesisSql, DAY_CLASS_STORE, CATCHMENT_HYP_STORE } from "../../../lib/dayClassRegistry";

export const prerender = false;

const CRON_SECRET = process.env.CRON_SECRET || "";

// Le pinger externe (offre gratuite) raccroche à 30 s ; la reconstruction complète (store +
// catchment + historique) dépasse. Réponse immédiate, travail gardé vivant par waitUntil
// (motif maison sync-besttime) — la santé réelle se lit dans computed_at du store.
export const GET: APIRoute = async ({ request }) => {
  const authHeader = request.headers.get("authorization") || "";
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
      status: 401, headers: { "content-type": "application/json" },
    });
  }
  waitUntil(runDayClassBatch().catch((e) => console.error("[day-class-impacts] background error:", e?.message)));
  return new Response(JSON.stringify({ ok: true, status: "started" }), {
    status: 200, headers: { "content-type": "application/json" },
  });
};

async function runDayClassBatch(): Promise<void> {
  const projectId = String(process.env.BQ_PROJECT_ID || "muse-square-open-data").trim();
  const bq = makeBQClient(projectId);

  try {
    const t0 = Date.now();
    await bq.query({
      query: `CREATE OR REPLACE TABLE \`${projectId}.${DAY_CLASS_STORE}\` AS ${dayClassAggregateSql(false)}`,
      location: "EU",
    });
    // Temps 2 du périmètre (01/08) : jours mesurables par hypothèse ('commune' 1 km / 'beyond'
    // 20 km), TABLE SÉPARÉE du store des pilules (voir CATCHMENT_HYP_STORE dans le lib pour le
    // pourquoi). Affiché sous les deux boutons de l'étape 1 « M'engager » — jamais codé en dur.
    await bq.query({
      query: `CREATE OR REPLACE TABLE \`${projectId}.${CATCHMENT_HYP_STORE}\` AS ${catchmentHypothesisSql(false)}`,
      location: "EU",
    });
    // HISTORIQUE (préalable de l'état « Résolu », validé 26/07) : le store est un snapshot ÉCRASÉ
    // chaque nuit — sans archive, aucun motif ne peut jamais être constaté « disparu ». Append
    // idempotent du batch du jour (delete-insert sur batch_date, partitionné). Schéma EXPLICITE
    // (jamais SELECT *) pour survivre aux évolutions du store.
    await bq.query({
      query: `CREATE TABLE IF NOT EXISTS \`${projectId}.analytics.day_class_impacts_history\` (
        batch_date DATE, location_id STRING, class_key STRING, family STRING, basis STRING,
        n_days INT64, avg_gap_eur FLOAT64, sd_gap_eur FLOAT64, span_days INT64, computed_at TIMESTAMP,
        med_gap_eur FLOAT64, n_log INT64, avg_log FLOAT64, sd_log FLOAT64
      ) PARTITION BY batch_date`,
      location: "EU",
    });
    // Régime log+médiane (01/08) : la table d'historique préexistante n'a pas les 4 colonnes —
    // CREATE IF NOT EXISTS ne modifie JAMAIS un schéma existant, d'où l'ALTER idempotent.
    await bq.query({
      query: `ALTER TABLE \`${projectId}.analytics.day_class_impacts_history\`
        ADD COLUMN IF NOT EXISTS med_gap_eur FLOAT64,
        ADD COLUMN IF NOT EXISTS n_log INT64,
        ADD COLUMN IF NOT EXISTS avg_log FLOAT64,
        ADD COLUMN IF NOT EXISTS sd_log FLOAT64`,
      location: "EU",
    });
    await bq.query({
      query: `DELETE FROM \`${projectId}.analytics.day_class_impacts_history\` WHERE batch_date = CURRENT_DATE('Europe/Paris')`,
      location: "EU",
    });
    await bq.query({
      query: `INSERT INTO \`${projectId}.analytics.day_class_impacts_history\`
        (batch_date, location_id, class_key, family, basis, n_days, avg_gap_eur, sd_gap_eur, span_days, computed_at, med_gap_eur, n_log, avg_log, sd_log)
        SELECT CURRENT_DATE('Europe/Paris'), location_id, class_key, family, basis, n_days, avg_gap_eur, sd_gap_eur, span_days, computed_at, med_gap_eur, n_log, avg_log, sd_log
        FROM \`${projectId}.${DAY_CLASS_STORE}\``,
      location: "EU",
    });

    const [countRows] = await bq.query({
      // NB: `rows` est un mot RÉSERVÉ BigQuery — d'où n_rows (500 prod du 24/07 au premier test).
      query: `SELECT COUNT(*) AS n_rows, COUNT(DISTINCT location_id) AS locations FROM \`${projectId}.${DAY_CLASS_STORE}\``,
      location: "EU",
    });
    const stats = (countRows as any[])[0] || {};
    console.log(`[day-class-impacts] rebuilt: ${stats.n_rows} rows / ${stats.locations} locations in ${Date.now() - t0}ms`);
  } catch (err: any) {
    console.error("[day-class-impacts]", err?.message);
    throw err;
  }
}
