// Les cinq formes d'un nom de KPI (27/08). Chaque attente est la chaîne EXACTE aujourd'hui
// écrite à la main dans la surface citée — le test prouve que la dérivation les reproduit,
// donc que brancher la surface ne changera aucun mot rendu.
import { describe, it, expect } from "vitest";
import { kpiNom, kpiTaux, kpiLe, kpiDu, kpiVotre, kpiA, KPI_NOM_FR } from "./kpiRegistry";
import type { KpiKey } from "./kpiRegistry";

describe("les cinq formes reproduisent les chaînes déjà en prod", () => {
  it("nue — event-form.js:89 « Panier moyen », tableau.astro:666 « taux de conversion »", () => {
    expect(kpiNom("basket")).toBe("panier moyen");
    expect(kpiNom("conversion")).toBe("taux de conversion");
  });

  it("taux — « /j » (owner 24/08) sur les FLUX seulement, jamais sur une moyenne ni un ratio", () => {
    expect(kpiTaux("transactions")).toBe("ventes/j");
    expect(kpiTaux("footfall")).toBe("visiteurs/j");
    expect(kpiTaux("discount")).toBe("€ remisés/j");
    expect(kpiTaux("basket")).toBe("panier moyen");
    expect(kpiTaux("conversion")).toBe("taux de conversion");
  });

  it("définie — rapport.astro:73 et salesDecomp.ts:60, mot pour mot", () => {
    expect(kpiLe("transactions")).toBe("les ventes");
    expect(kpiLe("basket")).toBe("le panier moyen");
    expect(kpiLe("conversion")).toBe("le taux de conversion");
  });

  it("génitive — dayClassRegistry.ts:1434, mot pour mot", () => {
    expect(kpiDu("footfall")).toBe("des visiteurs");
    expect(kpiDu("transactions")).toBe("des ventes");
    expect(kpiDu("conversion")).toBe("du taux de conversion");
  });

  it("possessive — pulse.astro:1773, mot pour mot", () => {
    expect(kpiVotre("footfall")).toBe("vos visiteurs");
    expect(kpiVotre("transactions")).toBe("vos ventes");
    expect(kpiVotre("basket")).toBe("votre panier moyen");
    expect(kpiVotre("conversion")).toBe("votre taux de conversion");
  });
});

describe("kpiA — la contraction que rapport.astro:285 n'a pas", () => {
  it("« aux ventes », jamais « à les ventes »", () => {
    expect(kpiA("transactions")).toBe("aux ventes");
    expect(kpiA("transactions")).not.toBe("à les ventes");
  });
  it("« au panier moyen », jamais « à le panier moyen »", () => {
    expect(kpiA("basket")).toBe("au panier moyen");
    expect(kpiA("footfall")).toBe("aux visiteurs");
    expect(kpiA("conversion")).toBe("au taux de conversion");
  });
  it("aucune forme ne laisse passer « à le » ou « à les »", () => {
    for (const k of Object.keys(KPI_NOM_FR) as KpiKey[]) {
      expect(kpiA(k)).not.toMatch(/^à le\b|^à les\b/);
    }
  });
});

describe("le féminin est porté, pas deviné", () => {
  it("ventes est féminin pluriel, note Google féminin singulier", () => {
    expect(kpiVotre("reputation")).toBe("votre note Google");
    expect(kpiLe("reputation")).toBe("la note Google");
    expect(kpiA("reputation")).toBe("à la note Google");
  });
});

describe("chaque KPI du registre a sa grammaire — aucun trou", () => {
  it("les 9 clés sont couvertes et rendent une chaîne non vide dans les 5 formes", () => {
    const keys = Object.keys(KPI_NOM_FR) as KpiKey[];
    expect(keys).toHaveLength(9); // 8 + profit_estimated (K9 fusionné 27/08)
    for (const k of keys) {
      for (const f of [kpiNom, kpiTaux, kpiLe, kpiDu, kpiVotre, kpiA]) {
        expect(f(k).trim().length).toBeGreaterThan(0);
      }
    }
  });
});
