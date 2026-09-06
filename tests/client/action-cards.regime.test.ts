// 06/09 (audit P1) — PORTE DE RÉGIME côté client : un fait heure / produit / famille dont la base
// typique n'a pas 3 jours du même régime que le jour du fait n'a pas de témoin → pas de carte.
// Payloads RÉELS du compte owner (04/09) : hour_share_move typ_n 7, baseline_same_regime_n 0 ;
// item_share_move typ_n 30, baseline_same_regime_n 4.
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
const hour = (date: string, sameRegime: number, delta = 169) => ({
  date, action_type: "hour_share_move", action_priority: 2, action_category: "performance", location_id: "f10c3e58-326e-4e38-947c-d59fcbe51df5",
  data_payload: { transaction_hour: 15, revenue: 216, expected_hour_revenue: 48, delta_eur: delta, direction: "surge", day_gap_eur: 739, expected_hour_transactions: 11, transactions: 47, typ_n: 7, baseline_same_regime_n: sameRegime, is_school_holiday_flag: false, regime_mismatch_flag: sameRegime / 7 < 0.5 },
});
const item = { date: "2026-09-04", action_type: "item_share_move", action_priority: 3, action_category: "performance", location_id: "f10c3e58-326e-4e38-947c-d59fcbe51df5",
  data_payload: { item_description: "Traditional Blend Chai Rg", revenue: 58, expected_item_revenue: 13, delta_eur: 44, direction_eur: "surge", day_gap_eur: 739, typ_n: 30, baseline_same_regime_n: 4, is_school_holiday_flag: false, regime_mismatch_flag: true } };

describe("porte de régime", () => {
  it("zéro témoin → pas de carte ; 4 témoins → carte (hedgée)", () => {
    expect(render([hour("2026-09-04", 0)]).length).toBe(0);
    const out = render([item]);
    expect(out.length).toBe(1);
    // 06/09 (audit P6) : la réserve de régime vit à part (tmpl.reserve), jamais dans le corps.
    expect(out[0].tmpl.reserve).toMatch(/^Comparé surtout à des jours en vacances scolaires \(26 sur 30\) — l’écart peut tenir au calendrier\.$/);
    expect(out[0].tmpl.sowhat).not.toMatch(/Comparé surtout/);
  });
  it("le dernier-par-type ignore les cartes écartées : un fait plus ancien avec témoins rend", () => {
    const out = render([hour("2026-09-04", 0), hour("2026-09-01", 5, 120)]);
    expect(out.length).toBe(1);
    expect(String(out[0].item.affected_date)).toBe("2026-09-01");
  });
  it("sans champ de régime (payload ancien) → la carte rend", () => {
    const r: any = hour("2026-09-04", 0); delete r.data_payload.baseline_same_regime_n;
    expect(render([r]).length).toBe(1);
  });
});

it("06/09 (audit P6) — le texte équipe (Faire suivre) porte la réserve dans son corps", () => {
  const win: any = new Window({ url: "https://app.local/app/insightevent/pulse" });
  new Function("window", "document", readFileSync(resolve("public/js/action-cards.js"), "utf8"))(win, win.document);
  const t = win.msMemberForwardText(item, {}, TODAY);
  expect(t.body).toMatch(/Traditional Blend Chai Rg a fait/);
  expect(t.body).toMatch(/ Comparé surtout à des jours en vacances scolaires \(26 sur 30\) — l’écart peut tenir au calendrier\.$/);
});
