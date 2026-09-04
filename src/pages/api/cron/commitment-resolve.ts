// Cron: resolve Engagement commitments whose window has closed.
// Bearer CRON_SECRET (mirrors internal-alert-sweep.ts). Deterministic only — no AI.
// Idempotent: loads only status in ('open','pending') with a closed window, so
// resolved/expired/cancelled are never re-processed; a no-op pending is skipped.
import type { APIRoute } from "astro";
import { makeBQClient } from "../../../lib/bq";
import { readMergeWrite, type CommitmentRow } from "../../../lib/commitments/actionCommitments";
import { resolveCommitment } from "../../../lib/commitments/commitmentResolve";
import { sendSlack, loadChannelConfig } from "../../../lib/channels/internalSend";
import { readDispositifChannel } from "../../../lib/channels/slackRouting";
import { verdictMessageFr } from "../../../lib/channels/slackMessagesFr";

export const prerender = false;
const BQ_PROJECT = "muse-square-open-data";
const CRON_SECRET = process.env.CRON_SECRET || "";

const flat = (v: any): any => (v && typeof v === "object" && "value" in v ? v.value : v);
function normalise(r: any): CommitmentRow {
  const out: any = {};
  for (const k of Object.keys(r)) out[k] = flat(r[k]);
  return out as CommitmentRow;
}

export const GET: APIRoute = async ({ request }) => {
  const authHeader = request.headers.get("authorization");
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
      status: 401, headers: { "content-type": "application/json" },
    });
  }

  const now = new Date().toISOString();
  const results: any[] = [];
  try {
    const bq = makeBQClient(process.env.BQ_PROJECT_ID || BQ_PROJECT);

    // Latest snapshot per commitment, still resolvable, window closed (Paris grain).
    const [rows] = await bq.query({
      query: `
        SELECT * EXCEPT(rn) FROM (
          SELECT *, ROW_NUMBER() OVER (
            PARTITION BY commitment_id ORDER BY updated_at DESC, CASE WHEN status IN ('resolved', 'cancelled') THEN 1 ELSE 0 END DESC, (verdict IS NOT NULL) DESC, created_at DESC
          ) AS rn
          FROM \`${BQ_PROJECT}.analytics.action_commitments\`
        )
        WHERE rn = 1
          AND status IN ('open', 'pending')
          AND window_end < CURRENT_DATE('Europe/Paris')
      `,
      location: "EU",
    });

    for (const raw of rows || []) {
      const snap = normalise(raw);
      try {
        const { patch, note } = await resolveCommitment(bq, snap, now);

        // Skip a no-op pending re-write (same status, same coverage) — keeps the
        // log from growing a pending row every run.
        if (patch.status === "pending" && snap.status === "pending" &&
            patch.window_days_resolved === snap.window_days_resolved) {
          continue;
        }

        // expired gets its own transition_type so expiries are findable in the
        // log; pending/resolved both use 'resolved' (the resolution writer).
        // NOTE: expired is terminal — a venue uploading sales after the 30-day
        // grace will NOT re-resolve; grace is the only knob.
        await readMergeWrite(bq, {
          commitmentId: snap.commitment_id,
          transitionType: patch.status === "expired" ? "expired" : "resolved",
          patch,
        });
        results.push({ commitment_id: snap.commitment_id, outcome: patch.status, verdict: patch.verdict ?? null, note });

        // ── Inc 8 (G3, mots owner 28/08) : le verdict se dit dans Slack — canal du
        // dispositif d'abord, sinon canal par défaut du compte, sinon rien (dit dans le
        // résultat). Écart € = réel − résultat habituel de la fenêtre (les deux champs
        // de la résolution). Non bloquant : un échec d'envoi ne touche pas la résolution.
        if (patch.status === "resolved" && patch.verdict) {
          try {
            const ch = snap.dispositif_id
              ? await readDispositifChannel(bq, String(snap.location_id), String(snap.dispositif_id)).catch(() => null)
              : null;
            const cfg: any = await loadChannelConfig(bq, String(snap.user_id), String(snap.location_id), "slack").catch(() => ({}));
            const channel = ch || String(cfg?.default_channel || "").trim() || null;
            if (channel) {
              const gap = (patch.window_actual_revenue != null && patch.window_expected_revenue != null)
                ? Number(patch.window_actual_revenue) - Number(patch.window_expected_revenue) : null;
              const msg = verdictMessageFr({
                actionText: String(snap.committed_action_text || ""), verdict: String(patch.verdict),
                windowStart: String(snap.window_start || ""), windowEnd: String(snap.window_end || ""),
                gapEur: gap, commitmentId: snap.commitment_id, locationId: String(snap.location_id),
              });
              const r = await sendSlack(cfg, { title: msg.title, body: msg.body, recipient: channel, blocks: msg.blocks });
              (results[results.length - 1] as any).verdict_slack = r.ok === true;
            } else {
              (results[results.length - 1] as any).verdict_slack = "aucun canal";
            }
          } catch (e: any) {
            (results[results.length - 1] as any).verdict_slack = "erreur: " + String(e?.message || e).slice(0, 60);
          }
        }
      } catch (e: any) {
        // One bad commitment must not sink the sweep; it retries next run.
        results.push({ commitment_id: snap.commitment_id, error: e?.message || "resolve error" });
      }
    }

    return new Response(JSON.stringify({ ok: true, processed: results.length, results }), {
      status: 200, headers: { "content-type": "application/json" },
    });
  } catch (err: any) {
    console.error("[commitment-resolve] Error:", err);
    return new Response(JSON.stringify({ ok: false, error: err?.message || "Unknown error" }), {
      status: 500, headers: { "content-type": "application/json" },
    });
  }
};
