// @vitest-environment happy-dom
// « Je m'engage » rattaché à un pôle (03/09, spec dispositifs-typologie — une opération née
// d'une carte entre dans la mémoire du pôle). Vérifié en évaluant le VRAI public/commit-form.js
// (le harnais est la page), fetch stubé sur le contrat exact de goal_context (+ poles) et le
// POST /api/commitments capturé : le corps porte attached_pole_id.
import { readFileSync } from "node:fs";
import { beforeAll, expect, it } from "vitest";

let posted: any = null;
function stubFetch(poles: any[] | undefined): void {
  posted = null;
  (globalThis as any).fetch = (url: any, init?: any) => {
    const u = String(url);
    const json = (o: any) => Promise.resolve({ ok: true, json: () => Promise.resolve(o) });
    if (u.includes("goal_context")) {
      return json({ ok: true, window_kind: "7d", days: 7, n_days: 40, baseline_daily: 1000, baseline_window: 7000,
        floor_pct: 5, preset_modeste_pct: 5, preset_net_pct: 8, ...(poles ? { poles } : {}) });
    }
    if (u.includes("channels/team")) return json({ ok: true, items: [] });
    if (u.includes("best-practices")) return json({ ok: true, items: [] });
    if (u === "/api/commitments" && init && init.method === "POST") { posted = JSON.parse(init.body); return json({ ok: true, commitment_id: "c-test" }); }
    return json({ ok: true });
  };
}

async function mountForm(poles: any[] | undefined): Promise<HTMLElement> {
  stubFetch(poles);
  const mount = document.createElement("div");
  document.body.appendChild(mount);
  const F = (window as any).MSCommitForm;
  mount.innerHTML = F.buildHtml({ location_id: "loc-test", prefill: { window_kind: "7d" } });
  F.wire(mount, { location_id: "loc-test", origin: { origin_action_type: "revenue_down_wow" }, ownerPool: [] });
  await new Promise((r) => setTimeout(r, 120));
  return mount;
}

beforeAll(() => { (0, eval)(readFileSync("public/commit-form.js", "utf8")); });

const POLES = [{ dispositif_id: "d-1", name: "Pôle périssables", families: ["Coffee", "Bakery"] }, { dispositif_id: "d-2", name: "Pôle traiteur", families: [] }];

it("site AVEC pôles : le bloc « Rattacher à un pôle » apparaît, « Aucun » d'abord, une option par pôle avec ses familles", async () => {
  const m = await mountForm(POLES);
  const wrap = m.querySelector("[data-cm-pole-wrap]") as HTMLElement;
  expect(wrap.style.display).toBe("");
  expect(m.innerHTML).toContain("Rattacher à un pôle");
  const opts = Array.from(m.querySelectorAll("[data-cm-pole] option")).map((o) => (o as HTMLOptionElement).textContent);
  expect(opts).toEqual(["Aucun", "Pôle périssables — Coffee, Bakery", "Pôle traiteur"]);
  m.remove();
});

it("le pôle choisi part dans le POST (attached_pole_id) ; « Aucun » → null", async () => {
  const m = await mountForm(POLES);
  (m.querySelector("[data-cm-action]") as HTMLTextAreaElement).value = "Producteur invité — fromages";
  (m.querySelector("[data-cm-owner]") as HTMLInputElement).value = "Camille";
  (m.querySelector("[data-cm-goal-pct]") as HTMLInputElement).value = "10";
  (m.querySelector("[data-cm-goal-pct]") as HTMLInputElement).dispatchEvent(new Event("input"));
  const sel = m.querySelector("[data-cm-pole]") as HTMLSelectElement;
  sel.value = "d-1";
  (m.querySelector("[data-cm-submit]") as HTMLButtonElement).click();
  await new Promise((r) => setTimeout(r, 50));
  expect(posted).not.toBeNull();
  expect(posted.attached_pole_id).toBe("d-1");
  expect(posted.location_id).toBe("loc-test");
  m.remove();
  const m2 = await mountForm(POLES);
  (m2.querySelector("[data-cm-action]") as HTMLTextAreaElement).value = "Autre action";
  (m2.querySelector("[data-cm-owner]") as HTMLInputElement).value = "Camille";
  (m2.querySelector("[data-cm-goal-pct]") as HTMLInputElement).value = "10";
  (m2.querySelector("[data-cm-goal-pct]") as HTMLInputElement).dispatchEvent(new Event("input"));
  (m2.querySelector("[data-cm-submit]") as HTMLButtonElement).click();
  await new Promise((r) => setTimeout(r, 50));
  expect(posted.attached_pole_id).toBeNull();
  m2.remove();
});

it("site SANS pôle, ou vieux serveur sans `poles` : le bloc reste caché, le formulaire d'avant est intact", async () => {
  for (const poles of [[], undefined]) {
    const m = await mountForm(poles as any);
    expect((m.querySelector("[data-cm-pole-wrap]") as HTMLElement).style.display).toBe("none");
    expect(m.innerHTML).toContain("M'engager sur une action");
    m.remove();
  }
});
