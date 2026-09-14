// @vitest-environment happy-dom
// renderMarge — le VRAI public/js/card-kit.js évalué (le harnais est la page) sur la forme que le provider rend.
import { readFileSync } from "node:fs";
import { beforeAll, expect, it } from "vitest";

beforeAll(() => { (0, eval)(readFileSync("public/js/card-kit.js", "utf8")); });
const kit = () => (window as any).MSCardKit;

it("rend le lead, la couverture, le bandeau, la table par famille et les deux alertes", () => {
  const html = kit().renderMarge({ ok: true, found: true, lead: "Marge brute : 19 845 € sur vos 30 derniers jours · taux de marge brute 48 % · calculée sur 92 % de votre CA",
    coverage_pct: 92, missing_pct: 8, gross_margin_ht: 19845, margin_rate_pct: 48, revenue: 53461, below_cost_lines: 3, heavy_light: "Branded",
    families: [{ family: "Coffee", gross_margin_ht: 9000, margin_rate_pct: 57, revenue_share_pct: 37.4, margin_share_pct: 45.4 }, { family: "Branded", gross_margin_ht: 2000, margin_rate_pct: 20, revenue_share_pct: 22.4, margin_share_pct: 10.1 }] });
  const el = document.createElement("div"); el.innerHTML = html; const t = el.textContent || "";
  expect(t).toContain("calculée sur 92 % de votre CA");
  expect(t).toContain("Calculée sur 92 % de votre CA · prix d’achat manquants sur 8 %");
  expect(t).toContain("Taux de marge brute");
  expect(t).toContain("Coffee"); expect(t).toContain("57 %"); expect(t).toContain("Part de la marge");
  expect(t).toContain("Branded pèse plus dans votre CA que dans votre marge brute.");
  expect(t).toContain("3 lignes de vente vendues sous son prix d’achat sur la période.");
});
it("absence dite quand la marge n'est pas mesurée", () => {
  const el = document.createElement("div"); el.innerHTML = kit().renderMarge({ ok: true, found: false });
  expect(el.textContent).toContain("Aucune marge brute mesurée pour l’instant");
});
