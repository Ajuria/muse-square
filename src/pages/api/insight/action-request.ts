import type { APIRoute } from "astro";
import { BigQuery } from "@google-cloud/bigquery";

export const prerender = false;

// Action type labels (for notification readability)
const ACTION_TYPE_LABELS: Record<string, string> = {
  prevenir_visiteurs: "Prévenir mes visiteurs",
  adapter_equipe: "Adapter mon équipe",
  publier_reseaux: "Publier sur les réseaux",
  adapter_signaletique: "Adapter signalétique / accès",
  coordonner_fournisseurs: "Coordonner fournisseurs / livraisons",
  autre: "Autre",
};

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const userId =
      (locals as any)?.auth?.()?.userId ??
      (locals as any)?.userId ??
      null;
    if (!userId) {
      return new Response(JSON.stringify({ ok: false, error: "Non authentifié" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      });
    }

    const body = await request.json().catch(() => null);
    if (!body) {
      return new Response(JSON.stringify({ ok: false, error: "Corps invalide" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    const {
      action_type,       // string — key from ACTION_TYPE_LABELS
      note,              // string — free text (optional)
      change_subtype,    // string — from feed item
      signal_summary,    // string — feedLine1 text
      impact_summary,    // string — feedLine2 text
      recommended_action,// string — the "Do what" text
      affected_date,     // string — YYYY-MM-DD
      location_id,       // string
      entity_id,         // string | null — event/competitor id
      alert_level,       // number
      urgency_label,     // string — "Aujourd'hui", "Avant 12h", etc.
    } = body;

    if (!action_type || !change_subtype || !location_id) {
      return new Response(
        JSON.stringify({ ok: false, error: "Champs requis manquants: action_type, change_subtype, location_id" }),
        { status: 400, headers: { "content-type": "application/json" } }
      );
    }

    // Insert into BigQuery
    const bq = new BigQuery({ projectId: "ms-database-472505" });
    const table = bq
      .dataset("insight_event", { projectId: "muse-square-open-data" })
      .table("action_requests");

    const row = {
      request_id: crypto.randomUUID(),
      user_id: userId,
      location_id: location_id,
      action_type: action_type,
      action_type_label: ACTION_TYPE_LABELS[action_type] || action_type,
      note: note || null,
      change_subtype: change_subtype,
      signal_summary: signal_summary || null,
      impact_summary: impact_summary || null,
      recommended_action: recommended_action || null,
      affected_date: affected_date || null,
      entity_id: entity_id || null,
      alert_level: alert_level != null ? Number(alert_level) : null,
      urgency_label: urgency_label || null,
      status: "pending",        // pending → in_progress → done
      created_at: new Date().toISOString(),
      resolved_at: null,
      resolution_note: null,
    };

    await table.insert([row]).catch(async (err: any) => {
      // Table might not exist yet — create it
      if (err?.code === 404 || err?.message?.includes("Not found")) {
        const schema = [
          { name: "request_id", type: "STRING", mode: "REQUIRED" },
          { name: "user_id", type: "STRING", mode: "REQUIRED" },
          { name: "location_id", type: "STRING", mode: "REQUIRED" },
          { name: "action_type", type: "STRING", mode: "REQUIRED" },
          { name: "action_type_label", type: "STRING" },
          { name: "note", type: "STRING" },
          { name: "change_subtype", type: "STRING" },
          { name: "signal_summary", type: "STRING" },
          { name: "impact_summary", type: "STRING" },
          { name: "recommended_action", type: "STRING" },
          { name: "affected_date", type: "DATE" },
          { name: "entity_id", type: "STRING" },
          { name: "alert_level", type: "INT64" },
          { name: "urgency_label", type: "STRING" },
          { name: "status", type: "STRING" },
          { name: "created_at", type: "TIMESTAMP" },
          { name: "resolved_at", type: "TIMESTAMP" },
          { name: "resolution_note", type: "STRING" },
        ];
        await bq
          .dataset("insight_event", { projectId: "muse-square-open-data" })
          .createTable("action_requests", { schema: { fields: schema } });
        // Retry insert
        await table.insert([row]);
      } else {
        throw err;
      }
    });

    // Send webhook notification (email via Vercel or any webhook)
    // During beta: notify Julen directly
    const webhookUrl = import.meta.env.ACTION_REQUEST_WEBHOOK_URL;
    if (webhookUrl) {
      fetch(webhookUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          text: `🔔 Nouvelle demande d'action\n\n` +
            `**Type:** ${ACTION_TYPE_LABELS[action_type] || action_type}\n` +
            `**Signal:** ${signal_summary || change_subtype}\n` +
            `**Impact:** ${impact_summary || "—"}\n` +
            `**Action recommandée:** ${recommended_action || "—"}\n` +
            `**Note utilisateur:** ${note || "—"}\n` +
            `**Date concernée:** ${affected_date || "—"}\n` +
            `**Urgence:** ${urgency_label || "—"}\n` +
            `**Location:** ${location_id}\n` +
            `**ID:** ${row.request_id}`,
          ...row,
        }),
      }).catch(() => {
        // Fire and forget — don't block the response
      });
    }

    return new Response(
      JSON.stringify({ ok: true, request_id: row.request_id }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[action-request] Error:", err);
    return new Response(
      JSON.stringify({ ok: false, error: "Erreur serveur" }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }
};