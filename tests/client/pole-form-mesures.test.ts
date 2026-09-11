// @vitest-environment happy-dom
// Mesures d'espace dans LE formulaire de pôle (11/09, docs/espace-et-pole.md E3-E5) — vérifié en
// évaluant le VRAI public/js/pole-form.js (le harnais est la page) : clé de composant partagée entre
// components et space_measures, longueur × faces côté serveur (le client envoie tel que tapé), Part de
// linéaire seulement à plusieurs familles et Σ = 100 %, surface de vente au pôle, « Pôle en projet »
// quand le site n'a aucune vente.
import { readFileSync } from "node:fs";
import { beforeAll, expect, it } from "vitest";

let posted: any = null;
function stubFetch(): void {
  (globalThis as any).fetch = (url: any, init?: any) => {
    const u = String(url);
    if (u.includes("/api/commitments")) { posted = JSON.parse(init.body); return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, commitment_id: "pole-1" }) }); }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) });
  };
}
const CTYPES = [{ value: "lineaire", label_fr: "Linéaire", roles: [] }, { value: "caisse", label_fr: "Caisse", roles: [] }];
const FAMS = [{ category: "Thé", avg_day_eur: 120 }, { category: "Gâteaux", avg_day_eur: 80 }, { category: "Épices", avg_day_eur: 60 }];

beforeAll(() => { (0, eval)(readFileSync("public/js/pole-form.js", "utf8")); });

function render(opts: Record<string, unknown>): HTMLElement {
  const mount = document.createElement("div");
  document.body.appendChild(mount);
  (window as any).MSPoleForm.render(mount, { location_id: "loc-test", families: FAMS, owners: [], takenFamilies: {}, componentTypes: CTYPES, ...opts });
  return mount;
}
const set = (el: Element | null, v: string) => { (el as HTMLInputElement).value = v; };
const wait = () => new Promise((r) => setTimeout(r, 30));

it("les mesures d'un composant partent sous space_measures avec LA clé du composant — jamais dans components", async () => {
  stubFetch(); posted = null;
  const m = render({});
  set(m.querySelector('[data-ef="polename"]'), "Petit déjeuner");
  (m.querySelector('[data-ef-polefam="Thé"]') as HTMLElement).click();
  (m.querySelector("[data-ef-comp-add]") as HTMLElement).click();
  const row = m.querySelector("[data-ef-comp-row]") as HTMLElement;
  expect(row.innerHTML).toContain("N° sur le plan");
  expect(row.innerHTML).toContain("Longueur (m)");
  expect(row.innerHTML).toContain("Faces de préhension");
  expect((row.querySelector("[data-ef-comp-shares]") as HTMLElement).style.display).toBe("none");   // une seule famille : rien à répartir
  set(row.querySelector("[data-ef-comp-label]"), "Rayonnage thé");
  set(row.querySelector("[data-ef-comp-no]"), "37");
  set(row.querySelector("[data-ef-comp-len]"), "1,07");
  set(row.querySelector("[data-ef-comp-faces]"), "1");
  set(m.querySelector('[data-ef="polesurface"]'), "18,5");
  (m.querySelector("[data-ef-pole-submit]") as HTMLElement).click();
  await wait();
  expect(posted).toBeTruthy();
  const key = posted.components[0].key;
  expect(key).toMatch(/^c[a-z0-9]{6,}$/);
  expect(posted.components[0]).toEqual({ key, type: "lineaire", role: null, label: "Rayonnage thé" });
  expect(posted.components[0].length_m).toBeUndefined();
  expect(posted.space_measures).toEqual({
    components: [{ component_key: key, fixture_no: "37", length_m: "1,07", faces: "1" }],
    surface_m2: "18,5", source: "saisie",
  });
});

it("à plusieurs familles, la Part de linéaire apparaît par famille et doit faire 100 %", async () => {
  stubFetch(); posted = null;
  const m = render({});
  set(m.querySelector('[data-ef="polename"]'), "Petit déjeuner");
  (m.querySelector("[data-ef-comp-add]") as HTMLElement).click();
  (m.querySelector('[data-ef-polefam="Thé"]') as HTMLElement).click();
  (m.querySelector('[data-ef-polefam="Gâteaux"]') as HTMLElement).click();
  const row = m.querySelector("[data-ef-comp-row]") as HTMLElement;
  const box = row.querySelector("[data-ef-comp-shares]") as HTMLElement;
  expect(box.style.display).toBe("");
  expect(box.innerHTML).toContain("Part de linéaire");
  expect(row.querySelectorAll("[data-ef-comp-share]").length).toBe(2);
  set(row.querySelector('[data-ef-comp-share="Thé"]'), "70");
  set(row.querySelector('[data-ef-comp-share="Gâteaux"]'), "20");
  set(row.querySelector("[data-ef-comp-len]"), "3,45");
  (m.querySelector("[data-ef-pole-submit]") as HTMLElement).click();
  await wait();
  expect(posted).toBeNull();
  expect(m.innerHTML).toContain("font 90 % — elles doivent faire 100 %");
  // Retirer une famille du pôle retire sa part ; la remettre la rend, et la part tapée de l'autre survit.
  (m.querySelector('[data-ef-polefam="Gâteaux"]') as HTMLElement).click();
  expect(box.style.display).toBe("none");
  (m.querySelector('[data-ef-polefam="Gâteaux"]') as HTMLElement).click();
  expect(box.style.display).toBe("");
  expect((row.querySelector('[data-ef-comp-share="Thé"]') as HTMLInputElement).value).toBe("70");
  set(row.querySelector('[data-ef-comp-share="Gâteaux"]'), "30");
  (m.querySelector("[data-ef-pole-submit]") as HTMLElement).click();
  await wait();
  expect(posted.space_measures.components[0].families_share).toEqual([{ family: "Thé", share: 0.7 }, { family: "Gâteaux", share: 0.3 }]);
});

it("sans mesure tapée, aucune space_measures — le formulaire d'avant reste intact", async () => {
  stubFetch(); posted = null;
  const m = render({});
  set(m.querySelector('[data-ef="polename"]'), "Cave");
  (m.querySelector('[data-ef-polefam="Thé"]') as HTMLElement).click();
  (m.querySelector("[data-ef-comp-add]") as HTMLElement).click();
  (m.querySelector("[data-ef-pole-submit]") as HTMLElement).click();
  await wait();
  expect(posted.space_measures).toBeUndefined();
  expect(posted.components.length).toBe(1);
});

it("Pôle en projet : sans vente importée, les familles s'écrivent et le POST part", async () => {
  stubFetch(); posted = null;
  const m = render({ families: [] });
  expect(m.innerHTML).toContain("Aucune famille dans vos ventes pour l’instant");
  expect(m.innerHTML).toContain("Pôle en projet — Aucune vente importée");
  set(m.querySelector('[data-ef="polename"]'), "Cave");
  (m.querySelector("[data-ef-pole-submit]") as HTMLElement).click();
  await wait();
  expect(posted).toBeNull();
  expect(m.innerHTML).toContain("Écrivez au moins une famille");
  set(m.querySelector('[data-ef="polefams-projet"]'), "Vin & Spiritueux, Champagne , Vin & Spiritueux");
  (m.querySelector("[data-ef-pole-submit]") as HTMLElement).click();
  await wait();
  expect(posted.dispositif_nature).toBe("permanent");
  expect(posted.pole_families).toEqual(["Vin & Spiritueux", "Champagne"]);
});
