// 06/09 (audit N3) — un changement concurrent sans terme (prix, offre, horaires) se rend sur
// AUJOURD'HUI tant que le fait a moins de N jours, avec son FAIT seul (la ligne d'action est un
// slot en attente owner). Sujet : public/js/action-cards.js → tests/ (CLAUDE.md § Tests).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Window } from "happy-dom";

const TODAY = "2026-09-06";
function render(rows: any[]) {
  const win: any = new Window({ url: "https://app.local/app/insightevent/pulse" });
  new Function("window", "document", readFileSync(resolve("public/js/action-cards.js"), "utf8"))(win, win.document);
  return win.renderActionCandidates(rows, {}, null, TODAY, "veille", {}, TODAY) || [];
}
const row = (type: string, date: string, extra: any = {}) => ({
  date, action_type: type, action_priority: 2, action_category: "competition", location_id: "f10c3e58-326e-4e38-947c-d59fcbe51df5",
  data_payload: { competitor_name: "Centre Pompidou", item: "Hilma af Klint", old_price_raw: "15 €", new_price_raw: "17 €", price_pct_change: 13.3, detected_date: date, ...extra },
});

describe("changements concurrents sans terme", () => {
  it("un fait de 5 jours rend sur aujourd'hui, daté du fait, avec sa ligne d'action (owner 07/09)", () => {
    const out = render([row("competitor_price_increase", "2026-09-01")]);
    expect(out.length).toBe(1);
    expect(String(out[0].item.affected_date)).toBe("2026-09-01");
    expect(out[0].tmpl.sowhat).toMatch(/Centre Pompidou a augmenté le prix de Hilma af Klint/);
    // 07/09 (owner) : la porte « fait seul » du 06/09 est levée — la ligne réécrite en français courant se rend.
    expect(out[0].tmpl.action || "").toMatch(/^Actions conseillées : comparez votre prix de .* au sien ; si le vôtre est plus bas, affichez-le\.$/);
  });
  it("un fait de 20 jours ne rend plus ; un fait futur ne rend pas", () => {
    expect(render([row("competitor_new_offering", "2026-08-17")]).length).toBe(0);
    expect(render([row("competitor_offering_removed", "2026-09-07")]).length).toBe(0);
  });
  it("les six types de la liste rendent à 14 jours, un type hors liste daté hier ne rend pas", () => {
    const six = ["competitor_price_drop", "competitor_price_increase", "competitor_repricing_event", "competitor_hours_change", "competitor_new_offering", "competitor_offering_removed"];
    expect(render(six.map((t) => row(t, "2026-08-23"))).length).toBe(6);
    expect(render([row("competitor_event_launch", "2026-09-05")]).length).toBe(0);
  });
});
