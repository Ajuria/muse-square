import { describe, it, expect } from "vitest";
import { latestPerComponent, photoObjectPath, photoGcsUri, type PhotoRow } from "./dispositifPhotos";
const row = (o: Partial<PhotoRow>): PhotoRow => ({ photo_id: "p", location_id: "l", dispositif_id: "d", version_no: 1, component_key: "c", walk_id: null, seq: null, t_offset_s: null, gcs_uri: "gs://x", dispositif_type: null, dispositif_role: null, status: "read", checklist: null, items_matched: null, items_confirmed: null, prices_seen: null, coverage_flag: null, model: null, prompt_version: null, created_by: null, created_at: "2026-09-03T10:00:00Z", ...o });
describe("dispositifPhotos — pur", () => {
  it("latestPerComponent garde la plus récente par (version, composant), quel que soit l'ordre d'entrée", () => {
    const rows = [row({ photo_id: "old", component_key: "c1", created_at: "2026-09-01T10:00:00Z" }), row({ photo_id: "new", component_key: "c1", created_at: "2026-09-03T10:00:00Z" }), row({ photo_id: "v2", component_key: "c1", version_no: 2, created_at: "2026-09-02T10:00:00Z" }), row({ photo_id: "c2", component_key: "c2" })];
    expect(latestPerComponent(rows).map((r) => r.photo_id).sort()).toEqual(["c2", "new", "v2"]);
  });
  it("le chemin objet et l'URI gs:// sont déterministes", () => {
    expect(photoObjectPath("loc", "disp", "ph")).toBe("loc/disp/ph.jpg");
    expect(photoGcsUri("loc/disp/ph.jpg")).toBe("gs://ms-dispositif-photo/loc/disp/ph.jpg");
  });
});
