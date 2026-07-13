// Cron: resolve Engagement commitments whose window has closed.
// Bearer CRON_SECRET (mirrors internal-alert-sweep.ts). Deterministic only — no AI.
// Idempotent: loads only status in ('open','pending') with a closed window, so
// resolved/expired/cancelled are never re-processed; a no-op pending is skipped.
import type { APIRoute } from "astro";
import { makeBQClient } from "../../../lib/bq";
import { readMergeWrite, type CommitmentRow } from "../../../lib/actionCommitments";
import { resolveCommitment } from "../../../lib/commitmentResolve";

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
            PARTITION BY commitment_id ORDER BY updated_at DESC
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
