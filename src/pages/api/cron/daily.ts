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

      const subject = daysUntil === 0
        ? `C'est aujourd'hui — ${row.title}`
        : `J-${daysUntil} — ${row.title}`;

      try {
        await resend.emails.send({
          from: "Insight <insight@musesquare.com>",
          replyTo: "contact@musesquare.com",
          to: row.email,
          subject,
          html: buildDailyEmail(row, daysUntil, isMandatory),
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
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function esc(v: any): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildDailyEmail(row: any, daysUntil: number, isMandatory: boolean): string {
  const firstName = row.first_name ? String(row.first_name) : "vous";
  const title = esc(row.title);

  const countdownLabel = daysUntil === 0
    ? "C'est aujourd'hui"
    : `J-${daysUntil} avant votre événement`;

  const urgencyColor = daysUntil <= 1 ? "#E24B4A" : daysUntil <= 3 ? "#EF9F27" : "#1D3BB3";

  const monitorUrl = `https://musesquare.com/app/insightevent/monitor?saved_item_id=${encodeURIComponent(row.saved_item_id)}&date=${encodeURIComponent(String(row.selected_date?.value ?? row.selected_date ?? ""))}`;

  return `
    <!DOCTYPE html>
    <html lang="fr">
    <head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
    <body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:40px 0;">
        <tr><td align="center">
          <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e5e7eb;max-width:600px;width:100%;">

            <tr><td style="padding:0;">
              <div style="background:${urgencyColor};padding:12px 40px;">
                <span style="font-size:12px;font-weight:600;letter-spacing:0.10em;text-transform:uppercase;color:#ffffff;">${esc(countdownLabel)}</span>
              </div>
            </td></tr>

            <tr><td style="padding:32px 40px 24px 40px;border-bottom:1px solid #f3f4f6;">
              <div style="font-size:11px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:#9ca3af;margin-bottom:8px;">MUSE SQUARE INSIGHT</div>
              <div style="font-size:22px;font-weight:300;color:#111827;">${title}</div>
              <div style="font-size:14px;color:#6b7280;margin-top:6px;">Date choisie : ${fmtDate(row.selected_date)}</div>
            </td></tr>

            <tr><td style="padding:24px 40px;">
              <p style="font-size:14px;color:#374151;margin:0 0 16px 0;">
                Bonjour ${esc(firstName)},
              </p>
              <p style="font-size:14px;color:#6b7280;margin:0 0 24px 0;">
                ${daysUntil === 0
                  ? "Votre événement a lieu aujourd'hui. Voici les dernières conditions."
                  : isMandatory
                  ? `Il reste <strong style="color:#111827;">${daysUntil} jour${daysUntil > 1 ? "s" : ""}</strong> avant votre événement. Voici le suivi en temps réel.`
                  : `Il reste <strong style="color:#111827;">${daysUntil} jour${daysUntil > 1 ? "s" : ""}</strong> avant votre événement.`
                }
              </p>

              <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;margin-bottom:24px;">
                <tr style="background:#f9fafb;">
                  <td style="padding:10px 16px;font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#9ca3af;border-bottom:1px solid #e5e7eb;">Indicateur</td>
                  <td style="padding:10px 16px;font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#9ca3af;border-bottom:1px solid #e5e7eb;">Statut</td>
                </tr>
                <tr>
                  <td style="padding:12px 16px;font-size:13px;color:#374151;border-bottom:1px solid #f3f4f6;">Météo</td>
                  <td style="padding:12px 16px;font-size:13px;color:#6b7280;border-bottom:1px solid #f3f4f6;">Voir dans Insight →</td>
                </tr>
                <tr>
                  <td style="padding:12px 16px;font-size:13px;color:#374151;border-bottom:1px solid #f3f4f6;">Mobilité</td>
                  <td style="padding:12px 16px;font-size:13px;color:#6b7280;border-bottom:1px solid #f3f4f6;">Voir dans Insight →</td>
                </tr>
                <tr>
                  <td style="padding:12px 16px;font-size:13px;color:#374151;">Concurrence</td>
                  <td style="padding:12px 16px;font-size:13px;color:#6b7280;">Voir dans Insight →</td>
                </tr>
              </table>

              <a href="${monitorUrl}" style="display:inline-block;padding:12px 28px;background:#111827;color:#ffffff;font-size:13px;font-weight:500;text-decoration:none;">
                Ouvrir le suivi temps réel →
              </a>
            </td></tr>

            ${row.decision_date ? `
            <tr><td style="padding:16px 40px;background:#f9fafb;border-top:1px solid #f3f4f6;">
              <p style="font-size:12px;color:#9ca3af;margin:0;">Date limite de décision : ${fmtDate(row.decision_date)}</p>
            </td></tr>` : ""}

            <tr><td style="padding:20px 40px;border-top:1px solid #f3f4f6;">
              <p style="font-size:11px;color:#9ca3af;margin:0;">
                ${isMandatory
                  ? "Ce suivi J-3 est automatiquement activé pour toutes les dates confirmées."
                  : "Vous recevez cet email car vous avez activé le suivi quotidien J-7."
                }
                <a href="https://musesquare.com/notifications" style="color:#9ca3af;">Gérer mes préférences</a>
              </p>
            </td></tr>

          </table>
        </td></tr>
      </table>
    </body>
    </html>
  `;
}