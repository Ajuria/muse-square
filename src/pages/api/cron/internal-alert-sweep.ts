import type { APIRoute } from "astro";
import { makeBQClient } from "../../../lib/bq";
import { sendSlack, sendEmail } from "../../../lib/channels/internalSend";
import { V1_ALERT_ACTION_TYPES } from "../../../lib/internalAlertCards";

export const prerender = false;

const BQ_PROJECT = "muse-square-open-data";
const CRON_SECRET = process.env.CRON_SECRET || "";

// v1 internal-alert allowlist (the 5 performance RULE cards) is the single source of truth in
// src/lib/internalAlertCards.ts, shared with the arm endpoint's Barrier 2 so it can never
// drift. Match on action_type only, never action_category.

// ── direct render (no generate-action-draft on the v1 rail) ──
// headline_fr is already a complete human sentence; append a compact, action_type-agnostic
// dump of the first-party numeric payload. location_id is dropped as noise.
function renderInternalBody(headlineFr: string, payloadJson: string): string {
  const lines: string[] = [headlineFr || ""];
  try {
    const p = JSON.parse(payloadJson || "{}");
    const detail = Object.keys(p)
      .filter((k) => k !== "location_id" && p[k] !== null && p[k] !== undefined)
      .map((k) => {
        let v: any = p[k];
        if (typeof v === "number") v = Number.isInteger(v) ? String(v) : v.toFixed(1);
        return "- " + k + " : " + v;
      });
    if (detail.length) {
      lines.push("");
      lines.push("Détails :");
      for (const d of detail) lines.push(d);
    }
  } catch {}
  return lines.join("\n");
}

// mirror of publish.ts channel-config load (analytics.channel_configs). Reading tokens is not
// a leak surface; the send primitives live in the sealed internalSend.ts, not here.
async function loadChannelConfig(bq: any, userId: string, locationId: string, channel: string): Promise<any> {
  // Owner 19/07 : config niveau COMPTE — site d'abord, sinon compte (aligné sur config.ts GET).
  const [rows] = await bq.query({
    query: `
      SELECT config_json
      FROM \`${BQ_PROJECT}.analytics.channel_configs\`
      WHERE user_id = @userId AND channel = @channel AND enabled = TRUE
      ORDER BY (location_id = @locationId) DESC, updated_at DESC
      LIMIT 1
    `,
    params: { userId, locationId, channel },
    location: "EU",
  });
  let config: any = {};
  if (rows?.[0]) { try { config = JSON.parse(rows[0].config_json || "{}"); } catch {} }
  return config;
}

// note_interne sink — direct INSERT into saved_drafts (cron-safe; the HTTP save-draft endpoint
// requires a Clerk session and would 401 from cron). Same table/shape as save-draft.ts.
async function writeInternalNote(
  bq: any,
  args: { userId: string; locationId: string; actionType: string; title: string; body: string; recipient: string; today: string },
): Promise<{ ok: boolean; error?: string }> {
  try {
    await bq.query({
      query: `
        INSERT INTO \`${BQ_PROJECT}.analytics.saved_drafts\` (
          draft_id, user_id, location_id, signal_type, channel,
          card_what, card_sowhat, affected_date, severity,
          title, body, hashtags, recipient,
          original_ai_text, user_instruction,
          status, artifact_mode,
          created_at, updated_at
        ) VALUES (
          @draft_id, @user_id, @location_id, @signal_type, 'note_interne',
          @card_what, '', SAFE.PARSE_DATE('%Y-%m-%d', NULLIF(@affected_date, '')), '',
          @title, @body, '', @recipient,
          @body, 'internal_alert',
          'active', 'post',
          CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP()
        )
      `,
      params: {
        draft_id: crypto.randomUUID(),
        user_id: args.userId,
        location_id: args.locationId,
        signal_type: args.actionType,
        card_what: args.actionType,
        affected_date: args.today,
        title: args.title,
        body: args.body,
        recipient: args.recipient,
      },
      location: "EU",
    });
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || "saved_drafts insert error" };
  }
}

export const GET: APIRoute = async ({ request }) => {
  const authHeader = request.headers.get("authorization");
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), { status: 401, headers: { "content-type": "application/json" } });
  }

  // Date derivation is inherited verbatim from daily-dispatch (server/UTC). If the mart date
  // grain is Europe/Paris, both crons share the same near-midnight off-by-one — a joint
  // pre-existing fix, intentionally not patched here.
  const now = new Date();
  const todayYmd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const results: any[] = [];

  try {
    const bq = makeBQClient(process.env.BQ_PROJECT_ID || BQ_PROJECT);

    // 1. Enabled internal-alert rules. Dedup to the latest row per (location_id, action_type,
    //    channel) FIRST, then filter enabled — never the reverse (a re-enable-then-disable must
    //    not mis-fire). channel is part of the arm identity.
    const [rules] = await bq.query({
      query: `
        SELECT rule_id, user_id, location_id, action_type, channel, recipient, frequency, threshold_pct, message
        FROM (
          SELECT *, ROW_NUMBER() OVER (PARTITION BY location_id, action_type, channel ORDER BY updated_at DESC) AS rn
          FROM \`${BQ_PROJECT}.analytics.internal_alert_rules\`
        )
        WHERE rn = 1 AND enabled = TRUE
        ORDER BY user_id, location_id
      `,
      location: "EU",
    });

    if (!rules || rules.length === 0) {
      return new Response(JSON.stringify({ ok: true, dispatched: 0, message: "No active internal-alert rules" }), { status: 200, headers: { "content-type": "application/json" } });
    }

    // 2. Group rules by user|location
    const byLocation = new Map<string, any[]>();
    for (const rule of rules) {
      const key = `${rule.user_id}|${rule.location_id}`;
      if (!byLocation.has(key)) byLocation.set(key, []);
      byLocation.get(key)!.push(rule);
    }

    for (const [key, locationRules] of byLocation) {
      const [userId, locationId] = key.split("|");

      // 3. Today's RULE-card rows for this location, restricted to the 5-set. Explicit DATE()
      //    cast on the DATE column (BQ silently returns 0 rows on DATE/STRING mismatch).
      const [candidates] = await bq.query({
        query: `
          SELECT action_type, headline_fr, CAST(data_payload AS STRING) AS data_payload_json
          FROM \`${BQ_PROJECT}.mart.fct_location_daily_action_candidates\`
          WHERE location_id = @locationId
            AND date = DATE(@today)
            AND action_type IN UNNEST(@allowed)
        `,
        params: { locationId, today: todayYmd, allowed: V1_ALERT_ACTION_TYPES },
        location: "EU",
      });

      if (!candidates || candidates.length === 0) continue;

      const byType = new Map<string, any>();
      for (const c of candidates) byType.set(String(c.action_type), c);

      // 4. Match on action_type only.
      for (const rule of locationRules) {
        const cand = byType.get(String(rule.action_type));
        if (!cand) continue;

        // 4b. Threshold gate — if the user tuned a threshold, fire only when the
        //     signal's magnitude meets it (|residual_pct| for the residual cards).
        //     No threshold set = fire on any occurrence (legacy behaviour).
        if (rule.threshold_pct != null) {
          let metricPct: number | null = null;
          try {
            const p = JSON.parse(String(cand.data_payload_json || "{}"));
            if (p.residual_pct != null) metricPct = Math.abs(Number(p.residual_pct));
          } catch {}
          if (metricPct == null || metricPct < Number(rule.threshold_pct)) continue;
        }

        // 5. first_occurrence dedup — skip if already alerted today for this exact arm
        //    (location_id, action_type, channel). Marker is written on successful send only.
        if (!rule.frequency || rule.frequency === "first_occurrence") {
          const [existing] = await bq.query({
            query: `
              SELECT 1 FROM \`${BQ_PROJECT}.analytics.action_log\`
              WHERE location_id = @locationId
                AND action_key = 'internal_alert'
                AND action_type = @actionType
                AND channel = @channel
                AND affected_date = DATE(@today)
              LIMIT 1
            `,
            params: { locationId, actionType: rule.action_type, channel: rule.channel, today: todayYmd },
            location: "EU",
          });
          if (existing && existing.length > 0) continue;
        }

        // 6. Body — the user's saved notification message if present, else the
        //    direct auto-render from headline + payload.
        const title = String(cand.headline_fr || rule.action_type);
        const body = (rule.message && String(rule.message).trim())
          ? String(rule.message)
          : renderInternalBody(String(cand.headline_fr || ""), String(cand.data_payload_json || "{}"));

        // 7. Deliver on the internal channel — sealed sinks only, never publish.
        let sendResult: { ok: boolean; error?: string };
        if (rule.channel === "note_interne") {
          sendResult = await writeInternalNote(bq, { userId, locationId, actionType: rule.action_type, title, body, recipient: rule.recipient, today: todayYmd });
        } else if (rule.channel === "slack") {
          const config = await loadChannelConfig(bq, userId, locationId, "slack");
          sendResult = await sendSlack(config, { title, body, recipient: rule.recipient });
        } else if (rule.channel === "email") {
          const config = await loadChannelConfig(bq, userId, locationId, "email");
          sendResult = await sendEmail(config, { title, body, recipient: rule.recipient });
        } else {
          // Barrier 3 prevents this at write-time; defensive skip.
          continue;
        }

        // 8. Log to action_log on success only — this row is also the first_occurrence marker,
        //    so logging only on success lets a failed send retry on the next run.
        if (sendResult.ok) {
          try {
            const logTable = bq.dataset("analytics").table("action_log");
            await logTable.insert([{
              log_id: crypto.randomUUID(),
              user_id: userId,
              location_id: locationId,
              action_key: "internal_alert",
              event: "internal_alert",
              action_type: rule.action_type,
              change_subtype: rule.action_type,
              channel: rule.channel,
              affected_date: todayYmd,
              action_category: "internal_alert",
              action_text: title.substring(0, 100),
              created_at: new Date().toISOString(),
            }]);
          } catch {}
        }

        results.push({
          rule_id: rule.rule_id,
          location_id: locationId,
          action_type: rule.action_type,
          channel: rule.channel,
          ok: sendResult.ok,
          error: sendResult.ok ? undefined : sendResult.error,
        });
      }
    }

    return new Response(JSON.stringify({ ok: true, dispatched: results.length, results }), { status: 200, headers: { "content-type": "application/json" } });
  } catch (err: any) {
    console.error("[internal-alert-sweep] Error:", err);
    return new Response(JSON.stringify({ ok: false, error: err?.message || "Unknown error" }), { status: 500, headers: { "content-type": "application/json" } });
  }
};
