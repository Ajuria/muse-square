// @vitest-environment happy-dom
// renderEspace — le VRAI public/js/card-kit.js évalué sur la forme que le provider espace rend.
import { readFileSync } from "node:fs";
import { beforeAll, expect, it } from "vitest";
beforeAll(() => { (0, eval)(readFileSync("public/js/card-kit.js", "utf8")); });
it("rend le lead, le bandeau, la table par pôle (aucune vente dite) et l'alerte", () => {
  const html = (window as any).MSCardKit.renderEspace({ ok: true, found: true, lead: "202,2 m de linéaire mesurés sur 7 pôles",
    site: { linear_m: 202.21, surface_m2: null, revenue_per_m: null, margin_per_m: null }, heavy: "Cave",
    poles: [{ name: "Cuisine", linear_m: 42.89, linear_share: 0.212, revenue_share: null, revenue_per_m: null, margin_share: null }, { name: "Cave", linear_m: 23.62, linear_share: 0.117, revenue_share: 0.05, revenue_per_m: 120, margin_share: 0.04 }] });
  const el = document.createElement("div"); el.innerHTML = html; const t = el.textContent || "";
  expect(t).toContain("202,2 m"); expect(t).toContain("Surface de vente"); expect(t).toContain("Part de linéaire");
  expect(t).toContain("21,2 %"); expect(t).toContain("aucune vente"); expect(t).toContain("120 €");
  expect(t).toContain("Cave occupe plus de linéaire qu’il ne génère de CA.");
});
it("absence dite", () => {
  const el = document.createElement("div"); el.innerHTML = (window as any).MSCardKit.renderEspace({ ok: true, found: false });
  expect(el.textContent).toContain("Aucune mesure d’espace pour l’instant");
});
