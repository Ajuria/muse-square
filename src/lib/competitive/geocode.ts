// src/lib/competitive/geocode.ts
/**
 * Geocode a competitor using the French BAN API (api-adresse.data.gouv.fr).
 *
 * Builds a query from address + city + competitor name (fallback).
 * Returns lat/lon or null if no result.
 */

export interface GeocodeResult {
  lat: number;
  lon: number;
  label: string;
}

/**
 * Geocode using BAN API. Tries address+city first, then name+city as fallback.
 */
export async function geocodeCompetitor(
  competitorName: string,
  city: string | null,
  address: string | null
): Promise<GeocodeResult | null> {
  const queries: string[] = [];
  if (address && city) queries.push(`${address}, ${city}`);
  else if (address) queries.push(address);
  if (competitorName && city) queries.push(`${competitorName} ${city}`);
  else if (competitorName) queries.push(competitorName);

  for (const q of queries) {
    const result = await callBanApi(q);
    if (result) return result;
  }

  return null;
}

async function callBanApi(q: string): Promise<GeocodeResult | null> {
  const url = new URL("https://api-adresse.data.gouv.fr/search");
  url.searchParams.set("q", q);
  url.searchParams.set("limit", "1");

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 4000);

  try {
    const res = await fetch(url.toString(), { signal: controller.signal });
    if (!res.ok) return null;
    const data: any = await res.json().catch(() => null);
    const f0 = data?.features?.[0];
    const coords = f0?.geometry?.coordinates;
    const lat = Array.isArray(coords) ? Number(coords[1]) : NaN;
    const lon = Array.isArray(coords) ? Number(coords[0]) : NaN;
    const label = f0?.properties?.label ?? "";
    const score = f0?.properties?.score ?? 0;

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    if (score < 0.3) return null;

    return { lat, lon, label };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}