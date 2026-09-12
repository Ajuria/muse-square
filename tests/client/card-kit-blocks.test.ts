// @vitest-environment happy-dom
// renderAnswerBlocks — le bloc `absence` (12/09) et l'assemblage registre + carte, sur le VRAI card-kit.js.
import { readFileSync } from "node:fs";
import { beforeAll, expect, it } from "vitest";
beforeAll(() => { (0, eval)(readFileSync("public/js/card-kit.js", "utf8")); });
it("absence : la phrase et le geste (lien interne seulement)", () => {
  const html = (window as any).MSCardKit.renderAnswerBlocks([
    { type: "register", register: "vetted", facts_cited: 0 },
    { type: "absence", manque: "Aucune mesure d’espace pour l’instant — les mètres se saisissent sur le formulaire de pôle.", geste: { label_fr: "Vos pôles", url: "/profile?tab=poles" } },
    { type: "absence", manque: "Sans geste", geste: { label_fr: "ailleurs", url: "https://evil" } },
  ]);
  const el = document.createElement("div"); el.innerHTML = html; const t = el.textContent || "";
  expect(t).toContain("Vérifié"); expect(t).toContain("Aucune mesure d’espace pour l’instant"); expect(t).toContain("Vos pôles →");
  expect(html).not.toContain("https://evil");
});
it("card + sources : la carte du kit rend la donnée du provider", () => {
  const html = (window as any).MSCardKit.renderAnswerBlocks([
    { type: "register", register: "model" },
    { type: "card", render: "renderMarge", data: { found: false } },
    { type: "sources", items: ["Votre caisse"] },
  ]);
  const el = document.createElement("div"); el.innerHTML = html; const t = el.textContent || "";
  expect(t).toContain("Non vérifié"); expect(t).toContain("Aucune marge brute mesurée pour l’instant"); expect(t).toContain("Votre caisse");
});
