// parseComponents / readComponents (spec § 3) : le type et le rôle viennent du registre, la
// clé est stable, le libellé est libre. Ce que le test attrape : un type hors registre, un rôle
// hors du type, une clé dupliquée ou malformée, une liste qui n'en est pas une, une colonne
// illisible qui ferait planter la lecture.
import { describe, it, expect } from "vitest";
import { parseComponents, readComponents } from "./dispositifTypes";

let n = 0;
const newKey = () => `k${++n}`;

describe("parseComponents", () => {
  it("accepte une liste vide, null, et fabrique une clé quand elle manque", () => {
    expect(parseComponents(null, newKey)).toEqual({ ok: true, components: [] });
    expect(parseComponents([], newKey)).toEqual({ ok: true, components: [] });
    const r = parseComponents([{ type: "lineaire", role: "expert", label: " Linéaire poivres " }], newKey);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.components).toEqual([{ key: "k1", type: "lineaire", role: "expert", label: "Linéaire poivres" }]);
  });
  it("garde une clé fournie (stabilité dans la chaîne de versions)", () => {
    const r = parseComponents([{ key: "abc-12", type: "vitrine" }], newKey);
    expect(r).toEqual({ ok: true, components: [{ key: "abc-12", type: "vitrine", role: null, label: null }] });
  });
  it("refuse un type hors registre", () => {
    const r = parseComponents([{ type: "meuble_central" }], newKey);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("type inconnu");
  });
  it("refuse un rôle qui n'existe pas pour le type", () => {
    expect(parseComponents([{ type: "vitrine", role: "expert" }], newKey).ok).toBe(false);
    expect(parseComponents([{ type: "mediation", role: "expert" }], newKey).ok).toBe(false);
    expect(parseComponents([{ type: "mediation", role: "cartel" }], newKey).ok).toBe(true);
  });
  it("refuse une clé dupliquée ou malformée, une liste qui n'en est pas une", () => {
    expect(parseComponents([{ key: "a", type: "caisse" }, { key: "a", type: "caisse" }], newKey).ok).toBe(false);
    expect(parseComponents([{ key: "a b", type: "caisse" }], newKey).ok).toBe(false);
    expect(parseComponents("lineaire", newKey).ok).toBe(false);
    expect(parseComponents([null], newKey).ok).toBe(false);
  });
  it("tronque le libellé à 120 caractères", () => {
    const r = parseComponents([{ type: "gondole", label: "x".repeat(200) }], newKey);
    if (r.ok) expect(r.components[0].label?.length).toBe(120);
    expect(r.ok).toBe(true);
  });
});

describe("readComponents", () => {
  it("lit la colonne JSON, rend vide sur NULL, vide ou illisible", () => {
    expect(readComponents(null)).toEqual([]);
    expect(readComponents("")).toEqual([]);
    expect(readComponents("{pas du json")).toEqual([]);
    expect(readComponents(JSON.stringify([{ key: "c1", type: "tete_de_gondole", role: "promo", label: "TG entrée" }])))
      .toEqual([{ key: "c1", type: "tete_de_gondole", role: "promo", label: "TG entrée" }]);
  });
  it("écarte une liste stockée dont un élément est devenu invalide (type retiré du registre)", () => {
    expect(readComponents(JSON.stringify([{ key: "c1", type: "type_disparu" }]))).toEqual([]);
  });
});
