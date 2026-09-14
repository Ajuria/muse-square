import { describe, expect, it } from "vitest";
import { composeResultatFacts, readResultat, moisFr, type Resultat } from "./resultat";
import { groundAgentText } from "../explorer/blocks";
import { TOURNURES_LLM } from "../fr/tournures.fr";
import { MOTS_BANNIS } from "../fr/evenement.fr";

const nb = (x: string): string => x.replace(/[\u202f\u00a0]/g, " ");
// Les lignes du compte de test (12/09) : septembre en cours, août et juillet complets, juin négatif.
function resultat(over: Partial<Resultat> = {}): Resultat {
  const m = (month: string, complete: boolean, net: number | null, gm: number, rev: number, cov = 1, fc: number | null = 6500, pay: number | null = 17000) =>
    ({ month, is_complete_month: complete, sales_days: 31, revenue_net_ht: rev, gross_margin_ht: gm, coverage_pct: cov, fixed_costs_month_eur: fc, payroll_month_eur: pay, net_result_eur: net, payroll_to_revenue_pct: pay == null ? null : pay / rev });
  return {
    mois: [m("2026-09-01", false, 14825.66, 38325.66, 53215.52), m("2026-08-01", true, 13003.09, 36503.09, 50499.2), m("2026-07-01", true, 4905.68, 28405.68, 39326.8), m("2026-06-01", true, -917.04, 22582.96, 31200)],
    jour: { date: "2026-09-12", gross_margin_ht: 1368.97, charges_day_eur: 758.06, break_even_revenue_ht: 1051.63, break_even_hour: 10, is_break_even_reached: true, margin_rate_30d: 0.7208, opening_days_ref: 31 },
    ...over,
  };
}

describe("composeResultatFacts — le résultat net d'un mois complet, les mois précédents, le seuil du jour", () => {
  it("défaut = le dernier mois complet ; la phrase de Piloter, le sujet nommé, la couverture dite", () => {
    const l = composeResultatFacts(resultat());
    expect(l.found).toBe(true); expect(l.mois_lu).toBe("2026-08-01");
    expect(nb(l.facts[0])).toBe("En août 2026, votre résultat net est de 13 003 € : 36 503 € de marge brute sur 50 499 € de CA net HT, moins 6 500 € de charges fixes et 17 000 € de masse salariale, calculé sur 100 % de votre CA.");
    expect(nb(l.facts[1])).toBe("En juillet 2026, votre résultat net est de 4 906 € : 28 406 € de marge brute sur 39 327 € de CA net HT, moins 6 500 € de charges fixes et 17 000 € de masse salariale, calculé sur 100 % de votre CA.");
    expect(nb(l.facts[2])).toBe("En juin 2026, votre résultat net est de −917 € : 22 583 € de marge brute sur 31 200 € de CA net HT, moins 6 500 € de charges fixes et 17 000 € de masse salariale, calculé sur 100 % de votre CA.");
    expect(nb(l.facts[3])).toBe("En août 2026, votre masse salariale représente 33,7 % de votre CA net HT (50 499 €).");
    expect(nb(l.facts[4])).toBe("Le 12/09/2026, votre seuil de rentabilité du jour est de 1 052 € de CA net HT (758 € de charges fixes et de masse salariale par jour de vente, sur 31 jours de vente du dernier mois complet, au taux de marge brute de 72 % des 30 derniers jours) ; il est atteint à 10 h.");
  });
  it("les blocs : le tableau des mois (résultat négatif en ambre), le seuil en fait, les sources", () => {
    const l = composeResultatFacts(resultat());
    expect(l.blocks.map((b) => b.type)).toEqual(["table", "facts", "sources"]);
    const t = l.blocks[0] as any;
    expect(t.cols.map((c: any) => c.label)).toEqual(["Mois", "CA net HT", "Marge brute", "Charges fixes", "Masse salariale", "Résultat net"]);
    expect(t.rows.map((r: any) => nb(r.cells[0].v) + " " + nb(r.cells[5].v))).toEqual(["Août 2026 13 003 €", "Juillet 2026 4 906 €", "Juin 2026 −917 €"]);
    expect(t.rows[2].cells[5].color).toBe("#B45309");
  });
  it("le mois en cours n'a pas de résultat net : la phrase le dit et renvoie au dernier mois complet", () => {
    const l = composeResultatFacts(resultat(), "2026-09");
    expect(l.facts[0]).toBe("Septembre 2026 est en cours : le résultat net se lit sur un mois complet. Le dernier mois complet est août 2026.");
    expect(l.facts[1]).toContain("En août 2026, votre résultat net");
  });
  it("un mois demandé se lit en premier ; le seuil non atteint se dit avec la marge du jour", () => {
    const l = composeResultatFacts(resultat({ jour: { date: "2026-09-12", gross_margin_ht: 500, charges_day_eur: 758.06, break_even_revenue_ht: 1051.63, break_even_hour: null, is_break_even_reached: false, margin_rate_30d: 0.7208, opening_days_ref: 31 } }), "2026-07");
    expect(l.mois_lu).toBe("2026-07-01");
    expect(l.facts[0]).toContain("En juillet 2026");
    expect(nb(l.facts[l.facts.length - 1])).toContain("; il n'est pas atteint (500 € de marge brute sur la journée).");
  });
  it("sans charges déclarées : absence « charges » ; sous couverture : absence « couverture » ; sans mois : « aucun_mois »", () => {
    const sans = resultat().mois.map((m) => ({ ...m, fixed_costs_month_eur: null, payroll_month_eur: null, net_result_eur: null }));
    expect(composeResultatFacts({ mois: sans, jour: null })).toMatchObject({ found: false, absence: "charges" });
    const sous = resultat().mois.map((m) => ({ ...m, coverage_pct: 0.4, net_result_eur: null }));
    expect(composeResultatFacts({ mois: sous, jour: null })).toMatchObject({ found: false, absence: "couverture" });
    expect(composeResultatFacts({ mois: [], jour: null })).toMatchObject({ found: false, absence: "aucun_mois" });
  });
  it("chaque nombre du tableau est dans les faits : la porte laisse passer", () => {
    const l = composeResultatFacts(resultat());
    const cells = (l.blocks[0] as any).rows.flatMap((r: any) => r.cells.map((c: any) => c.v)).join(" ");
    expect(groundAgentText(cells, l.facts).register).toBe("vetted");
  });
  it("les chaînes visibles passent les gardes du français", () => {
    const l = composeResultatFacts(resultat());
    const visibles = [...l.facts, ...(l.blocks[0] as any).cols.map((c: any) => c.label)];
    for (const s of visibles) {
      for (const t of TOURNURES_LLM) expect(t.motif.test(s.toLowerCase()), `${s} — ${t.faute}`).toBe(false);
      for (const mot of Object.keys(MOTS_BANNIS)) {
        const re = new RegExp(`(^|[^\\p{L}])${mot.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^\\p{L}]|$)`, "iu");
        expect(re.test(s), `${s} — « ${mot} » : ${MOTS_BANNIS[mot]}`).toBe(false);
      }
    }
  });
  it("moisFr écrit le mois en toutes lettres", () => { expect(moisFr("2026-08-01")).toBe("août 2026"); expect(moisFr("2025-12")).toBe("décembre 2025"); });
});

describe("readResultat — les deux vues semantic de Piloter, jamais mart", () => {
  it("lit vw_insight_event_monthly_result (6 mois) et vw_insight_event_daily_margin (dernier jour ≤ aujourd'hui)", async () => {
    const calls: any[] = [];
    const bq = { query: async (q: any) => { calls.push(q); return q.query.includes("monthly_result")
      ? [[{ month: { value: "2026-08-01" }, is_complete_month: true, sales_days: 31, revenue_net_ht: 50499.2, gross_margin_ht: 36503.09, coverage_pct: 1, fixed_costs_month_eur: 6500, payroll_month_eur: 17000, net_result_eur: 13003.09, payroll_to_revenue_pct: 0.3366 }]]
      : [[{ d: "2026-09-12", gross_margin_ht: 1368.97, charges_day_eur: 758.06, break_even_revenue_ht: 1051.63, break_even_hour: 10, is_break_even_reached: true, margin_rate_30d: 0.72, opening_days_ref: 31 }]]; } };
    const r = await readResultat(bq, "loc-1");
    expect(calls.map((c) => c.query)).toEqual([expect.stringMatching(/semantic\.vw_insight_event_monthly_result/), expect.stringMatching(/semantic\.vw_insight_event_daily_margin/)]);
    for (const c of calls) { expect(c.query).not.toMatch(/mart\./); expect(c.params).toEqual({ loc: "loc-1" }); }
    expect(r.mois[0]).toMatchObject({ month: "2026-08-01", is_complete_month: true, net_result_eur: 13003.09 });
    expect(r.jour).toMatchObject({ date: "2026-09-12", is_break_even_reached: true, break_even_hour: 10 });
  });
});
