import "dotenv/config";
import type { APIRoute } from "astro";
import { makeBQClient } from "../../../lib/bq";
import { Resend } from "resend";

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  try {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      });
    }

    const projectId = process.env.BQ_PROJECT_ID!;
    const semanticProjectId = process.env.BQ_SEMANTIC_PROJECT_ID || projectId;
    const bigquery = makeBQClient(projectId);
    const BQ_LOCATION = (process.env.BQ_LOCATION || "EU").trim();
    const resend = new Resend(process.env.RESEND_API_KEY);
    const baseUrl = process.env.APP_BASE_URL || "https://dev.musesquare.com";

    const [userRows] = await bigquery.query({
      query: `
        SELECT
          p.clerk_user_id,
          p.location_id,
          p.email,
          p.first_name,
          p.company_name,
          ctx.city_name,
          d.region_name
        FROM \`${projectId}.raw.insight_event_user_location_profile\` p
        JOIN \`${projectId}.raw.notification_preferences\` n
          ON p.clerk_user_id = n.clerk_user_id
        LEFT JOIN \`${projectId}.dims.dim_client_location\` d
          ON p.location_id = d.location_id
        LEFT JOIN \`${semanticProjectId}.semantic.vw_insight_event_ai_location_context\` ctx
          ON p.location_id = ctx.location_id
        WHERE p.email IS NOT NULL
          AND n.digest_weekly = TRUE
        QUALIFY ROW_NUMBER() OVER (PARTITION BY p.clerk_user_id ORDER BY COALESCE(p.is_primary, FALSE) DESC) = 1
      `,
      location: BQ_LOCATION,
    });

    if (!Array.isArray(userRows) || userRows.length === 0) {
      return new Response(JSON.stringify({ ok: true, sent: 0, reason: "no_users" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    let sent = 0;
    const errors: string[] = [];

    for (const rawUser of userRows) {
      const user = {
        clerk_user_id: String(rawUser.clerk_user_id),
        location_id: String(rawUser.location_id),
        email: String(rawUser.email),
        first_name: rawUser.first_name ? String(rawUser.first_name) : null,
        company_name: rawUser.company_name ?? null,
        city_name: rawUser.city_name ?? null,
        region_name: rawUser.region_name ?? null,
      };

      try {
        // 2a. Score trend (past 7 days) — divide by 10 for display
        const [scoreRows] = await bigquery.query({
          query: `
            SELECT date, opportunity_score_final_local AS score, opportunity_regime AS regime
            FROM \`${semanticProjectId}.semantic.vw_insight_event_day_surface\`
            WHERE location_id = @location_id
              AND date BETWEEN DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY) AND DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY)
            ORDER BY date ASC
          `,
          params: { location_id: user.location_id },
          location: BQ_LOCATION,
        });

        const scores = (scoreRows as any[]).map((r: any) => ({
          date: String(r.date?.value ?? r.date ?? ""),
          score: Math.round(Number(r.score ?? 0)) / 10,
          regime: String(r.regime ?? "B"),
        }));

        const avgScore = scores.length
          ? Math.round(scores.reduce((s, d) => s + d.score, 0) / scores.length * 10) / 10
          : 0;
        const bestDay = scores.length
          ? scores.reduce((best, d) => d.score > best.score ? d : best, scores[0])
          : null;
        const worstDay = scores.length
          ? scores.reduce((worst, d) => d.score < worst.score ? d : worst, scores[0])
          : null;

        // 2b. Signals detected (past 7 days)
        const [signalRows] = await bigquery.query({
          query: `
            SELECT change_category, alert_level, COUNT(*) AS cnt
            FROM \`${semanticProjectId}.semantic.vw_insight_event_change_feed\`
            WHERE location_id = @location_id
              AND feed_date BETWEEN DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY) AND DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY)
            GROUP BY change_category, alert_level
          `,
          params: { location_id: user.location_id },
          location: BQ_LOCATION,
        });

        let totalSignals = 0, threats = 0, opportunities = 0;
        for (const r of (signalRows as any[])) {
          const cnt = Number(r.cnt ?? 0);
          const level = Number(r.alert_level ?? 0);
          const cat = String(r.change_category ?? "").toLowerCase();
          totalSignals += cnt;
          if (level >= 3) threats += cnt;
          if (cat === "opportunity" || (level <= 1 && (cat === "competition" || cat === "context"))) opportunities += cnt;
        }

        // 2c. Actions taken (past 7 days)
        const [actionRows] = await bigquery.query({
          query: `
            SELECT event, COUNT(*) AS cnt
            FROM \`${projectId}.analytics.action_log\`
            WHERE location_id = @location_id
              AND DATE(created_at) BETWEEN DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY) AND DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY)
              AND event IN ('draft_generated', 'draft_copied', 'draft_saved', 'auto_publish', 'auto_dispatch')
            GROUP BY event
          `,
          params: { location_id: user.location_id },
          location: BQ_LOCATION,
        });

        let draftsGenerated = 0, draftsPublished = 0;
        for (const r of (actionRows as any[])) {
          const cnt = Number(r.cnt ?? 0);
          const evt = String(r.event ?? "");
          if (evt === "draft_generated") draftsGenerated += cnt;
          if (["draft_copied", "draft_saved", "auto_publish", "auto_dispatch"].includes(evt)) draftsPublished += cnt;
        }

        // 2d. Top 3 action cards for next 7 days — correct columns
        const [actionCardRows] = await bigquery.query({
          query: `
            WITH ranked AS (
              SELECT action_type, date, action_priority, action_category, headline_fr, data_payload,
                ROW_NUMBER() OVER (PARTITION BY action_type ORDER BY action_priority DESC, date ASC) AS rn
              FROM \`${semanticProjectId}.mart.fct_location_daily_action_candidates\`
              WHERE location_id = @location_id
                AND date BETWEEN CURRENT_DATE() AND DATE_ADD(CURRENT_DATE(), INTERVAL 6 DAY)
            )
            SELECT action_type, date, action_priority, action_category, headline_fr, data_payload
            FROM ranked WHERE rn = 1
            ORDER BY action_priority DESC
            LIMIT 3
          `,
          params: { location_id: user.location_id },
          location: BQ_LOCATION,
        });

        const ACTION_LABELS: Record<string, { what: string; category: string; color: string }> = {
          regime_c_forced: { what: "R\u00e9gime C impos\u00e9 \u2014 v\u00e9rifiez les risques", category: "Urgent", color: "#E24B4A" },
          mobility_disruption_active: { what: "Acc\u00e8s perturb\u00e9 \u2014 alertez votre \u00e9quipe", category: "Urgent", color: "#E24B4A" },
          competitor_audience_conflict: { what: "Conflit d'audience concurrent", category: "Concurrence", color: "#EF9F27" },
          competition_proximity: { what: "Forte concentration concurrentielle", category: "Concurrence", color: "#EF9F27" },
          competitor_threat_direct: { what: "Menace directe d'un concurrent", category: "Concurrence", color: "#EF9F27" },
          competitor_event_launch: { what: "Lancement \u00e9v\u00e9nement concurrent", category: "Concurrence", color: "#EF9F27" },
          weather_hazard_onset: { what: "Alerte m\u00e9t\u00e9o \u2014 adaptez vos op\u00e9rations", category: "M\u00e9t\u00e9o", color: "#EF9F27" },
          extended_bad_weather_3d: { what: "M\u00e9t\u00e9o d\u00e9grad\u00e9e 3+ jours", category: "M\u00e9t\u00e9o", color: "#E24B4A" },
          extended_bad_weather: { what: "M\u00e9t\u00e9o d\u00e9grad\u00e9e prolong\u00e9e", category: "M\u00e9t\u00e9o", color: "#EF9F27" },
          commercial_event_match: { what: "Temps fort commercial \u2014 activez", category: "Opportunit\u00e9", color: "#1D9E75" },
          audience_shift_opportunity: { what: "Ajustez votre message au public du jour", category: "Opportunit\u00e9", color: "#1D9E75" },
          weather_window: { what: "\u00c9claircie m\u00e9t\u00e9o \u2014 fen\u00eatre d'action", category: "Opportunit\u00e9", color: "#1D9E75" },
          low_competition_window: { what: "Fen\u00eatre de faible concurrence", category: "Opportunit\u00e9", color: "#1D9E75" },
          top_day_approaching: { what: "Meilleur jour de la semaine", category: "Opportunit\u00e9", color: "#1D9E75" },
          tourism_peak_window: { what: "Pic de tourisme d\u00e9tect\u00e9", category: "Opportunit\u00e9", color: "#1D9E75" },
          perfect_storm: { what: "Conditions id\u00e9ales \u2014 saisissez l'opportunit\u00e9", category: "Opportunit\u00e9", color: "#1D9E75" },
          score_driver_shift: { what: "Changement de facteur dominant", category: "Intelligence", color: "#185FA5" },
        };

        const topActions = (actionCardRows as any[]).map((r: any) => {
          const fallback = ACTION_LABELS[r.action_type] || { what: String(r.action_type ?? "Signal"), category: String(r.action_category ?? "Signal"), color: "#6B7280" };
          let headline = r.headline_fr ? String(r.headline_fr) : fallback.what;

          // Enrich generic headlines with specific data from payload
          try {
            const payload = typeof r.data_payload === "string" ? JSON.parse(r.data_payload) : r.data_payload;
            if (payload) {
              const at = String(r.action_type ?? "");
              if (at === "commercial_event_match" && payload.commercial_event_name) {
                headline = `${payload.commercial_event_name} \u2014 activez vos op\u00e9rations`;
              } else if (at === "audience_shift_opportunity" && payload.commercial_event_name) {
                headline = `${payload.commercial_event_name} \u2014 adaptez votre message`;
              } else if ((at === "competition_proximity" || at === "high_competition_density") && payload.top_competitor) {
                headline = `${payload.top_competitor} + ${payload.events_500m ?? payload.events_5km ?? "?"} \u00e9v\u00e9nements \u2014 forte pression`;
              } else if (at === "competitor_threat_direct" && payload.competitor_name) {
                headline = `${payload.competitor_name} \u2014 menace directe (${payload.threat_level ?? "?"})`;
              } else if (at === "competitor_event_launch" && payload.competitor_name && payload.event_name) {
                headline = `${payload.competitor_name} lance ${payload.event_name}`;
              }
            }
          } catch {}

          return {
            what: headline,
            category: fallback.category,
            color: fallback.color,
            date: String(r.date?.value ?? r.date ?? ""),
          };
        });

        // 2e. Context pills (holidays, commercial events)
        const [contextRows] = await bigquery.query({
          query: `
            SELECT a.date, a.is_public_holiday_fr_flag, a.public_holiday_name_fr, a.is_commercial_event_flag, a.commercial_events
            FROM \`${projectId}.mart.fct_region_day_annotations_daily\` a
            JOIN \`${projectId}.mart.fct_location_context_features_daily\` c
              ON a.date = c.date AND a.region_id = c.region_id
            WHERE c.location_id = @location_id
              AND a.date BETWEEN CURRENT_DATE() AND DATE_ADD(CURRENT_DATE(), INTERVAL 6 DAY)
              AND (a.is_public_holiday_fr_flag = TRUE OR a.is_commercial_event_flag = TRUE)
          `,
          params: { location_id: user.location_id },
          location: BQ_LOCATION,
        });

        const contextPills: string[] = [];
        for (const r of (contextRows as any[])) {
          if (r.public_holiday_name_fr) contextPills.push(String(r.public_holiday_name_fr));
          if (Array.isArray(r.commercial_events)) {
            for (const ce of r.commercial_events) {
              if (ce?.event_name && !contextPills.includes(ce.event_name)) contextPills.push(String(ce.event_name));
            }
          }
        }

        // 2f. Weather outlook
        const [weatherRows] = await bigquery.query({
          query: `
            SELECT alert_level_max, lvl_heat, lvl_rain, lvl_wind, lvl_cold, lvl_snow
            FROM \`${projectId}.mart.fct_location_weather_alerts_daily\`
            WHERE location_id = @location_id AND date = CURRENT_DATE()
            LIMIT 1
          `,
          params: { location_id: user.location_id },
          location: BQ_LOCATION,
        });

        const todayWeather = (weatherRows as any[])[0] ?? null;
        const alertMax = Number(todayWeather?.alert_level_max ?? 0);
        if (alertMax >= 2) {
          const hazard = Number(todayWeather?.lvl_heat ?? 0) >= 2 ? "Canicule"
            : Number(todayWeather?.lvl_rain ?? 0) >= 2 ? "Fortes pluies"
            : Number(todayWeather?.lvl_wind ?? 0) >= 2 ? "Vent fort"
            : Number(todayWeather?.lvl_cold ?? 0) >= 2 ? "Grand froid"
            : Number(todayWeather?.lvl_snow ?? 0) >= 2 ? "Neige"
            : "Alerte m\u00e9t\u00e9o";
          contextPills.unshift(hazard);
        }

        // 2g. Competitor activity (past 7 days)
        const [compRows] = await bigquery.query({
          query: `
            SELECT cd.competitor_name, ce.event_name, ROUND(ce.distance_from_location_m / 1000, 1) AS distance_km
            FROM \`${projectId}.raw.competitor_events\` ce
            JOIN \`${projectId}.raw.competitor_directory\` cd ON ce.competitor_id = cd.competitor_id
            WHERE ce.location_id = @location_id
              AND ce.crawled_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)
              AND ce.extraction_status = 'success' AND ce.event_name IS NOT NULL
            ORDER BY ce.crawled_at DESC LIMIT 5
          `,
          params: { location_id: user.location_id },
          location: BQ_LOCATION,
        });

        const compEvents = (compRows as any[]).map((r: any) => ({
          competitor: String(r.competitor_name ?? ""),
          event: String(r.event_name ?? ""),
          km: r.distance_km ?? null,
        }));

        // 2h. Crawl health
        const [healthRows] = await bigquery.query({
          query: `
            WITH latest AS (
              SELECT ce.competitor_id, ce.extraction_status, ce.event_name,
                ROW_NUMBER() OVER (PARTITION BY ce.competitor_id ORDER BY ce.crawled_at DESC) AS rn
              FROM \`${projectId}.raw.competitor_events\` ce
              JOIN \`${projectId}.raw.watched_competitors\` wc
                ON ce.competitor_id = wc.competitor_id AND wc.clerk_user_id = @clerk_user_id AND wc.deleted_at IS NULL
              WHERE ce.location_id = @location_id
            )
            SELECT COUNT(DISTINCT competitor_id) AS total,
              COUNTIF(rn = 1 AND extraction_status = 'success') AS ok,
              COUNTIF(extraction_status = 'success' AND event_name IS NOT NULL) AS events_detected
            FROM latest
          `,
          params: { clerk_user_id: user.clerk_user_id, location_id: user.location_id },
          location: BQ_LOCATION,
        });

        const health = (healthRows as any[])[0] ?? {};
        const totalComp = Number(health.total ?? 0);
        const okComp = Number(health.ok ?? 0);
        const eventsDetected = Number(health.events_detected ?? 0);

        // Step 3: Verdict
        const verdictParts: string[] = [];
        if (scores.length) {
          const delta = scores[scores.length - 1].score - scores[0].score;
          verdictParts.push(delta >= 0.3 ? "Score en hausse" : delta <= -0.3 ? "Score en baisse" : "Score stable");
        }
        if (threats > 0) verdictParts.push(`${threats} menace${threats > 1 ? "s" : ""}`);
        if (opportunities > 0) verdictParts.push(`${opportunities} opportunit\u00e9${opportunities > 1 ? "s" : ""}`);
        if (alertMax >= 2) verdictParts.push(contextPills[0] ?? "Alerte m\u00e9t\u00e9o");

        // Step 4: Build and send
        const html = buildDigestHtml({
          user, scores, avgScore, bestDay, worstDay,
          verdict: verdictParts.join(" \u00b7 "),
          totalSignals, threats, opportunities, draftsGenerated, draftsPublished,
          topActions, contextPills: contextPills.slice(0, 4),
          compEvents, totalComp, okComp, eventsDetected, baseUrl,
        });

        const subject = topActions.length > 0
          ? `${topActions[0].what} \u00b7 Score ${avgScore}/10`
          : `Digest \u00b7 Score moyen ${avgScore}/10`;

        await resend.emails.send({
          from: "Insight <insight@musesquare.com>",
          replyTo: "contact@musesquare.com",
          to: user.email,
          subject,
          html,
        });
        sent++;
      } catch (e: any) {
        console.error("[cron/digest] failed for", user.email, e);
        errors.push(`${user.email}: ${e?.message ?? String(e)}`);
      }
    }

    return new Response(JSON.stringify({ ok: true, sent, users: userRows.length, errors }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (err: any) {
    console.error("[cron/digest]", err);
    return new Response(JSON.stringify({ ok: false, error: err?.message }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
};

function fmtDateShort(val: any): string {
  const s = val?.value ?? val ?? "";
  if (!s) return "\u2014";
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return String(s);
  const months = ["janv", "f\u00e9vr", "mars", "avr", "mai", "juin", "juil", "ao\u00fbt", "sept", "oct", "nov", "d\u00e9c"];
  return `${parseInt(m[3])} ${months[parseInt(m[2]) - 1]}`;
}

function dayOfWeekFr(dateStr: string): string {
  const days = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
  const d = new Date(dateStr + "T12:00:00");
  return days[d.getUTCDay()] ?? "";
}

function esc(v: any): string {
  return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

interface DigestData {
  user: { first_name: string | null; city_name: string | null; region_name: string | null };
  scores: { date: string; score: number; regime: string }[];
  avgScore: number;
  bestDay: { date: string; score: number } | null;
  worstDay: { date: string; score: number } | null;
  verdict: string;
  totalSignals: number;
  threats: number;
  opportunities: number;
  draftsGenerated: number;
  draftsPublished: number;
  topActions: { what: string; category: string; color: string; date: string }[];
  contextPills: string[];
  compEvents: { competitor: string; event: string; km: number | null }[];
  totalComp: number;
  okComp: number;
  eventsDetected: number;
  baseUrl: string;
}

function buildDigestHtml(d: DigestData): string {
  const firstName = d.user.first_name ?? "vous";
  const cityLabel = d.user.city_name ?? "";
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });
  const dateLabel = `${dayOfWeekFr(today)} ${fmtDateShort(today)}`;
  const maxScore = 10;

  const scoreBarsHtml = d.scores.map((s, i) => {
    const h = Math.max(8, Math.round((s.score / maxScore) * 40));
    const isLast = i === d.scores.length - 1;
    const opacity = isLast ? "1" : (0.4 + (i / d.scores.length) * 0.35).toFixed(2);
    return `<td align="center" valign="bottom" style="height:48px;padding:0 2px;">
      <div style="width:28px;height:${h}px;background:rgba(255,255,255,${opacity});border-radius:2px 2px 0 0;"></div>
    </td>`;
    const bg = isLast ? "#ffffff" : "#7BA3D9";
    return `<td align="center" valign="bottom" style="height:40px;padding:0 2px;"><div style="width:24px;height:${h}px;background:${bg};border-radius:2px 2px 0 0;"></div></td>`;
  }).join("");

  const dayLabelsHtml = d.scores.map((s) => {
    const dow = dayOfWeekFr(s.date).charAt(0);
    return `<td align="center" style="font-size:10px;color:rgba(255,255,255,0.5);padding:3px 2px 0;">${dow}</td>`;
  }).join("");

  const todayYmd = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });

  const actionsHtml = d.topActions.map((a) => {
    const isToday = a.date.startsWith(todayYmd);
    const dayLabel = isToday ? "Aujourd'hui" : fmtDateShort(a.date);
    const catBg = a.color === "#E24B4A" ? "#FEF2F2" : a.color === "#EF9F27" ? "#FAEEDA" : a.color === "#1D9E75" ? "#E1F5EE" : "#E6F1FB";
    const catFg = a.color === "#E24B4A" ? "#991B1B" : a.color === "#EF9F27" ? "#854F0B" : a.color === "#1D9E75" ? "#0F6E56" : "#185FA5";
    return `<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:6px;"><tr>
      <td width="3" style="background:${a.color};font-size:1px;">&nbsp;</td>
      <td style="background:#f8fafc;padding:12px 14px;">
        <div style="display:inline-block;font-size:10px;font-weight:600;padding:1px 8px;border-radius:4px;background:${catBg};color:${catFg};margin-bottom:4px;">${esc(dayLabel)} &middot; ${esc(a.category)}</div>
        <div style="font-size:13px;font-weight:500;color:#111827;line-height:1.4;">${esc(a.what)}</div>
      </td></tr></table>`;
  }).join("");

  const pillsHtml = d.contextPills.map((p) =>
    `<span style="display:inline-block;font-size:11px;padding:4px 10px;border-radius:4px;background:#f3f4f6;color:#374151;margin:0 4px 4px 0;">${esc(p)}</span>`
  ).join("");

  let compHtml = "";
  if (d.compEvents.length > 0) {
    compHtml = `<div style="font-size:12px;color:#374151;line-height:1.6;padding:10px 12px;background:#f8fafc;border-radius:6px;">
      <strong style="color:#111827;">${d.compEvents.length} &eacute;v&eacute;nement${d.compEvents.length > 1 ? "s" : ""}</strong> d&eacute;tect&eacute;${d.compEvents.length > 1 ? "s" : ""} cette semaine.
      ${d.compEvents.slice(0, 2).map(c => `${esc(c.competitor)}${c.event ? " &mdash; " + esc(c.event) : ""}${c.km ? " (" + c.km + " km)" : ""}`).join(". ")}.
    </div>`;
  }

  const veilleLine = d.totalComp > 0
    ? `Veille : ${d.okComp}/${d.totalComp} concurrents analys&eacute;s &middot; ${d.eventsDetected} &eacute;v&eacute;nements rep&eacute;r&eacute;s`
    : "";

  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Digest hebdomadaire</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;-webkit-text-size-adjust:100%;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f3f4f6;padding:24px 0 48px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;border-radius:8px;overflow:hidden;">

  <!-- MASTHEAD -->
  <tr><td style="background:#ffffff;padding:16px 32px;">
    <table width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="font-size:11px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:#111827;">MUSE SQUARE</td>
      <td align="right" style="font-size:11px;color:#9ca3af;letter-spacing:0.04em;">${esc(dateLabel)} &middot; ${esc(cityLabel)}</td>
    </tr></table>
  </td></tr>

  <!-- HERO -->
  <tr><td style="background:#1a2744;padding:28px 32px 22px;">
    <div style="font-size:10px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:#7BA3D9;margin-bottom:6px;">Digest hebdomadaire</div>
    <div style="font-size:22px;font-weight:300;color:#ffffff;line-height:1.25;margin-bottom:18px;">Bonjour ${esc(firstName)}.</div>
    <table cellpadding="0" cellspacing="0">
      <tr>${scoreBarsHtml}
        <td style="padding-left:14px;" valign="bottom">
          <div style="font-size:28px;font-weight:300;color:#ffffff;line-height:1;">${d.avgScore}</div>
          <div style="font-size:10px;color:#7BA3D9;margin-top:2px;">score moyen /10</div>
        </td>
      </tr>
      <tr>${dayLabelsHtml}<td></td></tr>
    </table>
    <div style="margin-top:16px;padding-top:12px;border-top:1px solid rgba(255,255,255,0.08);font-size:12px;color:#A8C4E0;line-height:1.5;">
      ${esc(d.verdict)}
    </div>
  </td></tr>

  <!-- SECTION 1: CETTE SEMAINE -->
  <tr><td style="background:#ffffff;padding:28px 32px;">
    <div style="font-size:11px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:#185FA5;margin-bottom:16px;">Cette semaine</div>
    ${actionsHtml || '<div style="font-size:13px;color:#9ca3af;padding:12px 0;">Aucune action prioritaire cette semaine.</div>'}
    ${pillsHtml ? '<div style="margin-top:14px;">' + pillsHtml + '</div>' : ''}
    <div style="margin-top:20px;text-align:center;">
      <a href="${d.baseUrl}/app/insightevent/pulse" style="display:inline-block;padding:12px 32px;background:#185FA5;color:#ffffff;font-size:13px;font-weight:500;text-decoration:none;letter-spacing:0.02em;border-radius:6px;">Ouvrir Muse Square &rarr;</a>
    </div>
  </td></tr>

  <!-- DIVIDER -->
  <tr><td style="background:#ffffff;padding:0 32px;"><div style="border-top:1px solid #e5e7eb;"></div></td></tr>

  <!-- SECTION 2: SEMAINE PASSEE -->
  <tr><td style="background:#ffffff;padding:28px 32px;">
    <div style="font-size:11px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:#185FA5;margin-bottom:16px;">Semaine pass&eacute;e</div>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;"><tr>
      <td width="32%" style="background:#f8fafc;border-radius:6px;padding:12px;text-align:center;">
        <div style="font-size:20px;font-weight:500;color:#111827;">${d.totalSignals}</div>
        <div style="font-size:11px;color:#6b7280;margin-top:2px;">signaux</div>
      </td>
      <td width="2%"></td>
      <td width="32%" style="background:#f8fafc;border-radius:6px;padding:12px;text-align:center;">
        <div style="font-size:20px;font-weight:500;color:#991B1B;">${d.threats}</div>
        <div style="font-size:11px;color:#6b7280;margin-top:2px;">menaces</div>
      </td>
      <td width="2%"></td>
      <td width="32%" style="background:#f8fafc;border-radius:6px;padding:12px;text-align:center;">
        <div style="font-size:20px;font-weight:500;color:#0F6E56;">${d.opportunities}</div>
        <div style="font-size:11px;color:#6b7280;margin-top:2px;">opportunit&eacute;s</div>
      </td>
    </tr></table>

    <div style="margin-bottom:16px;">
      <div style="font-size:12px;font-weight:500;color:#111827;margin-bottom:8px;">Actions r&eacute;alis&eacute;es</div>
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr><td style="padding:8px 10px;background:#f8fafc;border-radius:6px;font-size:12px;color:#6b7280;">Brouillons g&eacute;n&eacute;r&eacute;s</td>
          <td align="right" style="padding:8px 10px;background:#f8fafc;border-radius:6px;font-size:12px;font-weight:500;color:#111827;">${d.draftsGenerated}</td></tr>
        <tr><td colspan="2" style="height:4px;"></td></tr>
        <tr><td style="padding:8px 10px;background:#f8fafc;border-radius:6px;font-size:12px;color:#6b7280;">Publi&eacute;s / copi&eacute;s</td>
          <td align="right" style="padding:8px 10px;background:#f8fafc;border-radius:6px;font-size:12px;font-weight:500;color:#0F6E56;">${d.draftsPublished}</td></tr>
      </table>
    </div>

    ${d.bestDay && d.worstDay ? `
    <div style="margin-bottom:16px;">
      <div style="font-size:12px;font-weight:500;color:#111827;margin-bottom:8px;">Score de la semaine</div>
      <table width="100%" cellpadding="0" cellspacing="0"><tr>
        <td width="49%" style="background:#f0fdf4;border-radius:6px;padding:10px 12px;">
          <div style="font-size:11px;color:#166534;">Meilleur jour</div>
          <div style="font-size:14px;font-weight:500;color:#166534;margin-top:2px;">${esc(dayOfWeekFr(d.bestDay.date).slice(0, 3))} ${fmtDateShort(d.bestDay.date)} &middot; ${d.bestDay.score}/10</div>
        </td>
        <td width="2%"></td>
        <td width="49%" style="background:#fef2f2;border-radius:6px;padding:10px 12px;">
          <div style="font-size:11px;color:#991B1B;">Jour le plus faible</div>
          <div style="font-size:14px;font-weight:500;color:#991B1B;margin-top:2px;">${esc(dayOfWeekFr(d.worstDay.date).slice(0, 3))} ${fmtDateShort(d.worstDay.date)} &middot; ${d.worstDay.score}/10</div>
        </td>
      </tr></table>
    </div>` : ''}

    ${compHtml ? `
    <div style="margin-bottom:16px;">
      <div style="font-size:12px;font-weight:500;color:#111827;margin-bottom:8px;">Activit&eacute; concurrentielle</div>
      ${compHtml}
    </div>` : ''}

    <div style="border:1px dashed #d1d5db;border-radius:6px;padding:14px 16px;text-align:center;">
      <div style="font-size:12px;color:#9ca3af;margin-bottom:6px;">Impact sur votre chiffre d'affaires</div>
      <div style="font-size:11px;color:#9ca3af;line-height:1.5;">Connectez vos donn&eacute;es de vente pour mesurer l'impact r&eacute;el de chaque signal.</div>
      <div style="margin-top:10px;">
        <a href="${d.baseUrl}/app/insightevent/pulse" style="display:inline-block;padding:6px 16px;border:1px solid #d1d5db;border-radius:6px;font-size:11px;font-weight:500;color:#185FA5;text-decoration:none;">Connecter mes ventes &rarr;</a>
      </div>
    </div>
  </td></tr>

  <!-- FOOTER -->
  <tr><td style="background:#ffffff;padding:16px 32px 24px;border-top:1px solid #e5e7eb;">
    ${veilleLine ? '<div style="font-size:11px;color:#9ca3af;line-height:1.6;margin-bottom:8px;">' + veilleLine + '</div>' : ''}
    <div style="font-size:11px;color:#9ca3af;line-height:1.7;text-align:center;">
      Digest hebdomadaire &middot; ${esc(cityLabel)}${d.user.region_name ? ", " + esc(d.user.region_name) : ""}<br>
      <a href="${d.baseUrl}/notifications" style="color:#9ca3af;text-decoration:underline;">G&eacute;rer mes alertes</a> &middot;
      <a href="${d.baseUrl}/notifications" style="color:#9ca3af;text-decoration:underline;">Se d&eacute;sabonner</a>
    </div>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}