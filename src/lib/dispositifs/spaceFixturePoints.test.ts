import { describe, expect, it } from "vitest";
import { refusDePoint, pointsEnVigueur, prochainAPlacer, type FixturePointRow, type ComposantAPlacer } from "./spaceFixturePoints";

const pt = (o: Partial<FixturePointRow>): FixturePointRow => ({
  point_id: "a", location_id: "loc", dispositif_id: "d1", component_key: "p1", plan_id: "pl1",
  x: 0.5, y: 0.5, created_by: null, created_at: "2026-09-15T10:00:00Z", ...o,
});
const c = (key: string, no: number | null, nom = key): ComposantAPlacer => ({ component_key: key, fixture_no: no, nom, length_m: 2 });

describe("les points des composants sur le plan", () => {
  it("un point HORS du plan est refusé — un tap à côté poserait un numéro dans le vide", () => {
    const base = { component_key: "p1", plan_id: "pl1" };
    expect(refusDePoint({ ...base, x: 0.5, y: 0.5 })).toBeNull();
    expect(refusDePoint({ ...base, x: 0, y: 1 })).toBeNull();          // les bords sont DANS le plan
    for (const [x, y] of [[-0.01, 0.5], [1.01, 0.5], [0.5, -0.01], [0.5, 1.01], [NaN, 0.5], ["a" as any, 0.5]]) {
      expect(refusDePoint({ ...base, x, y }), `${String(x)},${String(y)}`).toBe("hors_plan");
    }
    expect(refusDePoint({ component_key: "", plan_id: "pl1", x: 0.5, y: 0.5 })).toBe("composant_absent");
    expect(refusDePoint({ component_key: "p1", plan_id: "", x: 0.5, y: 0.5 })).toBe("plan_absent");
  });

  it("le DERNIER point d'un composant fait foi — un meuble déplacé se replace", () => {
    // L'ancien point n'est pas effacé : les photos d'avant ont été prises quand il était là.
    // LE NEUF EST DONNÉ EN PREMIER, à dessein : s'il arrivait en dernier, l'ordre d'entrée suffirait
    // et retirer le tri laisserait le test vert. La mutation n'est pas tombée au premier jet pour
    // exactement cette raison.
    const v = pointsEnVigueur([
      pt({ point_id: "neuf", x: 0.9, y: 0.9, created_at: "2026-09-15T10:00:00Z" }),
      pt({ point_id: "vieux", x: 0.1, y: 0.1, created_at: "2026-09-01T10:00:00Z" }),
      pt({ point_id: "autre", component_key: "p2", created_at: "2026-09-02T10:00:00Z" }),
    ]);
    expect(v.get("p1")?.point_id).toBe("neuf");
    expect(v.size).toBe(2);
  });

  it("le prochain à placer suit le NUMÉRO, qui est le rang dans la marche", () => {
    const comps = [c("p7", 7), c("p1", 1), c("p4", 4)];
    expect(prochainAPlacer({ composants: comps, points: new Map() })).toMatchObject({ places: 0, total: 3 });
    expect(prochainAPlacer({ composants: comps, points: new Map() }).prochain?.component_key).toBe("p1");
    const avecP1 = new Map([["p1", pt({})]]);
    const r = prochainAPlacer({ composants: comps, points: avecP1 });
    expect(r.prochain?.component_key).toBe("p4");
    expect(r).toMatchObject({ places: 1, total: 3 });
  });

  it("un composant SANS numéro passe en dernier, et l'ordre reste stable", () => {
    // Sans ordre stable, le composant annoncé changerait d'un affichage à l'autre — on placerait un
    // meuble en croyant en placer un autre.
    const comps = [c("zz", null), c("aa", null), c("p2", 2)];
    expect(prochainAPlacer({ composants: comps, points: new Map() }).prochain?.component_key).toBe("p2");
    // ET LE DÉPARTAGE DES SANS-NUMÉRO EST STABLE. Il ne se voit QUE si aucun n'a de numéro : sinon le
    // numéroté passe devant et le départage ne décide rien — c'est pourquoi la mutation qui le retire
    // restait verte. Avec deux sans-numéro seuls, « aa » doit sortir quel que soit l'ordre d'entrée.
    const sansNo = [c("zz", null), c("aa", null)];
    expect(prochainAPlacer({ composants: sansNo, points: new Map() }).prochain?.component_key).toBe("aa");
    expect(prochainAPlacer({ composants: [...sansNo].reverse(), points: new Map() }).prochain?.component_key).toBe("aa");
  });

  it("tout placé : plus de prochain, et l'avancement le dit", () => {
    const comps = [c("p1", 1), c("p2", 2)];
    const tous = new Map([["p1", pt({})], ["p2", pt({ component_key: "p2" })]]);
    expect(prochainAPlacer({ composants: comps, points: tous })).toMatchObject({ prochain: null, places: 2, total: 2 });
  });
});

// ── 15/09 (owner, à l'essai) — « SI JE CLIQUE SUR UN ITEM IL DEVRAIT DISPARAÎTRE ».
it("un point retiré rend son composant à la file, À SON RANG — pas à la fin", () => {
  // Retirer le n° 1 alors que 1 et 2 sont posés doit RÉANNONCER le n° 1, pas passer au suivant :
  // l'exploitant vient de corriger un tap, il veut replacer CE composant-là.
  const comps = [c("p1", 1), c("p2", 2), c("p4", 4)];
  const deuxPoses = new Map([["p1", pt({})], ["p2", pt({ component_key: "p2" })]]);
  expect(prochainAPlacer({ composants: comps, points: deuxPoses }).prochain?.component_key).toBe("p4");
  deuxPoses.delete("p1");
  const apres = prochainAPlacer({ composants: comps, points: deuxPoses });
  expect(apres.prochain?.component_key).toBe("p1");
  expect(apres).toMatchObject({ places: 1, total: 3 });
});
