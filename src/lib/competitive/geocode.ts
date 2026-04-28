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
function cleanCity(raw: string): string {
  let c = raw
    .replace(/\(.*?\)/g, "")
    .replace(/Île-de-France|Occitanie|PACA|Provence-Alpes-Côte d'Azur|Auvergne-Rhône-Alpes|Nouvelle-Aquitaine|Bretagne|Normandie|Grand Est|Hauts-de-France|Pays de la Loire|Centre-Val de Loire|Bourgogne-Franche-Comté|Corse/gi, "")
    .replace(/\d+(st|nd|rd|th)\s+arrondissement/gi, "")
    .replace(/\d+e(me|ème)?\s+arrondissement/gi, "")
    .replace(/\d+e\s+/g, "")
    .replace(/arrondissement/gi, "")
    .replace(/[,·]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (/paris/i.test(c)) c = "Paris";
  return c || raw;
}

export async function geocodeCompetitor(
  competitorName: string,
  city: string | null,
  address: string | null
): Promise<GeocodeResult | null> {
  const cleanedCity = city ? cleanCity(city) : null;
  const queries: string[] = [];
  if (address && cleanedCity) queries.push(`${address}, ${cleanedCity}`);
  else if (address) queries.push(address);
  if (competitorName && cleanedCity) queries.push(`${competitorName} ${cleanedCity}`);
  else if (competitorName) queries.push(competitorName);

  // Get city reference point for validation
  let cityRef: { lat: number; lon: number } | null = null;
  if (cleanedCity) {
    cityRef = await callBanApi(cleanedCity);
  }

  for (const q of queries) {
    const result = await callBanApi(q);
    if (result) {
      // Validate: if we have a city reference, reject results >30km away
      if (cityRef) {
        const dLat = result.lat - cityRef.lat;
        const dLon = result.lon - cityRef.lon;
        const approxKm = Math.sqrt(dLat * dLat + dLon * dLon) * 111;
        if (approxKm > 30) continue;
      }
      return result;
    }
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