// Matching PUR du résolveur d'entités (27/08) — chaque règle vue tomber par mutation.
import { describe, it, expect } from "vitest";
import { matchEntities, type SiteEntities } from "./entityResolver";

const SITE: SiteEntities = {
  entities: [
    { kind: "pole", id: "p1", name: "Pôle périssables", families: ["Coffee", "Bakery"] },
    { kind: "pole", id: "p2", name: "Pôle traiteur libanais", families: ["Traiteur"] },
    { kind: "famille", id: null, name: "Coffee", families: ["Coffee"] },
    { kind: "famille", id: null, name: "Traiteur", families: ["Traiteur"] },
    { kind: "famille", id: null, name: "Tea", families: ["Tea"] },
    { kind: "operation", id: "s1", name: "Producteur invité — fromages", families: [] },
    { kind: "personne", id: null, name: "Camille Robin · Vente", families: [] },
  ],
};

describe("matchEntities — le matching pur", () => {
  it("trouve un pôle avec ou sans le mot « pôle », accents/casse ignorés", () => {
    expect(matchEntities("comment va mon pôle périssables ?", SITE).map((e) => e.id)).toEqual(["p1"]);
    expect(matchEntities("les PERISSABLES depuis janvier", SITE).map((e) => e.id)).toEqual(["p1"]);
  });
  it("le nom le plus long prime : « pôle traiteur libanais » = LE PÔLE, jamais la famille Traiteur incluse dedans", () => {
    const m = matchEntities("le pôle traiteur libanais ce trimestre", SITE);
    expect(m).toHaveLength(1);
    expect(m[0].kind).toBe("pole");
    expect(m[0].id).toBe("p2");
  });
  it("la famille Traiteur seule reste trouvable quand le pôle n'est pas nommé", () => {
    const m = matchEntities("la famille traiteur en juin", SITE);
    expect(m).toHaveLength(1);
    expect(m[0].kind).toBe("famille");
  });
  it("une famille se trouve par son nom (« la famille Coffee cet été »)", () => {
    const m = matchEntities("la famille Coffee cet été", SITE);
    expect(m).toHaveLength(1);
    expect(m[0].kind).toBe("famille");
  });
  it("« Tea » ne matche JAMAIS au milieu d'un mot (« bâteau », « team »)", () => {
    expect(matchEntities("le team building du bateau", SITE)).toEqual([]);
  });
  it("une opération se trouve par son titre, une personne par son prénom", () => {
    expect(matchEntities("bilan du producteur invité — fromages", SITE)[0].kind).toBe("operation");
    expect(matchEntities("les opérations de Camille en août", SITE)[0].kind).toBe("personne");
  });
  it("zones consommées : « pôle périssables » ne libère pas un second match dedans", () => {
    const m = matchEntities("mon pôle périssables", SITE);
    expect(m).toHaveLength(1);
  });
  it("deux entités distinctes dans la même question sortent toutes les deux", () => {
    const kinds = matchEntities("Camille sur le pôle traiteur libanais", SITE).map((e) => e.kind).sort();
    expect(kinds).toEqual(["personne", "pole"]);
  });
});
