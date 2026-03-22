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
          a.alert_id,
          a.saved_item_id,
          a.alert_level,
          a.change_category,
          a.change_subtype,
          a.direction,
          a.affected_date,
          a.event_label,
          a.summary,
          s.title,
          s.selected_date,
          s.decision_date,
          s.clerk_user_id,
          s.location_id,
          p.email,
          p.first_name
        FROM \`${projectId}.raw.alerts\` a
        JOIN \`${projectId}.raw.saved_items\` s
          ON a.saved_item_id = s.saved_item_id
        JOIN \`${projectId}.raw.insight_event_user_location_profile\` p
          ON s.clerk_user_id = p.clerk_user_id
          AND s.location_id = p.location_id
        JOIN \`${projectId}.raw.notification_preferences\` n
          ON s.clerk_user_id = n.clerk_user_id
        WHERE a.alert_level >= 3
          AND a.notified_at IS NULL
          AND n.alerts_critical = TRUE
          AND p.email IS NOT NULL
        LIMIT 100
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
    const alertIds: string[] = [];

    for (const row of rows) {
      try {
        await resend.emails.send({
          from: "Insight <insight@musesquare.com>",
          replyTo: "contact@musesquare.com",
          to: row.email,
          subject: `Alerte niveau ${row.alert_level} — ${row.title}`,
          html: buildAlertEmail(row, baseUrl),
        });
        sent++;
        alertIds.push(row.alert_id);
      } catch (e) {
        console.error("[cron/alerts] send failed for", row.email, e);
      }
    }

    if (alertIds.length > 0) {
      const ids = alertIds.map(id => `'${id}'`).join(",");
      await bigquery.query({
        query: `
          UPDATE \`${projectId}.raw.alerts\`
          SET notified_at = CURRENT_TIMESTAMP()
          WHERE alert_id IN (${ids})
        `,
        location: BQ_LOCATION,
      });
    }

    return new Response(JSON.stringify({ ok: true, sent }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });

  } catch (err: any) {
    console.error("[cron/alerts]", err);
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

function buildAlertEmail(row: any, baseUrl: string): string {
  const firstName = row.first_name ? String(row.first_name) : "vous";
  const title = esc(row.title);
  const affectedDate = fmtDate(row.affected_date);
  const levelLabel = row.alert_level >= 4 ? "Impact majeur" : "Impact fort";
  const levelStyle = row.alert_level >= 4
    ? "background:#FCEBEB;color:#791F1F;"
    : "background:#FAEEDA;color:#854F0B;";

  const cat = String(row.change_category || "").toLowerCase();
  const catLabel = cat === "competition" ? "Concurrent détecté"
    : cat === "context" ? "Alerte météo"
    : cat === "mobility" ? "Mobilité perturbée"
    : "Signal détecté";

  const dirLabel = String(row.direction || "").toLowerCase();
  const dirStyle = dirLabel === "up" || dirLabel === "improved"
    ? "background:#EAF3DE;color:#3B6D11;"
    : dirLabel === "down" || dirLabel === "worsened"
    ? "background:#FCEBEB;color:#791F1F;"
    : "background:#FAEEDA;color:#854F0B;";
  const dirText = dirLabel === "up" || dirLabel === "improved" ? "Amélioration"
    : dirLabel === "down" || dirLabel === "worsened" ? "Dégradation"
    : "Changement";

  const monitorUrl = row.selected_date
    ? `${baseUrl}/app/insightevent/monitor?saved_item_id=${encodeURIComponent(String(row.saved_item_id))}&date=${encodeURIComponent(String(row.selected_date?.value ?? row.selected_date ?? ""))}`
    : `${baseUrl}/app/insightevent/days`;

  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Alerte niveau ${row.alert_level} — ${title}</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f3f4f6;padding:40px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">

  <tr><td style="background:#ffffff;padding:24px 40px;border-bottom:1px solid #e5e7eb;">
    <div style="font-size:13px;font-weight:500;letter-spacing:0.04em;color:#111827;">MUSE SQUARE <span style="font-style:italic;font-weight:400;">insight</span></div>
  </td></tr>

  <tr><td style="background:#ffffff;padding:40px 40px;border-bottom:1px solid #e5e7eb;">
    <div style="font-size:11px;font-weight:500;letter-spacing:0.14em;text-transform:uppercase;color:#0b37e5;margin-bottom:12px;">Alerte · ${esc(affectedDate)}</div>
    <div style="font-size:28px;font-weight:300;color:#111827;line-height:1.1;margin-bottom:24px;">${title}</div>
    <div style="font-size:14px;color:#374151;line-height:1.7;">Bonjour ${esc(firstName)}, un signal important a été détecté sur votre date du ${esc(affectedDate)} — vérifiez l'impact sur votre événement.</div>
  </td></tr>

  <tr><td style="background:#ffffff;padding:40px 40px;border-bottom:1px solid #e5e7eb;">
    <div style="font-size:11px;font-weight:500;letter-spacing:0.10em;text-transform:uppercase;color:#9ca3af;margin-bottom:20px;">Signal détecté</div>
    <div style="border-left:2px solid #0b37e5;padding:14px 18px;background:#f8f9ff;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;">
        <div>
          <div style="font-size:13px;font-weight:500;color:#111827;margin-bottom:6px;">${esc(catLabel)} · ${esc(affectedDate)}</div>
          <div style="font-size:12px;color:#6b7280;line-height:1.5;margin-bottom:8px;">${esc(String(row.summary || ""))}</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            ${pill(levelLabel, levelStyle)}
            ${pill(dirText, dirStyle)}
          </div>
        </div>
      </div>
    </div>
  </td></tr>

  <tr><td style="background:#ffffff;padding:40px 40px;border-top:0;">
    <a href="${monitorUrl}" style="display:inline-block;padding:12px 28px;background:#0b37e5;color:#ffffff;font-size:13px;font-weight:500;text-decoration:none;letter-spacing:0.02em;">
      Voir le détail →
    </a>
  </td></tr>

  ${row.decision_date ? `
  <tr><td style="background:#f9fafb;padding:20px 40px;border-top:1px solid #e5e7eb;">
    <div style="font-size:12px;color:#9ca3af;">Date limite de décision · ${fmtDate(row.decision_date)}</div>
  </td></tr>` : ""}

  <tr><td style="background:#f9fafb;padding:12px 40px 32px 40px;${row.decision_date ? "" : "border-top:1px solid #e5e7eb;"}">
    <div style="font-size:11px;color:#9ca3af;line-height:1.6;">
      Vous recevez cet email car les alertes critiques sont activées.
      &nbsp;·&nbsp;
      <a href="${baseUrl}/notifications" style="color:#9ca3af;text-decoration:underline;">Gérer mes préférences</a>
    </div>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}