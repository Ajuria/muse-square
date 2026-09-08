// @vitest-environment happy-dom
// « Ce que le dispositif vend » (owner 07/09, docs/dispositif-perimetre-mesure-spec.md D1-D7) — le module
// partagé des deux formulaires, évalué tel quel (le harnais est la page).
import { readFileSync } from "node:fs";
import { beforeAll, expect, it } from "vitest";

beforeAll(() => { (0, eval)(readFileSync("public/js/scope-form.js", "utf8")); });
const F = () => (window as any).MSScopeForm;
const FAMS = [{ category: "Coffee", avg_day_eur: 412 }, { category: "Branded", avg_day_eur: 44 }, { category: "Bakery", avg_day_eur: 236 }];
function mount(opts: any) { const m = document.createElement("div"); document.body.appendChild(m); F().render(m, opts); return m; }
const chip = (m: HTMLElement, nom: string) => m.querySelector(`[data-sc-fam="${nom}"]`) as HTMLElement;

it("rend la question et les familles du site avec leur €/j ; rien de coché = pas de périmètre (le CA du lieu)", () => {
  const m = mount({ families: FAMS });
  expect(m.textContent).toContain("Ce que le dispositif vend");
  expect(m.textContent).toContain("des familles");
  expect(m.textContent).toContain("Ajouter famille de produits");
  expect(m.querySelectorAll("[data-sc-fam]").length).toBe(3);
  expect(chip(m, "Coffee").textContent).toContain("412 €/j");
  expect((m.querySelector("[data-sc-kind-pole]") as HTMLElement).style.display).toBe("none");
  expect(m.querySelector("[data-sc-items]")).toBeNull();
  expect(F().read(m)).toBeNull();
});
it("plusieurs familles cochées → { kind familles } (D2) ; une famille nouvelle ajoutée porte nouvelle:true (D7)", () => {
  const m = mount({ families: FAMS });
  chip(m, "Branded").click(); chip(m, "Coffee").click();
  expect(F().read(m)).toEqual({ kind: "familles", familles: [{ nom: "Coffee" }, { nom: "Branded" }] });
  (m.querySelector("[data-sc-new]") as HTMLInputElement).value = "  Miel de   Houdan ";
  (m.querySelector("[data-sc-add-btn]") as HTMLButtonElement).click();
  expect(F().read(m)).toEqual({ kind: "familles", familles: [{ nom: "Coffee" }, { nom: "Branded" }, { nom: "Miel de Houdan", nouvelle: true }] });
  // une famille connue tapée à la main ne se dédouble pas : elle se coche
  (m.querySelector("[data-sc-new]") as HTMLInputElement).value = "Bakery";
  (m.querySelector("[data-sc-add-btn]") as HTMLButtonElement).click();
  expect(m.querySelectorAll("[data-sc-fam]").length).toBe(4);
  expect(F().read(m)!.familles!.map((f: any) => f.nom)).toEqual(["Coffee", "Branded", "Bakery", "Miel de Houdan"]);
});
it("un pôle rattaché pré-choisit « les familles du pôle » ({ kind pole, figées }) ; décocher une famille rend la main (kind familles) ; « Aucun » retire l'option", () => {
  const m = mount({ families: FAMS });
  F().setPole(m, { id: "p1", nom: "Épicerie fine", families: ["Coffee", "Bakery"] });
  expect((m.querySelector("[data-sc-kind-pole]") as HTMLElement).style.display).toBe("");
  expect(F().read(m)).toEqual({ kind: "pole", familles: [{ nom: "Coffee" }, { nom: "Bakery" }], pole_id: "p1", pole_nom: "Épicerie fine" });
  chip(m, "Bakery").click();
  expect(F().read(m)).toEqual({ kind: "familles", familles: [{ nom: "Coffee" }] });
  F().setPole(m, null);
  expect((m.querySelector("[data-sc-kind-pole]") as HTMLElement).style.display).toBe("none");
});
it("les articles de la photo (D3) : option présente seulement avec des articles confirmés, tous cochés par défaut", () => {
  const m = mount({ families: FAMS, photoItems: [{ item_code: "A1", item_description: "Miel toutes fleurs 250 g" }, { item_code: "B2", item_description: "Confiture" }] });
  expect(m.textContent).toContain("les articles de la photo");
  const radio = m.querySelector('[data-sc-kind-opt][value="articles"]') as HTMLInputElement;
  radio.checked = true; radio.dispatchEvent(new Event("change"));
  expect(F().read(m)).toEqual({ kind: "articles", item_codes: ["A1", "B2"] });
  (m.querySelector('[data-sc-item="B2"]') as HTMLElement).click();
  expect(F().read(m)).toEqual({ kind: "articles", item_codes: ["A1"] });
});
it("un périmètre existant se ré-affiche tel quel (V2, opération rouverte)", () => {
  const m = mount({ families: FAMS, selected: { kind: "familles", familles: [{ nom: "Branded" }, { nom: "Miel", nouvelle: true }] } });
  expect(F().read(m)).toEqual({ kind: "familles", familles: [{ nom: "Branded" }, { nom: "Miel", nouvelle: true }] });
});
