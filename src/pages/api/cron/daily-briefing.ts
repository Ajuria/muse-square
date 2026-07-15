// src/pages/api/cron/daily-briefing.ts
/*
  CRON JOB — Point du jour (daily briefing email) — Phase 3: GROUNDED on the brain.

  Schedule: daily 06:00 Europe/Paris. Sends only on a material signal (no email on quiet days).

  Per location: assembleDayContext('brief' slice) is the ONE source of day context (no ad-hoc
  score/weather/competitor queries). The "Point du jour" narrative is grounded — toGroundedDayPayload
  → runAIPackagerClaude('grounded_day') @ modelFor('briefing') (Haiku) — so it cites ONLY the brain's
  claim-typed citable_facts and the validator rejects anything ungrounded (regenerate once → deterministic
  floor). Yesterday's score is one extra read, made a citable fact for the day-over-day delta.

  Material gate (v1 tunable): acute weather, commercial moment, competitor change, |Δscore|≥0.3, or a
  saved-event milestone (J-7/J-3/J-0). NOT "a card exists" (cards fire almost everywhere).

  Structure: HERO (score+weather+operator-first verdict) · acute weather banner · Vos actions (saved
  events, user-curated) · Le point du jour (grounded narrative) · Ce qui bouge (fired competitor signals).
  Crawl-health / stale-surveillance dropped from the operator brief (internal ops, not day context).
*/

import "dotenv/config";
import type { APIRoute } from "astro";
import { makeBQClient } from "../../../lib/bq";
import { Resend } from "resend";
import { assembleDayContext } from "../../../lib/dayContext";
import { toGroundedDayPayload } from "../../../lib/ai/groundedPayload";
import { buildIdentityFacts } from "../../../lib/ai/facts/buildIdentityFacts";
import { mdInlineToSafeHtml } from "../../../lib/ai/safeMarkdown";
import { formatWeatherAlert } from "../../../lib/contextCopy";
import { runAIPackagerClaude } from "../../../lib/ai/runtime/runPackager";
import { modelFor } from "../../../lib/ai/models";
import { isMaterialBriefing } from "../../../lib/ai/briefingGate";

// French decimal: 7.4 -> "7,4" (never a raw JS toString on user-facing numbers)
const frNum = (n: number): string => String(Math.round(n * 10) / 10).replace(".", ",");

export const prerender = false;

// ── WMO Weather Code → Emoji ──────────────────────────────────────────────────
const WMO_EMOJI: Record<number, string> = {
  0: "☀️", 1: "🌤️", 2: "⛅", 3: "☁️",
  45: "🌫️", 48: "🌫️",
  51: "🌦️", 53: "🌦️", 55: "🌦️",
  61: "🌧️", 63: "🌧️", 65: "🌧️",
  66: "🌧️", 67: "🌧️",
  71: "🌨️", 73: "🌨️", 75: "🌨️", 77: "🌨️",
  80: "🌧️", 81: "🌧️", 82: "🌧️",
  85: "🌨️", 86: "🌨️",
  95: "⛈️", 96: "⛈️", 99: "⛈️",
};

function weatherEmoji(code: number | null): string {
  if (code === null || code === undefined) return "—";
  return WMO_EMOJI[code] ?? "🌤️";
}

// ── Helpers ────────────────────────────────────────────────────────────────────


function fmtDateShort(val: any): string {
  const s = val?.value ?? val ?? "";
  if (!s) return "—";
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return String(s);
  const months = ["janv", "févr", "mars", "avr", "mai", "juin", "juil", "août", "sept", "oct", "nov", "déc"];
  return `${parseInt(m[3])} ${months[parseInt(m[2]) - 1]}`;
}

function esc(v: any): string {
  return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function todayYmd(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });
}

function yesterdayYmd(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });
}

function dayOfWeekFr(dateStr: string): string {
  const days = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
  const d = new Date(dateStr + "T12:00:00");
  return days[d.getUTCDay()] ?? "";
}

// ── Types ──────────────────────────────────────────────────────────────────────

interface UserContext {
  clerk_user_id: string;
  location_id: string;
  email: string;
  first_name: string | null;
  primary_audience_1: string | null;
  primary_audience_2: string | null;
  company_name: string | null;
  city_name: string | null;
  region_name: string | null;
  client_industry_code: string | null;
  last_daily_email_sent_at: string | null;
}

interface SavedEvent {
  saved_item_id: string;
  title: string;
  selected_date: string;
  decision_date: string | null;
  stage: string | null;
  days_until: number;
}



// ── Main handler ──────────────────────────────────────────────────────────────

export const GET: APIRoute = async ({ request }) => {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  const projectId = String(process.env.BQ_PROJECT_ID || "muse-square-open-data").trim();
  const BQ_LOCATION = String(process.env.BQ_LOCATION || "EU").trim();
  const baseUrl = process.env.APP_BASE_URL || "https://dev.musesquare.com";
  const bq = makeBQClient(projectId);
  const resend = new Resend(process.env.RESEND_API_KEY);

  const results = { processed: 0, sent: 0, skipped: 0, errors: [] as string[] };

  try {
    // ── Step 1: Get all active users with at least one location ────────────
    const [userRows] = await bq.query({
      query: `
        SELECT DISTINCT
          p.clerk_user_id,
          p.location_id,
          p.email,
          p.first_name,
          p.primary_audience_1,
          p.primary_audience_2,
          p.company_name,
          ctx.city_name,
          d.region_name,
          d.client_industry_code,
          n.last_daily_email_sent_at
        FROM \`${projectId}.raw.insight_event_user_location_profile\` p
        LEFT JOIN \`${projectId}.dims.dim_client_location\` d
          ON p.location_id = d.location_id
        LEFT JOIN \`${projectId}.semantic.vw_insight_event_ai_location_context\` ctx
          ON p.location_id = ctx.location_id
        LEFT JOIN \`${projectId}.raw.notification_preferences\` n
          ON p.clerk_user_id = n.clerk_user_id
        WHERE p.email IS NOT NULL
          AND p.is_primary = TRUE
        QUALIFY ROW_NUMBER() OVER (PARTITION BY p.clerk_user_id ORDER BY p.updated_at DESC) = 1
      `,
      location: BQ_LOCATION,
    });

    if (!Array.isArray(userRows) || userRows.length === 0) {
      return new Response(JSON.stringify({ ok: true, ...results, reason: "no_users" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    const today = todayYmd();
    const yesterday = yesterdayYmd();

    for (const rawUser of userRows) {
      results.processed++;
      const user: UserContext = {
        clerk_user_id: String(rawUser.clerk_user_id),
        location_id: String(rawUser.location_id),
        email: String(rawUser.email),
        first_name: rawUser.first_name ? String(rawUser.first_name) : null,
        primary_audience_1: rawUser.primary_audience_1 ?? null,
        primary_audience_2: rawUser.primary_audience_2 ?? null,
        company_name: rawUser.company_name ?? null,
        city_name: rawUser.city_name ?? null,
        region_name: rawUser.region_name ?? null,
        client_industry_code: rawUser.client_industry_code ?? null,
        last_daily_email_sent_at: rawUser.last_daily_email_sent_at?.value ?? rawUser.last_daily_email_sent_at ?? null,
      };

      try {
        // ── Phase 3: the brain (brief slice) is the ONE source of day context. ──
        const dc = await assembleDayContext(bq, user.location_id, today, { slice: "brief" });

        // Saved events (user-curated — its own section, never a venue claim).
        const [savedRows] = await bq.query({
          query: `
            SELECT
              saved_item_id, title, selected_date, decision_date, stage,
              DATE_DIFF(selected_date, CURRENT_DATE('Europe/Paris'), DAY) AS days_until
            FROM \`${projectId}.raw.saved_items\`
            WHERE clerk_user_id = @clerk_user_id
              AND location_id = @location_id
              AND selected_date IS NOT NULL
              AND DATE_DIFF(selected_date, CURRENT_DATE('Europe/Paris'), DAY) BETWEEN 0 AND 30
            ORDER BY selected_date ASC
          `,
          params: { clerk_user_id: user.clerk_user_id, location_id: user.location_id },
          location: BQ_LOCATION,
        });
        const savedEvents: SavedEvent[] = (savedRows as any[]).map((r: any) => ({
          saved_item_id: String(r.saved_item_id),
          title: String(r.title ?? ""),
          selected_date: String(r.selected_date?.value ?? r.selected_date ?? ""),
          decision_date: r.decision_date?.value ?? r.decision_date ?? null,
          stage: r.stage ?? null,
          days_until: Number(r.days_until),
        }));

        // Yesterday's opportunity score — ONE read, for the day-over-day delta (made a citable fact).
        const [yRows] = await bq.query({
          query: `SELECT opportunity_score_final_local AS s FROM \`${projectId}.semantic.vw_insight_event_day_surface\` WHERE location_id = @location_id AND date = DATE(@yesterday) LIMIT 1`,
          params: { location_id: user.location_id, yesterday },
          location: BQ_LOCATION,
        });
        const scoreToday: number | null = dc.day_surface?.opportunity?.score ?? null;
        const yRaw = (yRows as any[])[0];
        const scoreYesterday: number | null = yRaw ? Number(yRaw.s?.value ?? yRaw.s) : null;
        const scoreDelta: number | null = (scoreToday != null && scoreYesterday != null) ? Math.round((scoreToday - scoreYesterday) * 10) / 10 : null;

        // Competitor changes = the brain's fired signals (change feed), NOT the ad-hoc crawl read.
        const competitorChanges = dc.signals.changes.filter((c: any) => c.event_label && c.change_type !== "opportunity" && c.change_type !== "planning");

        // ── Material-signal gate (re-sourced from the brain). No email on genuinely quiet days. ──
        //    Pure, unit-tested logic in briefingGate.ts (see briefingGate.test.ts).
        const material = isMaterialBriefing({ dc, competitorChanges, scoreDelta, savedEvents });
        if (!material) { results.skipped++; continue; }

        // ── Grounded Point du jour (adapter -> grounded packager @ Haiku). Regenerate once on reject,
        //    else a deterministic grounded line. Never an ungrounded free narrative.
        const deltaFact = (scoreToday != null && scoreYesterday != null && scoreDelta != null)
          ? [{ fact_fr: `Score du jour ${frNum(scoreToday)} — ${scoreDelta >= 0 ? "+" : ""}${frNum(scoreDelta)} vs hier (${frNum(scoreYesterday)})`, claim_type: "observed" as const }]
          : [];
        // Phase 1: measured customer-identity facts, folded into the same grounded whitelist.
        const _id = await buildIdentityFacts(user.location_id).catch(() => ({ status: "insufficient" as const, reason: "error" }));
        const identityFacts = _id.status === "ok" ? _id.facts.map((f) => ({ fact_fr: f.fact_fr, claim_type: f.claim_type })) : [];
        const grounded = toGroundedDayPayload(dc, { question: "Votre point du jour : qu'est-ce qui compte aujourd'hui ?", date: today, extraFacts: [...deltaFact, ...identityFacts] });
        let g = await runAIPackagerClaude({ mode: "grounded_day", row: grounded, model: modelFor("briefing") });
        if (!g.ok) g = await runAIPackagerClaude({ mode: "grounded_day", row: grounded, model: modelFor("briefing") });
        const grounded_out = g.ok ? g.output : null;
        // The action is the REAL fired action card (top action_candidate), never an LLM-invented geste.
        if (grounded_out) {
          const topCard = (dc.signals?.cards ?? []).find((c: any) => c && (c.headline_fr || c.detail_fr));
          grounded_out.suggested_action = topCard ? (topCard.headline_fr || topCard.detail_fr) : "";
        }

        // ── Subject line ──
        const urgentEvent = savedEvents.find((e) => e.days_until <= 3);
        const scoreLabel = scoreToday != null ? `${frNum(scoreToday)}/10` : "";
        const subject = urgentEvent
          ? `J-${urgentEvent.days_until} ${urgentEvent.title}${scoreLabel ? " · " + scoreLabel : ""}`
          : competitorChanges.length > 0
            ? `Mouvement concurrent${scoreLabel ? " · " + scoreLabel : ""}`
            : `${esc(user.city_name ?? "Votre zone")}${scoreLabel ? " · " + scoreLabel : ""}${scoreDelta != null && scoreDelta >= 0.3 ? " ↑" : scoreDelta != null && scoreDelta <= -0.3 ? " ↓" : ""}`;

        // ── Build HTML ──
        const html = buildBriefingHtml({
          user, today, dc, scoreToday, scoreDelta, savedEvents, competitorChanges, grounded: grounded_out, baseUrl,
        });

        // ── Step 7: Send ──────────────────────────────────────────────────

        await resend.emails.send({
          from: "Insight <insight@musesquare.com>",
          replyTo: "contact@musesquare.com",
          to: user.email,
          subject,
          html,
        });

        // Update last_daily_email_sent_at
        await bq.query({
          query: `
            UPDATE \`${projectId}.raw.notification_preferences\`
            SET last_daily_email_sent_at = CURRENT_TIMESTAMP()
            WHERE clerk_user_id = @clerk_user_id
          `,
          params: { clerk_user_id: user.clerk_user_id },
          location: BQ_LOCATION,
        });

        results.sent++;

      } catch (err: any) {
        results.errors.push(`${user.clerk_user_id}: ${err?.message ?? String(err)}`);
      }
    }

    return new Response(JSON.stringify({ ok: true, ...results }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });

  } catch (err: any) {
    console.error("[daily-briefing]", err);
    return new Response(JSON.stringify({ ok: false, error: err?.message, ...results }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
};

// ── HTML Builder ──────────────────────────────────────────────────────────────

interface BriefingData {
  user: UserContext;
  today: string;
  dc: any;                       // the brain payload (brief slice) — the ONE source for day context
  scoreToday: number | null;
  scoreDelta: number | null;
  savedEvents: SavedEvent[];
  competitorChanges: any[];      // dc.signals.changes (fired change feed)
  grounded: any | null;          // grounded_day packager output (headline/answer/key_facts/caveats)
  baseUrl: string;
}

// Grounded narrative -> HTML. Operator-first (headline leads with what matters), honest-absence
// (no grounded output -> a plain "rien de majeur" line, never a fabricated paragraph). French throughout;
// the facts already carry "estimé" where the brain marked an estimate.
function renderGroundedNarrative(g: any): string {
  if (!g || (!g.headline && !g.answer)) {
    return `<p style="margin:0;color:#6b7280;">Rien de majeur à signaler aujourd'hui — conditions dans la norme.</p>`;
  }
  let h = "";
  // Lead: the synthesized takeaway (why today matters).
  if (g.headline) h += `<p style="margin:0 0 12px 0;font-size:16px;font-weight:600;color:#111827;line-height:1.5;">${mdInlineToSafeHtml(g.headline)}</p>`;
  // The 2-3 salient facts behind it.
  if (g.answer) h += `<p style="margin:0 0 12px 0;">${mdInlineToSafeHtml(g.answer)}</p>`;
  const kf = Array.isArray(g.key_facts) ? g.key_facts.filter(Boolean) : [];
  if (kf.length) {
    h += `<table width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 8px 0;">` +
      kf.slice(0, 3).map((f: string) =>
        `<tr><td width="14" valign="top" style="color:#0b37e5;font-size:13px;line-height:1.7;">•</td><td style="font-size:13.5px;color:#374151;line-height:1.7;padding-bottom:3px;">${mdInlineToSafeHtml(f)}</td></tr>`
      ).join("") + `</table>`;
  }
  // The action: the REAL fired action card, highlighted (honest-absence — hidden when none fired).
  const action = typeof g.suggested_action === "string" ? g.suggested_action.trim() : "";
  if (action) {
    h += `<table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0 4px 0;"><tr>
      <td width="5" style="background:#0b37e5;font-size:1px;">&nbsp;</td>
      <td style="background:#eef2ff;padding:13px 15px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;font-size:13.5px;color:#1e3a8a;line-height:1.6;">
        <span style="display:block;font-weight:700;letter-spacing:0.06em;font-size:10px;text-transform:uppercase;color:#0b37e5;margin-bottom:5px;">Action à mener</span>${esc(action)}
      </td></tr></table>`;
  }
  const cav = Array.isArray(g.caveats) ? g.caveats.filter(Boolean) : [];
  if (cav.length) h += `<p style="margin:10px 0 0 0;font-size:12.5px;color:#9ca3af;">${esc(cav.join(" · "))}</p>`;
  return h;
}

export function buildBriefingHtml(d: BriefingData): string {
  const { user, today, dc, scoreToday, scoreDelta, savedEvents, competitorChanges, grounded, baseUrl } = d;
  const dateLabel = `${dayOfWeekFr(today)} ${fmtDateShort(today)}`;
  const cityLabel = user.city_name ?? "";

  const opp = dc?.day_surface?.opportunity ?? {};
  const wx = dc?.day_surface?.weather_surface ?? {};
  const scoreStr = scoreToday != null ? frNum(scoreToday) : "—";
  const regime = opp.regime ?? "";
  const medal = opp.medal ?? "";
  const regimeLabel = medal ? `${esc(regime)} (${esc(medal)})` : esc(regime);
  const scoreTrend = scoreDelta == null ? "" : scoreDelta >= 0.3 ? "En hausse" : scoreDelta <= -0.3 ? "En baisse" : "Stable";
  const weatherIcon = weatherEmoji(wx.code ?? null);
  const tempMax = wx.temp_max != null ? `${Math.round(Number(wx.temp_max))}°C` : "—";
  const weatherLabel = wx.label_fr ?? "";

  // Operator-first verdict chip line — the material signals, leading; the score-delta is supporting.
  const chips: string[] = [];
  if (dc?.weather_alert) chips.push(`Alerte météo niv. ${dc.weather_alert.level}`);
  if (Array.isArray(dc?.commercial_events) && dc.commercial_events.length) chips.push(esc(dc.commercial_events[0]));
  if (competitorChanges.length) chips.push(`${competitorChanges.length} mouvement${competitorChanges.length > 1 ? "s" : ""} concurrent${competitorChanges.length > 1 ? "s" : ""}`);
  const urgentEvent = savedEvents.find((e) => e.days_until <= 3);
  if (urgentEvent) chips.push(`J-${urgentEvent.days_until} ${esc(urgentEvent.title)}`);
  if (scoreDelta != null && Math.abs(scoreDelta) >= 0.3) chips.push(`Score ${scoreDelta >= 0 ? "+" : ""}${frNum(scoreDelta)} vs hier`);
  const verdictLine = chips.length ? chips.join(" · ") : "Conditions dans la norme";

  // Acute weather banner (observed_acute) — distinct register, present only when the brain flagged it.
  // Wording via formatWeatherAlert (contextCopy): it NAMES the alert ("Grand froid aujourd'hui — 2 °C
  // ressenti") instead of the meaningless "niveau 3" this used to hand-roll, and keeps the email in
  // step with the day fact + points-clés — one weather wording, authored in one place.
  const acuteBanner = dc?.weather_alert
    ? `<tr><td style="background:#ffffff;padding:16px 40px 0 40px;"><div style="background:#fef2f2;border:1px solid #fecaca;padding:12px 14px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;font-size:13px;font-weight:600;color:#991b1b;">${esc(formatWeatherAlert(dc.weather_alert))}</div></td></tr>`
    : "";

  // Saved events (user-curated) — own section, simplified (no per-event score fork).
  const actionsHtml = savedEvents.map((evt) => {
    const isUrgent = evt.days_until <= 3;
    const isPlanifier = evt.stage === "planifier" || evt.stage === "PLANIFIER";
    const labelText = isPlanifier ? "À VALIDER" : `J-${evt.days_until}${isUrgent ? " · CONFIRMÉ" : ""}`;
    const labelColor = isPlanifier ? "#854F0B" : isUrgent ? "#0b37e5" : "#9ca3af";
    const bgColor = isPlanifier ? "#FFFBF5" : isUrgent ? "#f8f9ff" : "#f9fafb";
    const borderColor = isPlanifier ? "#BA7517" : isUrgent ? "#0b37e5" : "#d1d5db";
    const monitorUrl = `${baseUrl}/app/insightevent/monitor?saved_item_id=${encodeURIComponent(evt.saved_item_id)}&date=${encodeURIComponent(evt.selected_date)}`;
    return `
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:6px;">
        <tr>
          <td width="5" style="background:${borderColor};font-size:1px;">&nbsp;</td>
          <td style="background:${bgColor};padding:13px 14px;">
            <table width="100%" cellpadding="0" cellspacing="0"><tr>
              <td valign="top">
                <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;font-size:10px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:${labelColor};margin-bottom:5px;">${esc(labelText)}</div>
                <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;font-size:14px;font-weight:500;color:#111827;line-height:1.4;">${esc(evt.title)} · ${fmtDateShort(evt.selected_date)}</div>
              </td>
              <td align="right" valign="middle" width="72" style="padding-left:12px;">
                <a href="${monitorUrl}" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;display:inline-block;padding:7px 14px;border:1px solid #d1d5db;background:#ffffff;color:#374151;font-size:11px;font-weight:600;text-decoration:none;">Suivi</a>
              </td>
            </tr></table>
          </td>
        </tr>
      </table>`;
  }).join("");

  // Competitor changes = fired signals (nudge). Honest-absence: hidden when none.
  const compHtml = competitorChanges.length
    ? `<tr><td style="background:#ffffff;padding:0 40px;border-top:1px solid #e5e7eb;">
        <div style="padding:28px 0 16px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;font-size:11px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:#0b37e5;">Ce qui bouge autour de vous</div>
        ${competitorChanges.slice(0, 4).map((c: any) => `<div style="margin-bottom:14px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;font-size:13px;color:#1a1a1a;line-height:1.6;"><strong>${esc(c.event_label)}</strong>${c.distance_m != null ? ` · à ${frNum(Number(c.distance_m) / 1000)} km` : ""}</div>`).join("")}
        <div style="height:8px;"></div>
      </td></tr>`
    : "";

  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Point du jour — ${dateLabel}</title></head>
<body style="margin:0;padding:0;background:#f0efeb;font-family:Georgia,'Times New Roman',serif;-webkit-text-size-adjust:100%;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f0efeb;padding:24px 0 48px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">

  <tr><td style="padding:0 40px 14px 40px;">
    <table width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;font-size:11px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:#111827;">MUSE SQUARE <span style="font-weight:400;font-style:italic;">insight</span></td>
      <td align="right" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;font-size:11px;color:#9ca3af;letter-spacing:0.04em;">${esc(dateLabel)} · ${esc(cityLabel)}</td>
    </tr></table>
  </td></tr>

  <tr><td style="background:#ffffff;padding:0;">
    <div style="background:linear-gradient(135deg,#0f1f3d 0%,#1a3366 60%,#2d5a9e 100%);padding:28px 40px 24px 40px;">
      <table width="100%" cellpadding="0" cellspacing="0"><tr>
        <td valign="middle">
          <table cellpadding="0" cellspacing="0"><tr>
            <td style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;font-size:42px;font-weight:300;color:#ffffff;line-height:1;padding-right:5px;">${esc(scoreStr)}</td>
            <td valign="bottom" style="padding-bottom:4px;"><div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;font-size:13px;color:rgba(255,255,255,0.45);">/10</div></td>
            <td style="padding-left:16px;padding-bottom:2px;" valign="bottom"><div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;font-size:11px;color:rgba(255,255,255,0.55);letter-spacing:0.04em;">${regimeLabel}${scoreTrend ? " · " + esc(scoreTrend) : ""}</div></td>
          </tr></table>
        </td>
        <td align="right" valign="middle">
          <table cellpadding="0" cellspacing="0"><tr>
            <td style="font-size:28px;line-height:1;padding-right:10px;">${weatherIcon}</td>
            <td><div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;font-size:18px;font-weight:300;color:#ffffff;line-height:1;">${esc(tempMax)}</div><div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;font-size:11px;color:rgba(255,255,255,0.55);margin-top:2px;">${esc(weatherLabel)}</div></td>
          </tr></table>
        </td>
      </tr></table>
      <div style="margin-top:18px;padding-top:14px;border-top:1px solid rgba(255,255,255,0.1);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;font-size:13px;color:rgba(255,255,255,0.85);line-height:1.6;">${esc(verdictLine)}</div>
    </div>
  </td></tr>

  ${acuteBanner}

  ${savedEvents.length > 0 ? `<tr><td style="background:#ffffff;padding:28px 40px 8px 40px;">
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;font-size:11px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:#0b37e5;margin-bottom:18px;">Vos actions</div>
    ${actionsHtml}<div style="height:20px;"></div>
  </td></tr>` : ""}

  <tr><td style="background:#ffffff;padding:0 40px;border-top:1px solid #e5e7eb;">
    <div style="padding:28px 0 8px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;font-size:11px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:#0b37e5;">Le point du jour</div>
    <div style="padding:12px 0 28px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;font-size:14.5px;color:#1a1a1a;line-height:1.8;">${renderGroundedNarrative(grounded)}</div>
  </td></tr>

  ${compHtml}

  <tr><td style="background:#ffffff;padding:24px 40px 36px 40px;border-top:1px solid #e5e7eb;">
    <div style="text-align:center;"><a href="${baseUrl}/app/insightevent/pulse" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;display:inline-block;padding:13px 36px;background:#0b37e5;color:#ffffff;font-size:13px;font-weight:500;text-decoration:none;letter-spacing:0.02em;">Ouvrir Pulse →</a></div>
  </td></tr>

  <tr><td style="padding:20px 40px 32px 40px;">
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;font-size:11px;color:#9ca3af;line-height:1.7;text-align:center;">
      Envoyé quand quelque chose bouge · ${esc(cityLabel)}${user.region_name ? ", " + esc(user.region_name) : ""}<br>
      <a href="${baseUrl}/notifications" style="color:#9ca3af;text-decoration:underline;">Gérer mes alertes</a> ·
      <a href="${baseUrl}/notifications" style="color:#9ca3af;text-decoration:underline;">Se désabonner</a>
    </div>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}