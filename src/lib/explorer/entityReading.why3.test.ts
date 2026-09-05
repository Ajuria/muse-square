// Le pourquoi aux 3 étages (owner 28/08) — constructeur PUR : hiérarchie par |r|, planchers
// (3 j de chaque côté), plafond 3 phénomènes, profil de jour seulement si contraste >= 15 %,
// pied des relations utilisées. Jamais une phrase de mode de calcul.
import { describe, it, expect } from "vitest";
import { buildEntityWhy3Blocks, type EntityWhyInputs } from "./entityReading";

const day = (date: string, eur: number) => ({ date, eur });
const base = (over: Partial<EntityWhyInputs> = {}): EntityWhyInputs => ({
  reading: { entity: { kind: "famille", id: null, name: "Coffee", families: ["Coffee"] } as any, start: "2026-07-01", end: "2026-07-31" } as any,
  daily: [
    day("2026-07-03", 900), day("2026-07-04", 820), day("2026-07-05", 780),
    day("2026-07-06", 400), day("2026-07-07", 380), day("2026-07-08", 360),
    day("2026-07-10", 350), day("2026-07-11", 700), day("2026-07-12", 690),
    day("2026-07-13", 300), day("2026-07-14", 310), day("2026-07-15", 290),
  ],
  factorsByDate: new Map([
    ["2026-07-06", ["heat"]], ["2026-07-07", ["heat"]], ["2026-07-08", ["heat"]],
    ["2026-07-13", ["rain"]], ["2026-07-14", ["rain"]], ["2026-07-15", ["rain"]],
  ]),
  factors: [
    { key: "heat", mot_fr: "forte chaleur", med_hist_eur: -143, corr_r: -0.34, a_confirmer: false, hist_days: 32 },
    { key: "rain", mot_fr: "pluie", med_hist_eur: -220, corr_r: -0.2, a_confirmer: false, hist_days: 20 },
  ],
  ...over,
});

describe("buildEntityWhy3Blocks", () => {
  it("3 étages, phénomènes triés par |r|, avec vs sans + prior site + indice", () => {
    const b = buildEntityWhy3Blocks(base());
    expect(b.headline).toBe("Famille Coffee — du 01/07/2026 au 31/07/2026 : ce qui l'explique");
    const titles = b.sections.map((s) => s.title);
    expect(titles[0]).toBe("Ce qui compose l'écart");
    expect(titles).toContain("Les phénomènes extérieurs");
    expect(titles).toContain("Indices de corrélation");
    const compo = b.sections[0].facts!.join(" ");
    expect(compo).toContain("3 meilleurs jours");
    expect(compo).toContain("03/07");
    const phen = b.sections.find((s) => s.title === "Les phénomènes extérieurs")!.facts!;
    expect(phen[0]).toContain("forte chaleur");             // |r|=0,34 avant pluie 0,2
    expect(phen[0]).toContain("jours de forte chaleur sur la période : 380 €/jour");
    expect(phen[0]).toContain("Historique du site : −143 €/jour (médiane)");
    expect(phen[0]).toContain("Indice de corrélation moyen (r = −0,34)");
  });
  it("plancher : un facteur à moins de 3 jours dans la période ne se dit pas", () => {
    const b = buildEntityWhy3Blocks(base({
      factorsByDate: new Map([["2026-07-06", ["heat"]], ["2026-07-07", ["heat"]]]),
    }));
    const phen = b.sections.find((s) => s.title === "Les phénomènes extérieurs");
    expect(phen).toBeUndefined();
  });
  it("signal à confirmer : dit sur la ligne ET au pied", () => {
    const b = buildEntityWhy3Blocks(base({
      factors: [{ key: "rain", mot_fr: "pluie", med_hist_eur: -154, corr_r: 0.07, a_confirmer: true, hist_days: 20 }],
      factorsByDate: new Map([["2026-07-13", ["rain"]], ["2026-07-14", ["rain"]], ["2026-07-15", ["rain"]]]),
    }));
    const phen = b.sections.find((s) => s.title === "Les phénomènes extérieurs")!.facts!;
    expect(phen[0]).toContain("Signal à confirmer.");
    const pied = b.sections.find((s) => s.title === "Indices de corrélation")!.facts!;
    expect(pied[0]).toContain("— signal à confirmer.");
  });
  it("profil de jour : seulement si contraste >= 15 % et 3 j de chaque côté", () => {
    const flat10 = [...Array(10)].map((_, i) => day(`2026-07-${String(i + 1).padStart(2, "0")}`, 500));
    const b = buildEntityWhy3Blocks(base({ daily: flat10, factorsByDate: new Map() }));
    expect(b.sections.map((s) => s.title)).not.toContain("Le profil de jour");
  });
  it("aucune matière → l'absence se dit, jamais une section vide", () => {
    const b = buildEntityWhy3Blocks(base({ daily: [day("2026-07-01", 100)], factorsByDate: new Map(), factors: [] }));
    expect(b.sections[0].facts![0]).toContain("Pas assez de jours vendus");
  });
});
