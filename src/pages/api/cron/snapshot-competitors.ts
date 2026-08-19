import "dotenv/config";
import type { APIRoute } from "astro";
import { makeBQClient } from "../../../lib/bq";
import { randomUUID } from "crypto";
import { createHash } from "crypto";
import { waitUntil } from "@vercel/functions";
import { getCompetitorCommercialNews } from "../../../lib/ai/webContext";
import { GET as competitorProfileGET } from "../competitive/competitor-profile";
import { POST as enrichEventPOST } from "../insight/enrich-event";

export const prerender = false;

const PLACES_API_BASE = "https://places.googleapis.com/v1/places";

interface PlaceDetailsResult {
  rating?: number;
  userRatingCount?: number;
  photos?: { name: string }[];
  currentOpeningHours?: { weekdayDescriptions?: string[] };
  regularOpeningHours?: { weekdayDescriptions?: string[] };
  reviews?: { text?: { text?: string }; publishTime?: string }[];
}

function hashString(s: string): string {
  return createHash("sha256").update(s).digest("hex").slice(0, 16);
}

async function fetchPlaceDetails(
  googlePlaceId: string,
  apiKey: string
): Promise<PlaceDetailsResult | null> {
  try {
    const fields = [
      "rating",
      "userRatingCount",
      "photos",
      "currentOpeningHours",
      "regularOpeningHours",
      "reviews",
    ].join(",");

    const res = await fetch(`${PLACES_API_BASE}/${googlePlaceId}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": fields,
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      console.error(
        `[snapshot] Places API error for ${googlePlaceId}: ${res.status} ${res.statusText}`
      );
      return null;
    }

    return (await res.json()) as PlaceDetailsResult;
  } catch (err: any) {
    console.error(
      `[snapshot] Places API fetch failed for ${googlePlaceId}:`,
      err?.message
    );
    return null;
  }
}

async function runSnapshots() {
  try {
    const apiKey = (process.env.GOOGLE_PLACES_API_KEY || "").trim();
    if (!apiKey) {
      return new Response(
        JSON.stringify({ ok: false, error: "GOOGLE_PLACES_API_KEY not set" }),
        { status: 500, headers: { "content-type": "application/json" } }
      );
    }

    const projectId = String(
      process.env.BQ_PROJECT_ID || "muse-square-open-data"
    ).trim();
    const bq = makeBQClient(projectId);
    const BQ_LOCATION = (process.env.BQ_LOCATION || "EU").trim();

    // Get all followed competitors with a google_place_id
    const [rows] = await bq.query({
      query: `
        SELECT DISTINCT
          cd.competitor_id,
          cd.google_place_id,
          cd.entity_type,
          ct.location_id
        FROM \`${projectId}.raw.competitor_directory\` cd
        INNER JOIN \`${projectId}.raw.competitor_tracking\` ct
          ON cd.competitor_id = ct.competitor_id
          AND ct.deleted_at IS NULL
        WHERE cd.deleted_at IS NULL
          AND cd.google_place_id IS NOT NULL
          AND cd.google_place_id != ''
      `,
      location: BQ_LOCATION,
    });

    if (!Array.isArray(rows) || rows.length === 0) {
      return new Response(
        JSON.stringify({
          ok: true,
          processed: 0,
          message: "No competitors with google_place_id found",
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }

    const today = new Date().toISOString().slice(0, 10);
    let processed = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const row of rows) {
      const competitorId = String(row.competitor_id);
      const googlePlaceId = String(row.google_place_id);
      const entityType = row.entity_type ?? "competitor";
      const locationId = row.location_id ?? null;

      const details = await fetchPlaceDetails(googlePlaceId, apiKey);

      if (!details) {
        // Insert a failed snapshot row for audit trail
        await bq.query({
          query: `
            INSERT INTO \`${projectId}.raw.competitor_snapshots\` (
              snapshot_id, competitor_id, entity_type, location_id,
              snapshot_date, source, crawl_status, created_at
            ) VALUES (
              @snapshot_id, @competitor_id, @entity_type, @location_id,
              DATE(@snapshot_date), 'gbp', 'failed', CURRENT_TIMESTAMP()
            )
          `,
          params: {
            snapshot_id: randomUUID(),
            competitor_id: competitorId,
            entity_type: entityType,
            location_id: locationId,
            snapshot_date: today,
          },
          types: {
            snapshot_id: "STRING",
            competitor_id: "STRING",
            entity_type: "STRING",
            location_id: "STRING",
            snapshot_date: "STRING",
          },
          location: BQ_LOCATION,
        });
        failed++;
        errors.push(competitorId);
        continue;
      }

      const googleRating = details.rating ?? null;
      const googleRatingCount = details.userRatingCount ?? null;
      const googlePhotosCount = details.photos?.length ?? null;

      const hours =
        details.regularOpeningHours?.weekdayDescriptions ??
        details.currentOpeningHours?.weekdayDescriptions ??
        null;
      const googleHoursHash = hours ? hashString(JSON.stringify(hours)) : null;

      const reviews = (details.reviews ?? []).slice(0, 5);
      const reviewTextsJson =
        reviews.length > 0
          ? JSON.stringify(
              reviews.map((r) => ({
                text: r.text?.text ?? "",
                publishTime: r.publishTime ?? null,
              }))
            )
          : null;

      const rawExtractionJson = JSON.stringify(details);

      await bq.query({
        query: `
          INSERT INTO \`${projectId}.raw.competitor_snapshots\` (
            snapshot_id, competitor_id, entity_type, location_id,
            snapshot_date, source,
            google_rating, google_rating_count, google_photos_count,
            google_hours_hash, review_texts_json,
            raw_extraction_json, crawl_status, created_at
          ) VALUES (
            @snapshot_id, @competitor_id, @entity_type, @location_id,
            DATE(@snapshot_date), 'gbp',
            @google_rating, @google_rating_count, @google_photos_count,
            @google_hours_hash, @review_texts_json,
            @raw_extraction_json, 'success', CURRENT_TIMESTAMP()
          )
        `,
        params: {
          snapshot_id: randomUUID(),
          competitor_id: competitorId,
          entity_type: entityType,
          location_id: locationId,
          snapshot_date: today,
          google_rating: googleRating,
          google_rating_count: googleRatingCount,
          google_photos_count: googlePhotosCount,
          google_hours_hash: googleHoursHash,
          review_texts_json: reviewTextsJson,
          raw_extraction_json: rawExtractionJson,
        },
        types: {
          snapshot_id: "STRING",
          competitor_id: "STRING",
          entity_type: "STRING",
          location_id: "STRING",
          snapshot_date: "STRING",
          google_rating: "FLOAT64",
          google_rating_count: "INT64",
          google_photos_count: "INT64",
          google_hours_hash: "STRING",
          review_texts_json: "STRING",
          raw_extraction_json: "STRING",
        },
        location: BQ_LOCATION,
      });

      // Update competitor_directory with latest rating data
      await bq.query({
        query: `
          UPDATE \`${projectId}.raw.competitor_directory\`
          SET
            google_rating = @google_rating,
            google_rating_count = @google_rating_count,
            updated_at = CURRENT_TIMESTAMP()
          WHERE competitor_id = @competitor_id
            AND deleted_at IS NULL
        `,
        params: {
          google_rating: googleRating,
          google_rating_count: googleRatingCount,
          competitor_id: competitorId,
        },
        types: {
          google_rating: "FLOAT64",
          google_rating_count: "INT64",
          competitor_id: "STRING",
        },
        location: BQ_LOCATION,
      });

      processed++;
    }

    return new Response(
      JSON.stringify({
        ok: true,
        processed,
        failed,
        total: rows.length,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[snapshot-competitors]", err?.message);
  }
}

// ── Enrichissement de fiche (validé owner 17/08) : actualité commerciale (lecture web, cache 7 j
//    sur la fiche) + analyse concurrentielle (competitor-profile EXISTANT — il génère et cache
//    competitive_analysis_json s'il manque). Cap 2 suivis par nuit (motif crawl-best-in-class
//    ?n=1) : tous les suivis d'un compte cyclent en quelques nuits, jamais un run > budget Vercel.
async function runFicheEnrichment() {
  const projectId = (process.env.BQ_PROJECT_ID || "muse-square-open-data").trim();
  const bq = makeBQClient(projectId);
  const flatv = (v: any): any => (v && typeof v === "object" && "value" in v ? v.value : v);
  // Colonnes du cache (idempotent — la migration du 17/08 les a posées, ceci garde les env neufs).
  await bq.query({
    query: `ALTER TABLE \`${projectId}.raw.competitor_directory\`
            ADD COLUMN IF NOT EXISTS commercial_news_json STRING,
            ADD COLUMN IF NOT EXISTS commercial_news_at TIMESTAMP`,
    location: "EU",
  }).catch((e: any) => console.warn("[fiche-enrich] ALTER:", e?.message));
  // Candidats : suivis VIVANTS dont l'actu a > 7 j (ou jamais lue) OU sans analyse cachée —
  // les plus anciens d'abord. Le clerk_user_id du suiveur sert au competitor-profile (auth locals).
  const [rows] = await bq.query({
    query: `SELECT ct.location_id, cd.competitor_id, cd.competitor_name,
                   cd.source_url, cd.tarifs_url,
                   (cd.competitive_analysis_json IS NULL AND cd.auto_enriched_description IS NOT NULL) AS needs_analysis,
                   (cd.commercial_news_at IS NULL
                    OR cd.commercial_news_at < TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)) AS needs_news,
                   (SELECT ANY_VALUE(clerk_user_id) FROM \`${projectId}.raw.insight_event_user_location_profile\` p
                    WHERE p.location_id = ct.location_id) AS clerk_user_id
            FROM \`${projectId}.raw.competitor_tracking\` ct
            JOIN \`${projectId}.raw.competitor_directory\` cd
              ON cd.competitor_id = ct.competitor_id AND cd.deleted_at IS NULL
            WHERE ct.deleted_at IS NULL
            QUALIFY ROW_NUMBER() OVER (PARTITION BY cd.competitor_id ORDER BY ct.created_at) = 1
            ORDER BY cd.commercial_news_at IS NULL DESC, cd.commercial_news_at
            LIMIT 6`,
    location: "EU",
  });
  const todo = (rows as any[]).filter((r) => flatv(r.needs_analysis) || flatv(r.needs_news)).slice(0, 2);
  console.log(`[fiche-enrich] ${todo.length} suivi(s) cette nuit`);
  for (const r of todo) {
    const cid = String(flatv(r.competitor_id));
    const nom = String(flatv(r.competitor_name) || "");
    try {
      if (flatv(r.needs_news)) {
        const urls = [flatv(r.source_url), flatv(r.tarifs_url)].filter(Boolean).map(String);
        if (urls.length) {
          const news = await getCompetitorCommercialNews(bq, { competitor_id: cid, competitor_name: nom, urls });
          console.log(`[fiche-enrich] actu ${nom}: ${news ? (news.mises_en_avant || []).length + " mises en avant" : "vide"}`);
        }
      }
      if (flatv(r.needs_analysis) && flatv(r.clerk_user_id)) {
        // Le VRAI endpoint (446 lignes) — il génère + cache l'analyse si absente. Invocation
        // directe avec les locals du suiveur (même motif que les harnais).
        const locals = { clerk_user_id: String(flatv(r.clerk_user_id)), location_id: String(flatv(r.location_id)) };
        const res = await competitorProfileGET({ url: new URL("http://cron/api/competitive/competitor-profile?id=" + encodeURIComponent(cid)), locals } as any);
        const j = JSON.parse(await (res as any).text());
        console.log(`[fiche-enrich] analyse ${nom}: ${j.ok ? (j.analysis ? "générée/cachée" : "sans matière") : j.error}`);
      }
    } catch (e: any) {
      console.error(`[fiche-enrich] ${nom}:`, e?.message);
    }
  }
}

// ── Surface « événements publics » MATÉRIALISÉE (19/08) — le budget 3 s du tableau. ──
// Le calcul (vue jour×événement 14/30 j + jointures géodésiques) coûte 10-17 s : à la requête
// c'est interdit (mesuré — il aurait mangé le budget du dashboard) ; on le paie UNE fois par
// nuit ici, même doctrine que fct_location_events_radius_daily. CREATE OR REPLACE = bascule
// atomique, jamais d'état partiel. Le dashboard ne fait plus que LIRE ces deux tables.
export async function runEventSurface(): Promise<void> {
  const projectId = (process.env.BQ_PROJECT_ID || "muse-square-open-data").trim();
  const bq = makeBQClient(projectId);
  const t0 = Date.now();
  await bq.query({
    query: `CREATE OR REPLACE TABLE \`${projectId}.analytics.location_public_events\` AS
      WITH locs AS (
        SELECT cl.location_id, cl.geo_point, cib.industry_bucket
        FROM \`${projectId}.dims.dim_client_location\` cl
        LEFT JOIN \`${projectId}.open_data.event_industry_keywords_normalization\` cib
          ON cib.raw_industry_code = cl.client_industry_code AND cib.source = 'client'
        WHERE cl.active_flag = TRUE AND cl.geo_point IS NOT NULL
      ),
      evt AS (
        SELECT event_uid, ANY_VALUE(event_label) nom, ANY_VALUE(event_venue_name) lieu,
               ANY_VALUE(city_name) ville, ANY_VALUE(industry_bucket) bucket,
               ANY_VALUE(geo_point) gp, MIN(date) d, MAX(date) dfin,
               ANY_VALUE(cached_audience_profile) pub, ANY_VALUE(is_free_bool) gratuit
        FROM \`${projectId}.intermediate.int_events_event_daily_enriched\`
        WHERE date BETWEEN CURRENT_DATE() AND DATE_ADD(CURRENT_DATE(), INTERVAL 14 DAY)
          AND geo_point IS NOT NULL AND COALESCE(is_cancelled_bool, FALSE) = FALSE
        GROUP BY event_uid
      )
      SELECT l.location_id, e.nom, e.lieu, e.ville,
             CAST(e.d AS STRING) d, CAST(e.dfin AS STRING) dfin,
             e.pub, e.gratuit, ROUND(ST_DISTANCE(e.gp, l.geo_point)) m,
             CURRENT_TIMESTAMP() AS computed_at
      FROM evt e
      JOIN locs l ON ST_DWITHIN(e.gp, l.geo_point, 15000) AND l.industry_bucket = e.bucket
      QUALIFY ROW_NUMBER() OVER (PARTITION BY l.location_id, e.nom, COALESCE(e.lieu, '')
                                 ORDER BY (e.pub IS NOT NULL) DESC, e.d) = 1`,
    location: "EU",
  });
  await bq.query({
    query: `CREATE OR REPLACE TABLE \`${projectId}.analytics.location_public_events_coverage\` AS
      WITH locs AS (
        SELECT cl.location_id, cl.geo_point
        FROM \`${projectId}.dims.dim_client_location\` cl
        WHERE cl.active_flag = TRUE AND cl.geo_point IS NOT NULL
      )
      SELECT l.location_id,
             COUNT(DISTINCT IF(ST_DWITHIN(e.geo_point, l.geo_point, 15000), e.event_uid, NULL)) n30,
             CURRENT_TIMESTAMP() AS computed_at
      FROM locs l
      LEFT JOIN \`${projectId}.intermediate.int_events_event_daily_enriched\` e
        ON e.date BETWEEN CURRENT_DATE() AND DATE_ADD(CURRENT_DATE(), INTERVAL 30 DAY)
       AND e.geo_point IS NOT NULL
      GROUP BY l.location_id`,
    location: "EU",
  });
  console.log(`[event-surface] tables matérialisées en ${Math.round((Date.now() - t0) / 1000)} s`);
}

// ── C5 (19/08) : enrichissement CIBLÉ des événements — l'entonnoir approuvé owner. ──
// Jamais les ~2 000 événements du mois : seulement ceux qui passent les deux portes GRATUITES
// (rayon 15 km d'un site client actif + MÊME bucket industrie), sans enrichissement frais
// (cached_enriched_at NULL ≤ 30 j), les plus proches dans le temps d'abord, plafond par nuit.
// Chaque enrichissement passe par le VRAI enrich-event (motif fiche-enrich : le rail, pas une
// copie) et remplit dims.dim_event_enrichment — dont audience_profile, le critère « publics ».
export async function runEventEnrichment(cap = 3): Promise<number> {
  const projectId = (process.env.BQ_PROJECT_ID || "muse-square-open-data").trim();
  const bq = makeBQClient(projectId);
  const flatv = (v: any): any => (v && typeof v === "object" && "value" in v ? v.value : v);
  const [rows] = await bq.query({
    query: `
      WITH locs AS (
        SELECT cl.location_id, cl.geo_point, cib.industry_bucket
        FROM \`${projectId}.dims.dim_client_location\` cl
        LEFT JOIN \`${projectId}.open_data.event_industry_keywords_normalization\` cib
          ON cib.raw_industry_code = cl.client_industry_code AND cib.source = 'client'
        WHERE cl.active_flag = TRUE AND cl.geo_point IS NOT NULL AND cib.industry_bucket IS NOT NULL
      ),
      evts AS (
        SELECT event_uid,
               ANY_VALUE(event_label) AS event_label,
               ANY_VALUE(description) AS description,
               ANY_VALUE(city_name) AS city_name,
               ANY_VALUE(city_id) AS city_id,
               ANY_VALUE(event_venue_name) AS event_venue_name,
               ANY_VALUE(industry_code) AS industry_code,
               ANY_VALUE(industry_bucket) AS industry_bucket,
               ANY_VALUE(geo_point) AS geo_point,
               MIN(date) AS first_date
        FROM \`${projectId}.intermediate.int_events_event_daily_enriched\`
        WHERE date BETWEEN CURRENT_DATE() AND DATE_ADD(CURRENT_DATE(), INTERVAL 30 DAY)
          AND geo_point IS NOT NULL
          AND COALESCE(is_cancelled_bool, FALSE) = FALSE
          AND industry_bucket IS NOT NULL AND industry_bucket != 'unknown'
          AND cached_enriched_at IS NULL
        GROUP BY event_uid
      )
      SELECT e.event_uid, e.event_label, e.description, e.city_name, e.city_id,
             e.event_venue_name, e.industry_code, e.first_date,
             l.location_id, ST_DISTANCE(e.geo_point, l.geo_point) AS distance_m
      FROM evts e
      JOIN locs l
        ON ST_DWITHIN(e.geo_point, l.geo_point, 15000)
       AND l.industry_bucket = e.industry_bucket
      QUALIFY ROW_NUMBER() OVER (PARTITION BY e.event_uid ORDER BY ST_DISTANCE(e.geo_point, l.geo_point)) = 1
      ORDER BY e.first_date ASC
      LIMIT @cap`,
    params: { cap },
    types: { cap: "INT64" },
    location: "EU",
  });
  const todo = Array.isArray(rows) ? (rows as any[]) : [];
  console.log(`[event-enrich] ${todo.length} événement(s) cette nuit (rayon+bucket, cap ${cap})`);
  let done = 0;
  for (const r of todo) {
    const label = String(flatv(r.event_label) || "");
    try {
      // Contexte profil du site le plus proche — les enums voyagent BRUTS, enrich-event les nomme.
      const [pRows] = await bq.query({
        query: `SELECT primary_audience_1, primary_audience_2, company_activity_type, main_event_objective
                FROM \`${projectId}.raw.insight_event_user_location_profile\`
                WHERE location_id = @l
                QUALIFY ROW_NUMBER() OVER (PARTITION BY location_id ORDER BY updated_at DESC) = 1`,
        params: { l: String(flatv(r.location_id)) },
        types: { l: "STRING" },
        location: "EU",
      });
      const p: any = (pRows as any[])[0] || {};
      const req = new Request("http://cron/api/insight/enrich-event", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          event_uid: String(flatv(r.event_uid)),
          event_label: label,
          description: flatv(r.description) || null,
          city_name: flatv(r.city_name) || null,
          city_id: flatv(r.city_id) || null,
          event_venue_name: flatv(r.event_venue_name) || null,
          industry_code: flatv(r.industry_code) || null,
          distance_m: flatv(r.distance_m) != null ? Number(flatv(r.distance_m)) : null,
          primary_audience_1: flatv(p.primary_audience_1) || null,
          primary_audience_2: flatv(p.primary_audience_2) || null,
          company_activity_type: flatv(p.company_activity_type) || null,
          main_event_objective: flatv(p.main_event_objective) || null,
        }),
      });
      const res = await enrichEventPOST({ request: req } as any);
      const j = JSON.parse(await (res as any).text());
      if (j.ok) done++;
      console.log(`[event-enrich] ${label}: ${j.ok ? (j.data?.primary_audience ? "public : " + j.data.primary_audience : "enrichi (public introuvable — dit)") : j.error}`);
    } catch (e: any) {
      console.error(`[event-enrich] ${label}:`, e?.message);
    }
  }
  return done;
}

export const GET: APIRoute = async ({ request }) => {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
      status: 401, headers: { "content-type": "application/json" },
    });
  }

  // Réponse immédiate ; les travaux vivent derrière la réponse (waitUntil — motif maison).
  waitUntil(runSnapshots().catch((e) => console.error("[snapshot-competitors] background error:", e?.message)));
  waitUntil(runFicheEnrichment().catch((e) => console.error("[fiche-enrich] background error:", e?.message)));
  waitUntil(runEventEnrichment().catch((e) => console.error("[event-enrich] background error:", e?.message)));
  waitUntil(runEventSurface().catch((e) => console.error("[event-surface] background error:", e?.message)));

  return new Response(
    JSON.stringify({ ok: true, status: "started" }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
};