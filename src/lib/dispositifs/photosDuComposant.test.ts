// Les photos d'un composant dans le temps (point 4, owner 14/09). Ce qui se garde : rien n'est jeté,
// l'ordre va du plus récent au plus ancien, et les versions ne séparent pas un composant de lui-même.
import { describe, expect, it } from "vitest";
import { photosDuComposant } from "./dispositifPhotoRows";

const p = (photo_id: string, component_key: string, version_no: number, created_at: string): any =>
  ({ photo_id, component_key, version_no, created_at, status: "read", dispositif_id: "d1", location_id: "l1" });

describe("photosDuComposant — la suite d'un meuble, jamais une seule photo", () => {
  it("groupe par composant et rend du plus récent au plus ancien", () => {
    const out = photosDuComposant([
      p("a", "k1", 1, "2026-09-01T10:00:00Z"),
      p("c", "k1", 1, "2026-09-12T10:00:00Z"),
      p("b", "k1", 1, "2026-09-07T10:00:00Z"),
      p("d", "k2", 1, "2026-09-05T10:00:00Z"),
    ]);
    expect(out.k1.map((r) => r.photo_id)).toEqual(["c", "b", "a"]);
    expect(out.k2.map((r) => r.photo_id)).toEqual(["d"]);
  });

  it("un composant reste LE MÊME meuble d'une version à l'autre — les versions ne le coupent pas en deux", () => {
    const out = photosDuComposant([
      p("v1", "k1", 1, "2026-08-01T10:00:00Z"),
      p("v2", "k1", 2, "2026-09-01T10:00:00Z"),
    ]);
    expect(out.k1.map((r) => r.photo_id)).toEqual(["v2", "v1"]);
    expect(Object.keys(out)).toEqual(["k1"]);
  });

  it("AUCUN plafond : ce qui serait jeté ici n'est atteignable nulle part ailleurs", () => {
    const rows = Array.from({ length: 12 }, (_, i) => p(`p${i}`, "k1", 1, `2026-09-${String(i + 1).padStart(2, "0")}T10:00:00Z`));
    expect(photosDuComposant(rows).k1).toHaveLength(12);
  });

  it("sans photo, aucune clé — jamais un composant vide à rendre", () => {
    expect(photosDuComposant([])).toEqual({});
  });
});
