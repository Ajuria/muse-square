// @vitest-environment happy-dom
// Menu KPI du formulaire événement/opération (audit owner 27/08) : flux et conversion ne sont
// proposés que si le SITE porte la donnée (ctx.kpi_available, >= 30 j couverts sur 90) — même
// mécanisme que le KPI famille. Vérifié en évaluant le VRAI public/js/event-form.js (le harnais est
// la page), fetch stubé sur le contrat exact de create_context.
import { readFileSync } from "node:fs";
import { beforeAll, expect, it } from "vitest";

function stubFetch(kpi_available: Record<string, boolean>): void {
  (globalThis as any).fetch = (url: any) => {
    const u = String(url);
    const json = (o: any) => Promise.resolve({ ok: true, json: () => Promise.resolve(o) });
    if (u.includes("create_context")) {
      return json({
        ok: true, industry_code: "cafe", event_types: [{ code: "autre", label_fr: "Autre" }],
        dow_baseline: [], families: [], kpi_available,
      });
    }
    if (u.includes("channels/team")) return json({ ok: true, items: [] });
    return json({ ok: true, days: [] });
  };
}

async function renderMenu(kpi_available: Record<string, boolean>): Promise<string> {
  stubFetch(kpi_available);
  const mount = document.createElement("div");
  document.body.appendChild(mount);
  (window as any).MSEventForm.open(mount, { location_id: "loc-test" });
  await new Promise((r) => setTimeout(r, 120));
  const html = mount.innerHTML;
  mount.remove();
  return html;
}

beforeAll(() => {
  // UN eval du vrai fichier (même règle que explorerTestKit : le module n'a pas de ré-init).
  (0, eval)(readFileSync("public/js/event-form.js", "utf8"));
});

it("site AVEC capteur : Visiteurs et Taux de conversion apparaissent, gabarit des options existantes", async () => {
  const html = await renderMenu({ visitors: true, conversion: true });
  expect(html).toContain('value="visitors"');
  expect(html).toContain('value="conversion"');
  expect(html).toContain("Visiteurs vs votre résultat habituel (base 30 j) — verdict plus faible");
  expect(html).toContain("Taux de conversion vs votre résultat habituel (base 30 j) — verdict plus faible");
});

it("site SANS capteur : ni Visiteurs ni Taux de conversion — et les options historiques inchangées", async () => {
  const html = await renderMenu({ visitors: false, conversion: false });
  expect(html).not.toContain('value="visitors"');
  expect(html).not.toContain('value="conversion"');
  for (const v of ["revenue_residual", "tickets", "basket", "profit_estimated"]) {
    expect(html).toContain(`value="${v}"`);
  }
});

it("ctx sans kpi_available (vieux serveur, client neuf) : comportement d'avant, rien ne casse", async () => {
  const html = await renderMenu(undefined as any);
  expect(html).not.toContain('value="visitors"');
  expect(html).toContain('value="revenue_residual"');
});
