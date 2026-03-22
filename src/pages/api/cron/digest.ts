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

    const [rows] = await bigquery.query({
      query: `
        SELECT
          n.clerk_user_id,
          p.email,
          p.first_name,
          ARRAY_AGG(
            STRUCT(
              s.saved_item_id,
              s.title,
              s.selected_date,
              s.decision_date,
              s.event_end_date,
              s.stage
            )
            ORDER BY s.decision_date ASC
          ) AS items
        FROM \`${projectId}.raw.notification_preferences\` n
        JOIN \`${projectId}.raw.insight_event_user_location_profile\` p
          ON n.clerk_user_id = p.clerk_user_id
        LEFT JOIN \`${projectId}.raw.saved_items\` s
          ON n.clerk_user_id = s.clerk_user_id
        WHERE n.digest_weekly = TRUE
          AND p.email IS NOT NULL
        GROUP BY n.clerk_user_id, p.email, p.first_name
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
      try {
        await resend.emails.send({
          from: "Insight <insight@musesquare.com>",
          replyTo: "contact@musesquare.com",
          to: row.email,
          subject: `Votre digest hebdomadaire Insight`,
          html: buildDigestEmail(row),
        });
        sent++;
      } catch (e) {
        console.error("[cron/digest] send failed for", row.email, e);
      }
    }

    return new Response(JSON.stringify({ ok: true, sent }), {
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

function fmtDate(val: any): string {
  const s = val?.value ?? val ?? "";
  if (!s) return "—";
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return String(s);
  const months = ["janv","févr","mars","avr","mai","juin","juil","août","sept","oct","nov","déc"];
  return `${parseInt(m[3])} ${months[parseInt(m[2])-1]} ${m[1]}`;
}

function daysUntil(val: any): number | null {
  const s = val?.value ?? val ?? "";
  if (!s) return null;
  const target = new Date(String(s));
  if (isNaN(target.getTime())) return null;
  const today = new Date();
  today.setHours(0,0,0,0);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

function esc(v: any): string {
  return String(v ?? "")
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

function buildDigestEmail(row: any): string {
  const firstName = row.first_name ? String(row.first_name) : "vous";
  const items = Array.isArray(row.items) ? row.items.filter((i: any) => i?.title) : [];

  const itemsHtml = items.length === 0
    ? `<tr><td colspan="3" style="padding:24px 0;font-size:14px;color:#9ca3af;text-align:center;">Aucune date enregistrée.</td></tr>`
    : items.map((item: any) => {
        const d = daysUntil(item.decision_date);
        const countdown = d === null ? "—" : d < 0 ? "Passée" : d === 0 ? "Aujourd'hui" : `J-${d}`;
        const countdownColor = d === null ? "#9ca3af" : d <= 0 ? "#E24B4A" : d <= 7 ? "#EF9F27" : "#111827";
        const hasSelected = item.selected_date;
        return `
          <tr>
            <td style="padding:16px 0;border-bottom:1px solid #f3f4f6;vertical-align:top;">
              <div style="font-size:14px;font-weight:600;color:#111827;margin-bottom:4px;">${esc(item.title)}</div>
              <div style="font-size:12px;color:#9ca3af;">${item.event_end_date ? `Fin : ${fmtDate(item.event_end_date)}` : ""}</div>
            </td>
            <td style="padding:16px 0 16px 24px;border-bottom:1px solid #f3f4f6;vertical-align:top;white-space:nowrap;">
              <div style="font-size:13px;font-weight:600;color:${countdownColor};">${countdown}</div>
              <div style="font-size:11px;color:#9ca3af;margin-top:2px;">${item.decision_date ? fmtDate(item.decision_date) : "—"}</div>
            </td>
            <td style="padding:16px 0 16px 24px;border-bottom:1px solid #f3f4f6;vertical-align:top;white-space:nowrap;">
              ${hasSelected
                ? `<span style="display:inline-block;padding:3px 10px;background:#EAF3DE;color:#3B6D11;font-size:11px;font-weight:600;border-radius:20px;">Date choisie</span>`
                : `<span style="display:inline-block;padding:3px 10px;background:#FAEEDA;color:#854F0B;font-size:11px;font-weight:600;border-radius:20px;">En attente</span>`
              }
            </td>
          </tr>
        `;
      }).join("");

  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Digest hebdomadaire — Insight</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f3f4f6;padding:40px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">
  <tr><td style="background:#111827;padding:24px 40px;">
    <img src="https://dev.musesquare.com/images/logo_ms_insight.svg" alt="Muse Square Insight" height="28" style="display:block;filter:invert(1);" />
  </td></tr>
  <tr><td style="background:#0b37e5;padding:20px 40px;">
    <div style="font-size:11px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:rgba(255,255,255,0.65);margin-bottom:4px;">Digest hebdomadaire</div>
    <div style="font-size:20px;font-weight:300;color:#ffffff;">Vos dates cette semaine</div>
  </td></tr>
  <tr><td style="background:#ffffff;padding:32px 40px;">
    <p style="font-size:14px;color:#374151;margin:0 0 24px 0;">Bonjour ${esc(firstName)},</p>
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <th style="text-align:left;font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#9ca3af;padding-bottom:12px;border-bottom:1px solid #e5e7eb;">Événement</th>
        <th style="text-align:left;font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#9ca3af;padding-bottom:12px;padding-left:24px;border-bottom:1px solid #e5e7eb;white-space:nowrap;">Décision</th>
        <th style="text-align:left;font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#9ca3af;padding-bottom:12px;padding-left:24px;border-bottom:1px solid #e5e7eb;">Statut</th>
      </tr>
      ${itemsHtml}
    </table>
  </td></tr>
  <tr><td style="background:#ffffff;padding:0 40px 32px 40px;">
    <a href="https://dev.musesquare.com/app/insightevent/days" style="display:inline-block;padding:12px 28px;background:#111827;color:#ffffff;font-size:13px;font-weight:500;text-decoration:none;letter-spacing:0.02em;">
      Ouvrir Insight →
    </a>
  </td></tr>
  <tr><td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:20px 40px;">
    <p style="font-size:11px;color:#9ca3af;margin:0;line-height:1.6;">
      Vous recevez cet email car vous avez activé le digest hebdomadaire dans
      <a href="https://dev.musesquare.com/notifications" style="color:#9ca3af;text-decoration:underline;">vos préférences</a>.
      &nbsp;·&nbsp;
      <a href="https://dev.musesquare.com/notifications" style="color:#9ca3af;text-decoration:underline;">Se désinscrire</a>
    </p>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}