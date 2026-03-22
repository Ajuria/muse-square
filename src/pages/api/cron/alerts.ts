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

    // Find all unsent critical alerts (level 3+) for users who have alerts_critical = true
    const [rows] = await bigquery.query({
      query: `
        SELECT
          a.alert_id,
          a.saved_item_id,
          a.alert_level,
          a.change_category,
          a.change_subtype,
          a.affected_date,
          a.event_label,
          s.title,
          s.clerk_user_id,
          s.location_id,
          p.email
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
          subject: `Alerte niveau ${row.alert_level} détectée — ${row.title}`,
          html: buildAlertEmail(row),
        });
        sent++;
        alertIds.push(row.alert_id);
      } catch (e) {
        console.error("[cron/alerts] send failed for", row.email, e);
      }
    }

    // Mark alerts as notified
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

function buildAlertEmail(row: any): string {
  const levelColor = row.alert_level >= 4 ? "#E24B4A" : "#EF9F27";
  const levelLabel = row.alert_level >= 4 ? "Impact majeur" : "Impact fort";
  const date = row.affected_date ? String(row.affected_date.value ?? row.affected_date) : "";
  return `<p>Placeholder alert email — date: ${date}, level: ${row.alert_level}, title: ${row.title}</p>`;
}