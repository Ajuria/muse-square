// tests/pos-system-save-verify.test.ts — preuve par le comportement (P3.1-b), sous vitest
// (save.ts lit import.meta.env, absent sous tsx). Invocation DIRECTE du POST réel sur le site
// MS Test : pos_system écrit, sentinelles intactes, puis retour à NULL. Aucun état durable.
// Lancement : npx vitest run tests/pos-system-save-verify.test.ts
import "dotenv/config";
import { describe, it, expect } from "vitest";
import { makeBQClient } from "../src/lib/bq";

const PROJECT = "muse-square-open-data";
const TBL = `\`${PROJECT}.raw.insight_event_user_location_profile\``;
const LOC = "29383776-bd7a-4401-ac26-f2e6efe1f58c"; // MS Test

describe("save.ts écrit pos_system (P3.1-b)", () => {
  it("écrit sage100, garde les sentinelles, revient à NULL", async () => {
    const bq = makeBQClient(PROJECT);
    const readRow = async () => {
      const [rows] = await bq.query({
        query: `SELECT clerk_user_id, site_name, company_address, company_activity_type, pos_system,
                       location_type, event_time_profile, location_access_pattern,
                       nearest_transit_stop, nearest_transit_stop_id, nearest_transit_lines,
                       location_description, CAST(venue_capacity AS STRING) AS venue_capacity,
                       event_type_1, event_type_2, event_type_3,
                       CAST(weather_sensitivity AS STRING) AS weather_sensitivity, seasonality,
                       operating_hours, website_url, review_link, google_place_id,
                       city_id, company_lat, besttime_venue_id
                FROM ${TBL} WHERE location_id = @loc`,
        params: { loc: LOC }, types: { loc: "STRING" }, location: "EU",
      });
      return (rows as any[])[0];
    };

    const before = await readRow();
    expect(before, "ligne MS Test introuvable").toBeTruthy();
    expect(before.city_id, "city_id nul — chemin géocode 'unchanged' non tenable").toBeTruthy();

    const { POST } = await import("../src/pages/api/profile/save");
    // profileRowExists : posé par le middleware en prod ; la ligne vient d'être LUE ci-dessus.
    const locals = { clerk_user_id: String(before.clerk_user_id), all_location_ids: [LOC], profileRowExists: true };
    const basePayload: Record<string, any> = {
      mode: "update", location_id: LOC,
      // company_name / audiences / villes d'origine OMIS : gardés par IF(NULL) côté MERGE.
      company_address: before.company_address, // même adresse → 'unchanged', géo intacte
      company_activity_type: before.company_activity_type,
      location_type: before.location_type,
      event_time_profile: before.event_time_profile,
      location_access_pattern: before.location_access_pattern,
      nearest_transit_stop: before.nearest_transit_stop,
      nearest_transit_stop_id: before.nearest_transit_stop_id,
      nearest_transit_lines: before.nearest_transit_lines,
      site_name: before.site_name,
      location_description: before.location_description,
      venue_capacity: before.venue_capacity,
      event_type_1: before.event_type_1, event_type_2: before.event_type_2, event_type_3: before.event_type_3,
      weather_sensitivity: before.weather_sensitivity,
      seasonality: before.seasonality,
      operating_hours: before.operating_hours,
      website_url: before.website_url, review_link: before.review_link, google_place_id: before.google_place_id,
    };
    const call = async (payload: Record<string, any>) => {
      const req = new Request("http://localhost/api/profile/save", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload),
      });
      const res = await (POST as any)({ request: req, locals });
      return { status: res.status, out: await res.json().catch(() => null) };
    };

    const w1 = await call({ ...basePayload, pos_system: "sage100" });
    expect(w1.status, JSON.stringify(w1.out)).toBe(200);
    const mid = await readRow();
    expect(mid.pos_system).toBe("sage100");
    expect(mid.site_name).toBe(before.site_name);
    expect(mid.company_activity_type).toBe(before.company_activity_type);
    expect(String(mid.company_lat)).toBe(String(before.company_lat));
    expect(mid.city_id).toBe(before.city_id);

    const w2 = await call(basePayload); // sans pos_system → retour à NULL
    expect(w2.status).toBe(200);
    const after = await readRow();
    expect(after.pos_system).toBeNull();
    expect(after.site_name).toBe(before.site_name);
  }, 180_000);
});
