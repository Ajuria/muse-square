// L'idée soumise (owner 28/08) — constructeur PUR : placement réel, analogues du MÊME levier
// seulement, vides DITS, CTA daté sur la condition d'abord, pied des relations utilisées.
import { describe, it, expect } from "vitest";
import { buildIdeaBlocks, type IdeaInputs } from "./ideaPlacement";

const base = (over: Partial<IdeaInputs> = {}): IdeaInputs => ({
  idea: { levier: "conversion", condition: "rain" },
  calm_weeks: [{ wk: "2026-09-14", label: "14/09", count: 0, count_overlap: 0, state: "quiet" }],
  condition_days: ["2026-09-02", "2026-09-03", "2026-09-16"],
  motif: { mot_fr: "pluie", med_gap_eur: -220, corr_index_fr: "Indice de corrélation faible (r = −0,2)", a_confirmer: false },
  proven: [
    { text: "Coupon café glacé", lever: "conversion" },
    { text: "Happy hour terrasse", lever: "frequentation" },
  ],
  web_plays: [],
  ...over,
});

describe("buildIdeaBlocks", () => {
  it("placement : jours de la condition + mesure avec indice + semaine calme ; CTA daté sur la condition", () => {
    const b = buildIdeaBlocks(base());
    const place = b.sections[0];
    expect(place.title).toBe("Où la placer");
    expect(place.facts![0]).toContain("02/09, 03/09, 16/09");
    expect(place.facts![1]).toContain("−220 €/jour");
    expect(place.facts![1]).toContain("Indice de corrélation faible");
    expect(place.facts![2]).toContain("Semaine du 14/09");
    expect(b.test_date).toBe("2026-09-02");
    const pied = b.sections.find((s) => s.title === "Indices de corrélation")!;
    expect(pied.facts![0]).toContain("pluie ↔ CA");
  });
  it("analogues : le MÊME levier seulement — jamais le levier voisin", () => {
    const b = buildIdeaBlocks(base());
    const pr = b.sections.find((s) => s.title === "Ce qui est prouvé chez vous")!;
    expect(pr.facts!.join(" ")).toContain("Coupon café glacé");
    expect(pr.facts!.join(" ")).not.toContain("Happy hour");
  });
  it("aucun prouvé du levier → l'absence se dit (premier test mesuré)", () => {
    const b = buildIdeaBlocks(base({ proven: [{ text: "Happy hour terrasse", lever: "frequentation" }] }));
    const pr = b.sections.find((s) => s.title === "Ce qui est prouvé chez vous")!;
    expect(pr.facts![0]).toContain("premier test mesuré");
  });
  it("sans condition : la semaine calme place, le CTA prend son lundi", () => {
    const b = buildIdeaBlocks(base({ idea: { levier: "conversion", condition: "aucune" }, condition_days: [], motif: null }));
    expect(b.sections[0].facts![0]).toContain("Semaine du 14/09");
    expect(b.test_date).toBe("2026-09-14");
    expect(b.sections.map((s) => s.title)).not.toContain("Indices de corrélation");
  });
  it("signal à confirmer sur la condition : dit sur la ligne et au pied", () => {
    const b = buildIdeaBlocks(base({ motif: { mot_fr: "pluie", med_gap_eur: -154, corr_index_fr: "Indice de corrélation faible (r = 0,07)", a_confirmer: true } }));
    expect(b.sections[0].facts![1]).toContain("Signal à confirmer.");
    const pied = b.sections.find((s) => s.title === "Indices de corrélation")!;
    expect(pied.facts![0]).toContain("— signal à confirmer.");
  });
});
