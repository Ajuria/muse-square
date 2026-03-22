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
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function daysUntil(val: any): number | null {
  const s = val?.value ?? val ?? "";
  if (!s) return null;
  const target = new Date(String(s));
  if (isNaN(target.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

function buildDigestEmail(row: any): string {
  const firstName = row.first_name ? String(row.first_name) : "vous";
  const items = Array.isArray(row.items) ? row.items.filter((i: any) => i?.title) : [];

  const itemsHtml = items.length === 0
    ? `<p style="color:#6b7280;font-size:14px;">Aucune date enregistrée.</p>`
    : items.map((item: any) => {
        const d = daysUntil(item.decision_date);
        const countdown = d === null ? null : d < 0 ? "Décision passée" : d === 0 ? "Décision aujourd'hui" : `J-${d} avant décision`;
        const hasSelected = item.selected_date;

        return `
          <div style="padding:16px 0;border-bottom:1px solid #f3f4f6;">
            <div style="font-size:15px;font-weight:600;color:#111827;margin-bottom:4px;">${esc(item.title)}</div>
            <div style="font-size:13px;color:#6b7280;display:flex;gap:16px;flex-wrap:wrap;">
              ${item.decision_date ? `<span>Décision : ${fmtDate(item.decision_date)}${countdown ? ` — <strong style="color:#111827;">${countdown}</strong>` : ""}</span>` : ""}
              ${item.event_end_date ? `<span>Événement : ${fmtDate(item.event_end_date)}</span>` : ""}
              ${hasSelected ? `<span style="color:#059669;font-weight:500;">✓ Date choisie : ${fmtDate(item.selected_date)}</span>` : `<span style="color:#d97706;">En attente de choix</span>`}
            </div>
          </div>
        `;
      }).join("");

  return `
    <!DOCTYPE html>
    <html lang="fr">
    <head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
    <body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:40px 0;">
        <tr><td align="center">
          <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e5e7eb;max-width:600px;width:100%;">

            <tr><td style="padding:32px 40px 24px 40px;border-bottom:1px solid #f3f4f6;">
              <div style="font-size:11px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:#9ca3af;margin-bottom:8px;">MUSE SQUARE INSIGHT</div>
              <div style="font-size:22px;font-weight:300;color:#111827;">Digest hebdomadaire</div>
            </td></tr>

            <tr><td style="padding:24px 40px 8px 40px;">
              <p style="font-size:14px;color:#374151;margin:0 0 4px 0;">Bonjour ${esc(firstName)},</p>
              <p style="font-size:14px;color:#6b7280;margin:0;">Voici l'état de vos dates enregistrées cette semaine.</p>
            </td></tr>

            <tr><td style="padding:8px 40px 24px 40px;">
              ${itemsHtml}
            </td></tr>

            <tr><td style="padding:24px 40px;background:#f9fafb;border-top:1px solid #f3f4f6;">
              <a href="https://musesquare.com/app/insightevent/days" style="display:inline-block;padding:10px 24px;background:#111827;color:#ffffff;font-size:13px;font-weight:500;text-decoration:none;">
                Ouvrir Insight →
              </a>
            </td></tr>

            <tr><td style="padding:20px 40px;border-top:1px solid #f3f4f6;">
              <p style="font-size:11px;color:#9ca3af;margin:0;">
                Vous recevez cet email car vous avez activé le digest hebdomadaire dans vos préférences Insight.
                <a href="https://musesquare.com/notifications" style="color:#9ca3af;">Se désinscrire</a>
              </p>
            </td></tr>

          </table>
        </td></tr>
      </table>
    </body>
    </html>
  `;
}

function esc(v: any): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}