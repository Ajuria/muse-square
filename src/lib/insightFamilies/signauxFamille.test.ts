// Provider signaux × famille — composition PURE : la porte du site (n ≥ 5, portée ≥ 60 j, |t| ≥ 1, signe,
// matérialité 0,3 % du CA annuel DE LA FAMILLE) appliquée à l'identique, base pure d'abord.
import { describe, expect, it } from "vitest";
import { composeSignauxFamille, type FamilyClassRow } from "./signauxFamille";

const row = (o: Partial<FamilyClassRow>): FamilyClassRow => ({
  family: "Tea", class_key: "rain", class_family: "weather", basis: "marginal", metric: "family_revenue_gap",
  n_days: 20, avg_gap: -58.3, sd_gap: 40, med_gap: -52, n_log: 20, avg_log: -0.31, sd_log: 0.3, span_days: 161, corr_r: -0.21, ...o,
});
const plain = (s: string) => s.replace(/[  ]/g, " ");

describe("composeSignauxFamille", () => {
  it("un effet qui passe la porte : lead, fait CA/jour vs vos jours comparables, panier et part quand leur t ≥ 1", () => {
    const r = composeSignauxFamille([
      row({}),
      row({ metric: "family_basket", avg_gap: 0.4, sd_gap: 0.5, n_days: 20 }),
      row({ metric: "family_share", avg_gap: -1.3, sd_gap: 3, n_days: 20 }),
    ], { Tea: 40000 }, "2026-09-11");
    expect(r.found).toBe(true);
    const l = (r.data.lines as any[])[0];
    expect(l).toMatchObject({ family: "Tea", class_key: "rain", label_fr: "jours de pluie marquée", n_days: 20, tier: "estimé", entangled: true });
    expect(l.eur_year).toBe(Math.round(-52 * (20 / (161 / 365.25))));   // médiane × n / (portée en années)
    expect(l.basket_delta_eur).toBe(0.4); expect(l.share_delta_pt).toBe(-1.3);
    const facts = r.facts.map((f) => plain(f.fact_fr));
    expect(facts[0]).toBe(`CA/jour Tea sur vos jours de pluie marquée : −52 € vs vos jours comparables, sur 20 jours — ≈ −${Math.abs(l.eur_year).toLocaleString("fr-FR").replace(/[  ]/g, " ")} € par an (estimé, à saison égale).`);
    expect(facts).toContain("Panier moyen avec Tea sur vos jours de pluie marquée : +0,40 € vs vos jours comparables.");
    expect(facts).toContain("Part de Tea dans le CA sur vos jours de pluie marquée : −1,3 point vs vos jours comparables.");
  });
  it("sous la porte (n < 5, t < 1, immatériel) : absence", () => {
    expect(composeSignauxFamille([row({ n_days: 3, n_log: 3 })], { Tea: 40000 }, "d").found).toBe(false);
    expect(composeSignauxFamille([row({ avg_log: -0.02, sd_log: 0.3 })], { Tea: 40000 }, "d").found).toBe(false);
    expect(composeSignauxFamille([row({})], { Tea: 40_000_000 }, "d").found).toBe(false);   // 0,3 % de 40 M€ = 120 000 € > l'effet
  });
});
