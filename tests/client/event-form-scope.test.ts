// @vitest-environment happy-dom
// « Créer opération » — « Ce que le dispositif vend » (owner 07/09, P2) : le KPI famille ouvre le bloc
// partagé ; plusieurs familles + une famille nouvelle ; l'opération (saved-items) et l'engagement de
// mesure portent measured_scope, kpi_family = la première famille (libellé de la page Opération).
import { readFileSync } from "node:fs";
import { beforeAll, expect, it } from "vitest";

const posted: Record<string, any> = {};
function stubFetch(): void {
  (globalThis as any).fetch = (url: any, init?: any) => {
    const u = String(url);
    const json = (o: any) => Promise.resolve({ ok: true, json: () => Promise.resolve(o) });
    if (u.includes("create_context")) return json({ ok: true, industry_code: "cafe", event_types: [{ code: "autre", label_fr: "Autre" }], dow_baseline: [], kpi_available: {},
      families: [{ category: "Coffee", avg_day_eur: 412 }, { category: "Branded", avg_day_eur: 44 }],
      poles: [{ dispositif_id: "p1", name: "Pôle producteurs", families: ["Branded"] }] });
    if (u.includes("channels/team")) return json({ ok: true, items: [] });
    if (u.includes("/api/saved-items/create")) { posted.item = JSON.parse(init.body); return json({ ok: true, saved_item_id: "s1", occurrences: ["2026-09-20"] }); }
    if (u.includes("/api/commitments")) { posted.commitment = JSON.parse(init.body); return json({ ok: true, commitment_id: "c1" }); }
    if (u.includes("/api/insight/month")) {
      // la grille ne rend que les jours servis par le mois : un jour à venir suffit
      const d = new Date(); d.setUTCDate(d.getUTCDate() + 3);
      return json({ ok: true, days: [{ date: d.toISOString().slice(0, 10), alert_level_max: 0 }] });
    }
    return json({ ok: true, days: [] });
  };
}
beforeAll(() => { (0, eval)(readFileSync("public/js/scope-form.js", "utf8")); (0, eval)(readFileSync("public/js/event-form.js", "utf8")); });

it("KPI famille → le bloc apparaît ; familles cochées + famille nouvelle → measured_scope sur l'opération, kpi_family = la première", async () => {
  stubFetch();
  const m = document.createElement("div"); document.body.appendChild(m);
  (window as any).MSEventForm.open(m, { location_id: "loc-test" });
  await new Promise((r) => setTimeout(r, 120));
  const q = (s: string) => m.querySelector(s) as any;
  expect(m.textContent).toContain("CA de ce que le dispositif vend vs votre résultat habituel");
  q('[data-ef="kpi"]').value = "family_revenue"; q('[data-ef="kpi"]').dispatchEvent(new Event("change"));
  expect(q("[data-ef-famwrap]").style.display).toBe("block");
  expect(m.textContent).toContain("Ce que le dispositif vend");
  q('[data-sc-fam="Branded"]').click(); q('[data-sc-fam="Coffee"]').click();
  q("[data-sc-new]").value = "Miel de Houdan"; q("[data-sc-add-btn]").click();
  expect(q('[data-ef="family"]').value).toBe("Coffee");
  q('[data-ef="title"]').value = "Corner producteur"; q('[data-ef="dispositif"]').value = "Le producteur est sur place";
  q('[data-ef="target"]').value = "600"; q('[data-ef="target"]').dispatchEvent(new Event("input"));
  expect(m.textContent).toContain("familles « Coffee », « Branded », « Miel de Houdan »");
  // une opération datée exige un jour : le premier jour à venir de la grille
  const today = new Date().toISOString().slice(0, 10);
  const day = Array.from(m.querySelectorAll("[data-ef-day]")).find((c) => String(c.getAttribute("data-ef-day")) > today) as HTMLElement;
  expect(day).toBeTruthy();
  day.click();
  q("[data-ef-submit]").click();
  await new Promise((r) => setTimeout(r, 80));
  expect(posted.item.kpi).toBe("family_revenue");
  expect(posted.item.kpi_family).toBe("Coffee");
  expect(posted.item.measured_scope).toEqual({ kind: "familles", familles: [{ nom: "Coffee" }, { nom: "Branded" }, { nom: "Miel de Houdan", nouvelle: true }] });
  expect(posted.item.kpi_target_eur).toBe(600);
  m.remove();
});
it("rattacher un pôle bascule le KPI sur la famille et pré-choisit ses familles ({ kind pole })", async () => {
  stubFetch();
  const m = document.createElement("div"); document.body.appendChild(m);
  (window as any).MSEventForm.open(m, { location_id: "loc-test" });
  await new Promise((r) => setTimeout(r, 120));
  const q = (s: string) => m.querySelector(s) as any;
  q('[data-ef="pole"]').value = "p1"; q('[data-ef="pole"]').dispatchEvent(new Event("change"));
  expect(q('[data-ef="kpi"]').value).toBe("family_revenue");
  expect((window as any).MSScopeForm.read(q("[data-ef-scope]"))).toEqual({ kind: "pole", familles: [{ nom: "Branded" }], pole_id: "p1", pole_nom: "Pôle producteurs" });
  expect(q('[data-ef="family"]').value).toBe("Branded");
  m.remove();
});
