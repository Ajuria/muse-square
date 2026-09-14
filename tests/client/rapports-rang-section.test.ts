// @vitest-environment happy-dom
// LE RANG « 3 / 8 » SUR CHAQUE SECTION D'UN RAPPORT (owner 14/09 : « I don't see block numbers »).
//
// POURQUOI CE TEST EXISTE. Je l'avais annoncé « à côté du titre » et posé dans la rangée des BOUTONS.
// L'owner regardait le titre : rien. Ce test rend le VRAI card-kit.js sur un vrai document, applique la
// MÊME logique que la page (le rang inséré en tête du premier enfant du bloc), et vérifie que le numéro
// atterrit bien DANS la ligne de titre — pas ailleurs, pas nulle part.
//
// Il garde aussi ce qui rendrait le repère inutile : un rang qui ne suivrait pas l'ordre, ou un total faux.
import { readFileSync } from "node:fs";
import * as vm from "node:vm";
import { beforeAll, expect, it } from "vitest";

let kit: any;
beforeAll(() => {
  const bac: any = { window: {}, console };
  bac.window.window = bac.window;
  vm.createContext(bac);
  vm.runInContext(readFileSync("public/js/card-kit.js", "utf8"), bac, { filename: "card-kit.js" });
  kit = bac.window.MSCardKit;
});

const rapport = (titres: string[]) => ({
  type: "rapport", titre: "Rapport de ventes", periode: { libelle_fr: "sur vos 30 derniers jours" },
  synthese: null,
  sections: titres.map((t) => ({ titre: t, blocs: [{ type: "prose", md: "…" }] })),
});

// La MÊME logique que rapports.astro : pour chaque section, le rang en tête du premier enfant (le titre).
function numeroter(html: string): Document {
  document.body.innerHTML = html;
  const zones = document.body.querySelectorAll("[data-rapport-section]");
  zones.forEach((z) => {
    const i = Number(z.getAttribute("data-rapport-section"));
    const rang = document.createElement("span");
    rang.className = "rp-rang";
    rang.textContent = (i + 1) + " / " + zones.length;
    const titreEl = z.firstElementChild;
    if (titreEl) titreEl.insertBefore(rang, titreEl.firstChild);
  });
  return document;
}

it("le rang atterrit DANS la ligne de titre de chaque section, pas ailleurs", () => {
  const html = String(kit.renderAnswerBlocks([{ type: "register", register: "vetted" }, rapport(["Chiffre d'affaires", "Panier moyen", "Marge brute"])]));
  const doc = numeroter(html);
  const zones = doc.body.querySelectorAll("[data-rapport-section]");
  expect(zones).toHaveLength(3);
  zones.forEach((z, i) => {
    const rang = z.querySelector(".rp-rang");
    expect(rang, `section ${i} sans rang`).not.toBeNull();
    // DANS le titre : le rang est un descendant du PREMIER enfant du bloc, celui que le kit rend en tête.
    expect(z.firstElementChild!.contains(rang!)).toBe(true);
    expect(rang!.textContent).toBe(`${i + 1} / 3`);
  });
});

it("le titre reste lisible : le rang le PRÉCÈDE, il ne le remplace pas", () => {
  const html = String(kit.renderAnswerBlocks([{ type: "register", register: "vetted" }, rapport(["Chiffre d'affaires", "Panier moyen"])]));
  const doc = numeroter(html);
  const t = doc.body.querySelector('[data-rapport-section="0"]')!.firstElementChild!;
  expect(t.textContent).toBe("1 / 2Chiffre d'affaires");   // le séparateur « · » vient du CSS, pas du texte
  expect(t.querySelector(".rp-rang")!.nextSibling).not.toBeNull();
});

it("le total suit le NOMBRE RÉEL de sections — un total faux rendrait le repère inutile", () => {
  const html = String(kit.renderAnswerBlocks([{ type: "register", register: "vetted" }, rapport(["A", "B", "C", "D", "E"])]));
  const doc = numeroter(html);
  const rangs = Array.from(doc.body.querySelectorAll(".rp-rang")).map((e) => e.textContent);
  expect(rangs).toEqual(["1 / 5", "2 / 5", "3 / 5", "4 / 5", "5 / 5"]);
});

it("une seule section porte « 1 / 1 » — jamais un rang absent", () => {
  const html = String(kit.renderAnswerBlocks([{ type: "register", register: "vetted" }, rapport(["Chiffre d'affaires"])]));
  const doc = numeroter(html);
  expect(doc.body.querySelector(".rp-rang")!.textContent).toBe("1 / 1");
});
