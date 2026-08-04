// GET /api/cron/event-occurrences — l'engagement de mesure + le snapshot de CHAQUE occurrence
// d'événement, à l'approche (spec docs/evenement-dossier-spec.md § 1.3 : « créé par le cron à
// J-7 de chaque occurrence, jamais 52 d'un coup »). Quotidien via cron-job.org (Bearer
// CRON_SECRET, patron daily.ts).
//
// IDEMPOTENT par construction :
//  - fenêtre GLISSANTE [aujourd'hui, J+7] (rattrape un jour sauté) ;
//  - un engagement n'est créé QUE s'il n'en existe aucun pour (saved_item_id, occurrence)
//    — la clé window_start ancrée ;
//  - un snapshot n'est posé QUE s'il n'en existe aucun pour (saved_item_id, occurrence) ; si la
//    date est hors horizon de la surface, l'INSERT..SELECT n'insère rien → retenté demain.
// Héritage de SÉRIE : seuil, texte d'action, responsable et measured_metric du PREMIER
// engagement de la série (même saved_item_id) — cohérence garantie ; repli : dérivation depuis
// les champs kpi de l'événement (kpiKeyForEventKpi + kpi_target_pct, défaut 10 %).
// Échec SOFT par occurrence : une erreur n'arrête ni les autres occurrences ni le cron.
import type { APIRoute } from "astro";
import crypto from "node:crypto";
import { makeBQClient } from "../../../lib/bq";
import { readMergeWrite, type CommitmentRow } from "../../../lib/actionCommitments";
import { kpiKeyForEventKpi, measureKpiBaseline, measureFamilyBaseline, isKpiMeasurable } from "../../../lib/kpiRegistry";

const PROJECT = "muse-square-open-data";
const flat = (v: any): any => (v && typeof v === "object" && "value" in v ? v.value : v);
const ymd = (d: Date) => d.toISOString().slice(0, 10);

export const GET: APIRoute = async ({ request }) => {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), { status: 401 });
  }
  const bq = makeBQClient(process.env.BQ_PROJECT_ID || PROJECT);
  const today = ymd(new Date());
  const horizon = ymd(new Date(Date.now() + 7 * 86_400_000));

  // Occurrences à venir (récurrents : toutes les dates ; ponctuels : la date CHOISIE seule),
  // avec l'état d'idempotence (engagement ? snapshot ?) en agrégats joints — une requête.
  const [rows] = await bq.query({
    query: `
      WITH occ AS (
        SELECT si.saved_item_id, si.location_id, si.clerk_user_id, si.title, si.description,
               si.event_type, si.kpi, si.kpi_family, si.kpi_target_pct, si.author_person_name,
               CAST(d.date AS STRING) AS occ_date
        FROM \`${PROJECT}.raw.saved_items\` si
        JOIN \`${PROJECT}.raw.saved_item_dates\` d
          ON d.saved_item_id = si.saved_item_id AND d.location_id = si.location_id
        WHERE d.date BETWEEN @today AND @horizon
          AND (COALESCE(si.recurrence, 'none') != 'none' OR si.selected_date = d.date)
      ),
      com AS (
        SELECT saved_item_id, CAST(window_start AS STRING) AS occ_date, COUNT(*) AS n
        FROM \`${PROJECT}.analytics.action_commitments\`
        WHERE saved_item_id IS NOT NULL GROUP BY 1, 2
      ),
      snap AS (
        SELECT saved_item_id, CAST(selected_date AS STRING) AS occ_date, COUNT(*) AS n
        FROM \`${PROJECT}.raw.saved_item_snapshots\` GROUP BY 1, 2
      ),
      first_com AS (
        SELECT saved_item_id, threshold_level, threshold_basis, threshold_value,
               committed_action_text, owner_person_name, measured_metric
        FROM (
          SELECT *, ROW_NUMBER() OVER (PARTITION BY saved_item_id ORDER BY created_at ASC) AS rn
          FROM \`${PROJECT}.analytics.action_commitments\` WHERE saved_item_id IS NOT NULL
        ) WHERE rn = 1
      )
      SELECT o.*, COALESCE(c.n, 0) AS n_com, COALESCE(s.n, 0) AS n_snap,
             f.threshold_level AS f_level, f.threshold_basis AS f_basis, f.threshold_value AS f_value,
             f.committed_action_text AS f_text, f.owner_person_name AS f_owner, f.measured_metric AS f_metric
      FROM occ o
      LEFT JOIN com c ON c.saved_item_id = o.saved_item_id AND c.occ_date = o.occ_date
      LEFT JOIN snap s ON s.saved_item_id = o.saved_item_id AND s.occ_date = o.occ_date
      LEFT JOIN first_com f ON f.saved_item_id = o.saved_item_id
      ORDER BY o.occ_date
      LIMIT 200`,
    params: { today: bq.date(today), horizon: bq.date(horizon) }, location: "EU",
  });

  let created = 0, snapshots = 0;
  const details: string[] = [];
  const CAP = 50;

  for (const r of rows as any[]) {
    const sid = String(flat(r.saved_item_id));
    const loc = String(flat(r.location_id));
    const occ = String(flat(r.occ_date));
    try {
      // ── Engagement de l'occurrence (si absent, plafond CAP par passage) ──
      if (Number(flat(r.n_com)) === 0 && created < CAP) {
        const metric = (flat(r.f_metric) != null ? String(flat(r.f_metric)) : null)
          || kpiKeyForEventKpi(flat(r.kpi) as any) || "revenue_residual";
        const thresholdValue = flat(r.f_value) != null ? Number(flat(r.f_value))
          : Math.max(1, Math.min(100, Math.round(Number(flat(r.kpi_target_pct) ?? 10)) || 10));
        let kpiBaseline: number | null = null;
        try {
          if (metric === "family_revenue" && flat(r.kpi_family) != null) {
            kpiBaseline = await measureFamilyBaseline(bq, loc, String(flat(r.kpi_family)), occ);
          } else if (metric !== "revenue_residual" && isKpiMeasurable(metric as any)) {
            kpiBaseline = await measureKpiBaseline(bq, loc, metric as any, occ);
          }
        } catch { kpiBaseline = null; }
        const patch: Partial<CommitmentRow> = {
          user_id: String(flat(r.clerk_user_id)),
          location_id: loc,
          status: "open",
          verdict: null,
          origin_kind: "event_occurrence",
          origin_action_type: `event_${String(flat(r.event_type) || "autre")}`,
          origin_driver: null,
          origin_factor: null,
          origin_suppression_key: null,
          origin_card_instance_id: null,
          origin_affected_date: occ,
          saved_item_id: sid,
          measured_metric: metric,
          window_kind: "day_of",
          window_start: occ,
          window_end: occ,
          window_days_expected: 1,
          threshold_level: flat(r.f_level) != null ? String(flat(r.f_level)) : "custom",
          threshold_basis: flat(r.f_basis) != null ? String(flat(r.f_basis)) : "pct",
          threshold_value: thresholdValue,
          committed_action_text: flat(r.f_text) != null ? String(flat(r.f_text))
            : `${String(flat(r.title) || "Événement")}${flat(r.description) ? " — " + String(flat(r.description)) : ""}`,
          owner_person_name: flat(r.f_owner) != null ? String(flat(r.f_owner)) : (flat(r.author_person_name) != null ? String(flat(r.author_person_name)) : "—"),
          owner_person_id: null,
          kpi_baseline: kpiBaseline,
        };
        await readMergeWrite(bq, { commitmentId: crypto.randomUUID(), transitionType: "created", create: true, patch });
        created += 1;
        details.push(`commitment ${sid.slice(0, 8)}@${occ}`);
      }
      // ── Snapshot de l'occurrence (gel de contexte ; no-op si surface hors horizon) ──
      if (Number(flat(r.n_snap)) === 0) {
        const [job] = await bq.query({
          query: `INSERT INTO \`${PROJECT}.raw.saved_item_snapshots\`
                  SELECT @sid, @loc, @cid, PARSE_DATE('%F', @occ), CURRENT_TIMESTAMP(),
                         SAFE_CAST(opportunity_score_final_local AS FLOAT64), opportunity_regime,
                         lvl_rain, lvl_wind, lvl_snow, lvl_heat, lvl_cold,
                         alert_level_max, delta_att_events_pct,
                         -- La colonne snapshot s'appelle delta_att_mobility_car_pct ; la vue a
                         -- renommé la mesure delta_ops_mobility_car_pct (bug latent attrapé par
                         -- ce cron le 04/08 — le snapshot.ts legacy échouait en silence).
                         delta_ops_mobility_car_pct,
                         is_forced_regime_c_flag, primary_score_driver_label, weather_label_fr,
                         competition_presence_flag, events_within_5km_count, CAST(NULL AS STRING)  -- mobility_status_region : colonne disparue de la vue (04/08) — NULL honnête, jamais un substitut
                  FROM \`${PROJECT}.semantic.vw_insight_event_day_surface\`
                  WHERE location_id = @loc AND date = PARSE_DATE('%F', @occ)
                  LIMIT 1`,
          params: { sid, loc, cid: String(flat(r.clerk_user_id)), occ }, location: "EU",
        });
        void job;
        snapshots += 1;
      }
    } catch (e: any) {
      details.push(`ERREUR ${sid.slice(0, 8)}@${occ}: ${String(e?.message || e).slice(0, 120)}`);
    }
  }

  return new Response(JSON.stringify({ ok: true, window: [today, horizon], scanned: (rows as any[]).length, created, snapshots_attempted: snapshots, details }), {
    status: 200, headers: { "content-type": "application/json" },
  });
};
