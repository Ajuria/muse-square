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
it("rapport (12/09, spec § 6) : titre, période, Synthèse avec sa pastille, une zone par section rendue par le kit, l'inconnu dit", () => {
  const html = (window as any).MSCardKit.renderAnswerBlocks([
    { type: "register", register: "vetted", facts_cited: 3 },
    { type: "rapport", titre: "Rapport — la semaine dernière, du 31/08/2026 au 06/09/2026", periode: { du: "2026-08-31", au: "2026-09-06", relative: "semaine_derniere", libelle_fr: "la semaine dernière, du 31/08/2026 au 06/09/2026" },
      synthese: { text: "Vous avez généré 11 015 € de chiffre d’affaires.", register: "vetted" },
      sections: [
        { cle: "volume", titre: "Volume de ventes", definition: "Le nombre de ventes de la période et son écart à la période précédente.", provenance: null,
          blocs: [{ type: "table", cols: [{ label: "" }, { label: "Du 31/08/2026 au 06/09/2026" }], rows: [{ cells: [{ v: "Volume de ventes", bold: true }, { v: "2 426" }] }] }, { type: "facts", items: ["Vous avez réalisé 2 426 ventes."] }] },
        { cle: "poles", titre: "Vos pôles · du plus au moins performant", provenance: null, blocs: [{ type: "absence", manque: "Aucune vente rattachée à un pôle sur cette période.", geste: null }] },
      ],
      non_reconnu: ["la couleur des murs"] },
  ]);
  const el = document.createElement("div"); el.innerHTML = html; const t = el.textContent || "";
  expect(t).toContain("Rapport — la semaine dernière, du 31/08/2026 au 06/09/2026");
  expect(t).toContain("Synthèse"); expect(t).toContain("Vous avez généré 11 015 € de chiffre d’affaires.");
  expect((t.match(/Vérifié/g) || []).length).toBe(2); // la pastille du tour + celle de la Synthèse
  const zones = [...el.querySelectorAll(".ie-rapport > div[style*='border-radius:12px']")];
  expect(zones.length).toBe(3);
  expect(zones[1].getAttribute("title")).toBeNull();
  expect(zones[1].querySelector("div")?.getAttribute("title")).toBe("Le nombre de ventes de la période et son écart à la période précédente.");
  expect(el.querySelectorAll(".ie-rapport table").length).toBe(1);
  expect(t).toContain("Aucune vente rattachée à un pôle sur cette période.");
  expect(t).toContain("Aucune section du Rapport ne correspond à : « la couleur des murs ».");
});
it("note (12/09, Votre note) : pastille distincte, texte échappé, auteur et date au survol ; les sections d'un rapport portent leur index", () => {
  const html = (window as any).MSCardKit.renderAnswerBlocks([
    { type: "register", register: "vetted" },
    { type: "rapport", titre: "R", periode: { du: "2026-08-31", au: "2026-09-06", relative: null, libelle_fr: "x" }, synthese: null, non_reconnu: [],
      sections: [{ cle: "volume", titre: "Volume de ventes", provenance: null, blocs: [{ type: "facts", items: ["2 426 ventes."] }, { type: "note", text: "Fermé le <lundi>.\nRentrée.", auteur: "Nadia", date: "2026-09-12T11:00:00.000Z" }] }] },
  ]);
  const el = document.createElement("div"); el.innerHTML = html;
  const note = el.querySelector("[data-rapport-note]")!;
  expect(note.textContent).toContain("Votre note"); expect(note.textContent).toContain("Fermé le <lundi>.");
  expect(html).not.toContain("<lundi>");
  expect(note.querySelector("div")?.getAttribute("title")).toBe("Nadia · 12/09/2026");
  expect(el.querySelector("[data-rapport-section='0']")).not.toBeNull();
});
it("graphiques (12/09) : barres, barres_h et parts dessinent les valeurs d'outil, libellés formatés, sans calcul", () => {
  const html = (window as any).MSCardKit.renderAnswerBlocks([
    { type: "register", register: "vetted" },
    { type: "barres", items: [{ label: "lundi", value: 640, value_fr: "640 €" }, { label: "samedi", value: 1320, value_fr: "1 320 €" }], unite: "CA moyen par jour de la semaine" },
    { type: "barres_h", items: [{ label: "Cuisine", value: 20805, value_fr: "20 805 €", part_fr: "40 %" }, { label: "Cave", value: 2405, value_fr: "2 405 €" }] },
    { type: "parts", items: [{ label: "Coffee", value: 20014, value_fr: "20 014 €", part_fr: "38,6 %" }, { label: "Tea", value: 14617, value_fr: "14 617 €", part_fr: "28,2 %" }] },
  ]);
  const el = document.createElement("div"); el.innerHTML = html;
  const svgs = el.querySelectorAll("svg");
  expect(svgs.length).toBe(2);                                   // barres (verticales) + parts (anneau) ; barres_h est en div
  expect(svgs[0].querySelectorAll("rect").length).toBe(2);
  expect(svgs[0].textContent).toContain("1 320 €"); expect(svgs[0].textContent).toContain("samedi");
  const tracks = [...el.querySelectorAll("div[style*='width:']")].filter((d) => /background:#1D3BB3/.test(d.getAttribute("style") || ""));
  expect(tracks.length).toBe(2); expect(tracks[0].getAttribute("style")).toContain("width:100%");
  expect(svgs[1].querySelectorAll("circle").length).toBe(2);
  expect(el.textContent).toContain("38,6 %"); expect(el.textContent).toContain("CA moyen par jour de la semaine");
});
