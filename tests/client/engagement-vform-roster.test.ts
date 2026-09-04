// @vitest-environment happy-dom
// Roster Responsable(s) sur « La version suivante » (owner 27/08) : les personnes des canaux
// de communication (/api/channels/team) se proposent en chips sous l'input du sous-formulaire,
// via le MÊME foyer que le formulaire M'engager (MSCommitForm.wireOwnerPool — zéro duplication).
// Vérifié en évaluant les VRAIS public/commit-form.js + public/card-kit.js (le harnais est la page).
import { readFileSync } from "node:fs";
import { beforeAll, expect, it } from "vitest";
import { EVOL_COPY } from "../../src/lib/commitments/commitmentCopy";

beforeAll(() => {
  (0, eval)(readFileSync("public/commit-form.js", "utf8"));
  (0, eval)(readFileSync("public/card-kit.js", "utf8"));
});

it("les chips du roster se rendent sous Responsable(s) et un clic remplit l'input", async () => {
  (globalThis as any).fetch = (url: any) => {
    expect(String(url)).toContain("/api/channels/team?location_id=loc-test");
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, items: [
      { first_name: "Camille", last_name: "Robin", role: "Vente" },
      { first_name: "Sam", last_name: "", role: null },
    ] }) });
  };
  const data: any = {
    commitment: { commitment_id: "c-v1", status: "open", window_kind: "day_of", location_id: "loc-test",
      committed_action_text: "Corner producteur", owner_person_name: "",
      window_start: "2026-08-29", window_end: "2026-08-29", created_at: "2026-08-24T10:00:00Z" },
    series: [], kpi: null, move_stats: [], best_in_class: [], site_name: "Muse Square",
  };
  const mount = document.createElement("div");
  document.body.appendChild(mount);
  mount.innerHTML = (window as any).MSCardKit.renderEvolution(data, EVOL_COPY);
  const vfc = mount.querySelector("[data-vform]") as HTMLElement;
  expect(vfc).toBeTruthy();
  (window as any).MSCommitForm.wireOwnerPool(vfc, "loc-test");
  await new Promise((r) => setTimeout(r, 50));
  const chips = vfc.querySelectorAll("[data-cm-owner-pick]");
  expect(chips.length).toBe(2);
  expect((chips[0] as HTMLElement).textContent).toContain("Camille Robin · Vente");
  (chips[0] as HTMLElement).click();
  expect((vfc.querySelector("[data-cm-owner]") as HTMLInputElement).value).toBe("Camille Robin");
});
