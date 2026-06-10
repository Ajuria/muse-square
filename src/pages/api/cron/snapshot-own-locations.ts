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
        `[snapshot-own] Places API error for ${googlePlaceId}: ${res.status} ${res.statusText}`
      );
      return null;
    }

    return (await res.json()) as PlaceDetailsResult;
  } catch (err: any) {
    console.error(
      `[snapshot-own] Places API fetch failed for ${googlePlaceId}:`,
      err?.message
    );
    return null;
  }
}

async function runSnapshots() {
  try {
    const apiKey = (process.env.GOOGLE_PLACES_API_KEY || "").trim();
    if (!apiKey) {
      console.error("[snapshot-own] GOOGLE_PLACES_API_KEY not set");
      return;
    }

    const projectId = String(
      process.env.BQ_PROJECT_ID || "muse-square-open-data"
    ).trim();
    const bq = makeBQClient(projectId);
    const BQ_LOCATION = (process.env.BQ_LOCATION || "EU").trim();

    // Own locations with a google_place_id
    const [rows] = await bq.query({
      query: `
        SELECT DISTINCT
          location_id,
          google_place_id
        FROM \`${projectId}.raw.insight_event_user_location_profile\`
        WHERE google_place_id IS NOT NULL
          AND google_place_id != ''
      `,
      location: BQ_LOCATION,
    });

    if (!Array.isArray(rows) || rows.length === 0) {
      console.log("[snapshot-own] No own locations with google_place_id");
      return;
    }

    const today = new Date().toISOString().slice(0, 10);
    let processed = 0;
    let failed = 0;

    for (const row of rows) {
      const locationId = String(row.location_id);
      const googlePlaceId = String(row.google_place_id);

      const details = await fetchPlaceDetails(googlePlaceId, apiKey);

      if (!details) {
        await bq.query({
          query: `
            INSERT INTO \`${projectId}.raw.own_location_review_snapshots\` (
              snapshot_id, location_id, google_place_id,
              snapshot_date, source, crawl_status, created_at
            ) VALUES (
              @snapshot_id, @location_id, @google_place_id,
              DATE(@snapshot_date), 'gbp', 'failed', CURRENT_TIMESTAMP()
            )
          `,
          params: {
            snapshot_id: randomUUID(),
            location_id: locationId,
            google_place_id: googlePlaceId,
            snapshot_date: today,
          },
          types: {
            snapshot_id: "STRING",
            location_id: "STRING",
            google_place_id: "STRING",
            snapshot_date: "STRING",
          },
          location: BQ_LOCATION,
        });
        failed++;
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
          INSERT INTO \`${projectId}.raw.own_location_review_snapshots\` (
            snapshot_id, location_id, google_place_id,
            snapshot_date, source,
            google_rating, google_rating_count, google_photos_count,
            google_hours_hash, review_texts_json,
            raw_extraction_json, crawl_status, created_at
          ) VALUES (
            @snapshot_id, @location_id, @google_place_id,
            DATE(@snapshot_date), 'gbp',
            @google_rating, @google_rating_count, @google_photos_count,
            @google_hours_hash, @review_texts_json,
            @raw_extraction_json, 'success', CURRENT_TIMESTAMP()
          )
        `,
        params: {
          snapshot_id: randomUUID(),
          location_id: locationId,
          google_place_id: googlePlaceId,
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
          location_id: "STRING",
          google_place_id: "STRING",
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

      processed++;
    }

    console.log(`[snapshot-own] processed=${processed} failed=${failed} total=${rows.length}`);
  } catch (err: any) {
    console.error("[snapshot-own-locations]", err?.message);
  }
}

export const GET: APIRoute = async ({ request }) => {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
      status: 401, headers: { "content-type": "application/json" },
    });
  }

  runSnapshots().catch((e) => console.error("[snapshot-own-locations] background error:", e?.message));

  return new Response(
    JSON.stringify({ ok: true, status: "started" }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
};