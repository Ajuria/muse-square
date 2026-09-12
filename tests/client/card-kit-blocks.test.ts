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
it("table (12/09, lire_ventes) : msTable rend colonnes et cellules du format rows[].cells — les trois couches", () => {
  const html = (window as any).MSCardKit.renderAnswerBlocks([
    { type: "register", register: "vetted", facts_cited: 8 },
    { type: "table", cols: [{ label: "" }, { label: "Du 13/08/2026 au 11/09/2026" }, { label: "Période précédente" }, { label: "Écart" }],
      rows: [
        { cells: [{ v: "Chiffre d’affaires", bold: true }, { v: "51 851 €" }, { v: "42 541 €" }, { v: "+21,9 %" }] },
        { cells: [{ v: "Volume de ventes", bold: true }, { v: "10 688" }, { v: "8 971" }, { v: "+19,1 %" }] },
        { cells: [{ v: "Panier moyen", bold: true }, { v: "4,85 €" }, { v: "4,74 €" }, { v: "+2,3 %" }] },
      ] },
    { type: "sources", items: ["Vos ventes par jour et par famille (caisse)"] },
  ]);
  const el = document.createElement("div"); el.innerHTML = html;
  const ths = [...el.querySelectorAll("th")].map((x) => x.textContent);
  expect(ths).toEqual(["", "Du 13/08/2026 au 11/09/2026", "Période précédente", "Écart"]);
  const rows = [...el.querySelectorAll("tbody tr")].map((tr) => [...tr.querySelectorAll("td")].map((td) => td.textContent));
  expect(rows).toEqual([["Chiffre d’affaires", "51 851 €", "42 541 €", "+21,9 %"], ["Volume de ventes", "10 688", "8 971", "+19,1 %"], ["Panier moyen", "4,85 €", "4,74 €", "+2,3 %"]]);
  expect(el.textContent).toContain("Vérifié");
});
