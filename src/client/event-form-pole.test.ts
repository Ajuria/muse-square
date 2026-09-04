// @vitest-environment happy-dom
// Mode « Pôle — dispositif permanent » greffé sur « Nouvelle opération » (spec pôles, 27/08).
// Vérifié en évaluant le VRAI public/event-form.js (le harnais est la page) : bascule de
// nature, chips familles RÉELLES multi-choix, POST /api/commitments nature permanent.
import { readFileSync } from "node:fs";
import { beforeAll, expect, it } from "vitest";

let posted: any = null;
function stubFetch(): void {
  (globalThis as any).fetch = (url: any, init?: any) => {
    const u = String(url);
    const json = (o: any) => Promise.resolve({ ok: true, json: () => Promise.resolve(o) });
    if (u.includes("create_context")) {
      return json({ ok: true, industry_code: "cafe", event_types: [{ code: "autre", label_fr: "Autre" }],
        dow_baseline: [], kpi_available: {},
        families: [{ category: "Coffee", avg_day_eur: 412 }, { category: "Bakery", avg_day_eur: 236 }, { category: "Kitchen", avg_day_eur: 158 }] });
    }
    if (u.includes("channels/team")) return json({ ok: true, items: [{ first_name: "Camille", last_name: "Robin", role: "Vente" }] });
    if (u.includes("/api/commitments")) { posted = JSON.parse(init.body); return json({ ok: true, commitment_id: "pole-1" }); }
    return json({ ok: true, days: [] });
  };
}

// Rouge depuis le 28/08 (instruit le 03/09) : le panneau pôle est rendu par window.MSPoleForm,
// module PARTAGÉ extrait d'event-form.js (vue équipe inc 9c, d5d692f) — il faut évaluer les DEUX
// fichiers ; et le libellé des familles est le mot owner « Familles de produits & services »
// (28/08, ddbf3d4), rendu `&amp;` dans le innerHTML.
beforeAll(() => {
  (0, eval)(readFileSync("public/event-form.js", "utf8"));
  (0, eval)(readFileSync("public/pole-form.js", "utf8"));
});

it("la bascule montre le panneau pôle, les chips choisissent les familles, le POST porte nature permanent", async () => {
  stubFetch();
  const mount = document.createElement("div");
  document.body.appendChild(mount);
  (window as any).MSEventForm.open(mount, { location_id: "loc-test" });
  await new Promise((r) => setTimeout(r, 120));

  // Par défaut : panneau daté visible, panneau pôle masqué — l'existant est INTACT.
  const dated = mount.querySelector("[data-ef-dated-panel]") as HTMLElement;
  const pole = mount.querySelector("[data-ef-pole-panel]") as HTMLElement;
  expect(dated && dated.style.display).not.toBe("none");
  expect(pole.style.display).toBe("none");
  expect(dated.innerHTML).toContain("Créer l’événement");

  (mount.querySelector('[data-ef-mode="pole"]') as HTMLElement).click();
  expect(pole.style.display).toBe("");
  expect(dated.style.display).toBe("none");
  expect(pole.innerHTML).toContain("Familles de produits &amp; services — depuis vos ventes");
  expect(pole.innerHTML).toContain("Coffee · 412 €/j");

  (mount.querySelector('[data-ef="polename"]') as HTMLInputElement).value = "Pôle périssables";
  const chips = mount.querySelectorAll("[data-ef-polefam]");
  (chips[0] as HTMLElement).click();
  (chips[1] as HTMLElement).click();
  (mount.querySelector("[data-ef-pole-submit]") as HTMLElement).click();
  await new Promise((r) => setTimeout(r, 30));

  expect(posted).toBeTruthy();
  expect(posted.dispositif_nature).toBe("permanent");
  expect(posted.pole_families).toEqual(["Coffee", "Bakery"]);
  expect(posted.committed_action_text).toContain("Pôle périssables");
  expect(mount.innerHTML).toContain("Ouvrir le pôle");
});

it("sans famille choisie, le pôle ne part pas — le périmètre est obligatoire", async () => {
  stubFetch(); posted = null;
  const mount = document.createElement("div");
  document.body.appendChild(mount);
  (window as any).MSEventForm.open(mount, { location_id: "loc-test" });
  await new Promise((r) => setTimeout(r, 120));
  (mount.querySelector('[data-ef-mode="pole"]') as HTMLElement).click();
  (mount.querySelector('[data-ef="polename"]') as HTMLInputElement).value = "Pôle sans périmètre";
  (mount.querySelector("[data-ef-pole-submit]") as HTMLElement).click();
  await new Promise((r) => setTimeout(r, 30));
  expect(posted).toBeNull();
  expect(mount.innerHTML).toContain("Choisissez au moins une famille");
});

it("héritage KPI : rattacher un pôle bascule sur CA famille et restreint aux familles DU pôle ; « Aucun » restaure", async () => {
  stubFetch(); posted = null;
  (globalThis as any).fetch = ((orig) => (url: any, init?: any) => {
    const u = String(url);
    if (u.includes("create_context")) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({
        ok: true, industry_code: "cafe", event_types: [{ code: "autre", label_fr: "Autre" }],
        dow_baseline: [], kpi_available: {},
        families: [{ category: "Coffee", avg_day_eur: 412 }, { category: "Bakery", avg_day_eur: 236 }, { category: "Kitchen", avg_day_eur: 158 }],
        poles: [{ dispositif_id: "pole-1", name: "Pôle périssables", families: ["Coffee", "Bakery"] }],
      }) });
    }
    return (orig as any)(url, init);
  })((globalThis as any).fetch);
  const mount = document.createElement("div");
  document.body.appendChild(mount);
  (window as any).MSEventForm.open(mount, { location_id: "loc-test" });
  await new Promise((r) => setTimeout(r, 120));

  const pole = mount.querySelector('[data-ef="pole"]') as HTMLSelectElement;
  const kpi = mount.querySelector('[data-ef="kpi"]') as HTMLSelectElement;
  const fam = mount.querySelector('[data-ef="family"]') as HTMLSelectElement;
  expect(pole).toBeTruthy();
  expect(pole.innerHTML).toContain("Pôle périssables — Coffee, Bakery");

  pole.value = "pole-1";
  pole.dispatchEvent(new Event("change"));
  expect(kpi.value).toBe("family_revenue");
  const opts = Array.from(fam.options).map((o) => o.value);
  expect(opts).toEqual(["Coffee", "Bakery"]);   // Kitchen exclu — le périmètre est celui du pôle
  expect(fam.value).toBe("Coffee");

  pole.value = "";
  pole.dispatchEvent(new Event("change"));
  expect(Array.from(fam.options).map((o) => o.value)).toEqual(["Coffee", "Bakery", "Kitchen"]);
});
