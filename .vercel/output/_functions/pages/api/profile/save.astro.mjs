import "dotenv/config";
import { BigQuery } from "@google-cloud/bigquery";
import { createClerkClient } from "@clerk/clerk-sdk-node";
import crypto from "node:crypto";
import { renderers } from "../../../renderers.mjs";
const prerender = false;
class HttpError extends Error {
  status;
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
function requireString(v, name) {
  if (typeof v !== "string" || v.trim() === "") {
    throw new Error(`Missing or invalid field: ${name}`);
  }
  return v.trim();
}
function getOptionalString(fd, name) {
  const v = fd.get(name);
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s.length ? s : null;
}
function getAllStrings(fd, name) {
  return fd.getAll(name).map((v) => typeof v === "string" ? v.trim() : "").filter((v) => v.length > 0);
}
function getUserIdFromLocals(locals) {
  const v = locals?.clerk_user_id;
  if (typeof v !== "string" || v.trim() === "") {
    throw new HttpError(401, "Unauthorized");
  }
  return v.trim();
}
async function getUserEmailFromClerk(userId) {
  const secretKey = requireString(process.env.CLERK_SECRET_KEY, "CLERK_SECRET_KEY");
  const clerk = createClerkClient({ secretKey });
  const user = await clerk.users.getUser(userId);
  const primary = user.primaryEmailAddressId && user.emailAddresses?.find((e) => e.id === user.primaryEmailAddressId)?.emailAddress || user.emailAddresses?.[0]?.emailAddress || "";
  return requireString(primary, "email (from Clerk user)");
}
function normalizeAddressForKey(addr) {
  return addr.trim().toUpperCase().replace(/\s+/g, " ").replace(/[’]/g, "'").replace(/[^\p{L}\p{N}\s'.,-]/gu, "");
}
function sha256Hex(s) {
  return crypto.createHash("sha256").update(s, "utf8").digest("hex");
}
async function geocodeWithBAN(q) {
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
      signal: controller.signal
    });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    const f0 = data?.features?.[0];
    const coords = f0?.geometry?.coordinates;
    const lon = Array.isArray(coords) ? Number(coords[0]) : NaN;
    const lat = Array.isArray(coords) ? Number(coords[1]) : NaN;
    const label = String(f0?.properties?.label ?? "");
    const score = Number(f0?.properties?.score);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(score)) return null;
    return { lat, lon, label, score };
  } catch (_) {
    return null;
  } finally {
    clearTimeout(t);
  }
}
const POST = async ({ request, locals }) => {
  try {
    if (false) ;
    const contentType = request.headers.get("content-type") || "";
    if (!contentType.includes("multipart/form-data") && !contentType.includes("application/x-www-form-urlencoded")) {
      return new Response(JSON.stringify({ ok: false, error: "Unsupported content-type" }), {
        status: 415,
        headers: { "content-type": "application/json" }
      });
    }
    const fd = await request.formData();
    const submitted_location_id = requireString(fd.get("location_id"), "location_id");
    const clerk_user_id = getUserIdFromLocals(locals);
    const email = await getUserEmailFromClerk(clerk_user_id);
    const first_name = getOptionalString(fd, "first_name");
    const last_name = getOptionalString(fd, "last_name");
    const position = getOptionalString(fd, "position");
    const company_name = getOptionalString(fd, "company_name");
    const company_address = getOptionalString(fd, "company_address");
    const company_address_key = company_address ? sha256Hex(normalizeAddressForKey(company_address)) : "";
    const company_activity_type = getOptionalString(fd, "company_activity_type");
    const location_type = getOptionalString(fd, "location_type");
    const event_time_profile = getOptionalString(fd, "event_time_profile");
    const location_access_pattern = getOptionalString(fd, "location_access_pattern");
    const nearest_transit_stop = getOptionalString(fd, "nearest_transit_stop");
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
    const projectId = requireString(process.env.BQ_PROJECT_ID, "BQ_PROJECT_ID");
    const dataset = requireString(process.env.BQ_DATASET, "BQ_DATASET");
    const table = requireString(process.env.BQ_TABLE, "BQ_TABLE");
    const hasKeyfile = !!process.env.GOOGLE_APPLICATION_CREDENTIALS;
    const useAdc = (process.env.BQ_USE_ADC || "").trim().toLowerCase() === "true";
    if (!hasKeyfile && !useAdc) {
      throw new HttpError(
        500,
        "BigQuery auth misconfigured: set GOOGLE_APPLICATION_CREDENTIALS or set BQ_USE_ADC=true when running with ADC."
      );
    }
    const bigquery = new BigQuery(
      hasKeyfile ? { projectId, keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS } : { projectId }
    );
    const fullTable = `\`${projectId}.${dataset}.${table}\``;
    const BQ_LOCATION = (process.env.BQ_LOCATION || "EU").trim();
    const location_id = submitted_location_id;
    const priorKeyQuery = `
      SELECT company_address_key, company_geocoded_at
      FROM ${fullTable}
      WHERE clerk_user_id = @clerk_user_id
        AND location_id = @location_id
      ORDER BY updated_at DESC
      LIMIT 1
    `;
    let prior_company_address_key = null;
    let prior_company_geocoded_at_ms = null;
    try {
      const [rows] = await bigquery.query({
        query: priorKeyQuery,
        location: BQ_LOCATION,
        params: { clerk_user_id, location_id },
        types: { clerk_user_id: "STRING", location_id: "STRING" }
      });
      const r0 = Array.isArray(rows) && rows.length ? rows[0] : null;
      prior_company_address_key = r0 && typeof r0.company_address_key === "string" && r0.company_address_key.trim() ? r0.company_address_key.trim() : null;
      const rawGeoAt = r0 ? r0.company_geocoded_at ?? null : null;
      if (rawGeoAt instanceof Date) {
        prior_company_geocoded_at_ms = Number.isFinite(rawGeoAt.getTime()) ? rawGeoAt.getTime() : null;
      } else if (typeof rawGeoAt === "string" && rawGeoAt.trim()) {
        const t = Date.parse(rawGeoAt);
        prior_company_geocoded_at_ms = Number.isFinite(t) ? t : null;
      } else {
        prior_company_geocoded_at_ms = null;
      }
    } catch (_) {
      prior_company_address_key = null;
      prior_company_geocoded_at_ms = null;
    }
    const prior_key = prior_company_address_key === null ? "" : prior_company_address_key;
    const addressChanged = company_address_key !== "" && company_address_key !== prior_key;
    const GEOCODE_THROTTLE_MS = Number(process.env.GEOCODE_THROTTLE_MS || "10000");
    const throttled = addressChanged && prior_company_geocoded_at_ms !== null && Date.now() - prior_company_geocoded_at_ms < GEOCODE_THROTTLE_MS;
    let company_lat = null;
    let company_lon = null;
    let company_geocode_label = null;
    let company_geocode_score = null;
    let company_geocode_provider = null;
    let company_geocoded_at = null;
    let company_geocode_status = null;
    if (!company_address_key) {
      company_geocode_status = "address_missing";
    } else if (!addressChanged) {
      company_geocode_status = "unchanged";
    } else if (throttled) {
      company_geocode_status = "throttled";
    } else {
      const MIN_BAN_SCORE = 0.6;
      const r = await geocodeWithBAN(company_address);
      company_geocode_provider = "ban";
      company_geocoded_at = (/* @__PURE__ */ new Date()).toISOString();
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
      origin_city_label_3
    };
    const types = {
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
      company_geocode_status: "STRING"
    };
    await bigquery.query({ query: mergeQuery, location: BQ_LOCATION, params, types });
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
      types: { clerk_user_id: "STRING", location_id: "STRING" }
    });
    const saved = Array.isArray(savedRows) && savedRows.length > 0 ? savedRows[0] : null;
    return new Response(JSON.stringify({ ok: true, location_id, saved }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 400;
    const message = status >= 500 && true ? "Server error" : err?.message ?? "Unknown error";
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status,
      headers: { "content-type": "application/json" }
    });
  }
};
const _page = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  POST,
  prerender
}, Symbol.toStringTag, { value: "Module" }));
const page = () => _page;
export {
  page,
  renderers
};
