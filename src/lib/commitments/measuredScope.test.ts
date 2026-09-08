// Le périmètre de mesure — pur (docs/dispositif-perimetre-mesure-spec.md). Chaque assertion vue tomber par mutation.
import { describe, it, expect } from "vitest";
import { parseScope, normalizeScope, scopeFromFamily, scopeLabelFr, scopeFilter, scopeNewFamilies, serializeScope, scopeFromConfirmedPhotos } from "./measuredScope";

describe("parse / normalize", () => {
  it("la migration du Corner : { familles: [Branded] }", () => {
    const s = parseScope('{"kind":"familles","familles":[{"nom":"Branded"}]}');
    expect(s).toEqual({ kind: "familles", familles: [{ nom: "Branded" }] });
    expect(scopeFromFamily(" Branded ")).toEqual(s);
    expect(serializeScope(s)).toBe('{"kind":"familles","familles":[{"nom":"Branded"}]}');
  });
  it("familles en chaînes ou en objets, doublons retirés, « nouvelle » gardée (D7)", () => {
    const s = normalizeScope({ kind: "familles", familles: ["Coffee beans", { nom: "Coffee beans" }, { nom: "Miel de Houdan", nouvelle: true }] });
    expect(s?.familles).toEqual([{ nom: "Coffee beans" }, { nom: "Miel de Houdan", nouvelle: true }]);
    expect(scopeNewFamilies(s)).toEqual(["Miel de Houdan"]);
  });
  it("pôle : ses familles figées + nom ; articles : codes ; vide ou inconnu → null", () => {
    expect(normalizeScope({ kind: "pole", pole_id: "p1", pole_nom: "Épicerie fine", familles: ["Tea"] })).toEqual({ kind: "pole", familles: [{ nom: "Tea" }], pole_id: "p1", pole_nom: "Épicerie fine" });
    expect(normalizeScope({ kind: "articles", item_codes: ["A1", "A1", "B2"] })).toEqual({ kind: "articles", item_codes: ["A1", "B2"] });
    expect(normalizeScope({ kind: "familles", familles: [] })).toBeNull();
    expect(normalizeScope({ kind: "autre", familles: ["Tea"] })).toBeNull();
    expect(parseScope("pas du json")).toBeNull();
    expect(parseScope(null)).toBeNull();
  });
});

describe("scopeFromConfirmedPhotos (P4, D3 — une photo confirmée = un périmètre)", () => {
  const ph = (component_key: string, created_at: string, codes: string[] | null) => ({ component_key, created_at, items_confirmed: codes ? codes.map((item_code) => ({ item_code })) : null });
  it("l'union des articles confirmés des DERNIÈRES photos par composant devient le périmètre articles", () => {
    const r = scopeFromConfirmedPhotos([ph("c1", "2026-09-01", ["A1", "B2"]), ph("c1", "2026-09-05", ["A1"]), ph("c2", "2026-09-03", ["C3", "A1"])], null);
    expect(r).toEqual({ scope: { kind: "articles", item_codes: ["A1", "C3"] }, changed: true });
  });
  it("sans article confirmé : rien ne change ; un choix explicite de familles ou de pôle n'est jamais écrasé ; le même ensemble ne réécrit pas", () => {
    expect(scopeFromConfirmedPhotos([ph("c1", "2026-09-01", null), ph("c2", "2026-09-01", [])], null)).toEqual({ scope: null, changed: false });
    const fam = { kind: "familles" as const, familles: [{ nom: "Branded" }] };
    expect(scopeFromConfirmedPhotos([ph("c1", "2026-09-01", ["A1"])], fam)).toEqual({ scope: fam, changed: false });
    const art = { kind: "articles" as const, item_codes: ["A1"] };
    expect(scopeFromConfirmedPhotos([ph("c1", "2026-09-01", ["A1"])], art)).toEqual({ scope: art, changed: false });
    expect(scopeFromConfirmedPhotos([ph("c1", "2026-09-02", ["A1", "B2"])], art).changed).toBe(true);
  });
});

describe("scopeFilter", () => {
  it("familles → item_category ; articles → item_code", () => {
    expect(scopeFilter({ kind: "familles", familles: [{ nom: "Tea" }, { nom: "Coffee" }] })).toEqual({ sql: "item_category IN UNNEST(@scope_familles)", params: { scope_familles: ["Tea", "Coffee"] }, types: { scope_familles: ["STRING"] } });
    expect(scopeFilter({ kind: "articles", item_codes: ["A1"] }).sql).toBe("item_code IN UNNEST(@scope_items)");
  });
});

describe("scopeLabelFr (mots owner 07/09)", () => {
  const fam = (...n: string[]) => ({ kind: "familles" as const, familles: n.map((nom) => ({ nom })) });
  it("une, deux, trois familles, puis le nombre ; pôle ; articles = le titre du dispositif ; sans périmètre = CA", () => {
    expect(scopeLabelFr(fam("Branded"))).toBe("CA de la famille « Branded »");
    expect(scopeLabelFr(fam("Branded", "Coffee beans"))).toBe("CA des familles « Branded » et « Coffee beans »");
    expect(scopeLabelFr(fam("A", "B", "C"))).toBe("CA des familles « A », « B » et « C »");
    expect(scopeLabelFr(fam("A", "B", "C", "D"))).toBe("CA des 4 familles du dispositif");
    expect(scopeLabelFr({ kind: "pole", familles: [{ nom: "Tea" }], pole_nom: "Épicerie fine" })).toBe("CA du pôle « Épicerie fine »");
    expect(scopeLabelFr({ kind: "articles", item_codes: ["A1"] }, "Corner de vente producteur")).toBe("CA de « Corner de vente producteur »");
    expect(scopeLabelFr(null)).toBe("CA");
  });
});
