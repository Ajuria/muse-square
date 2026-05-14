import type { APIRoute } from "astro";
import { makeBQClient } from "../../../lib/bq";

export const prerender = false;

const BQ_PROJECT = "muse-square-open-data";
const CRON_SECRET = process.env.CRON_SECRET || "";

export const GET: APIRoute = async ({ request, url }) => {
  // Verify cron secret (Vercel sends Authorization header)
  const authHeader = request.headers.get("authorization");
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), { status: 401, headers: { "content-type": "application/json" } });
  }

  const now = new Date();
  const todayYmd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const results: any[] = [];

  try {
    const bq = makeBQClient(process.env.BQ_PROJECT_ID || BQ_PROJECT);

    // 1. Get all enabled automation rules
    const [rules] = await bq.query({
      query: `
        SELECT rule_id, user_id, location_id, member_id, signal_category, channel, recipient, require_approval, frequency
        FROM (
          SELECT *, ROW_NUMBER() OVER (PARTITION BY rule_id ORDER BY updated_at DESC) AS rn
          FROM \`${BQ_PROJECT}.analytics.automation_rules\`
        )
        WHERE rn = 1 AND enabled = TRUE
        ORDER BY user_id, location_id
      `,
      location: "EU",
    });

    if (!rules || rules.length === 0) {
      return new Response(JSON.stringify({ ok: true, dispatched: 0, message: "No active rules" }), { status: 200, headers: { "content-type": "application/json" } });
    }

    // 2. Group rules by location
    const byLocation = new Map<string, any[]>();
    for (const rule of rules) {
      const key = `${rule.user_id}|${rule.location_id}`;
      if (!byLocation.has(key)) byLocation.set(key, []);
      byLocation.get(key)!.push(rule);
    }

    // 3. For each location, fetch today's signals
    for (const [key, locationRules] of byLocation) {
      const [userId, locationId] = key.split("|");

      const [signals] = await bq.query({
        query: `
          SELECT change_subtype, change_category, alert_level, affected_date,
                 old_value, new_value, event_label, distance_m, mobility_mode,
                 lvl_rain, lvl_wind, lvl_snow, lvl_heat, lvl_cold, score_delta
          FROM \`${BQ_PROJECT}.semantic.vw_insight_event_change_feed\`
          WHERE location_id = @locationId
            AND affected_date = DATE(@today)
            AND alert_level >= 2
          ORDER BY alert_level DESC
          LIMIT 20
        `,
        params: { locationId, today: todayYmd },
        location: "EU",
      });

      if (!signals || signals.length === 0) continue;

      // 4. Map change_subtype to signal_category
      const CATEGORY_MAP: Record<string, string> = {
        weather_worsened: "weather", weather_improved: "weather", weather_hazard_onset: "weather",
        competitor_event_launch: "competition", competitor_audience_conflict: "competition",
        competition_pressure_spike: "competition", competitor_event_ending: "competition",
        mobility_disruption: "mobility", mobility_disruption_planned: "mobility",
        score_up: "opportunity", score_down: "opportunity", calendar_audience_shift: "calendar",
        mega_event_activation: "competition", mega_event_end: "competition",
        competitor_review_surge: "competition", competitor_review_drop: "competition",
        competitor_hours_change: "competition", competitor_new_offering: "competition",
        competitor_sold_out: "competition", competitor_content_spike: "competition",
        competitor_content_silent: "competition", institution_campaign_detected: "competition",
        media_mention_detected: "competition",
      };

      // 5. Match signals to rules
      for (const rule of locationRules) {
        const matchingSignals = signals.filter((s: any) => {
          const cat = CATEGORY_MAP[String(s.change_subtype || "").toLowerCase()] || "";
          return cat === rule.signal_category;
        });

        if (matchingSignals.length === 0) continue;

        // Frequency check: first_occurrence = only if no dispatch today for this rule
        if (rule.frequency === "first_occurrence") {
          const [existing] = await bq.query({
            query: `
              SELECT 1 FROM \`${BQ_PROJECT}.analytics.action_log\`
              WHERE location_id = @locationId
                AND action_key = 'auto_dispatch'
                AND JSON_VALUE(metadata, '$.rule_id') = @ruleId
                AND DATE(created_at) = DATE(@today)
              LIMIT 1
            `,
            params: { locationId, ruleId: rule.rule_id, today: todayYmd },
            location: "EU",
          });
          if (existing && existing.length > 0) continue;
        }

        // 6. Generate draft
        const topSignal = matchingSignals[0];
        const signalJson = {
          change_subtype: topSignal.change_subtype,
          event_label: topSignal.event_label || null,
          distance_m: topSignal.distance_m != null ? Number(topSignal.distance_m) : null,
          mobility_mode: topSignal.mobility_mode || null,
          affected_date: todayYmd,
          old_value: topSignal.old_value != null ? String(topSignal.old_value) : null,
          new_value: topSignal.new_value != null ? String(topSignal.new_value) : null,
          lvl_rain: Number(topSignal.lvl_rain || 0),
          lvl_wind: Number(topSignal.lvl_wind || 0),
          lvl_snow: Number(topSignal.lvl_snow || 0),
          lvl_heat: Number(topSignal.lvl_heat || 0),
          lvl_cold: Number(topSignal.lvl_cold || 0),
          score_delta: topSignal.score_delta != null ? Number(topSignal.score_delta) : null,
        };

        const baseUrl = url.origin;
        let draftRes;
        try {
          draftRes = await fetch(`${baseUrl}/api/insight/generate-action-draft`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              action_key: "draft",
              channel: rule.channel,
              change_subtype: topSignal.change_subtype,
              signal: signalJson,
              card_what: String(topSignal.change_subtype),
              card_sowhat: "",
            }),
          });
        } catch (e) { continue; }

        const draftJson = await draftRes.json().catch(() => null);
        if (!draftJson?.ok || !draftJson?.draft) continue;

        const draft = draftJson.draft;

        // 7. Publish or notify
        if (!rule.require_approval) {
          // Auto-publish
          try {
            const pubRes = await fetch(`${baseUrl}/api/channels/publish`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                channel: rule.channel,
                location_id: locationId,
                title: draft.title || "",
                body: draft.body || draft.full_text || "",
                hashtags: draft.hashtags || "",
                recipient: rule.recipient,
                signal_type: topSignal.change_subtype,
                affected_date: todayYmd,
              }),
            });
            const pubJson = await pubRes.json().catch(() => null);
            results.push({
              rule_id: rule.rule_id,
              location_id: locationId,
              signal: topSignal.change_subtype,
              action: "published",
              success: pubJson?.ok || false,
            });
          } catch (e) {
            results.push({ rule_id: rule.rule_id, action: "publish_error" });
          }
        } else {
          // Save draft for approval
          try {
            await fetch(`${baseUrl}/api/analytics/save-draft`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                location_id: locationId,
                signal_type: topSignal.change_subtype,
                channel: rule.channel,
                card_what: String(topSignal.change_subtype),
                card_sowhat: "",
                affected_date: todayYmd,
                severity: "",
                title: draft.title || "",
                body: draft.body || draft.full_text || "",
                hashtags: draft.hashtags || "",
                recipient: rule.recipient,
                original_ai_text: draft.body || draft.full_text || "",
                user_instruction: "auto_dispatch",
              }),
            });
            results.push({
              rule_id: rule.rule_id,
              location_id: locationId,
              signal: topSignal.change_subtype,
              action: "draft_saved_for_approval",
            });
          } catch (e) {
            results.push({ rule_id: rule.rule_id, action: "save_error" });
          }
        }

        // 8. Log dispatch
        try {
          const logTable = bq.dataset("analytics").table("action_log");
          await logTable.insert([{
            log_id: crypto.randomUUID(),
            user_id: userId,
            location_id: locationId,
            action_key: "auto_dispatch",
            event: "auto_dispatch",
            channel: rule.channel,
            change_subtype: topSignal.change_subtype,
            signal_type: topSignal.change_subtype,
            affected_date: todayYmd,
            metadata: JSON.stringify({ rule_id: rule.rule_id, recipient: rule.recipient, require_approval: rule.require_approval }),
            created_at: new Date().toISOString(),
          }]);
        } catch (e) {}
      }
    }

    return new Response(JSON.stringify({ ok: true, dispatched: results.length, results }), { status: 200, headers: { "content-type": "application/json" } });
  } catch (err: any) {
    console.error("[daily-dispatch] Error:", err);
    return new Response(JSON.stringify({ ok: false, error: err?.message || "Unknown error" }), { status: 500, headers: { "content-type": "application/json" } });
  }
};