// Porte de merge (06/09) : la carte « Paniers à plusieurs articles » (tickets_lines_move, grain
// FACTURE — mart fct_client_tickets_daily, bloc candidat ms_database). Owner 06/09 : « ce sera la
// situation courante — arrête de te limiter aux données factices ». La graine du compte owner n'a
// qu'UNE ligne par ticket (47 782 tickets, 47 782 lignes) : la carte y est muette par construction.
// Les deux payloads ci-dessous sont ceux que le bloc candidat a PRODUITS sur BigQuery (06/09) à
// partir des lignes réelles du site owner regroupées en tickets à plusieurs articles
// (_audit_scratch.fct_client_tickets_synth : base ~1,8 ligne/ticket ; 30/08 forcé à 1 article,
// 05/09 forcé à ~3,3 lignes) — même moteur, même contrat, mêmes clés.
// Le sujet est public/js/action-cards.js → le test vit dans tests/ (CLAUDE.md § Tests).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Window } from "happy-dom";

function render(payload: Record<string, unknown>, date: string) {
  const win: any = new Window({ url: "https://app.local/app/insightevent/pulse" });
  const src = readFileSync(resolve("public/js/action-cards.js"), "utf8");
  new Function("window", "document", src)(win, win.document);
  const row = { date, action_type: "tickets_lines_move", action_priority: 3, action_category: "performance",
    location_id: "f10c3e58-326e-4e38-947c-d59fcbe51df5", data_payload: payload };
  const out = win.renderActionCandidates([row], {}, null, date, "pulse", null, date) || [];
  expect(out.length).toBe(1);
  return out[0].tmpl as { what: string; sowhat: string; action: string };
}

// 30/08 — effondrement : 97 % des tickets à un seul article (base 54 %).
const COLLAPSE_0830 = { tickets: 322, lines: 333, revenue: 1732, lines_per_ticket: 1.03, lines_per_ticket_baseline: 1.84,
  lines_per_ticket_delta: -0.81, lines_per_ticket_z: -10.6, single_line_share: 0.966, single_line_share_baseline: 0.536,
  single_line_share_delta_points: 43, units_per_ticket: 1.55, units_per_ticket_baseline: 2.77,
  discounted_ticket_share: 0.168, discounted_ticket_share_baseline: 0.244, baseline_n: 28, direction: "collapse",
  avg_line_eur: 5.2, delta_eur: -1356 };
// 05/09 — hausse : 3,3 articles par ticket (base 1,8).
const SURGE_0905 = { tickets: 107, lines: 348, revenue: 1537, lines_per_ticket: 3.25, lines_per_ticket_baseline: 1.8,
  lines_per_ticket_delta: 1.45, lines_per_ticket_z: 8.74, single_line_share: 0.299, single_line_share_baseline: 0.552,
  single_line_share_delta_points: -25.3, units_per_ticket: 4.55, units_per_ticket_baseline: 2.73,
  discounted_ticket_share: 0.355, discounted_ticket_share_baseline: 0.241, baseline_n: 28, direction: "surge",
  avg_line_eur: 4.42, delta_eur: 685 };

describe("tickets_lines_move — chaque couche dans son unité, jamais d'euros dans le corps", () => {
  it("effondrement : titre au sens, corps en articles / tickets, geste sans article nommé (règle 4, owner 06/09)", () => {
    const t = render(COLLAPSE_0830, "2026-08-30");
    expect(t.what).toBe("Moins de paniers à plusieurs articles que d’habitude");
    expect(t.sowhat).toBe("1,0 article par ticket le 30/08 contre 1,8 d’habitude : 97 % des tickets à un seul article contre 54 %, sur 322 tickets. Tickets remisés : 17 % contre 24 %.");
    expect(t.sowhat).not.toMatch(/€/);
    expect(t.action).toBe("Action conseillée : notez ce qui était à côté du produit ce jour-là.");
    expect(t.action).not.toMatch(/deuxième article|à côté du premier/);
  });
  it("hausse : pluriel « articles », titre « Plus de … », geste d'observation", () => {
    const t = render(SURGE_0905, "2026-09-05");
    expect(t.what).toBe("Plus de paniers à plusieurs articles que d’habitude");
    expect(t.sowhat).toBe("3,3 articles par ticket le 05/09 contre 1,8 d’habitude : 30 % des tickets à un seul article contre 55 %, sur 107 tickets. Tickets remisés : 36 % contre 24 %.");
    expect(t.action).toMatch(/^Action conseillée : notez ce qui était à côté du produit ce jour-là/);
  });
  it("la remise ne s'écrit que si elle a bougé de 5 points", () => {
    const t = render({ ...COLLAPSE_0830, discounted_ticket_share: 0.25 }, "2026-08-30");
    expect(t.sowhat).not.toMatch(/remisés/);
    expect(t.sowhat).toMatch(/sur 322 tickets\.$/);
  });
  it("sans direction au payload, le sens se lit sur lines_per_ticket_delta", () => {
    const { direction: _d, ...noDir } = COLLAPSE_0830;
    const t = render(noDir, "2026-08-30");
    expect(t.what).toMatch(/^Moins de paniers/);
    expect(t.action).toBe("Action conseillée : notez ce qui était à côté du produit ce jour-là.");
  });
});
