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

    // Find events that ended exactly 7 days ago, no bilan submitted yet,
    // and primary account holder has an email
    const [rows] = await bigquery.query({
      query: `
        SELECT
          s.saved_item_id,
          s.clerk_user_id,
          s.title,
          s.selected_date,
          s.event_end_date,
          p.email,
          p.first_name
        FROM \`${projectId}.raw.saved_items\` s
        JOIN \`${projectId}.raw.insight_event_user_location_profile\` p
          ON s.clerk_user_id = p.clerk_user_id
          AND p.is_primary = TRUE
        WHERE s.event_end_date = DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)
          AND s.selected_date IS NOT NULL
          AND p.email IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM \`${projectId}.raw.event_outcomes\` o
            WHERE o.saved_item_id = s.saved_item_id
              AND o.clerk_user_id = s.clerk_user_id
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
      try {
        const selDate = row.selected_date?.value ?? row.selected_date ?? "";
        const bilanUrl = `${baseUrl}/app/insightevent/monitor?saved_item_id=${encodeURIComponent(row.saved_item_id)}&date=${encodeURIComponent(selDate)}&mode=bilan`;

        await resend.emails.send({
          from: "Insight <insight@musesquare.com>",
          replyTo: "contact@musesquare.com",
          to: row.email,
          subject: `Votre bilan post-événement — ${row.title}`,
          html: buildBilanEmail(row, bilanUrl),
        });
        sent++;
      } catch (e) {
        console.error("[cron/bilan] send failed for", row.email, e);
      }
    }

    return new Response(JSON.stringify({ ok: true, sent }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });

  } catch (err: any) {
    console.error("[cron/bilan]", err);
    return new Response(JSON.stringify({ ok: false, error: err?.message }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
};

function esc(v: any): string {
  return String(v ?? "")
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

function buildBilanEmail(row: any, bilanUrl: string): string {
  const firstName = row.first_name ? String(row.first_name) : "vous";

  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Bilan post-événement — Insight</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f3f4f6;padding:40px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">

  <tr><td style="background:#ffffff;padding:24px 40px;border-bottom:1px solid #e5e7eb;">
    <div style="font-size:13px;font-weight:500;letter-spacing:0.04em;color:#111827;">MUSE SQUARE <span style="font-style:italic;font-weight:400;">insight</span></div>
  </td></tr>

  <tr><td style="background:#ffffff;padding:40px 40px;border-bottom:1px solid #e5e7eb;">
    <div style="font-size:11px;font-weight:500;letter-spacing:0.14em;text-transform:uppercase;color:#0b37e5;margin-bottom:12px;">Bilan post-événement</div>
    <div style="font-size:28px;font-weight:300;color:#111827;line-height:1.1;margin-bottom:24px;">${esc(row.title)}</div>
    <div style="font-size:14px;color:#374151;line-height:1.7;">Bonjour ${esc(firstName)},<br><br>Votre événement s'est terminé il y a 7 jours. 3 questions rapides nous aident à calibrer vos prochaines recommandations — les conditions que nous avions prévues étaient-elles conformes à ce que vous avez observé ?</div>
  </td></tr>

  <tr><td style="background:#ffffff;padding:32px 40px 40px 40px;">
    <a href="${esc(bilanUrl)}" style="display:inline-block;padding:12px 28px;background:#0b37e5;color:#ffffff;font-size:13px;font-weight:500;text-decoration:none;letter-spacing:0.02em;">
      Compléter mon bilan →
    </a>
    <div style="margin-top:16px;font-size:12px;color:#9ca3af;">3 questions · 2 minutes</div>
  </td></tr>

  <tr><td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:20px 40px;">
    <div style="font-size:11px;color:#9ca3af;line-height:1.6;">
      Cet email est envoyé au titulaire principal du compte.
      &nbsp;·&nbsp;
      <a href="${esc(bilanUrl.split('/app')[0])}/notifications" style="color:#9ca3af;text-decoration:underline;">Gérer mes préférences</a>
    </div>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}