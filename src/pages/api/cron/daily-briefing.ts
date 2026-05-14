// src/pages/api/cron/daily-briefing.ts
/*
  CRON JOB — Daily Briefing Email (v4)

  "Your most customized local business morning brief"

  Schedule: daily 06:00 Europe/Paris via cron-job.org
  Send logic: only when material change detected (smart frequency)

  Material change triggers:
  - Score delta ≥ 0.3 (up or down)
  - New competitor event detected (crawled in last 24h)
  - Weather alert level ≥ 2
  - Saved event J-7, J-3, or J-0
  - Competitor crawl failure (new, not repeated)

  Structure:
  1. HERO — Score + weather + one-line verdict
  2. VOS ACTIONS — Saved events with countdown, score changes, decisions due
  3. LE POINT DU JOUR — AI narrative (Claude Haiku) synthesizing all signals
  4. CE QUI BOUGE — Competitor intelligence, only if deltas exist
  5. FOOTER — Veille health + CTA
*/

import "dotenv/config";
import type { APIRoute } from "astro";
import { makeBQClient } from "../../../lib/bq";
import { Resend } from "resend";
import { randomUUID } from "crypto";

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

function fmtDate(val: any): string {
  const s = val?.value ?? val ?? "";
  if (!s) return "—";
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return String(s);
  const months = ["janv", "févr", "mars", "avr", "mai", "juin", "juil", "août", "sept", "oct", "nov", "déc"];
  return `${parseInt(m[3])} ${months[parseInt(m[2]) - 1]} ${m[1]}`;
}

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

interface CompetitorChange {
  competitor_name: string;
  event_name: string | null;
  distance_km: number | null;
  extraction_status: string;
  crawled_at: string;
  primary_audience: string | null;
  event_date: string | null;
  event_date_end: string | null;
}

interface CrawlHealth {
  total_competitors: number;
  crawled_ok: number;
  crawled_failed: number;
  events_detected: number;
  failed_names: string[];
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
        // ── Step 2: Gather data for this user ───────────────────────────────

        // 2a. Today's score + yesterday's score
        const [scoreRows] = await bq.query({
          query: `
            SELECT
              date,
              opportunity_score_final_local,
              opportunity_regime,
              opportunity_medal,
              alert_level_max,
              lvl_wind, lvl_rain, lvl_snow, lvl_heat, lvl_cold,
              impact_weather_pct,
              competition_index_local,
              events_within_5km_count,
              is_school_holiday_flag,
              is_public_holiday_flag,
              is_weekend_flag
            FROM \`${projectId}.mart.fct_location_context_features_daily\`
            WHERE location_id = @location_id
              AND date IN (DATE(@today), DATE(@yesterday))
          `,
          params: { location_id: user.location_id, today, yesterday },
          location: BQ_LOCATION,
        });

        const todayScore = (scoreRows as any[]).find((r: any) => String(r.date?.value ?? r.date).startsWith(today));
        const yesterdayScore = (scoreRows as any[]).find((r: any) => String(r.date?.value ?? r.date).startsWith(yesterday));

        const scoreToday = Number(todayScore?.opportunity_score_final_local ?? 0);
        const scoreYesterday = Number(yesterdayScore?.opportunity_score_final_local ?? 0);
        const scoreDelta = scoreToday - scoreYesterday;

        // 2b. Weather for today
        const [weatherRows] = await bq.query({
          query: `
            SELECT weather_code, weather_label_fr, temperature_2m_max, temperature_2m_min,
                   wind_speed_10m_max, rain_sum_mm, precipitation_probability_max_pct
            FROM \`${projectId}.mart.fct_location_weather_forecast_daily_detail\`
            WHERE location_id = @location_id AND date = DATE(@today)
            LIMIT 1
          `,
          params: { location_id: user.location_id, today },
          location: BQ_LOCATION,
        });
        const weather = (weatherRows as any[])[0] ?? null;

        // 2c. Saved events within 30 days
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

        // 2d. Competitor changes in last 24h
        const [compRows] = await bq.query({
          query: `
            SELECT
              cd.competitor_name,
              ce.event_name,
              ROUND(ce.distance_from_location_m / 1000, 1) AS distance_km,
              ce.extraction_status,
              ce.crawled_at,
              ce.primary_audience,
              ce.event_date,
              ce.event_date_end
            FROM \`${projectId}.raw.competitor_events\` ce
            JOIN \`${projectId}.raw.competitor_directory\` cd
              ON ce.competitor_id = cd.competitor_id
            WHERE ce.location_id = @location_id
              AND ce.crawled_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 24 HOUR)
            ORDER BY ce.crawled_at DESC
          `,
          params: { location_id: user.location_id },
          location: BQ_LOCATION,
        });

        const competitorChanges: CompetitorChange[] = (compRows as any[]).map((r: any) => ({
          competitor_name: String(r.competitor_name ?? ""),
          event_name: r.event_name ?? null,
          distance_km: r.distance_km ?? null,
          extraction_status: String(r.extraction_status ?? ""),
          crawled_at: String(r.crawled_at?.value ?? r.crawled_at ?? ""),
          primary_audience: r.primary_audience ?? null,
          event_date: r.event_date?.value ?? r.event_date ?? null,
          event_date_end: r.event_date_end?.value ?? r.event_date_end ?? null,
        }));

        // 2e. Crawl health summary
        const [healthRows] = await bq.query({
          query: `
            WITH latest AS (
              SELECT
                ce.competitor_id,
                cd.competitor_name,
                ce.extraction_status,
                ce.event_name,
                ROW_NUMBER() OVER (PARTITION BY ce.competitor_id ORDER BY ce.crawled_at DESC) AS rn
              FROM \`${projectId}.raw.competitor_events\` ce
              JOIN \`${projectId}.raw.competitor_directory\` cd ON ce.competitor_id = cd.competitor_id
              JOIN \`${projectId}.raw.watched_competitors\` wc ON ce.competitor_id = wc.competitor_id
                AND wc.clerk_user_id = @clerk_user_id AND wc.deleted_at IS NULL
              WHERE ce.location_id = @location_id
            )
            SELECT
              COUNT(DISTINCT competitor_id) AS total,
              COUNTIF(rn = 1 AND extraction_status = 'success') AS ok,
              COUNTIF(rn = 1 AND extraction_status IN ('failed', 'fetch_error')) AS failed,
              COUNTIF(extraction_status = 'success' AND event_name IS NOT NULL) AS events_detected,
              ARRAY_AGG(CASE WHEN rn = 1 AND extraction_status IN ('failed', 'fetch_error') THEN competitor_name END IGNORE NULLS) AS failed_names
            FROM latest
          `,
          params: { clerk_user_id: user.clerk_user_id, location_id: user.location_id },
          location: BQ_LOCATION,
        });

        const healthRaw = (healthRows as any[])[0] ?? {};
        const crawlHealth: CrawlHealth = {
          total_competitors: Number(healthRaw.total ?? 0),
          crawled_ok: Number(healthRaw.ok ?? 0),
          crawled_failed: Number(healthRaw.failed ?? 0),
          events_detected: Number(healthRaw.events_detected ?? 0),
          failed_names: Array.isArray(healthRaw.failed_names) ? healthRaw.failed_names.filter(Boolean) : [],
        };

        // 2f. Stale surveillance detection — competitors not crawled in 3+ days
        const [staleRows] = await bq.query({
          query: `
            SELECT cd.competitor_name,
              TIMESTAMP_DIFF(CURRENT_TIMESTAMP(), MAX(ce.crawled_at), DAY) AS days_since_crawl
            FROM \`${projectId}.raw.watched_competitors\` wc
            JOIN \`${projectId}.raw.competitor_directory\` cd
              ON wc.competitor_id = cd.competitor_id AND cd.deleted_at IS NULL
            LEFT JOIN \`${projectId}.raw.competitor_events\` ce
              ON cd.competitor_id = ce.competitor_id AND ce.extraction_status IN ('success', 'partial')
            WHERE wc.clerk_user_id = @clerk_user_id AND wc.deleted_at IS NULL
            GROUP BY cd.competitor_name
            HAVING MAX(ce.crawled_at) IS NULL
              OR TIMESTAMP_DIFF(CURRENT_TIMESTAMP(), MAX(ce.crawled_at), DAY) >= 3
          `,
          params: { clerk_user_id: user.clerk_user_id },
          location: BQ_LOCATION,
        });
        const staleCompetitors: string[] = (staleRows as any[]).map((r: any) => String(r.competitor_name));

        // 2f. Score per saved event date (today vs yesterday)
        const eventScores: Record<string, { today: number; yesterday: number }> = {};
        for (const evt of savedEvents) {
          const evtDate = evt.selected_date;
          const evtYesterday = (() => {
            const d = new Date(evtDate + "T12:00:00");
            d.setDate(d.getDate() - 1);
            return d.toISOString().slice(0, 10);
          })();
          const [evtScoreRows] = await bq.query({
            query: `
              SELECT date, opportunity_score_final_local
              FROM \`${projectId}.mart.fct_location_context_features_daily\`
              WHERE location_id = @location_id AND date IN (DATE(@d1), DATE(@d2))
            `,
            params: { location_id: user.location_id, d1: evtDate, d2: evtYesterday },
            location: BQ_LOCATION,
          });
          const todayRow = (evtScoreRows as any[]).find((r: any) => String(r.date?.value ?? r.date).startsWith(evtDate));
          const yesterdayRow = (evtScoreRows as any[]).find((r: any) => String(r.date?.value ?? r.date).startsWith(evtYesterday));
          eventScores[evtDate] = {
            today: Number(todayRow?.opportunity_score_final_local ?? 0),
            yesterday: Number(yesterdayRow?.opportunity_score_final_local ?? 0),
          };
        }

        // ── Step 3: Material change detection ─────────────────────────────

        const hasScoreChange = Math.abs(scoreDelta) >= 0.3;
        const hasWeatherAlert = Number(todayScore?.alert_level_max ?? 0) >= 2;
        const hasNewCompetitorEvent = competitorChanges.some(c => c.extraction_status === "success" && c.event_name);
        const hasNewCrawlFailure = competitorChanges.some(c => c.extraction_status === "failed" || c.extraction_status === "fetch_error");
        const hasEventMilestone = savedEvents.some(e => [0, 3, 7].includes(e.days_until));
        const hasEventScoreChange = Object.values(eventScores).some(s => Math.abs(s.today - s.yesterday) >= 0.3);
        const hasStaleSurveillance = staleCompetitors.length > 0;

        const hasMaterialChange = hasScoreChange || hasWeatherAlert || hasNewCompetitorEvent || hasEventMilestone || hasEventScoreChange || hasStaleSurveillance;

        if (!hasMaterialChange) {
          results.skipped++;
          continue;
        }

        // ── Step 4: Claude Haiku narrative ─────────────────────────────────

        const audienceLabel = user.primary_audience_1
          ? { families: "familles", professionals: "professionnels", tourists: "touristes", students: "étudiants", seniors: "seniors", locals: "résidents locaux" }[user.primary_audience_1] ?? user.primary_audience_1
          : null;

        const narrativePayload = {
          date: today,
          day_of_week: dayOfWeekFr(today),
          city: user.city_name,
          score_today: scoreToday,
          score_yesterday: scoreYesterday,
          score_delta: Math.round(scoreDelta * 10) / 10,
          regime: todayScore?.opportunity_regime ?? null,
          weather: weather ? {
            label: weather.weather_label_fr,
            temp_max: weather.temperature_2m_max,
            temp_min: weather.temperature_2m_min,
            wind_max: weather.wind_speed_10m_max,
            rain_mm: weather.rain_sum_mm,
            precip_prob: weather.precipitation_probability_max_pct,
          } : null,
          alert_level_max: Number(todayScore?.alert_level_max ?? 0),
          is_school_holiday: Boolean(todayScore?.is_school_holiday_flag),
          is_public_holiday: Boolean(todayScore?.is_public_holiday_flag),
          is_weekend: Boolean(todayScore?.is_weekend_flag),
          events_5km: Number(todayScore?.events_within_5km_count ?? 0),
          audience: audienceLabel,
          saved_events: savedEvents.map(e => ({
            title: e.title,
            date: e.selected_date,
            days_until: e.days_until,
            score_today: eventScores[e.selected_date]?.today ?? null,
            score_delta: eventScores[e.selected_date] ? Math.round((eventScores[e.selected_date].today - eventScores[e.selected_date].yesterday) * 10) / 10 : null,
            decision_date: e.decision_date,
          })),
          competitor_news: competitorChanges
            .filter(c => c.extraction_status === "success" && c.event_name)
            .slice(0, 3)
            .map(c => ({
              competitor: c.competitor_name,
              event: c.event_name,
              distance_km: c.distance_km,
              audience: c.primary_audience,
              date_range: c.event_date ? `${c.event_date}${c.event_date_end ? ' → ' + c.event_date_end : ''}` : null,
            })),
          crawl_failures: crawlHealth.failed_names.slice(0, 2),
          stale_surveillance: staleCompetitors.slice(0, 3),
        };

        const narrativeSystem = `Tu es le rédacteur du briefing matinal de Muse Square Insight — une plateforme d'intelligence locale pour les professionnels de l'événementiel en France. Tu rédiges un briefing de 3 paragraphes courts (2-3 phrases chacun), factuel, opérationnel, chaleureux mais pas marketing. Chaque paragraphe commence par une phrase en gras qui résume le point clé pour un lecteur pressé. Tu t'adresses directement à l'utilisateur ("votre score", "votre zone"). Tu ne répètes jamais des données brutes — tu les interprètes en impact business. Tu réponds UNIQUEMENT avec le texte HTML des 3 paragraphes (balises <p> avec <strong> pour les leads), sans JSON, sans markdown, sans préambule.`;

        let narrative = "";
        try {
          const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
              "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
              "anthropic-version": "2023-06-01",
              "content-type": "application/json",
            },
            body: JSON.stringify({
              model: "claude-haiku-4-5-20251001",
              max_tokens: 600,
              system: narrativeSystem,
              messages: [{ role: "user", content: JSON.stringify(narrativePayload) }],
            }),
          });
          const aiData = await aiRes.json();
          const textBlock = aiData.content?.filter((b: any) => b.type === "text").pop();
          narrative = textBlock?.text ?? "";
        } catch (e) {
          console.error("[daily-briefing] Claude narrative failed:", e);
          narrative = `<p><strong>Score du jour : ${scoreToday}/10</strong> — ${scoreDelta >= 0 ? "en hausse" : "en baisse"} par rapport à hier.</p>`;
        }

        // ── Step 5: Build subject line ────────────────────────────────────

        const urgentEvent = savedEvents.find(e => e.days_until <= 3);
        const subject = urgentEvent
          ? `J-${urgentEvent.days_until} ${urgentEvent.title} · ${scoreToday}/10`
          : hasNewCompetitorEvent
            ? `Nouveau concurrent détecté · ${scoreToday}/10`
            : `${esc(user.city_name ?? "Votre zone")} · ${scoreToday}/10 ${scoreDelta >= 0.3 ? "↑" : scoreDelta <= -0.3 ? "↓" : ""}`;

        // ── Step 6: Build HTML ────────────────────────────────────────────

        const html = buildBriefingHtml({
          user,
          today,
          scoreToday,
          scoreYesterday,
          scoreDelta,
          regime: String(todayScore?.opportunity_regime ?? ""),
          medal: String(todayScore?.opportunity_medal ?? ""),
          weather,
          savedEvents,
          eventScores,
          competitorChanges,
          crawlHealth,
          narrative,
          baseUrl,
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
  scoreToday: number;
  scoreYesterday: number;
  scoreDelta: number;
  regime: string;
  medal: string;
  weather: any;
  savedEvents: SavedEvent[];
  eventScores: Record<string, { today: number; yesterday: number }>;
  competitorChanges: CompetitorChange[];
  crawlHealth: CrawlHealth;
  narrative: string;
  baseUrl: string;
}

function buildBriefingHtml(d: BriefingData): string {
  const { user, today, scoreToday, scoreDelta, regime, medal, weather, savedEvents, eventScores, competitorChanges, crawlHealth, narrative, baseUrl } = d;
  const firstName = user.first_name ?? "vous";
  const dateLabel = `${dayOfWeekFr(today)} ${fmtDateShort(today)}`;
  const cityLabel = user.city_name ?? "";

  const weatherIcon = weatherEmoji(weather?.weather_code ?? null);
  const tempMax = weather?.temperature_2m_max != null ? `${Math.round(weather.temperature_2m_max)}°C` : "—";
  const weatherLabel = weather?.weather_label_fr ?? "";

  const scoreTrend = scoreDelta >= 0.3 ? "En hausse" : scoreDelta <= -0.3 ? "En baisse" : "Stable";
  const regimeLabel = medal ? `${regime} (${medal})` : regime;

  // ── Verdict one-liner ──
  const verdictParts: string[] = [];
  if (scoreDelta >= 0.3) verdictParts.push("Score en hausse");
  else if (scoreDelta <= -0.3) verdictParts.push("Score en baisse");
  else verdictParts.push("Conditions stables");
  if (weatherLabel) verdictParts.push(weatherLabel);
  const urgentEvent = savedEvents.find(e => e.days_until <= 3);
  if (urgentEvent) verdictParts.push(`J-${urgentEvent.days_until} ${urgentEvent.title}`);
  const newCompEvents = competitorChanges.filter(c => c.extraction_status === "success" && c.event_name);
  if (newCompEvents.length > 0) verdictParts.push(`${newCompEvents.length} nouveau${newCompEvents.length > 1 ? "x" : ""} concurrent${newCompEvents.length > 1 ? "s" : ""}`);
  if (d.crawlHealth.failed_names.length > 0) verdictParts.push(`${d.crawlHealth.failed_names.length} veille${d.crawlHealth.failed_names.length > 1 ? "s" : ""} interrompue${d.crawlHealth.failed_names.length > 1 ? "s" : ""}`);

  // ── Actions HTML ──
  const actionsHtml = savedEvents.map(evt => {
    const scores = eventScores[evt.selected_date];
    const evtDelta = scores ? Math.round((scores.today - scores.yesterday) * 10) / 10 : 0;
    const evtScore = scores?.today ?? 0;
    const isUrgent = evt.days_until <= 3;
    const needsReeval = Math.abs(evtDelta) >= 0.3 && evtDelta < 0;
    const isPlanifier = evt.stage === "planifier" || evt.stage === "PLANIFIER";

    let borderColor = "#d1d5db";
    let bgColor = "#f9fafb";
    let labelColor = "#9ca3af";
    let labelText = `J-${evt.days_until}`;
    let btnLabel = "Suivi";
    let btnStyle = "border:1px solid #d1d5db;background:#ffffff;color:#374151;";

    if (needsReeval || isPlanifier) {
      borderColor = "#BA7517";
      bgColor = "#FFFBF5";
      labelColor = "#854F0B";
      labelText = isPlanifier ? "À VALIDER" : "À RÉÉVALUER";
      btnLabel = "Évaluer";
      btnStyle = "background:#111827;color:#ffffff;border:none;";
    } else if (isUrgent) {
      borderColor = "#0b37e5";
      bgColor = "#f8f9ff";
      labelColor = "#0b37e5";
      labelText = `J-${evt.days_until} · CONFIRMÉ`;
      btnLabel = "Suivi";
      btnStyle = "border:1px solid #d1d5db;background:#ffffff;color:#374151;";
    }

    const scoreInfo = evtDelta !== 0 && Math.abs(evtDelta) >= 0.3
      ? `Score ${evtScore}/10 (${evtDelta > 0 ? "+" : ""}${evtDelta})`
      : `Score ${evtScore}/10 stable`;

    const decisionLine = evt.decision_date && isPlanifier
      ? ` · Décision avant le ${fmtDateShort(evt.decision_date)}`
      : "";

    const monitorUrl = `${baseUrl}/app/insightevent/monitor?saved_item_id=${encodeURIComponent(evt.saved_item_id)}&date=${encodeURIComponent(evt.selected_date)}`;

    return `
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:6px;">
        <tr>
          <td width="5" style="background:${borderColor};font-size:1px;">&nbsp;</td>
          <td style="background:${bgColor};padding:13px 14px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td valign="top">
                  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;font-size:10px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:${labelColor};margin-bottom:5px;">${esc(labelText)}${decisionLine ? ` · ${esc(decisionLine.replace(' · ', ''))}` : ""}</div>
                  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;font-size:14px;font-weight:500;color:#111827;line-height:1.4;">${esc(evt.title)} · ${fmtDateShort(evt.selected_date)}</div>
                  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;font-size:12px;color:#6b7280;margin-top:3px;line-height:1.5;">${esc(scoreInfo)}</div>
                </td>
                <td align="right" valign="middle" width="72" style="padding-left:12px;">
                  <a href="${monitorUrl}" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;display:inline-block;padding:7px 14px;${btnStyle}font-size:11px;font-weight:600;text-decoration:none;letter-spacing:0.02em;">${esc(btnLabel)}</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>`;
  }).join("");

  // ── Competitor changes HTML ──
  const highImpactChanges = newCompEvents.filter(c => {
    const sameAudience = user.primary_audience_1 && c.primary_audience === user.primary_audience_1;
    return sameAudience;
  });
  const lowImpactChanges = newCompEvents.filter(c => {
    return !highImpactChanges.includes(c);
  });

  let competitorHtml = "";
  if (newCompEvents.length > 0 || crawlHealth.crawled_failed > 0) {
    const highHtml = highImpactChanges.map(c => `
      <div style="margin-bottom:18px;padding-bottom:18px;border-bottom:1px solid #f3f4f6;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td width="40" valign="top" style="padding-top:2px;">
              <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;width:32px;height:32px;background:#FCEBEB;text-align:center;line-height:32px;font-size:14px;">⚡</div>
            </td>
            <td style="padding-left:12px;" valign="top">
              <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;font-size:13px;color:#1a1a1a;line-height:1.65;">
                <strong>${esc(c.event_name)}</strong> (${esc(c.competitor_name)}, ${c.distance_km ? c.distance_km + " km" : "proximité"})${c.event_date ? " · " + fmtDateShort(c.event_date) : ""} — même audience. <span style="color:#791F1F;font-weight:500;">Impact direct.</span>
              </div>
            </td>
          </tr>
        </table>
      </div>`).join("");

    const lowSummary = lowImpactChanges.length > 0 ? `
      <div style="margin-bottom:18px;padding-bottom:18px;border-bottom:1px solid #f3f4f6;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td width="40" valign="top" style="padding-top:2px;">
              <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;width:32px;height:32px;background:#EAF3DE;text-align:center;line-height:32px;font-size:14px;">✓</div>
            </td>
            <td style="padding-left:12px;" valign="top">
              <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;font-size:13px;color:#1a1a1a;line-height:1.65;">
                ${lowImpactChanges.length} autre${lowImpactChanges.length > 1 ? "s" : ""} événement${lowImpactChanges.length > 1 ? "s" : ""} détecté${lowImpactChanges.length > 1 ? "s" : ""} (${lowImpactChanges.map(c => esc(c.competitor_name)).join(", ")}) — audiences différentes, pas d'impact sur votre activité.
              </div>
            </td>
          </tr>
        </table>
      </div>` : "";

    const failHtml = crawlHealth.failed_names.length > 0 ? `
      <div style="margin-bottom:18px;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td width="40" valign="top" style="padding-top:2px;">
              <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;width:32px;height:32px;background:#f3f4f6;text-align:center;line-height:32px;font-size:14px;">—</div>
            </td>
            <td style="padding-left:12px;" valign="top">
              <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;font-size:13px;color:#6b7280;line-height:1.65;">
                <strong style="color:#374151;">${esc(crawlHealth.failed_names.join(", "))}</strong> — page${crawlHealth.failed_names.length > 1 ? "s" : ""} inaccessible${crawlHealth.failed_names.length > 1 ? "s" : ""}.
                <a href="${baseUrl}/app/insightevent/suivis" style="color:#0b37e5;text-decoration:none;font-size:12px;margin-left:2px;">Modifier →</a>
              </div>
            </td>
          </tr>
        </table>
      </div>` : "";

    competitorHtml = `
    <tr><td style="background:#ffffff;padding:0 40px;border-top:1px solid #e5e7eb;">
      <div style="padding:28px 0 16px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;font-size:11px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:#0b37e5;">Ce qui bouge autour de vous</div>
      ${highHtml}${lowSummary}${failHtml}
    </td></tr>`;
  }

  // ── Veille summary ──
  const veilleLine = crawlHealth.total_competitors > 0
    ? `Veille : ${crawlHealth.crawled_ok}/${crawlHealth.total_competitors} concurrents analysés · ${crawlHealth.events_detected} événements repérés${crawlHealth.crawled_failed > 0 ? ` · ${crawlHealth.crawled_failed} inaccessible${crawlHealth.crawled_failed > 1 ? "s" : ""}` : ""}`
    : "";

  // ── Full email ──
  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Briefing du ${dateLabel}</title></head>
<body style="margin:0;padding:0;background:#f0efeb;font-family:Georgia,'Times New Roman',serif;-webkit-text-size-adjust:100%;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f0efeb;padding:24px 0 48px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">

  <!-- MASTHEAD -->
  <tr><td style="padding:0 40px 14px 40px;">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;font-size:11px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:#111827;">MUSE SQUARE <span style="font-weight:400;font-style:italic;">insight</span></td>
        <td align="right" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;font-size:11px;color:#9ca3af;letter-spacing:0.04em;">${esc(dateLabel)} · ${esc(cityLabel)}</td>
      </tr>
    </table>
  </td></tr>

  <!-- HERO -->
  <tr><td style="background:#ffffff;padding:0;">
    <div style="background:linear-gradient(135deg,#0f1f3d 0%,#1a3366 60%,#2d5a9e 100%);padding:28px 40px 24px 40px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td valign="middle">
            <table cellpadding="0" cellspacing="0"><tr>
              <td style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;font-size:42px;font-weight:300;color:#ffffff;line-height:1;padding-right:5px;">${scoreToday}</td>
              <td valign="bottom" style="padding-bottom:4px;">
                <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;font-size:13px;color:rgba(255,255,255,0.45);">/10</div>
              </td>
              <td style="padding-left:16px;padding-bottom:2px;" valign="bottom">
                <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;font-size:11px;color:rgba(255,255,255,0.55);letter-spacing:0.04em;">${esc(regimeLabel)} · ${esc(scoreTrend)}</div>
              </td>
            </tr></table>
          </td>
          <td align="right" valign="middle">
            <table cellpadding="0" cellspacing="0"><tr>
              <td style="font-size:28px;line-height:1;padding-right:10px;">${weatherIcon}</td>
              <td>
                <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;font-size:18px;font-weight:300;color:#ffffff;line-height:1;">${esc(tempMax)}</div>
                <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;font-size:11px;color:rgba(255,255,255,0.55);margin-top:2px;">${esc(weatherLabel)}</div>
              </td>
            </tr></table>
          </td>
        </tr>
      </table>
      <div style="margin-top:18px;padding-top:14px;border-top:1px solid rgba(255,255,255,0.1);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;font-size:13px;color:rgba(255,255,255,0.8);line-height:1.6;">
        ${esc(verdictParts.join(" · "))}
      </div>
    </div>
  </td></tr>

  <!-- ACTIONS -->
  ${savedEvents.length > 0 ? `
  <tr><td style="background:#ffffff;padding:28px 40px 8px 40px;">
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;font-size:11px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:#0b37e5;margin-bottom:18px;">Vos actions</div>
    ${actionsHtml}
    <div style="height:20px;"></div>
  </td></tr>` : ""}

  <!-- NARRATIVE -->
  <tr><td style="background:#ffffff;padding:0 40px;border-top:1px solid #e5e7eb;">
    <div style="padding:28px 0 8px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;font-size:11px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:#0b37e5;">Le point du jour</div>
    <div style="padding:12px 0 28px 0;font-size:15.5px;color:#1a1a1a;line-height:1.85;">
      ${narrative}
    </div>
  </td></tr>

  <!-- COMPETITOR CHANGES -->
  ${competitorHtml}

  <!-- FOOTER -->
  <tr><td style="background:#ffffff;padding:0 40px 36px 40px;border-top:1px solid #e5e7eb;">
    ${veilleLine ? `<div style="padding:20px 0 24px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;font-size:11px;color:#9ca3af;line-height:1.6;">${esc(veilleLine)}</div>` : ""}
    <div style="text-align:center;">
      <a href="${baseUrl}/app/insightevent/pulse" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif;display:inline-block;padding:13px 36px;background:#0b37e5;color:#ffffff;font-size:13px;font-weight:500;text-decoration:none;letter-spacing:0.02em;">Ouvrir Pulse →</a>
    </div>
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