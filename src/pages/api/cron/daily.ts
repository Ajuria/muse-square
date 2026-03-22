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
    const bigquery = makeBQClient(projectId);
    const BQ_LOCATION = (process.env.BQ_LOCATION || "EU").trim();
    const resend = new Resend(process.env.RESEND_API_KEY);
    const baseUrl = process.env.APP_BASE_URL || "https://dev.musesquare.com";

    const [rows] = await bigquery.query({
      query: `
        SELECT
          s.saved_item_id,
          s.title,
          s.selected_date,
          s.decision_date,
          s.event_end_date,
          s.location_id,
          s.clerk_user_id,
          p.email,
          p.first_name,
          DATE_DIFF(s.selected_date, CURRENT_DATE('Europe/Paris'), DAY) AS days_until,
          COALESCE(n.daily_j7, FALSE) AS daily_j7
        FROM \`${projectId}.raw.saved_items\` s
        JOIN \`${projectId}.raw.insight_event_user_location_profile\` p
          ON s.clerk_user_id = p.clerk_user_id
          AND s.location_id = p.location_id
        LEFT JOIN \`${projectId}.raw.notification_preferences\` n
          ON s.clerk_user_id = n.clerk_user_id
        WHERE s.selected_date IS NOT NULL
          AND DATE_DIFF(s.selected_date, CURRENT_DATE('Europe/Paris'), DAY) BETWEEN 0 AND 7
          AND p.email IS NOT NULL
          AND (
            DATE_DIFF(s.selected_date, CURRENT_DATE('Europe/Paris'), DAY) <= 3
            OR n.daily_j7 = TRUE
          )
      `,
      location: BQ_LOCATION,
    });

    if (!Array.isArray(rows) || rows.length === 0) {
      return new Response(JSON.stringify({ ok: true, sent: 0 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    let sent = 0;

    for (const row of rows) {
      const daysUntil = Number(row.days_until);
      const isMandatory = daysUntil <= 3;
      const selectedDate = String(row.selected_date?.value ?? row.selected_date ?? "");

      // Fetch live insight data
      let insightData: any = null;
      try {
        const insightUrl = `${baseUrl}/api/insight/days?location_id=${encodeURIComponent(row.location_id)}&selected_dates=${encodeURIComponent(selectedDate)}`;
        const insightRes = await fetch(insightUrl);
        if (insightRes.ok) {
          insightData = await insightRes.json();
        }
      } catch (e) {
        console.error("[cron/daily] insight fetch failed for", row.saved_item_id, e);
      }

      const dayData = Array.isArray(insightData?.days) ? insightData.days[0] ?? null : null;
      const alerts = Array.isArray(insightData?.alerts) ? insightData.alerts : [];

      const subject = daysUntil === 0
        ? `C'est aujourd'hui — ${row.title}`
        : `J-${daysUntil} — ${row.title}`;

      try {
        await resend.emails.send({
          from: "Insight <insight@musesquare.com>",
          replyTo: "contact@musesquare.com",
          to: row.email,
          subject,
          html: buildDailyEmail(row, daysUntil, isMandatory, dayData, alerts, baseUrl),
        });
        sent++;
      } catch (e) {
        console.error("[cron/daily] send failed for", row.email, e);
      }
    }

    return new Response(JSON.stringify({ ok: true, sent }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });

  } catch (err: any) {
    console.error("[cron/daily]", err);
    return new Response(JSON.stringify({ ok: false, error: err?.message }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
};

function fmtDate(val: any): string {
  const s = val?.value ?? val ?? "";
  if (!s) return "—";
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return String(s);
  const months = ["janv","févr","mars","avr","mai","juin","juil","août","sept","oct","nov","déc"];
  return `${parseInt(m[3])} ${months[parseInt(m[2])-1]} ${m[1]}`;
}

function esc(v: any): string {
  return String(v ?? "")
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

function pill(label: string, style: string): string {
  return `<span style="display:inline-block;padding:2px 10px;border-radius:20px;font-size:11px;font-weight:600;${style}">${esc(label)}</span>`;
}

function buildDailyEmail(row: any, daysUntil: number, isMandatory: boolean, day: any, alerts: any[], baseUrl: string): string {
  const firstName = row.first_name ? String(row.first_name) : "vous";
  const title = esc(row.title);
  const selectedDate = fmtDate(row.selected_date);
  const urgencyBg = daysUntil === 0 ? "#E24B4A" : daysUntil <= 3 ? "#EF9F27" : "#0b37e5";
  const countdownLabel = daysUntil === 0 ? "Aujourd'hui" : `J-${daysUntil}`;
  const monitorUrl = `${baseUrl}/app/insightevent/monitor?saved_item_id=${encodeURIComponent(String(row.saved_item_id))}&date=${encodeURIComponent(String(row.selected_date?.value ?? row.selected_date ?? ""))}`;

  // ---- Score ----
  const score = day?.opportunity_score_final_local ?? null;
  const scoreHtml = score !== null
    ? `<div style="display:flex;align-items:baseline;gap:6px;margin-bottom:16px;">
        <span style="font-size:40px;font-weight:300;color:#111827;line-height:1;">${esc(String(score))}</span>
        <span style="font-size:16px;color:#9ca3af;">/10</span>
        <span style="font-size:12px;color:#6b7280;margin-left:4px;">Indice de faisabilité</span>
       </div>`
    : "";

  // ---- Alerts ----
  const criticalAlerts = alerts.filter((a: any) => Number(a?.alert_level) >= 3);
  const alertsHtml = criticalAlerts.length > 0
    ? `<div style="background:#FCEBEB;border-left:3px solid #E24B4A;padding:12px 16px;margin-bottom:20px;">
        <div style="font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#A32D2D;margin-bottom:8px;">
          ⚠ ${criticalAlerts.length} signal${criticalAlerts.length > 1 ? "s" : ""} à surveiller
        </div>
        ${criticalAlerts.slice(0, 3).map((a: any) => {
          const cat = String(a?.change_category || "").toLowerCase();
          const catLabel = cat === "competition" ? "Concurrent détecté"
            : cat === "context" ? "Alerte météo"
            : cat === "mobility" ? "Mobilité perturbée"
            : "Signal détecté";
          const date = fmtDate(a?.affected_date);
          const dirLabel = String(a?.direction || "").toLowerCase();
          const dirStyle = dirLabel === "up" || dirLabel === "improved"
            ? "background:#EAF3DE;color:#3B6D11;"
            : dirLabel === "down" || dirLabel === "worsened"
            ? "background:#FCEBEB;color:#791F1F;"
            : "background:#FAEEDA;color:#854F0B;";
          const dirText = dirLabel === "up" || dirLabel === "improved" ? "Amélioration"
            : dirLabel === "down" || dirLabel === "worsened" ? "Dégradation"
            : "Changement";
          return `
            <div style="display:flex;align-items:center;justify-content:space-between;padding:4px 0;font-size:13px;color:#374151;">
              <span>${esc(catLabel)} · ${esc(date)}</span>
              ${pill(dirText, dirStyle)}
            </div>
          `;
        }).join("")}
      </div>`
    : "";

  // ---- Key metrics ----
  const eventsScore = day?.events_score ?? null;
  const weatherScore = day?.weather_score ?? null;
  const mobilityScore = day?.mobility_score ?? null;
  const calendarScore = day?.calendar_score ?? null;

  function scorePill(v: any): string {
    const n = parseFloat(String(v ?? ""));
    if (!Number.isFinite(n)) return "<span style='color:#9ca3af;'>—</span>";
    const style = n >= 7 ? "background:#EAF3DE;color:#3B6D11;"
      : n >= 5 ? "background:#FAEEDA;color:#854F0B;"
      : "background:#FCEBEB;color:#791F1F;";
    return pill(`${n.toFixed(1)}/10`, style);
  }

  // ---- Audience ----
  const aud1 = day?.primary_audience_1 ?? null;
  const aud2 = day?.primary_audience_2 ?? null;
  const audMap: Record<string,string> = {
    local: "Résidents locaux", professionals: "Professionnels",
    tourists: "Touristes", students: "Étudiants / Scolaires",
    families: "Familles", seniors: "Seniors", mixed: "Public mixte"
  };

  const isWeekend = (() => {
    const s = String(row.selected_date?.value ?? row.selected_date ?? "");
    if (!s) return false;
    const d = new Date(s);
    return d.getUTCDay() === 0 || d.getUTCDay() === 6;
  })();
  const hasVacation = Boolean(day?.vacation_name);
  const hasHoliday = Boolean(day?.holiday_name);

  function audAvail(type: string): { label: string; style: string } {
    const t = String(type || "").toLowerCase();
    let avail = false;
    if (t === "local") avail = isWeekend || hasVacation || hasHoliday;
    else if (t === "professionals") avail = !isWeekend;
    else if (t === "tourists") avail = isWeekend || hasVacation || hasHoliday;
    else if (t === "families") avail = isWeekend || hasVacation;
    else if (t === "students") avail = isWeekend || hasVacation;
    else avail = true;
    return avail
      ? { label: "Disponible", style: "background:#EAF3DE;color:#3B6D11;" }
      : { label: "Peu disponible", style: "background:#FCEBEB;color:#791F1F;" };
  }

  const audienceRows = [aud1, aud2].filter(Boolean).map((a: any) => {
    const av = audAvail(a);
    return `<tr>
      <td style="padding:8px 0;font-size:13px;color:#374151;border-bottom:1px solid #f3f4f6;">${esc(audMap[a] ?? a)}</td>
      <td style="padding:8px 0;text-align:right;border-bottom:1px solid #f3f4f6;">${pill(av.label, av.style)}</td>
    </tr>`;
  }).join("");

  // ---- Concurrence ----
  const c500 = Number(day?.events_within_500m_count ?? 0);
  const c5km = Number(day?.events_within_5km_count ?? 0);
  const deltaEvents = Number(day?.delta_att_events_pct ?? 0);
  const concPressure = deltaEvents > 3 ? { label: "Élevée", style: "background:#FCEBEB;color:#791F1F;" }
    : deltaEvents < -3 ? { label: "Faible", style: "background:#EAF3DE;color:#3B6D11;" }
    : { label: "Normale", style: "background:#F1EFE8;color:#444441;" };

  // ---- Accessibilité ----
  const deltaAtt = Number(day?.delta_att_mobility_pct ?? 0);
  const deltaOps = Number(day?.delta_ops_mobility_car_pct ?? 0);
  const attVerdict = deltaAtt >= 0 ? { label: "Fluide", style: "background:#EAF3DE;color:#3B6D11;" }
    : deltaAtt >= -4 ? { label: "Perturbé", style: "background:#FAEEDA;color:#854F0B;" }
    : { label: "Fortement perturbé", style: "background:#FCEBEB;color:#791F1F;" };
  const opsVerdict = deltaOps >= 0 ? { label: "Fluide", style: "background:#EAF3DE;color:#3B6D11;" }
    : { label: "Perturbé", style: "background:#FAEEDA;color:#854F0B;" };

  // ---- Exploitation météo ----
  const alertMax = Number(day?.alert_level_max ?? 0);
  const freqImpact = alertMax >= 3 ? { label: "Défavorable", style: "background:#FCEBEB;color:#791F1F;" }
    : alertMax >= 1 ? { label: "Modéré", style: "background:#FAEEDA;color:#854F0B;" }
    : { label: "Aucune alerte", style: "background:#EAF3DE;color:#3B6D11;" };

  const lvlWind = Number(day?.lvl_wind ?? 0);
  const installRisk = lvlWind >= 3 ? { label: "Élevé", style: "background:#FCEBEB;color:#791F1F;" }
    : lvlWind >= 1 ? { label: "Modéré", style: "background:#FAEEDA;color:#854F0B;" }
    : { label: "Aucun risque", style: "background:#EAF3DE;color:#3B6D11;" };

  const metricsHtml = day ? `
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;">

      <!-- Scores -->
      <tr>
        <td colspan="2" style="padding:0 0 8px 0;">
          <div style="font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#9ca3af;">Scores composants</div>
        </td>
      </tr>
      <tr>
        <td style="padding:6px 0;font-size:13px;color:#374151;border-bottom:1px solid #f3f4f6;">Audience</td>
        <td style="padding:6px 0;text-align:right;border-bottom:1px solid #f3f4f6;">${scorePill(calendarScore)}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;font-size:13px;color:#374151;border-bottom:1px solid #f3f4f6;">Concurrence</td>
        <td style="padding:6px 0;text-align:right;border-bottom:1px solid #f3f4f6;">${scorePill(eventsScore)}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;font-size:13px;color:#374151;border-bottom:1px solid #f3f4f6;">Accessibilité</td>
        <td style="padding:6px 0;text-align:right;border-bottom:1px solid #f3f4f6;">${scorePill(mobilityScore)}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;font-size:13px;color:#374151;border-bottom:1px solid #f3f4f6;">Météo</td>
        <td style="padding:6px 0;text-align:right;border-bottom:1px solid #f3f4f6;">${scorePill(weatherScore)}</td>
      </tr>

      <!-- Audience -->
      <tr><td colspan="2" style="padding:20px 0 8px 0;">
        <div style="font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#9ca3af;">Audience</div>
      </td></tr>
      ${audienceRows || `<tr><td colspan="2" style="font-size:13px;color:#9ca3af;padding:4px 0;">—</td></tr>`}

      <!-- Concurrence -->
      <tr><td colspan="2" style="padding:20px 0 8px 0;">
        <div style="font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#9ca3af;">Concurrence</div>
      </td></tr>
      <tr>
        <td style="padding:6px 0;font-size:13px;color:#374151;border-bottom:1px solid #f3f4f6;">${c500} événements &lt; 500m</td>
        <td style="padding:6px 0;text-align:right;border-bottom:1px solid #f3f4f6;">${pill(concPressure.label, concPressure.style)}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;font-size:13px;color:#374151;border-bottom:1px solid #f3f4f6;">${c5km} événements &lt; 5km</td>
        <td style="padding:6px 0;text-align:right;border-bottom:1px solid #f3f4f6;"></td>
      </tr>

      <!-- Accessibilité -->
      <tr><td colspan="2" style="padding:20px 0 8px 0;">
        <div style="font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#9ca3af;">Accessibilité</div>
      </td></tr>
      <tr>
        <td style="padding:6px 0;font-size:13px;color:#374151;border-bottom:1px solid #f3f4f6;">Visiteurs &lt; 5km</td>
        <td style="padding:6px 0;text-align:right;border-bottom:1px solid #f3f4f6;">${pill(attVerdict.label, attVerdict.style)}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;font-size:13px;color:#374151;border-bottom:1px solid #f3f4f6;">Prestataires &lt; 10km</td>
        <td style="padding:6px 0;text-align:right;border-bottom:1px solid #f3f4f6;">${pill(opsVerdict.label, opsVerdict.style)}</td>
      </tr>

      <!-- Exploitation -->
      <tr><td colspan="2" style="padding:20px 0 8px 0;">
        <div style="font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#9ca3af;">Exploitation</div>
      </td></tr>
      <tr>
        <td style="padding:6px 0;font-size:13px;color:#374151;border-bottom:1px solid #f3f4f6;">Impact fréquentation</td>
        <td style="padding:6px 0;text-align:right;border-bottom:1px solid #f3f4f6;">${pill(freqImpact.label, freqImpact.style)}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;font-size:13px;color:#374151;">Risque installation</td>
        <td style="padding:6px 0;text-align:right;">${pill(installRisk.label, installRisk.style)}</td>
      </tr>

    </table>
  ` : `<p style="font-size:13px;color:#9ca3af;">Données indisponibles pour cette date.</p>`;

  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${countdownLabel} — ${title}</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f3f4f6;padding:40px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">

  <!-- Urgency bar (blue only, no black header) -->
  <tr><td style="background:${urgencyBg};padding:24px 40px;">
    <img src="${baseUrl}/images/logo_ms_insight.svg" alt="Muse Square Insight" height="24" style="display:block;margin-bottom:16px;filter:invert(1);opacity:0.7;" />
    <div style="font-size:36px;font-weight:300;color:#ffffff;letter-spacing:-0.02em;line-height:1;">${countdownLabel}</div>
    <div style="font-size:14px;color:rgba(255,255,255,0.8);margin-top:6px;">${title} · ${selectedDate}</div>
  </td></tr>

  <!-- Body -->
  <tr><td style="background:#ffffff;padding:32px 40px;">
    <p style="font-size:14px;color:#374151;margin:0 0 20px 0;">Bonjour ${esc(firstName)},</p>

    ${scoreHtml}
    ${alertsHtml}
    ${metricsHtml}

    <a href="${monitorUrl}" style="display:inline-block;padding:12px 28px;background:#0b37e5;color:#ffffff;font-size:13px;font-weight:500;text-decoration:none;letter-spacing:0.02em;">
      Ouvrir le suivi temps réel →
    </a>
  </td></tr>

  ${row.decision_date ? `
  <tr><td style="background:#f9fafb;padding:16px 40px;border-top:1px solid #e5e7eb;">
    <p style="font-size:12px;color:#9ca3af;margin:0;">Date limite de décision : ${fmtDate(row.decision_date)}</p>
  </td></tr>` : ""}

  <!-- Footer -->
  <tr><td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:20px 40px;">
    <p style="font-size:11px;color:#9ca3af;margin:0;line-height:1.6;">
      ${isMandatory
        ? "Ce suivi J-3 est automatiquement activé pour toutes les dates confirmées."
        : "Vous recevez cet email car vous avez activé le suivi quotidien J-7."
      }
      &nbsp;·&nbsp;
      <a href="${baseUrl}/notifications" style="color:#9ca3af;text-decoration:underline;">Gérer mes préférences</a>
    </p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}
