import { describe, it, expect } from "vitest";
import { planDeRedescription, lireComposants } from "./composantsDescription";
import type { DispositifComponent } from "./dispositifTypes";

// Les sept meubles de la Cave du compte owner, tels qu'ils sont en base au 14/09 : tous « autre »,
// sans rôle, avec leur libellé porteur du numéro du plan. C'est ce jeu que la redescription vise.
const CAVE: DispositifComponent[] = [
  { key: "p1", type: "autre", role: null, label: "N° 1 — Vin & Spiritueux" },
  { key: "p2", type: "autre", role: null, label: "N° 2 — Vin & Spiritueux" },
  { key: "p8", type: "autre", role: null, label: "N° 8 — Ilot spiritueux" },
];

describe("planDeRedescription — ce qui se redécrit en place", () => {
  it("type un composant sans toucher aux autres", () => {
    const r = planDeRedescription({
      actuels: CAVE,
      proposes: [{ key: "p1", type: "lineaire" }, { key: "p2" }, { key: "p8" }],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.components.map((c) => c.type)).toEqual(["lineaire", "autre", "autre"]);
    expect(r.changements).toEqual([{ key: "p1", champ: "type", avant: "autre", apres: "lineaire" }]);
    // le libellé et la clé ne bougent pas
    expect(r.components[0].key).toBe("p1");
    expect(r.components[0].label).toBe("N° 1 — Vin & Spiritueux");
  });

  it("pose un rôle qui appartient au type", () => {
    const r = planDeRedescription({
      actuels: CAVE,
      proposes: [{ key: "p1", type: "lineaire", role: "expert" }, { key: "p2" }, { key: "p8" }],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.components[0].role).toBe("expert");
  });

  it("refuse un rôle étranger au type", () => {
    const r = planDeRedescription({
      actuels: CAVE,
      proposes: [{ key: "p1", type: "caisse", role: "expert" }, { key: "p2" }, { key: "p8" }],
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("expert");
  });

  it("un type qui change emporte un rôle devenu impossible, au lieu de le garder", () => {
    const avecRole: DispositifComponent[] = [{ key: "p1", type: "lineaire", role: "expert", label: null }];
    const r = planDeRedescription({ actuels: avecRole, proposes: [{ key: "p1", type: "caisse" }] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.components[0].role).toBeNull();
    expect(r.changements).toContainEqual({ key: "p1", champ: "role", avant: "expert", apres: null });
  });

  it("renomme un composant", () => {
    const r = planDeRedescription({
      actuels: CAVE,
      proposes: [{ key: "p1" }, { key: "p2" }, { key: "p8", label: "Îlot spiritueux" }],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.components[2].label).toBe("Îlot spiritueux");
  });

  it("garde l'ORDRE des actuels, quel que soit celui de la proposition", () => {
    const r = planDeRedescription({
      actuels: CAVE,
      proposes: [{ key: "p8", type: "lineaire" }, { key: "p1" }, { key: "p2" }],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // l'ordre est celui de la marche dans le magasin : le relevé attribue ses photos par RANG.
    expect(r.components.map((c) => c.key)).toEqual(["p1", "p2", "p8"]);
  });
});

describe("planDeRedescription — ce qui exige une version nouvelle", () => {
  it("refuse un composant AJOUTÉ", () => {
    const r = planDeRedescription({
      actuels: CAVE,
      proposes: [{ key: "p1" }, { key: "p2" }, { key: "p8" }, { key: "p9", type: "lineaire" }],
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("version nouvelle");
  });

  it("refuse un composant RETIRÉ", () => {
    const r = planDeRedescription({ actuels: CAVE, proposes: [{ key: "p1" }, { key: "p2" }] });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("version nouvelle");
  });

  it("refuse une clé inconnue — même à effectif constant", () => {
    const r = planDeRedescription({
      actuels: CAVE,
      proposes: [{ key: "p1" }, { key: "p2" }, { key: "pZZ", type: "lineaire" }],
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("Ajouter");
  });
});

describe("planDeRedescription — les gardes d'entrée", () => {
  it("refuse une clé en double", () => {
    const r = planDeRedescription({ actuels: CAVE, proposes: [{ key: "p1" }, { key: "p1" }, { key: "p8" }] });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("deux fois");
  });

  it("refuse un composant sans clé", () => {
    const r = planDeRedescription({ actuels: CAVE, proposes: [{ type: "lineaire" }, { key: "p2" }, { key: "p8" }] });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("clé");
  });

  it("refuse un type inconnu", () => {
    const r = planDeRedescription({ actuels: CAVE, proposes: [{ key: "p1", type: "meuble_a_moi" }, { key: "p2" }, { key: "p8" }] });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("type inconnu");
  });

  it("refuse un pôle sans composant", () => {
    const r = planDeRedescription({ actuels: [], proposes: [{ key: "p1", type: "lineaire" }] });
    expect(r.ok).toBe(false);
  });

  it("dit « rien à modifier » quand la proposition est identique — aucune écriture pour rien", () => {
    const r = planDeRedescription({ actuels: CAVE, proposes: CAVE.map((c) => ({ ...c })) });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe("Rien à modifier");
  });
});

describe("lireComposants — le JSON stocké n'est jamais supposé valide", () => {
  it("lit la forme normale", () => {
    expect(lireComposants('[{"key":"p1","type":"autre","role":null,"label":"N° 1"}]')).toEqual([
      { key: "p1", type: "autre", role: null, label: "N° 1" },
    ]);
  });
  it("rend [] sur null, vide, JSON cassé ou objet", () => {
    expect(lireComposants(null)).toEqual([]);
    expect(lireComposants("")).toEqual([]);
    expect(lireComposants("{pas du json")).toEqual([]);
    expect(lireComposants('{"key":"p1"}')).toEqual([]);
  });
  it("écarte une entrée sans clé, et normalise les vides en null", () => {
    expect(lireComposants('[{"type":"autre"},{"key":"p2","type":"autre","role":"","label":"  "}]')).toEqual([
      { key: "p2", type: "autre", role: null, label: null },
    ]);
  });
});
