import "dotenv/config";
import type { APIRoute } from "astro";
import { makeBQClient } from "../../../lib/bq";
import { requireLocationOwnership } from "../../../lib/requireLocationOwnership";

export const prerender = false;

// Périmètre de clientèle déclaré par l'exploitant (docs/perimetre-client-spec.md).
// 'commune' -> rayon 1 km · 'beyond' -> rayon 20 km · NULL -> aucun rayon, comportement actuel.
// NULL est un état de plein droit : c'est lui qui déclenche l'affichage de la question sur la carte.
// Endpoint DÉDIÉ et non une extension de save.ts : la réponse vient d'un clic, alors que save.ts
// fait un MERGE de ~40 champs plus un géocodage — on paierait tout ça pour un mot.
const ALLOWED = new Set(["commune", "beyond"]);

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const clerk_user_id = (locals as any)?.clerk_user_id;
    if (typeof clerk_user_id !== "string" || !clerk_user_id.trim()) {
      return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
        status: 401, headers: { "content-type": "application/json" },
      });
    }

    const body = await request.json();
    const location_id = String(body.location_id || "").trim();
    const catchment = String(body.catchment || "").trim();

    if (!location_id) {
      return new Response(JSON.stringify({ ok: false, error: "location_id required" }), {
        status: 400, headers: { "content-type": "application/json" },
      });
    }
    requireLocationOwnership(locals, location_id);

    // Validation STRICTE : toute autre valeur est rejetée, jamais coercée vers un défaut —
    // un périmètre deviné réintroduirait l'instabilité mesurée (9 lieux sur 30 basculaient).
    if (!ALLOWED.has(catchment)) {
      return new Response(JSON.stringify({ ok: false, error: "catchment must be 'commune' or 'beyond'" }), {
        status: 400, headers: { "content-type": "application/json" },
      });
    }

    const projectId = process.env.BQ_PROJECT_ID!;
    const bigquery = makeBQClient(projectId);
    const BQ_LOCATION = (process.env.BQ_LOCATION || "EU").trim();

    // 1. La table de profil — la source de vérité que la chaîne dbt lit
    //    (stg_insight_event_user_location_profile -> int_client_website_profiles -> dim_client_location).
    await bigquery.query({
      query: `
        UPDATE \`${projectId}.raw.insight_event_user_location_profile\`
        SET client_catchment = @catchment,
            updated_at = CURRENT_TIMESTAMP()
        WHERE clerk_user_id = @clerk_user_id AND location_id = @location_id
      `,
      params: { clerk_user_id, location_id, catchment },
      types: { clerk_user_id: "STRING", location_id: "STRING", catchment: "STRING" },
      location: BQ_LOCATION,
    });

    // 2. Synchronisation de dim_client_location (non fatale) — même parti pris que save.ts à son
    //    bloc dimSyncParams. Sans elle, la valeur n'atteindrait la dimension qu'au prochain run dbt
    //    et la carte reposerait la question entre-temps. UPDATE et non MERGE : un lieu qui répond
    //    à la question existe déjà dans la dimension par construction.
    await bigquery.query({
      query: `
        UPDATE \`${projectId}.dims.dim_client_location\`
        SET client_catchment = @catchment
        WHERE location_id = @location_id
      `,
      params: { location_id, catchment },
      types: { location_id: "STRING", catchment: "STRING" },
      location: BQ_LOCATION,
    }).catch((e: any) => {
      console.error("[set-catchment] dim_client_location sync failed (non-fatal):", e?.message);
    });

    return new Response(JSON.stringify({ ok: true, catchment }), {
      status: 200, headers: { "content-type": "application/json" },
    });

  } catch (err: any) {
    console.error("[set-catchment]", err);
    return new Response(JSON.stringify({ ok: false, error: err?.message }), {
      status: 500, headers: { "content-type": "application/json" },
    });
  }
};
