import type { APIRoute } from "astro";
import { makeBQClient } from "../../../lib/bq";
export const prerender = false;

// Qualification du RÔLE d'un compte client depuis la carte client_dormant (geste
// « Préciser ce compte », spec docs/client-patterns-spec.md § R.3).
// Vocabulaire verrouillé owner 07/08 — une valeur = un couple détecteur × famille d'actions.
// 'unknown' n'est pas proposable : c'est le défaut, jamais une réponse.
const VALID_ROLES = ["pro_recurring", "pro_project", "consumer_recurring", "consumer", "channel"];
// Pour role='channel', le TYPE de canal est obligatoire — un canal anonyme n'est pas
// exploitable ; la valeur s'écrit dans party_directory.channel et reroute le CA du compte
// vers l'analyse canal (même mécanique que le comptoir, via la facette canal du staging).
const VALID_CHANNEL_KINDS = ["corner", "commission", "canal"];

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const userId = String((locals as any)?.clerk_user_id || "").trim() || null;
    if (!userId) {
      return new Response(JSON.stringify({ ok: false }), {
        status: 401,
        headers: { "content-type": "application/json" },
      });
    }

    const body = await request.json().catch(() => null);
    const locationId = String(body?.location_id || "").trim();
    const partyCode = String(body?.party_code || "").trim();
    const role = String(body?.party_role || "").trim();
    const channelKind = body?.channel_kind ? String(body.channel_kind).trim() : null;
    const allLocs: string[] = Array.isArray((locals as any)?.all_location_ids)
      ? (locals as any).all_location_ids.map((l: any) => String(l))
      : [];

    if (
      !locationId ||
      !partyCode ||
      !VALID_ROLES.includes(role) ||
      (role === "channel" && !VALID_CHANNEL_KINDS.includes(channelKind || "")) ||
      (role !== "channel" && channelKind !== null) ||
      !allLocs.includes(locationId)
    ) {
      return new Response(JSON.stringify({ ok: false, error: "Invalid payload" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    const projectId = String(process.env.BQ_PROJECT_ID || "muse-square-open-data").trim();
    const bq = makeBQClient(projectId);

    // Le compte est identifié par (source_location_id, party_code) — le site d'IMPORT.
    // La carte porte le site ROUTÉ : on résout la clé annuaire via le mart clients,
    // ce qui vérifie du même coup que ce compte existe bien pour ce site.
    const [partyRows]: any = await bq.query({
      query: `
        SELECT source_location_id
        FROM \`${projectId}.mart.fct_location_client_patterns\`
        WHERE location_id = @location_id AND party_code = @party_code
        LIMIT 1`,
      params: { location_id: locationId, party_code: partyCode },
      location: "EU",
    });
    const sourceLocationId = partyRows?.[0]?.source_location_id;
    if (!sourceLocationId) {
      return new Response(JSON.stringify({ ok: false, error: "Unknown party" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    }

    // MERGE DML — JAMAIS de streaming insert sur party_directory : table load-job que
    // l'app réécrit par DML (un buffer de streaming bloquerait UPDATE/DELETE, leçon
    // best_practices/dispositif_triggers).
    await bq.query({
      query: `
        MERGE \`${projectId}.analytics.party_directory\` d
        USING (SELECT @src AS source_location_id, @party AS party_code) s
        ON d.source_location_id = s.source_location_id AND d.party_code = s.party_code
        WHEN MATCHED THEN UPDATE SET
          party_role   = @role,
          channel      = COALESCE(@channel_kind, d.channel),
          match_status = 'user_card',
          source_file  = @provenance,
          loaded_at    = CURRENT_TIMESTAMP()
        WHEN NOT MATCHED THEN INSERT
          (source_location_id, party_code, party_role, channel, match_status, source_file, loaded_at)
          VALUES (@src, @party, @role, @channel_kind, 'user_card', @provenance, CURRENT_TIMESTAMP())`,
      params: {
        src: sourceLocationId,
        party: partyCode,
        role,
        channel_kind: channelKind,
        provenance: `user_card:${userId}`,
      },
      types: { channel_kind: "STRING" },
      location: "EU",
    });

    // Audit — même rail que confirm.ts (action_log accepte le streaming : append-only).
    const actionTable = bq.dataset("analytics").table("action_log");
    await actionTable
      .insert([
        {
          log_id: crypto.randomUUID(),
          user_id: userId,
          location_id: locationId,
          affected_date: null,
          change_subtype: "party_role",
          action_key: partyCode,
          action_text: role + (channelKind ? `:${channelKind}` : ""),
          action_category: "party_qualification",
          channel: null,
          event: "party_role_set",
          created_at: new Date().toISOString(),
        },
      ])
      .catch(() => {});

    return new Response(JSON.stringify({ ok: true, party_code: partyCode, party_role: role }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (err: any) {
    console.error("party-role error:", err?.message, err?.errors ? JSON.stringify(err.errors) : "");
    return new Response(JSON.stringify({ ok: false, error: err?.message || "Unknown" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
};
