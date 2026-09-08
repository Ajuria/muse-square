// @vitest-environment happy-dom
// « M'engager » — « Ce que le dispositif vend » (owner 07/09, docs/dispositif-perimetre-mesure-spec.md P2) :
// le bloc partagé MSScopeForm, rempli par goal_context.families ; un pôle rattaché pré-choisit ses
// familles ; le POST /api/commitments porte measured_scope ; rien de coché → null (le CA du lieu).
import { readFileSync } from "node:fs";
import { beforeAll, expect, it } from "vitest";

let posted: any = null;
const POLES = [{ dispositif_id: "d-1", name: "Pôle périssables", families: ["Coffee", "Bakery"] }];
const FAMS = [{ category: "Coffee", avg_day_eur: 412 }, { category: "Bakery", avg_day_eur: 236 }, { category: "Branded", avg_day_eur: 44 }];
function stubFetch(): void {
  posted = null;
  (globalThis as any).fetch = (url: any, init?: any) => {
    const u = String(url);
    const json = (o: any) => Promise.resolve({ ok: true, json: () => Promise.resolve(o) });
    if (u.includes("goal_context")) return json({ ok: true, window_kind: "7d", days: 7, n_days: 40, baseline_daily: 1000, baseline_window: 7000, floor_pct: 5, preset_modeste_pct: 5, preset_net_pct: 8, poles: POLES, families: FAMS });
    if (u.includes("channels/team")) return json({ ok: true, items: [] });
    if (u.includes("best-practices")) return json({ ok: true, items: [] });
    if (u === "/api/commitments" && init && init.method === "POST") { posted = JSON.parse(init.body); return json({ ok: true, commitment_id: "c-test" }); }
    return json({ ok: true });
  };
}
async function mountForm(prefill: any = {}): Promise<HTMLElement> {
  stubFetch();
  const m = document.createElement("div"); document.body.appendChild(m);
  const F = (window as any).MSCommitForm;
  m.innerHTML = F.buildHtml({ location_id: "loc-test", prefill: { window_kind: "7d", ...prefill } });
  F.wire(m, { location_id: "loc-test", prefill: { window_kind: "7d", ...prefill }, origin: { origin_action_type: "revenue_down_wow" }, ownerPool: [] });
  await new Promise((r) => setTimeout(r, 120));
  return m;
}
async function submit(m: HTMLElement) {
  (m.querySelector("[data-cm-action]") as HTMLTextAreaElement).value = "Corner producteur";
  (m.querySelector("[data-cm-owner]") as HTMLInputElement).value = "Camille";
  (m.querySelector("[data-cm-goal-pct]") as HTMLInputElement).value = "10";
  (m.querySelector("[data-cm-goal-pct]") as HTMLInputElement).dispatchEvent(new Event("input"));
  (m.querySelector("[data-cm-submit]") as HTMLButtonElement).click();
  await new Promise((r) => setTimeout(r, 50));
}
beforeAll(() => { (0, eval)(readFileSync("public/js/scope-form.js", "utf8")); (0, eval)(readFileSync("public/js/commit-form.js", "utf8")); });

it("le bloc est rendu avec les familles du site ; rien de coché → measured_scope null (le CA du lieu, comme avant)", async () => {
  const m = await mountForm();
  expect(m.textContent).toContain("Ce que le dispositif vend");
  expect(m.querySelectorAll("[data-sc-fam]").length).toBe(3);
  await submit(m);
  expect(posted.measured_scope).toBeNull();
  m.remove();
});
it("familles cochées + « Ajouter famille de produits » → measured_scope { familles } dans le POST", async () => {
  const m = await mountForm();
  (m.querySelector('[data-sc-fam="Branded"]') as HTMLElement).click();
  (m.querySelector("[data-sc-new]") as HTMLInputElement).value = "Miel de Houdan";
  (m.querySelector("[data-sc-add-btn]") as HTMLButtonElement).click();
  await submit(m);
  expect(posted.measured_scope).toEqual({ kind: "familles", familles: [{ nom: "Branded" }, { nom: "Miel de Houdan", nouvelle: true }] });
  m.remove();
});
it("un pôle rattaché pré-choisit ses familles : measured_scope { pole, familles figées, pole_nom }", async () => {
  const m = await mountForm();
  const sel = m.querySelector("[data-cm-pole]") as HTMLSelectElement;
  sel.value = "d-1"; sel.dispatchEvent(new Event("change"));
  await submit(m);
  expect(posted.attached_pole_id).toBe("d-1");
  expect(posted.measured_scope).toEqual({ kind: "pole", familles: [{ nom: "Coffee" }, { nom: "Bakery" }], pole_id: "d-1", pole_nom: "Pôle périssables" });
  m.remove();
});
it("la version suivante repart du périmètre du parent et des articles confirmés de ses photos", async () => {
  const m = await mountForm({ measured_scope: { kind: "familles", familles: [{ nom: "Branded" }] }, photo_items: [{ item_code: "A1", item_description: "Miel 250 g" }] });
  expect(m.textContent).toContain("les articles de la photo");
  await submit(m);
  expect(posted.measured_scope).toEqual({ kind: "familles", familles: [{ nom: "Branded" }] });
  m.remove();
});
