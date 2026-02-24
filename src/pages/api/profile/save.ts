import "dotenv/config";
import type { APIRoute } from "astro";
import { BigQuery } from "@google-cloud/bigquery";
import { createClerkClient } from "@clerk/clerk-sdk-node";
import crypto from "node:crypto";

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
    .replace(/[’]/g, "'")
    .replace(/[^\p{L}\p{N}\s'.,-]/gu, "");
}

function sha256Hex(s: string): string {
  return crypto.createHash("sha256").update(s, "utf8").digest("hex");
}

type BanGeocodeResult = { lat: number; lon: number; label: string; score: number };

async function geocodeWithBAN(q: string): Promise<BanGeocodeResult | null> {
  const url = new URL("https://api-adresse.data.gouv.fr/search");
  url.searchParams.set("q", q);
  url.searchParams.set("limit", "1");
  url.searchParams.set("type", "housenumber");

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
    const coords = f0?.geometry?.coordinates;

    const lon = Array.isArray(coords) ? Number(coords[0]) : NaN;
    const lat = Array.isArray(coords) ? Number(coords[1]) : NaN;
    const label = String(f0?.properties?.label ?? "");
    const score = Number(f0?.properties?.score);

    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(score)) return null;

    return { lat, lon, label, score };
  } catch (_) {
    // Non-fatal: degrade gracefully so profile saves still succeed
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

    // ✅ INSERT THIS GUARD HERE (before request.formData())
    const contentType = request.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      return new Response(JSON.stringify({ ok: false, error: "Unsupported content-type" }), {
        status: 415,
        headers: { "content-type": "application/json" },
      });
    }

    const body = await request.json();

    // Adapter: mirrors FormData API used below
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

    const raw_location_id = fd.get("location_id");
    const submitted_location_id =
      typeof raw_location_id === "string" && raw_location_id.trim() !== ""
        ? raw_location_id.trim()
        : crypto.randomUUID();
    
    // --- Auth (server-side truth) ---
    const clerk_user_id = getUserIdFromLocals(locals);

    // --- Email (server-side truth) ---
    const email = await getUserEmailFromClerk(clerk_user_id);
    
    // --- Optional identity fields from form ---
    const first_name = getOptionalString(fd, "first_name");
    const last_name = getOptionalString(fd, "last_name");
    const position = getOptionalString(fd, "position");

    // --- Company / environment ---
    const company_name = getOptionalString(fd, "company_name");
    const company_address = getOptionalString(fd, "company_address");
    const company_address_key = company_address
      ? sha256Hex(normalizeAddressForKey(company_address))
      : ""; // sentinel => no address

    const company_activity_type = getOptionalString(fd, "company_activity_type");
    const location_type = getOptionalString(fd, "location_type");
    const event_time_profile = getOptionalString(fd, "event_time_profile");
    const location_access_pattern = getOptionalString(fd, "location_access_pattern");
    const nearest_transit_stop = getOptionalString(fd, "nearest_transit_stop");

    // --- Multi-selects (limits enforced; preserve all slots in schema) ---
    const audiences = getAllStrings(fd, "primary_audience_1");
    if (audiences.length < 1) {
      throw new HttpError(400, "Missing or invalid field: primary_audience_1 (select at least 1 audience)");
    }
    if (audiences.length > 2) {
      throw new HttpError(400, "Too many audiences selected (max 2)");
    }
    const primary_audience_1 = audiences[0] ?? null;
    const primary_audience_2 = audiences[1] ?? null;

    const originCities = getAllStrings(fd, "origin_city_ids");
    if (originCities.length < 1) {
      throw new HttpError(400, "Missing or invalid field: origin_city_ids (select at least 1 city)");
    }
    if (originCities.length > 3) {
      throw new HttpError(400, "Too many origin cities selected (max 3)");
    }
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
    const hasKeyfile = !!process.env.GOOGLE_APPLICATION_CREDENTIALS;
    const useAdc = (process.env.BQ_USE_ADC || "").trim().toLowerCase() === "true";

    if (!import.meta.env.DEV && !hasKeyfile && !useAdc) {
      throw new HttpError(
        500,
        "BigQuery auth misconfigured: set GOOGLE_APPLICATION_CREDENTIALS or set BQ_USE_ADC=true when running with ADC."
      );
    }
    const bigquery = new BigQuery(
      hasKeyfile
        ? { projectId, keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS }
        : { projectId }
    );
    const fullTable = `\`${projectId}.${dataset}.${table}\``;
    const BQ_LOCATION = (process.env.BQ_LOCATION || "EU").trim();

    const location_id = submitted_location_id;

    // --- Load prior stored address_key to avoid re-geocoding if unchanged ---
    const priorKeyQuery = `
      SELECT company_address_key, company_geocoded_at
      FROM ${fullTable}
      WHERE clerk_user_id = @clerk_user_id
        AND location_id = @location_id
      ORDER BY updated_at DESC
      LIMIT 1
    `;

    let prior_company_address_key: string | null = null;
    let prior_company_geocoded_at_ms: number | null = null;

    try {
      const [rows] = await bigquery.query({
        query: priorKeyQuery,
        location: BQ_LOCATION,
        params: { clerk_user_id, location_id },
        types: { clerk_user_id: "STRING", location_id: "STRING" },
      });

      const r0: any = Array.isArray(rows) && rows.length ? rows[0] : null;
      prior_company_address_key =
        r0 && typeof r0.company_address_key === "string" && r0.company_address_key.trim()
          ? r0.company_address_key.trim()
          : null;

      const rawGeoAt = r0 ? (r0.company_geocoded_at ?? null) : null;

      if (rawGeoAt instanceof Date) {
        prior_company_geocoded_at_ms = Number.isFinite(rawGeoAt.getTime()) ? rawGeoAt.getTime() : null;
      } else if (typeof rawGeoAt === "string" && rawGeoAt.trim()) {
        const t = Date.parse(rawGeoAt);
        prior_company_geocoded_at_ms = Number.isFinite(t) ? t : null;
      } else {
        prior_company_geocoded_at_ms = null;
      }

    } catch (_) {
      // non-fatal
      prior_company_address_key = null;
      prior_company_geocoded_at_ms = null;
    }

    const prior_key = prior_company_address_key === null ? "" : prior_company_address_key;
    const addressChanged = company_address_key !== "" && company_address_key !== prior_key;

    const GEOCODE_THROTTLE_MS = Number(process.env.GEOCODE_THROTTLE_MS || "10000"); // 10s default
    const throttled =
      addressChanged &&
      prior_company_geocoded_at_ms !== null &&
      (Date.now() - prior_company_geocoded_at_ms) < GEOCODE_THROTTLE_MS;

    let company_lat: number | null = null;
    let company_lon: number | null = null;
    let company_geocode_label: string | null = null;
    let company_geocode_score: number | null = null;
    let company_geocode_provider: string | null = null;
    let company_geocoded_at: string | null = null; // ISO string acceptable for TIMESTAMP
    let company_geocode_status: string | null = null;

    if (!company_address_key) {
      company_geocode_status = "address_missing";
    } else if (!addressChanged) {
      company_geocode_status = "unchanged";
    } else if (throttled) {
      company_geocode_status = "throttled";
    } else {
      const MIN_BAN_SCORE = 0.6;
      const r = await geocodeWithBAN(company_address!);

      company_geocode_provider = "ban";
      company_geocoded_at = new Date().toISOString();

      if (!r) {
        company_geocode_status = "geocode_failed";
      } else if (r.score < MIN_BAN_SCORE) {
        company_geocode_status = "geocode_low_score";
        company_geocode_score = r.score;
        company_geocode_label = r.label;
      } else {
        company_geocode_status = "geocoded_ok";
        company_lat = r.lat;
        company_lon = r.lon;
        company_geocode_label = r.label;
        company_geocode_score = r.score;
      }
    }

    // Default location = earliest created_at for this user, else generate one.
    const mergeQuery = `
      MERGE ${fullTable} T
      USING (SELECT
        @clerk_user_id AS clerk_user_id,
        @location_id AS location_id
      ) S
      ON T.clerk_user_id = S.clerk_user_id AND T.location_id = S.location_id
      WHEN MATCHED THEN UPDATE SET
        email = @email,
        first_name = @first_name,
        last_name = @last_name,
        position = @position,
        company_name = @company_name,
        company_address = @company_address,
        company_address_key = @company_address_key,
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
        primary_audience_1 = @primary_audience_1,
        primary_audience_2 = @primary_audience_2,
        origin_city_id_1 = @origin_city_id_1,
        origin_city_id_2 = @origin_city_id_2,
        origin_city_id_3 = @origin_city_id_3,
        origin_city_label_1 = @origin_city_label_1,
        origin_city_label_2 = @origin_city_label_2,
        origin_city_label_3 = @origin_city_label_3,
        updated_at = CURRENT_TIMESTAMP()
      WHEN NOT MATCHED THEN INSERT (
        clerk_user_id,
        location_id,
        email,
        first_name,
        last_name,
        position,
        company_name,
        company_address,
        company_address_key,
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
        primary_audience_1,
        primary_audience_2,
        origin_city_id_1,
        origin_city_id_2,
        origin_city_id_3,
        origin_city_label_1,
        origin_city_label_2,
        origin_city_label_3,
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
        @primary_audience_1,
        @primary_audience_2,
        @origin_city_id_1,
        @origin_city_id_2,
        @origin_city_id_3,
        @origin_city_label_1,
        @origin_city_label_2,
        @origin_city_label_3,
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
        origin_city_label_1,
        origin_city_label_2,
        origin_city_label_3,
    };

    // BigQuery needs explicit param types when any value is null
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
      primary_audience_1: "STRING",
      primary_audience_2: "STRING",
      origin_city_id_1: "STRING",
      origin_city_id_2: "STRING",
      origin_city_id_3: "STRING",
      origin_city_label_1: "STRING",
      origin_city_label_2: "STRING",
      origin_city_label_3: "STRING",
      company_address_key: "STRING",
      company_lat: "FLOAT64",
      company_lon: "FLOAT64",
      company_geocode_label: "STRING",
      company_geocode_score: "FLOAT64",
      company_geocode_provider: "STRING",
      company_geocoded_at: "TIMESTAMP",
      company_geocode_status: "STRING",
    };

    await bigquery.query({ query: mergeQuery, location: BQ_LOCATION, params, types });


    // Read-back proof: return the row as stored in BigQuery after MERGE
    const readBackQuery = `
      SELECT
        clerk_user_id,
        location_id,
        email,
        first_name,
        last_name,
        position,
        company_name,
        company_address,
        company_address_key,
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
        primary_audience_1,
        primary_audience_2,
        origin_city_id_1,
        origin_city_id_2,
        origin_city_id_3,
        created_at,
        updated_at
      FROM ${fullTable}
      WHERE clerk_user_id = @clerk_user_id
        AND location_id = @location_id
      ORDER BY updated_at DESC
      LIMIT 1
    `;

    const [savedRows] = await bigquery.query({
      query: readBackQuery,
      location: BQ_LOCATION,
      params: { clerk_user_id, location_id },
      types: { clerk_user_id: "STRING", location_id: "STRING" },
    });

    const saved = Array.isArray(savedRows) && savedRows.length > 0 ? savedRows[0] : null;

    return new Response(JSON.stringify({ ok: true, location_id, saved }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  
  } catch (err: any) {
    const status =
      err instanceof HttpError ? err.status :
      400;

    // Avoid leaking internals on 500 in production
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
