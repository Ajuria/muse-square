// Mesures d'espace — validation PURE, format dbt, mesure en vigueur (docs/espace-et-pole.md E3-E5).
import { describe, expect, it } from "vitest";
import {
  validateComponentMeasure, validatePoleMeasure, parseSpaceMeasuresBody, familiesShareJson, currentMeasures,
  parseMeasureSource, type SpaceMeasureRow,
} from "./spaceMeasures";

describe("validateComponentMeasure", () => {
  it("longueur à la virgule × faces = mètres linéaires de façade, arrondis au cm", () => {
    const v = validateComponentMeasure({ component_key: "c1", fixture_no: "12", length_m: "2,4", depth_m: "1,1", faces: "2" });
    expect(v).toEqual({ ok: true, value: { component_key: "c1", fixture_no: 12, length_m: 2.4, depth_m: 1.1, faces: 2, linear_m_facade: 4.8, families_share: null } });
  });
  it("sans faces, pas de mètres de façade — la longueur reste (une mesure incomplète n'est pas 0)", () => {
    const v = validateComponentMeasure({ component_key: "c1", length_m: 1.62, depth_m: 0.39 });
    expect(v.ok && v.value.linear_m_facade).toBeNull();
    expect(v.ok && v.value.length_m).toBe(1.62);
  });
  it("faces : 1 ou 2, rien d'autre", () => {
    expect(validateComponentMeasure({ component_key: "c1", length_m: 1, faces: 0 })).toEqual({ ok: false, error: "Faces de préhension : 1 ou 2." });
    expect(validateComponentMeasure({ component_key: "c1", length_m: 1, faces: 3 }).ok).toBe(false);
  });
  it("Part de linéaire : Σ = 100 % à l'arrondi près, familles uniques", () => {
    const ok = validateComponentMeasure({ component_key: "c1", length_m: 3, faces: 1, families_share: [{ family: "Couteaux", share: 0.33 }, { family: "Céréales", share: 0.67 }] });
    expect(ok.ok && ok.value.families_share).toEqual([{ family: "Couteaux", share: 0.33 }, { family: "Céréales", share: 0.67 }]);
    const tiers = validateComponentMeasure({ component_key: "c1", length_m: 3, faces: 1, families_share: [{ family: "A", share: 0.33 }, { family: "B", share: 0.33 }, { family: "C", share: 0.34 }] });
    expect(tiers.ok).toBe(true);
    const bad = validateComponentMeasure({ component_key: "c1", length_m: 3, faces: 1, families_share: [{ family: "A", share: 0.5 }, { family: "B", share: 0.3 }] });
    expect(bad).toEqual({ ok: false, error: "Les parts de linéaire font 80 % — elles doivent faire 100 %." });
    const dup = validateComponentMeasure({ component_key: "c1", length_m: 3, faces: 1, families_share: [{ family: "A", share: 0.5 }, { family: "A", share: 0.5 }] });
    expect(dup.ok).toBe(false);
  });
  it("une rangée vide n'est pas une mesure", () => {
    expect(validateComponentMeasure({ component_key: "c1" }).ok).toBe(false);
    expect(validateComponentMeasure({ component_key: "", length_m: 1 }).ok).toBe(false);
  });
  it("bornes : longueur > 100 m, N° non entier, refusés", () => {
    expect(validateComponentMeasure({ component_key: "c1", length_m: 120 }).ok).toBe(false);
    expect(validateComponentMeasure({ component_key: "c1", fixture_no: "1,5" }).ok).toBe(false);
  });
});

describe("validatePoleMeasure / parseSpaceMeasuresBody", () => {
  it("surface de vente en m² à la virgule", () => {
    expect(validatePoleMeasure({ surface_m2: "42,5" })).toEqual({ ok: true, value: { surface_m2: 42.5 } });
    expect(validatePoleMeasure({ surface_m2: "0" }).ok).toBe(false);
  });
  it("le corps d'un POST : composants + surface ; un composant mesuré deux fois est refusé", () => {
    const v = parseSpaceMeasuresBody({ components: [{ component_key: "a", fixture_no: 1, length_m: "1,79", faces: 1 }], surface_m2: "12" });
    expect(v.ok && v.value.components[0].linear_m_facade).toBe(1.79);
    expect(v.ok && v.value.pole).toEqual({ surface_m2: 12 });
    expect(parseSpaceMeasuresBody(null)).toEqual({ ok: true, value: { components: [], pole: null } });
    expect(parseSpaceMeasuresBody({ components: [{ component_key: "a", length_m: 1 }, { component_key: "a", length_m: 2 }] }).ok).toBe(false);
  });
  it("families_share s'écrit au format que dbt lit ($.family, $.share)", () => {
    expect(familiesShareJson([{ family: "Thé", share: 0.5 }, { family: "Gâteaux", share: 0.5 }])).toBe('[{"family":"Thé","share":0.5},{"family":"Gâteaux","share":0.5}]');
    expect(familiesShareJson(null)).toBeNull();
    expect(familiesShareJson([])).toBeNull();
  });
  it("source : la liste fermée de dbt, repli saisie", () => {
    expect(parseMeasureSource("plan")).toBe("plan");
    expect(parseMeasureSource("laser")).toBe("saisie");
  });
});

describe("currentMeasures", () => {
  const row = (o: Partial<SpaceMeasureRow>): SpaceMeasureRow => ({
    measure_id: "m", location_id: "l", dispositif_id: "d", version_no: 1, component_key: null, fixture_no: null, length_m: null,
    depth_m: null, faces: null, linear_m_facade: null, surface_m2: null, families_share: null, measured_at: null, source: "plan",
    declarant_user_id: null, created_at: "2026-09-11T10:00:00", ...o,
  });
  it("la dernière created_at par (dispositif, version, composant | pôle) — un ruban remplace un plan", () => {
    const cur = currentMeasures([
      row({ measure_id: "plan", component_key: "c1", length_m: 4.61, source: "plan", created_at: "2026-09-11T10:00:00" }),
      row({ measure_id: "ruban", component_key: "c1", length_m: 4.2, source: "ruban", created_at: "2026-09-15T09:00:00" }),
      row({ measure_id: "surf", component_key: null, surface_m2: 30 }),
      row({ measure_id: "v2", version_no: 2, component_key: "c1", length_m: 4.2 }),
    ]);
    expect(cur.map((r) => r.measure_id).sort()).toEqual(["ruban", "surf", "v2"]);
  });
});
