// Cron: détecteur des 3 sous-performances — vue équipe inc 8, G4 (règle owner 28/08 :
// « trois mauvaises journées dans la même semaine ; mauvaise = nettement sous votre
// résultat habituel, pas une petite variation ; une notification par semaine et par
// dispositif »). Bearer CRON_SECRET (motif commitment-resolve). Quotidien.
//
// Périmètre v1 : les opérations EN COURS mesurées sur le CA du site
// (measured_metric='revenue_residual') — « nettement » = residual_z <= -1, la bande de
// bruit du lieu, le même seuil que le reste de l'app (semantic.vw_insight_event_day_residual,
// consommateur existant : goal_context). Les dispositifs à métrique FAMILLE sont exclus
// v1 : il n'existe pas de bande de bruit par famille et par jour — on n'invente pas un
// seuil. Semaine = lundi→hier (Europe/Paris), jamais le jour en cours (journée partielle).
// Idempotence : trace analytics.card_forwards kind='underperf3' (dispositif_id =
// commitment_id) — une ligne cette semaine → pas de renvoi.
import type { APIRoute } from "astro";
import { makeBQClient } from "../../../lib/bq";
import { sendSlack, loadChannelConfig } from "../../../lib/channels/internalSend";
import { readDispositifChannel, traceForward } from "../../../lib/channels/slackRouting";
import { underperfMessageFr } from "../../../lib/channels/slackMessagesFr";

export const prerender = false;
const BQ_PROJECT = "muse-square-open-data";
const CRON_SECRET = process.env.CRON_SECRET || "";
const flat = (v: any): any => (v && typeof v === "object" && "value" in v ? v.value : v);

export const GET: APIRoute = async ({ request }) => {
  const authHeader = request.headers.get("authorization");
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
      status: 401, headers: { "content-type": "application/json" },
    });
  }
  const results: any[] = [];
  try {
    const bq = makeBQClient(process.env.BQ_PROJECT_ID || BQ_PROJECT);

    // UNE requête : opérations candidates × leurs mauvaises journées de la semaine,
    // moins celles déjà notifiées cette semaine. Lundi = DATE_TRUNC(..., WEEK(MONDAY)).
    const [rows] = await bq.query({
      query: `
        WITH latest AS (
          SELECT * EXCEPT(rn) FROM (
            SELECT commitment_id, user_id, location_id, status, measured_metric,
                   committed_action_text, dispositif_id, window_start, window_end, updated_at,
                   ROW_NUMBER() OVER (PARTITION BY commitment_id ORDER BY updated_at DESC) AS rn
            FROM \`${BQ_PROJECT}.analytics.action_commitments\`
          ) WHERE rn = 1
        ),
        candidates AS (
          SELECT * FROM latest
          WHERE status = 'open' AND measured_metric = 'revenue_residual'
            AND window_start <= DATE_SUB(CURRENT_DATE('Europe/Paris'), INTERVAL 1 DAY)
            AND window_end >= DATE_TRUNC(CURRENT_DATE('Europe/Paris'), WEEK(MONDAY))
        ),
        bad_days AS (
          SELECT c.commitment_id, r.date, r.daily_revenue, r.expected_revenue
          FROM candidates c
          JOIN \`${BQ_PROJECT}.semantic.vw_insight_event_day_residual\` r
            ON r.location_id = c.location_id
           AND r.date >= GREATEST(DATE_TRUNC(CURRENT_DATE('Europe/Paris'), WEEK(MONDAY)), c.window_start)
           AND r.date <= LEAST(DATE_SUB(CURRENT_DATE('Europe/Paris'), INTERVAL 1 DAY), c.window_end)
          WHERE r.residual_z <= -1
        ),
        already AS (
          SELECT DISTINCT dispositif_id AS commitment_id
          FROM \`${BQ_PROJECT}.analytics.card_forwards\`
          WHERE kind = 'underperf3'
            AND DATE(sent_at, 'Europe/Paris') >= DATE_TRUNC(CURRENT_DATE('Europe/Paris'), WEEK(MONDAY))
        )
        SELECT c.commitment_id, c.user_id, c.location_id, c.committed_action_text, c.dispositif_id,
               ARRAY_AGG(CAST(b.date AS STRING) ORDER BY b.date) AS days,
               ROUND(SUM(b.daily_revenue - b.expected_revenue), 0) AS gap_eur
        FROM candidates c
        JOIN bad_days b USING (commitment_id)
        WHERE c.commitment_id NOT IN (SELECT commitment_id FROM already)
        GROUP BY 1, 2, 3, 4, 5
        HAVING COUNT(*) >= 3
      `,
      location: "EU",
    });

    for (const raw of rows || []) {
      const r: any = {}; for (const k of Object.keys(raw)) r[k] = flat((raw as any)[k]);
      try {
        const ch = r.dispositif_id
          ? await readDispositifChannel(bq, String(r.location_id), String(r.dispositif_id)).catch(() => null)
          : null;
        const cfg: any = await loadChannelConfig(bq, String(r.user_id), String(r.location_id), "slack").catch(() => ({}));
        const channel = ch || String(cfg?.default_channel || "").trim() || null;
        if (!channel) { results.push({ commitment_id: r.commitment_id, sent: "aucun canal" }); continue; }
        const days: string[] = (r.days || []).map(String).slice(0, 3);
        const msg = underperfMessageFr({
          actionText: String(r.committed_action_text || ""), days,
          gapEur: r.gap_eur != null ? Number(r.gap_eur) : null,
          commitmentId: String(r.commitment_id), locationId: String(r.location_id),
        });
        const s = await sendSlack(cfg, { title: msg.title, body: msg.body, recipient: channel, blocks: msg.blocks });
        await traceForward(bq, {
          location_id: String(r.location_id), user_id: String(r.user_id), kind: "underperf3",
          action_type: null, affected_date: days[days.length - 1] || null,
          dispositif_id: String(r.commitment_id), slack_channel: channel, sent_ok: s.ok === true,
        }).catch(() => { /* trace non bloquante */ });
        results.push({ commitment_id: r.commitment_id, sent: s.ok === true, n_bad_days: (r.days || []).length });
      } catch (e: any) {
        results.push({ commitment_id: r.commitment_id, error: String(e?.message || e).slice(0, 100) });
      }
    }

    return new Response(JSON.stringify({ ok: true, processed: results.length, results }), {
      status: 200, headers: { "content-type": "application/json" },
    });
  } catch (err: any) {
    console.error("[underperf-watch] Error:", err);
    return new Response(JSON.stringify({ ok: false, error: err?.message || "Unknown error" }), {
      status: 500, headers: { "content-type": "application/json" },
    });
  }
};
