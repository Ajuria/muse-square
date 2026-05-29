import "dotenv/config";
import type { APIRoute } from "astro";
import { BigQuery } from "@google-cloud/bigquery";
import { createClerkClient } from "@clerk/clerk-sdk-node";
import crypto from "node:crypto";
import { makeBQClient } from "../../../lib/bq";
import { triggerDbtJobs } from "../../../lib/dbt-trigger";
import { logApiError } from "../../../lib/error-logger";
import { requireLocationOwnership } from "../../../lib/requireLocationOwnership";

export const prerender = false;

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function requireString(v: unknown, name: string): string {
  if (typeof v !== "string" || v.trim() === "") {
    throw new Error(`Missing or invalid field: ${name}`);
  }
  return v.trim();
}

function getOptionalString(fd: { get: (k: string) => any }, name: string): string | null {
  const v = fd.get(name);
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s.length ? s : null;
}

function getAllStrings(fd: { getAll: (k: string) => any[] }, name: string): string[] {
  return fd
    .getAll(name)
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter((v) => v.length > 0);
}

function getUserIdFromLocals(locals: any): string {
  const v = locals?.clerk_user_id;
  if (typeof v !== "string" || v.trim() === "") {
    throw new HttpError(401, "Unauthorized");
  }
  return v.trim();
}

async function getUserEmailFromClerk(userId: string): Promise<string> {
  const secretKey = requireString(process.env.CLERK_SECRET_KEY, "CLERK_SECRET_KEY");
  const clerk = createClerkClient({ secretKey });
  const user = await clerk.users.getUser(userId);

  const primary =
    (user.primaryEmailAddressId &&
      user.emailAddresses?.find((e) => e.id === user.primaryEmailAddressId)?.emailAddress) ||
    user.emailAddresses?.[0]?.emailAddress ||
    "";

  return requireString(primary, "email (from Clerk user)");
}

// ------------------------
// Geocoding helpers (BAN)
// ------------------------
function normalizeAddressForKey(addr: string): string {
  return addr
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ")
    .replace(/[']/g, "'")
    .replace(/[^\p{L}\p{N}\s'.,-]/gu, "");
}

function sha256Hex(s: string): string {
  return crypto.createHash("sha256").update(s, "utf8").digest("hex");
}

type BanGeocodeResult = {
  lat: number;
  lon: number;
  label: string;
  score: number;
  citycode: string | null;
};

async function geocodeWithBAN(q: string): Promise<BanGeocodeResult | null> {
  const url = new URL("https://api-adresse.data.gouv.fr/search");
  url.searchParams.set("q", q);
  url.searchParams.set("limit", "1");
  url.searchParams.set("autocomplete", "1");

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 3500);
  try {
    const res = await fetch(url.toString(), {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!res.ok) return null;

    const data: any = await res.json().catch(() => null);
    const f0 = data?.features?.[0];
    const citycodeRaw = f0?.properties?.citycode;
    const citycode =
      typeof citycodeRaw === "string" && citycodeRaw.trim() ? citycodeRaw.trim() : null;
    const coords = f0?.geometry?.coordinates;

    const lon = Array.isArray(coords) ? Number(coords[0]) : NaN;
    const lat = Array.isArray(coords) ? Number(coords[1]) : NaN;
    const label = String(f0?.properties?.label ?? "");
    const score = Number(f0?.properties?.score);

    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(score)) return null;

    return { lat, lon, label, score, citycode };
  } catch (_) {
    return null;
  } finally {
    clearTimeout(t);
  }
}

// ------------------------
// BestTime venue registration
// ------------------------
async function registerBestTimeVenue(
  venueName: string,
  venueAddress: string
): Promise<string | null> {
  const apiKey = process.env.BESTTIME_API_KEY_PRIVATE;
  if (!apiKey) return null;

  const url = new URL("https://besttime.app/api/v1/forecasts");
  url.searchParams.set("api_key_private", apiKey);
  url.searchParams.set("venue_name", venueName);
  url.searchParams.set("venue_address", venueAddress);

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url.toString(), {
      method: "POST",
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data: any = await res.json().catch(() => null);
    const vid = data?.venue_info?.venue_id;
    return typeof vid === "string" && vid.trim() ? vid.trim() : null;
  } catch (_) {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    if (import.meta.env.DEV) {
      console.log("ENV CHECK:", {
        BQ_PROJECT_ID: process.env.BQ_PROJECT_ID,
        BQ_DATASET: process.env.BQ_DATASET,
        BQ_TABLE: process.env.BQ_TABLE,
        CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY ? "[set]" : "[missing]",
        GOOGLE_APPLICATION_CREDENTIALS: process.env.GOOGLE_APPLICATION_CREDENTIALS ? "[set]" : "[missing]",
      });
    }

    const contentType = request.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      return new Response(JSON.stringify({ ok: false, error: "Unsupported content-type" }), {
        status: 415,
        headers: { "content-type": "application/json" },
      });
    }

    const body = await request.json();

    const _t0 = Date.now();
    const _log = (label: string) => console.log(`[save.ts] ${label}: ${Date.now() - _t0}ms`);

    const fd = {
      get: (k: string) => {
        const v = body[k];
        if (Array.isArray(v)) return v[0] ?? null;
        return v ?? null;
      },
      getAll: (k: string) => {
        const v = body[k];
        if (Array.isArray(v)) return v;
        if (typeof v === "string" && v.trim()) return [v.trim()];
        return [];
      },
    };

    const raw_mode = fd.get("mode");
    if (raw_mode !== "create" && raw_mode !== "update") {
      throw new HttpError(400, "Missing or invalid field: mode (create | update)");
    }
    const mode = raw_mode as "create" | "update";

    const raw_location_id = fd.get("location_id");
    const location_id =
      mode === "update"
        ? (() => {
            if (typeof raw_location_id !== "string" || raw_location_id.trim() === "") {
              throw new HttpError(400, "location_id required for update mode");
            }
            return raw_location_id.trim();
          })()
        : (() => {
            if (typeof raw_location_id === "string" && raw_location_id.trim() !== "") {
              throw new HttpError(400, "location_id must not be provided in create mode");
            }
            return crypto.randomUUID();
          })();

    if (mode === "update") requireLocationOwnership(locals, location_id);

    // --- Auth + Email (parallel) ---
    const clerk_user_id = getUserIdFromLocals(locals);
    const email = await getUserEmailFromClerk(clerk_user_id);

    // --- Form fields ---
    const first_name = getOptionalString(fd, "first_name");
    const last_name = getOptionalString(fd, "last_name");
    const position = getOptionalString(fd, "position");
    const company_name = getOptionalString(fd, "company_name");
    const company_address = getOptionalString(fd, "company_address");
    if (!company_address && mode === "create") {
      throw new HttpError(400, "L'adresse professionnelle est obligatoire.");
    }
    const company_address_key = company_address
      ? sha256Hex(normalizeAddressForKey(company_address))
      : "";

    const company_activity_type = getOptionalString(fd, "company_activity_type");
    const location_type = getOptionalString(fd, "location_type");
    const event_time_profile = getOptionalString(fd, "event_time_profile");
    const location_access_pattern = getOptionalString(fd, "location_access_pattern");
    const nearest_transit_stop = getOptionalString(fd, "nearest_transit_stop");
    const nearest_transit_stop_id = getOptionalString(fd, "nearest_transit_stop_id");
    const nearest_transit_lines = getOptionalString(fd, "nearest_transit_lines");
    const site_name = getOptionalString(fd, "site_name");
    const location_description = getOptionalString(fd, "location_description");
    const venue_capacity = fd.get("venue_capacity") ? Number(fd.get("venue_capacity")) : null;
    const event_type_1 = getOptionalString(fd, "event_type_1");
    const event_type_2 = getOptionalString(fd, "event_type_2");
    const event_type_3 = getOptionalString(fd, "event_type_3");
    const weather_sensitivity = fd.get("weather_sensitivity") ? Number(fd.get("weather_sensitivity")) : null;
    const seasonality = getOptionalString(fd, "seasonality");
    const main_event_objective = getOptionalString(fd, "main_event_objective");
    const operating_hours = getOptionalString(fd, "operating_hours");
    const website_url = getOptionalString(fd, "website_url");

    const audiences = getAllStrings(fd, "primary_audience_1");
    if (audiences.length > 2) {
      throw new HttpError(400, "Too many audiences selected (max 2)");
    }
    const hasAudiences = audiences.length > 0;
    const primary_audience_1 = audiences[0] ?? null;
    const primary_audience_2 = audiences[1] ?? null;

    const originCities = getAllStrings(fd, "origin_city_ids");
    if (originCities.length > 3) {
      throw new HttpError(400, "Too many origin cities selected (max 3)");
    }
    const hasOriginCities = originCities.length > 0;
    const origin_city_id_1 = originCities[0] ?? null;
    const origin_city_id_2 = originCities[1] ?? null;
    const origin_city_id_3 = originCities[2] ?? null;
    const origin_city_label_1 = getOptionalString(fd, "origin_city_label_1");
    const origin_city_label_2 = getOptionalString(fd, "origin_city_label_2");
    const origin_city_label_3 = getOptionalString(fd, "origin_city_label_3");

    // --- BigQuery wiring ---
    const projectId = requireString(process.env.BQ_PROJECT_ID, "BQ_PROJECT_ID");
    const dataset = requireString(process.env.BQ_DATASET, "BQ_DATASET");
    const table = requireString(process.env.BQ_TABLE, "BQ_TABLE");
    const bigquery = makeBQClient(projectId);

    const fullTable = `\`${projectId}.${dataset}.${table}\``;
    const BQ_LOCATION = (process.env.BQ_LOCATION || "EU").trim();

    // ================================================================
    // PARALLEL PRE-FLIGHT: existence check + prior key + BestTime check
    // ================================================================
    const bqParams = { clerk_user_id, location_id };
    const bqTypes = { clerk_user_id: "STRING" as const, location_id: "STRING" as const };

    const [existsResult, priorResult, btCheckResult] = await Promise.all([
      Promise.resolve(locals?.profileRowExists ? [[{ _: 1 }]] : [[]]),

      bigquery.query({
        query: `SELECT company_address_key, company_geocoded_at, company_activity_type, nearest_transit_stop, city_id FROM ${fullTable} WHERE clerk_user_id = @clerk_user_id AND location_id = @location_id ORDER BY updated_at DESC LIMIT 1`,
        location: BQ_LOCATION, params: bqParams, types: bqTypes,
      }).catch(() => [[]]),

      (company_name && company_address)
        ? bigquery.query({
            query: `SELECT besttime_venue_id FROM ${fullTable} WHERE clerk_user_id = @clerk_user_id AND location_id = @location_id AND besttime_venue_id IS NOT NULL LIMIT 1`,
            location: BQ_LOCATION, params: bqParams, types: bqTypes,
          }).catch(() => [[]])
        : Promise.resolve([[]]),
    ]);

    // Unpack existence check
    if (mode === "update") {
      const existsRows = existsResult[0];
      if (!Array.isArray(existsRows) || existsRows.length === 0) {
        throw new HttpError(404, "Unknown location_id for update");
      }
    }

    // Unpack prior key
    let prior_company_address_key: string | null = null;
    let prior_company_geocoded_at_ms: number | null = null;
    let prior_city_id: string | null = null;
    let prior_company_activity_type: string | null = null;
    let prior_nearest_transit_stop: string | null = null;

    const r0: any = Array.isArray(priorResult[0]) && priorResult[0].length ? priorResult[0][0] : null;
    if (r0) {
      prior_company_address_key = typeof r0.company_address_key === "string" && r0.company_address_key.trim() ? r0.company_address_key.trim() : null;
      prior_city_id = typeof r0.city_id === "string" && r0.city_id.trim() ? r0.city_id.trim() : null;
      prior_company_activity_type = typeof r0.company_activity_type === "string" && r0.company_activity_type.trim() ? r0.company_activity_type.trim() : null;
      prior_nearest_transit_stop = typeof r0.nearest_transit_stop === "string" && r0.nearest_transit_stop.trim() ? r0.nearest_transit_stop.trim() : null;
      const rawGeoAt = r0.company_geocoded_at ?? null;
      if (rawGeoAt instanceof Date) {
        prior_company_geocoded_at_ms = Number.isFinite(rawGeoAt.getTime()) ? rawGeoAt.getTime() : null;
      } else if (typeof rawGeoAt === "string" && rawGeoAt.trim()) {
        const t = Date.parse(rawGeoAt);
        prior_company_geocoded_at_ms = Number.isFinite(t) ? t : null;
      }
    }

    // Unpack BestTime check
    let besttime_venue_id: string | null = null;
    const btRows = btCheckResult[0];
    const existingBt = Array.isArray(btRows) && btRows.length > 0 ? btRows[0]?.besttime_venue_id : null;
    if (typeof existingBt === "string" && existingBt.trim()) {
      besttime_venue_id = existingBt.trim();
    }

    // --- Address change detection ---
    const prior_key = prior_company_address_key === null ? "" : prior_company_address_key;
    const addressChanged = company_address_key !== "" && company_address_key !== prior_key;

    const GEOCODE_THROTTLE_MS = Number(process.env.GEOCODE_THROTTLE_MS || "10000");
    const throttled =
      addressChanged &&
      prior_company_geocoded_at_ms !== null &&
      (Date.now() - prior_company_geocoded_at_ms) < GEOCODE_THROTTLE_MS;

    // --- Geocode variable declarations ---
    let company_lat: number | null = null;
    let company_lon: number | null = null;
    let company_geocode_label: string | null = null;
    let company_geocode_score: number | null = null;
    let company_geocode_provider: string | null = null;
    let company_geocoded_at: Date | null = null;
    let company_geocode_status: string | null = null;
    let city_id: string | null = prior_city_id ?? null;

    // ================================================================
    // PARALLEL EXTERNAL: geocode + BestTime registration
    // ================================================================
    const needsGeocode = company_address_key !== "" && addressChanged && !throttled && !!company_address;
    const needsBestTimeReg = !besttime_venue_id && !!company_name && !!company_address;

    const [geocodeResult, btRegResult] = await Promise.all([
      needsGeocode ? geocodeWithBAN(company_address!) : Promise.resolve(null),
      needsBestTimeReg ? registerBestTimeVenue(company_name!, company_address!) : Promise.resolve(null),
    ]);

    // Process geocode result
    if (!company_address_key) {
      company_geocode_status = "address_missing";
    } else if (!addressChanged && prior_city_id !== null) {
      company_geocode_status = "unchanged";
    } else if (throttled) {
      company_geocode_status = "throttled";
    } else if (needsGeocode) {
      const MIN_BAN_SCORE = 0.45;
      company_geocode_provider = "ban";
      company_geocoded_at = new Date();

      if (!geocodeResult) {
        company_geocode_status = "geocode_failed";
        logApiError({
          clerk_user_id, location_id,
          endpoint: "/api/profile/save",
          error_type: "geocode_failed",
          error_message: "BAN geocode returned null",
          request_metadata: { company_address },
        });
      } else if (geocodeResult.score < MIN_BAN_SCORE) {
        company_geocode_status = "geocode_low_score";
        company_geocode_score = geocodeResult.score;
        company_geocode_label = geocodeResult.label;
      } else {
        company_geocode_status = "geocoded_ok";
        company_lat = geocodeResult.lat;
        company_lon = geocodeResult.lon;
        company_geocode_label = geocodeResult.label;
        company_geocode_score = geocodeResult.score;
        city_id = geocodeResult.citycode;
      }
    }

    // Process BestTime registration
    if (btRegResult) {
      besttime_venue_id = btRegResult;
    }

    // ================================================================
    // MERGE (must be sequential — writes depend on geocode results)
    // ================================================================
    const mergeQuery = `
      MERGE ${fullTable} T
      USING (SELECT
        @clerk_user_id AS clerk_user_id,
        @location_id AS location_id
      ) S
      ON T.clerk_user_id = S.clerk_user_id AND T.location_id = S.location_id
      WHEN MATCHED THEN UPDATE SET
        email = @email,
        first_name = IF(@first_name IS NULL, first_name, @first_name),
        last_name = IF(@last_name IS NULL, last_name, @last_name),
        position = IF(@position IS NULL, position, @position),
        company_name = IF(@company_name IS NULL, company_name, @company_name),
        company_address = IF(@company_address IS NULL, company_address, @company_address),
        company_address_key = @company_address_key,
        city_id =
          IF(@company_geocode_status IN ('unchanged','throttled'), city_id, @city_id),
        company_lat =
          IF(@company_geocode_status IN ('unchanged','throttled'), company_lat, @company_lat),
        company_lon =
          IF(@company_geocode_status IN ('unchanged','throttled'), company_lon, @company_lon),
        company_geocode_label =
          IF(@company_geocode_status IN ('unchanged','throttled'), company_geocode_label, @company_geocode_label),
        company_geocode_score =
          IF(@company_geocode_status IN ('unchanged','throttled'), company_geocode_score, @company_geocode_score),
        company_geocode_provider =
          IF(@company_geocode_status IN ('unchanged','throttled'), company_geocode_provider, @company_geocode_provider),
        company_geocoded_at =
          IF(@company_geocode_status IN ('unchanged','throttled'), company_geocoded_at, @company_geocoded_at),
        company_geocode_status = @company_geocode_status,
        company_geog =
          IF(
            @company_geocode_status IN ('unchanged','throttled'),
            company_geog,
            IF(@company_lon IS NULL OR @company_lat IS NULL, NULL, ST_GEOGPOINT(@company_lon, @company_lat))
          ),
        company_activity_type = @company_activity_type,
        location_type = @location_type,
        event_time_profile = @event_time_profile,
        location_access_pattern = @location_access_pattern,
        nearest_transit_stop = @nearest_transit_stop,
        nearest_transit_stop_id = @nearest_transit_stop_id,
        nearest_transit_lines = @nearest_transit_lines,
        primary_audience_1 = IF(@hasAudiences, @primary_audience_1, primary_audience_1),
        primary_audience_2 = IF(@hasAudiences, @primary_audience_2, primary_audience_2),
        origin_city_id_1 = IF(@hasOriginCities, @origin_city_id_1, origin_city_id_1),
        origin_city_id_2 = IF(@hasOriginCities, @origin_city_id_2, origin_city_id_2),
        origin_city_id_3 = IF(@hasOriginCities, @origin_city_id_3, origin_city_id_3),
        origin_city_label_1 = IF(@hasOriginCities, @origin_city_label_1, origin_city_label_1),
        origin_city_label_2 = IF(@hasOriginCities, @origin_city_label_2, origin_city_label_2),
        origin_city_label_3 = IF(@hasOriginCities, @origin_city_label_3, origin_city_label_3),
        site_name = @site_name,
        location_description = @location_description,
        venue_capacity = @venue_capacity,
        event_type_1 = @event_type_1,
        event_type_2 = @event_type_2,
        event_type_3 = @event_type_3,
        weather_sensitivity = @weather_sensitivity,
        seasonality = @seasonality,
        operating_hours = @operating_hours,
        website_url = @website_url,
        besttime_venue_id =
          IF(@besttime_venue_id IS NULL, besttime_venue_id, @besttime_venue_id),
        main_event_objective = IF(@main_event_objective IS NULL, main_event_objective, @main_event_objective),
        updated_at = CURRENT_TIMESTAMP()
      WHEN NOT MATCHED AND @company_address IS NOT NULL THEN INSERT (
        clerk_user_id,
        location_id,
        email,
        first_name,
        last_name,
        position,
        company_name,
        company_address,
        company_address_key,
        city_id,
        company_lat,
        company_lon,
        company_geocode_label,
        company_geocode_score,
        company_geocode_provider,
        company_geocoded_at,
        company_geocode_status,
        company_geog,
        company_activity_type,
        location_type,
        event_time_profile,
        location_access_pattern,
        nearest_transit_stop,
        nearest_transit_stop_id,
        nearest_transit_lines,
        primary_audience_1,
        primary_audience_2,
        origin_city_id_1,
        origin_city_id_2,
        origin_city_id_3,
        origin_city_label_1,
        origin_city_label_2,
        origin_city_label_3,
        site_name,
        location_description,
        venue_capacity,
        event_type_1,
        event_type_2,
        event_type_3,
        weather_sensitivity,
        seasonality,
        operating_hours,
        website_url,
        besttime_venue_id,
        main_event_objective,
        created_at,
        updated_at
      ) VALUES (
        @clerk_user_id,
        @location_id,
        @email,
        @first_name,
        @last_name,
        @position,
        @company_name,
        @company_address,
        @company_address_key,
        @city_id,
        @company_lat,
        @company_lon,
        @company_geocode_label,
        @company_geocode_score,
        @company_geocode_provider,
        @company_geocoded_at,
        @company_geocode_status,
        IF(@company_lon IS NULL OR @company_lat IS NULL, NULL, ST_GEOGPOINT(@company_lon, @company_lat)),
        @company_activity_type,
        @location_type,
        @event_time_profile,
        @location_access_pattern,
        @nearest_transit_stop,
        @nearest_transit_stop_id,
        @nearest_transit_lines,
        @primary_audience_1,
        @primary_audience_2,
        @origin_city_id_1,
        @origin_city_id_2,
        @origin_city_id_3,
        @origin_city_label_1,
        @origin_city_label_2,
        @origin_city_label_3,
        @site_name,
        @location_description,
        @venue_capacity,
        @event_type_1,
        @event_type_2,
        @event_type_3,
        @weather_sensitivity,
        @seasonality,
        @operating_hours,
        @website_url,
        @besttime_venue_id,
        @main_event_objective,
        CURRENT_TIMESTAMP(),
        CURRENT_TIMESTAMP()
      )
    `;

    const params = {
      clerk_user_id,
      location_id,
      email,
      first_name,
      last_name,
      position,
      company_name,
      company_address,
      company_address_key,
      city_id,
      company_lat,
      company_lon,
      company_geocode_label,
      company_geocode_score,
      company_geocode_provider,
      company_geocoded_at,
      company_geocode_status,
      company_activity_type,
      location_type,
      event_time_profile,
      location_access_pattern,
      nearest_transit_stop,
      nearest_transit_stop_id,
      nearest_transit_lines,
      primary_audience_1,
      primary_audience_2,
      origin_city_id_1,
      origin_city_id_2,
      origin_city_id_3,
      origin_city_label_1,
      origin_city_label_2,
      origin_city_label_3,
      hasAudiences,
      hasOriginCities,
      site_name,
      location_description,
      venue_capacity,
      event_type_1,
      event_type_2,
      event_type_3,
      weather_sensitivity,
      seasonality,
      main_event_objective,
      operating_hours,
      website_url,
      besttime_venue_id,
    };

    const types: Record<string, any> = {
      clerk_user_id: "STRING",
      location_id: "STRING",
      email: "STRING",
      first_name: "STRING",
      last_name: "STRING",
      position: "STRING",
      company_name: "STRING",
      company_address: "STRING",
      company_activity_type: "STRING",
      location_type: "STRING",
      event_time_profile: "STRING",
      location_access_pattern: "STRING",
      nearest_transit_stop: "STRING",
      nearest_transit_stop_id: "STRING",
      nearest_transit_lines: "STRING",
      primary_audience_1: "STRING",
      primary_audience_2: "STRING",
      origin_city_id_1: "STRING",
      origin_city_id_2: "STRING",
      origin_city_id_3: "STRING",
      origin_city_label_1: "STRING",
      origin_city_label_2: "STRING",
      origin_city_label_3: "STRING",
      company_address_key: "STRING",
      city_id: "STRING",
      company_lat: "FLOAT64",
      company_lon: "FLOAT64",
      company_geocode_label: "STRING",
      company_geocode_score: "FLOAT64",
      company_geocode_provider: "STRING",
      company_geocoded_at: "TIMESTAMP",
      company_geocode_status: "STRING",
      site_name: "STRING",
      location_description: "STRING",
      venue_capacity: "INT64",
      event_type_1: "STRING",
      event_type_2: "STRING",
      event_type_3: "STRING",
      weather_sensitivity: "INT64",
      seasonality: "STRING",
      main_event_objective: "STRING",
      operating_hours: "STRING",
      website_url: "STRING",
      besttime_venue_id: "STRING",
      hasAudiences: "BOOL",
      hasOriginCities: "BOOL",
    };

    await bigquery.query({ query: mergeQuery, location: BQ_LOCATION, params, types });

    // ================================================================
    // PARALLEL POST-MERGE: propagate + dim sync + read-back
    // ================================================================
    const activityToIndustry: Record<string, string> = {
      non_profit: 'Associatif & Non lucratif',
      wellness: 'Sports & Loisirs actifs',
      cinema_theatre: 'Cin\u00e9ma & Th\u00e9\u00e2tre',
      commercial: 'Commerce & Retail',
      institutional: 'Collectivit\u00e9s & Secteur public',
      culture: 'Culture & Patrimoine',
      family: '\u00c9ducation & Enseignement',
      live_event: '\u00c9v\u00e9nementiel',
      hotel_lodging: 'H\u00f4tellerie & H\u00e9bergement',
      food_nightlife: 'Restauration & Bars',
      science_innovation: 'Sciences & Innovation',
      pro_event: '\u00c9v\u00e9nementiel',
      sport: 'Sports & Loisirs actifs',
      transport_mobility: 'Transport & Mobilit\u00e9 locale',
      outdoor_leisure: 'Tourisme & Loisirs',
      nightlife: 'Restauration & Bars',
      unknown: 'Autre activit\u00e9 accueillant du public',
    };

    const derivedIndustryCode = company_activity_type
      ? (activityToIndustry[company_activity_type] ?? company_activity_type)
      : null;

    const dimSyncParams = {
      location_id,
      location_label: company_name ?? company_address ?? location_id,
      location_type: location_type ?? null,
      latitude: company_lat ?? null,
      longitude: company_lon ?? null,
      client_industry_code: derivedIndustryCode,
      location_access_pattern: location_access_pattern ?? null,
      origin_city_ids: [origin_city_id_1, origin_city_id_2, origin_city_id_3]
        .filter((v): v is string => typeof v === 'string' && v.trim() !== '')
        .join(','),
      city_id: city_id ?? null,
      site_name: site_name ?? null,
      weather_sensitivity: weather_sensitivity ?? null,
      seasonality: seasonality ?? null,
      event_type_1: event_type_1 ?? null,
      event_type_2: event_type_2 ?? null,
      event_type_3: event_type_3 ?? null,
      main_event_objective: main_event_objective ?? null,
      operating_hours: operating_hours ?? null,
      is_primary: mode === 'create' ? true : null,
    };

    const dimSyncTypes = {
      location_id: 'STRING',
      location_label: 'STRING',
      location_type: 'STRING',
      latitude: 'FLOAT64',
      longitude: 'FLOAT64',
      client_industry_code: 'STRING',
      location_access_pattern: 'STRING',
      origin_city_ids: 'STRING',
      city_id: 'STRING',
      site_name: 'STRING',
      weather_sensitivity: 'INT64',
      seasonality: 'STRING',
      event_type_1: 'STRING',
      event_type_2: 'STRING',
      event_type_3: 'STRING',
      main_event_objective: 'STRING',
      operating_hours: 'STRING',
      is_primary: 'BOOL',
    };

    const [, , readBackResult] = await Promise.all([
      // 1. Propagate user-level fields
      bigquery.query({
        query: `
          UPDATE ${fullTable}
          SET
            first_name = IF(@first_name IS NULL, first_name, @first_name),
            last_name = IF(@last_name IS NULL, last_name, @last_name),
            position = IF(@position IS NULL, position, @position),
            main_event_objective = IF(@main_event_objective IS NULL, main_event_objective, @main_event_objective),
            updated_at = CURRENT_TIMESTAMP()
          WHERE clerk_user_id = @clerk_user_id
        `,
        location: BQ_LOCATION,
        params: { clerk_user_id, first_name, last_name, position, main_event_objective },
        types: { clerk_user_id: "STRING", first_name: "STRING", last_name: "STRING", position: "STRING", main_event_objective: "STRING" },
      }),

      // 2. dim_client_location sync (non-fatal)
      bigquery.query({
        query: `
          MERGE \`${projectId}.dims.dim_client_location\` T
          USING (SELECT @location_id AS location_id) S
          ON T.location_id = S.location_id
          WHEN MATCHED THEN UPDATE SET
            location_label        = @location_label,
            location_type         = @location_type,
            active_flag           = TRUE,
            latitude              = @latitude,
            longitude             = @longitude,
            client_industry_code  = @client_industry_code,
            location_access_pattern = @location_access_pattern,
            origin_city_ids       = @origin_city_ids,
            site_name             = @site_name,
            weather_sensitivity   = @weather_sensitivity,
            seasonality           = @seasonality,
            event_type_1          = @event_type_1,
            event_type_2          = @event_type_2,
            event_type_3          = @event_type_3,
            main_event_objective  = @main_event_objective,
            operating_hours       = @operating_hours,
            is_primary            = @is_primary,
            geo_point             = IF(@longitude IS NULL OR @latitude IS NULL, NULL, ST_GEOGPOINT(@longitude, @latitude))
          WHEN NOT MATCHED THEN INSERT (
            location_id, location_label, location_type, active_flag,
            city_id_granular, city_id_commune, location_source,
            latitude, longitude, client_industry_code,
            location_access_pattern, origin_city_ids,
            site_name, weather_sensitivity, seasonality,
            event_type_1, event_type_2, event_type_3,
            main_event_objective, operating_hours, is_primary, geo_point
          ) VALUES (
            @location_id, @location_label, @location_type, TRUE,
            @city_id, @city_id, 'website',
            @latitude, @longitude, @client_industry_code,
            @location_access_pattern, @origin_city_ids,
            @site_name, @weather_sensitivity, @seasonality,
            @event_type_1, @event_type_2, @event_type_3,
            @main_event_objective, @operating_hours, @is_primary,
            IF(@longitude IS NULL OR @latitude IS NULL, NULL, ST_GEOGPOINT(@longitude, @latitude))
          )
        `,
        location: BQ_LOCATION,
        params: dimSyncParams,
        types: dimSyncTypes,
      }).catch((e) => {
        console.error('[save.ts] dim_client_location sync failed (non-fatal):', e?.message);
        logApiError({
          clerk_user_id, location_id,
          endpoint: "/api/profile/save",
          error_type: "dim_sync_failed",
          error_message: e?.message || "dim_client_location MERGE failed",
          request_metadata: { mode },
        });
      }),

      // 3. Read-back skipped — return params directly
      Promise.resolve(null),
    ]);

    const saved = {
      clerk_user_id,
      location_id,
      email,
      first_name,
      last_name,
      position,
      company_name,
      company_address,
      company_address_key,
      city_id,
      company_lat,
      company_lon,
      company_geocode_label,
      company_geocode_score,
      company_geocode_provider,
      company_geocoded_at,
      company_geocode_status,
      company_activity_type,
      location_type,
      event_time_profile,
      location_access_pattern,
      nearest_transit_stop,
      primary_audience_1,
      primary_audience_2,
      origin_city_id_1,
      origin_city_id_2,
      origin_city_id_3,
      site_name,
      location_description,
      venue_capacity,
      event_type_1,
      event_type_2,
      event_type_3,
      weather_sensitivity,
      seasonality,
      main_event_objective,
      operating_hours,
      website_url,
      besttime_venue_id,
    };

    // ── Trigger dbt Cloud jobs based on what changed ──
    const industryChanged =
      company_activity_type !== null &&
      company_activity_type !== prior_company_activity_type;

    const transitChanged =
      (nearest_transit_stop !== null && nearest_transit_stop !== prior_nearest_transit_stop);

    triggerDbtJobs(
      {
        isNewAccount: mode === 'create',
        addressChanged: addressChanged && company_geocode_status === 'geocoded_ok',
        industryChanged,
        transitChanged,
      },
      location_id,
      mode
    );

    // ── Fire-and-forget: crawl website if URL is new/changed ──
    if (website_url) {
      const baseUrl = import.meta.env.DEV
        ? "http://localhost:4321"
        : new URL(request.url).origin;
      fetch(`${baseUrl}/api/profile/crawl-website`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: request.headers.get("cookie") || "",
        },
        body: JSON.stringify({ location_id, website_url }),
      }).catch((e) => {
        console.error("[save.ts] crawl-website fire-and-forget failed (non-fatal):", e?.message);
      });
    }

    return new Response(JSON.stringify({ ok: true, location_id, saved }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });

  } catch (err: any) {
    const status =
      err instanceof HttpError ? err.status : 400;

    const message =
      status >= 500 && !import.meta.env.DEV
        ? "Server error"
        : (err?.message ?? "Unknown error");

    return new Response(JSON.stringify({ ok: false, error: message }), {
      status,
      headers: { "content-type": "application/json" },
    });
  }
};