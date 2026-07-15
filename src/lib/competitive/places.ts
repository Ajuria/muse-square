// src/lib/competitive/places.ts
// The ONE Google Places lookup for competitive surfaces. Returns what we actually need to judge a
// competitor BEFORE following it: where it is (→ real distance, not an LLM guess) and how established
// it is (Google rating + review count — the "who do I watch first" signal).
//
// Distinct from lib/competitive/geocode.ts on purpose: that one is the French BAN address API (free,
// no key, address → lat/lon). Places costs per call but carries the GBP signals BAN cannot.
//
// Degrades to null on missing key / quota / no match — every caller must treat enrichment as optional
// and still render the answer.

const PLACES_API_BASE = "https://places.googleapis.com/v1/places";

export interface PlaceLookup {
  place_id: string;
  display_name: string;
  lat: number;
  lon: number;
  rating: number | null;        // Google rating (0-5)
  rating_count: number | null;  // how many reviews back it — a thin rating is a weak signal
}

// One text search ("<name> <city>"). Returns null rather than throwing: enrichment is never critical.
export async function lookupPlace(query: string): Promise<PlaceLookup | null> {
  const apiKey = (process.env.GOOGLE_PLACES_API_KEY || "").trim();
  const q = String(query || "").trim();
  if (!apiKey || !q) return null;
  try {
    const res = await fetch(`${PLACES_API_BASE}:searchText`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        // location + displayName (what add-competitor needed) PLUS the GBP signals.
        "X-Goog-FieldMask": "places.id,places.location,places.displayName,places.rating,places.userRatingCount",
      },
      body: JSON.stringify({ textQuery: q, languageCode: "fr", maxResultCount: 1 }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      console.error(`[places] searchText error: ${res.status} ${res.statusText}`);
      return null;
    }
    const data: any = await res.json();
    const p = data?.places?.[0];
    const lat = Number(p?.location?.latitude);
    const lon = Number(p?.location?.longitude);
    const place_id = String(p?.id || "").trim();
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !place_id) return null;
    const rating = Number(p?.rating);
    const rating_count = Number(p?.userRatingCount);
    return {
      place_id,
      display_name: String(p?.displayName?.text || "").trim(),
      lat,
      lon,
      rating: Number.isFinite(rating) ? rating : null,
      rating_count: Number.isFinite(rating_count) ? rating_count : null,
    };
  } catch (err: any) {
    console.error("[places] searchText failed:", err?.message);
    return null;
  }
}

// Haversine, metres. (The same math is inlined in search-db.ts and competitor-surveillance.ts; this is
// the shared home for new callers.)
export function distanceMeters(aLat: number, aLon: number, bLat: number, bLon: number): number | null {
  if (![aLat, aLon, bLat, bLon].every((n) => Number.isFinite(n))) return null;
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s)));
}
