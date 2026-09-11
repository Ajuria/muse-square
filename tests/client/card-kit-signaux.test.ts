// @vitest-environment happy-dom
// renderSignauxFamille — le VRAI public/js/card-kit.js évalué sur la forme que le provider rend.
import { readFileSync } from "node:fs";
import { beforeAll, expect, it } from "vitest";
beforeAll(() => { (0, eval)(readFileSync("public/js/card-kit.js", "utf8")); });
it("rend le lead, la table famille × jours, panier et part, et la réserve", () => {
  const html = (window as any).MSCardKit.renderSignauxFamille({ ok: true, found: true, lead: "CA/jour Tea sur vos jours de pluie marquée : −52 € vs vos jours comparables (20 jours, ≈ −2 358 € par an, estimé)",
    lines: [{ family: "Tea", class_key: "rain", label_fr: "jours de pluie marquée", eur_year: -2358, tier: "estimé", n_days: 20, avg_gap_eur: -52, basket_delta_eur: 0.4, share_delta_pt: -1.3, corr_r: -0.21, entangled: true }] });
  const el = document.createElement("div"); el.innerHTML = html; const t = el.textContent || "";
  expect(t).toContain("CA/jour de la famille vs vos jours comparables, à saison égale");
  expect(t).toContain("Tea"); expect(t).toContain("jours de pluie marquée"); expect(t).toContain("−52 €"); expect(t).toContain("estimé");
  expect(t).toContain("Panier moyen avec Tea jours de pluie marquée : +0 €".slice(0, 30));
  expect(t).toContain("pas des causes établies");
});
it("absence dite", () => {
  const el = document.createElement("div"); el.innerHTML = (window as any).MSCardKit.renderSignauxFamille({ ok: true, found: false });
  expect(el.textContent).toContain("Aucune réponse famille × jours mesurable pour l’instant");
});
