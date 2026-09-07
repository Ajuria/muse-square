// Blocs de comparaison (incrément 4, 28/08) — le constructeur PUR : une ligne par
// entité × période, l'écart €/j composé seulement entre les DEUX périodes d'une même
// entité CA (planchers tenus), jamais un verdict entre entités.
import { describe, it, expect } from "vitest";
import { buildEntityCompareBlocks, type EntityPeriodReading } from "./entityReading";

const fam = (name: string): any => ({ kind: "famille", id: null, name, families: [name] });
const caReading = (name: string, start: string, end: string, rev: number, n: number, delta: number | null): EntityPeriodReading => ({
  entity: fam(name), start, end,
  pole: { families: [], operations: [], totals: { rev30_eur: rev, share_pct: 10, avg30_eur_day: rev / n, base_eur_day: null, delta_pct: delta, n30: n } },
});

describe("buildEntityCompareBlocks", () => {
  it("deux entités × une période : une ligne chacune, pas de fact composé", () => {
    const b = buildEntityCompareBlocks([
      [caReading("Coffee", "2026-07-01", "2026-07-31", 15521, 31, 23.6)],
      [caReading("Tea", "2026-07-01", "2026-07-31", 6200, 31, -4.1)],
    ]);
    expect(b.headline).toBe("Famille Coffee vs Famille Tea — du 01/07/2026 au 31/07/2026");
    const rows = b.sections[0].table!.rows;
    expect(rows).toHaveLength(2);
    expect(rows[0].cells[3].v).toBe("501 €/jour");
    expect(b.sections[0].facts).toBeUndefined();
  });
  it("une entité × deux périodes : l'écart €/j composé, division de sommes mesurées", () => {
    const b = buildEntityCompareBlocks([[
      caReading("Coffee", "2026-07-01", "2026-07-31", 15521, 31, 23.6),
      caReading("Coffee", "2026-06-01", "2026-06-30", 12198, 30, 21),
    ]]);
    expect(b.headline).toContain("vs du 01/06/2026");
    expect(b.sections[0].facts![0]).toBe("Famille Coffee : 501 €/jour (du 01/07/2026 au 31/07/2026) vs 407 €/jour (du 01/06/2026 au 30/06/2026) — +23,1 %.");
  });
  it("sous les planchers (< 5 j vendus) : « — », et jamais d'écart composé", () => {
    const b = buildEntityCompareBlocks([[
      caReading("Coffee", "2026-07-01", "2026-07-31", 900, 3, null),
      caReading("Coffee", "2026-06-01", "2026-06-30", 12198, 30, 21),
    ]]);
    expect(b.sections[0].table!.rows[0].cells[4].v).toBe("—");
    expect(b.sections[0].facts).toBeUndefined();
  });
});
