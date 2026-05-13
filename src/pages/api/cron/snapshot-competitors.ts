import "dotenv/config";
import type { APIRoute } from "astro";
import { makeBQClient } from "../../../lib/bq";
import { randomUUID } from "crypto";
import { createHash } from "crypto";

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

export const GET: APIRoute = async () => {
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
    return new Response(
      JSON.stringify({ ok: false, error: err?.message }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }
};