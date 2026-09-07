// I7 — les blocs « top K familles d'une période » (pur, fixture). Mutation vue rouge : tri/K.
import { describe, it, expect } from "vitest";
import { buildTopFamillesBlocks } from "./topFamilles";

const r = { start: "2026-08-01", end: "2026-08-31", n_days_total: 31, familles: [
  { famille: "Coffee", ca: 15000, share: 0.385, ca_jour: 483.9, n_days: 31 },
  { famille: "Tea", ca: 11000, share: 0.282, ca_jour: 354.8, n_days: 31 },
  { famille: "Bakery", ca: 5000, share: 0.128, ca_jour: 161.3, n_days: 31 },
  { famille: "Branded", ca: 800, share: 0.02, ca_jour: 25.8, n_days: 20 },
] };
const plain = (s: string) => s.replace(/[  ]/g, " ");

describe("buildTopFamillesBlocks", () => {
  it("K premières + Autres familles, titre daté, phrase de tête", () => {
    const b = buildTopFamillesBlocks(r, 3);
    expect(b.headline).toBe("Vos familles de produits & services — du 01/08/2026 au 31/08/2026");
    expect(b.sections[0].title).toBe("Top 3 familles de produits par CA");
    expect(b.sections[0].table.rows.map((x: any) => x.cells[0].v)).toEqual(["Coffee", "Tea", "Bakery", "Autres familles (1)"]);
    expect(plain(b.sections[0].table.rows[0].cells[1].v)).toBe("15 000 €");
    expect(b.sections[0].table.rows[0].cells[2].v).toBe("38,5 %");
    expect(plain(b.sections[0].facts[0])).toBe("4 familles vendues sur 31 jours mesurés · vos 3 premières familles font 79,5 % du CA de la période.");
    // K = 1 : la famille est nommée explicitement (owner 04/09).
    expect(plain(buildTopFamillesBlocks(r, 1).sections[0].facts[0])).toBe("4 familles vendues sur 31 jours mesurés · la famille Coffee fait 38,5 % du CA de la période.");
    expect(buildTopFamillesBlocks(r, 1).sections[0].title).toBe("Top 1 famille de produits par CA");
  });
  it("K plafonné au nombre de familles ; période sans vente = absence dite", () => {
    expect(buildTopFamillesBlocks(r, 9).sections[0].table.rows).toHaveLength(4);
    const e = buildTopFamillesBlocks({ start: "2026-08-01", end: "2026-08-31", n_days_total: 0, familles: [] }, 3);
    expect(e.sections[0].facts[0]).toBe("Aucune vente sur la période, du 01/08/2026 au 31/08/2026.");
  });
});
