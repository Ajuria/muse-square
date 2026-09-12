import { describe, expect, it } from "vitest";
import { composePoleClassement, readPoleClassement, poleClassementToText, type PoleClassementData } from "./poleClassement";
import { groundAgentText } from "../explorer/blocks";
import { TOURNURES_LLM } from "../fr/tournures.fr";
import { MOTS_BANNIS } from "../fr/evenement.fr";

const nb = (x: string): string => x.replace(/[\u202f\u00a0]/g, " ");
// Les lignes du compte de test (30 j au 11/09/2026), arrondies.
function data(over: Partial<PoleClassementData> = {}): PoleClassementData {
  const r = (pole_id: string, pole_label: string, n_days: number, revenue: number, units: number, gross_margin_ht: number, delta_eur: number, expected_revenue: number, is_unassigned = false) =>
    ({ pole_id, pole_label, is_unassigned, n_days, revenue, units, gross_margin_ht, revenue_costed: revenue, delta_eur, expected_revenue });
  return {
    start: "2026-08-13", end: "2026-09-11",
    rows: [r("p1", "Cuisine", 30, 20804.7, 6667, 15520.59, 2456.8, 18347.9), r("p2", "Maison", 30, 14974.28, 5233, 11501.91, 1954.27, 13020.01), r("p3", "Cave", 22, 2562.85, 118, 910.41, 1005.8, 1557.05), r("nr", "Non rattaché", 10, 300, 40, 100, -20, 320, true)],
    space: [
      { grain: "site", pole_id: null, pole_label: null, family: null, window_start: "2026-08-13", window_end: "2026-09-11", linear_m: 202.2, linear_share: null, surface_m2: 308.7, n_components: 52, revenue: 38641, revenue_net_ht: null, revenue_share: null, margin_share: null, coverage_pct: null, revenue_per_m: 191, revenue_net_ht_per_m: null, margin_per_m: 138, revenue_per_m2: 125, revenue_net_ht_per_m2: null, margin_per_m2: null },
      { grain: "pole", pole_id: "p1", pole_label: "Cuisine", family: null, window_start: "2026-08-13", window_end: "2026-09-11", linear_m: 40.5, linear_share: 0.2, surface_m2: 56.8, n_components: 9, revenue: 20805, revenue_net_ht: null, revenue_share: 0.538, margin_share: 0.55, coverage_pct: 1, revenue_per_m: 514, revenue_net_ht_per_m: null, margin_per_m: 383, revenue_per_m2: 366, revenue_net_ht_per_m2: null, margin_per_m2: null },
      { grain: "pole", pole_id: "p3", pole_label: "Cave", family: null, window_start: "2026-08-13", window_end: "2026-09-11", linear_m: 30.1, linear_share: 0.149, surface_m2: 48.6, n_components: 6, revenue: 2563, revenue_net_ht: null, revenue_share: 0.066, margin_share: 0.03, coverage_pct: 1, revenue_per_m: 85, revenue_net_ht_per_m: null, margin_per_m: 30, revenue_per_m2: 53, revenue_net_ht_per_m2: null, margin_per_m2: null },
    ],
    ...over,
  };
}

describe("composePoleClassement — du plus au moins performant, l'indicateur nommé, Non rattaché dans la même liste", () => {
  it("en CA : le pôle génère, la part du CA, l'écart au résultat habituel signé, les jours vendus", () => {
    const l = composePoleClassement(data(), "ca", "sur vos 30 derniers jours, du 13/08/2026 au 11/09/2026");
    expect(l.found).toBe(true);
    expect(l.facts[0]).toBe("Vos pôles du plus au moins performant en CA, sur vos 30 derniers jours, du 13/08/2026 au 11/09/2026 :");
    expect(nb(l.facts[1])).toBe("Cuisine génère 20 805 € de CA, soit 53,8 % de votre CA, +2 457 € par rapport à votre résultat habituel (30 jours vendus).");
    expect(nb(l.facts[4])).toBe("Non rattaché génère 300 € de CA, soit 0,8 % de votre CA, −20 € par rapport à votre résultat habituel (10 jours vendus).");
    const t = l.blocks[0] as any;
    expect(t.cols.map((c: any) => c.label)).toEqual(["Pôle", "CA", "Part du CA", "Écart au résultat habituel", "Jours vendus"]);
    expect(t.rows.map((r: any) => r.cells[0].v)).toEqual(["Cuisine", "Maison", "Cave", "Non rattaché"]);
    expect(t.rows[3].cells[3].color).toBe("#B45309");
  });
  it("en ventes : unités vendues (une pesée = une vente), classées ; en marge brute : la part de la marge et la couverture", () => {
    const v = composePoleClassement(data(), "ventes", "sur la semaine dernière");
    expect(nb(v.facts[1])).toBe("Cuisine réalise 6 667 ventes, soit 53,8 % de votre CA, +2 457 € par rapport à votre résultat habituel (30 jours vendus).");
    expect((v.blocks[0] as any).cols[1].label).toBe("Ventes");
    const m = composePoleClassement(data(), "marge_brute", "sur vos 30 derniers jours");
    expect(nb(m.facts[1])).toBe("Cuisine génère 15 521 € de marge brute (calculée sur 100 % de son CA), soit 55,4 % de votre marge brute, +2 457 € par rapport à votre résultat habituel (30 jours vendus).");
    expect((m.blocks[0] as any).cols[2].label).toBe("Part de la marge");
  });
  it("par mètre et par m² : le foyer espace, fenêtre fixe dite, classé sur l'indicateur", () => {
    const l = composePoleClassement(data(), "ca_par_metre", "sur la semaine dernière");
    expect(l.facts[0]).toBe("Vos pôles du plus au moins performant en CA par mètre, sur les 30 jours du 13/08/2026 au 11/09/2026 (la fenêtre des mesures d'espace, quelle que soit la période demandée) :");
    expect(nb(l.facts[1])).toBe("Cuisine génère 514 € de CA par mètre sur 40,5 m de linéaire, soit 53,8 % de votre CA pour 20 % de votre linéaire.");
    expect((l.blocks[0] as any).rows.map((r: any) => r.cells[0].v)).toEqual(["Cuisine", "Cave"]);
    const m2 = composePoleClassement(data(), "ca_par_m2", "x");
    expect(nb(m2.facts[1])).toContain("366 € de CA par m² sur 56,8 m²");
    expect((m2.blocks[0] as any).cols[2].label).toBe("Surface de vente");
  });
  it("absences : aucun pôle vendu ; aucune mesure d'espace ; aucune marge", () => {
    expect(composePoleClassement(data({ rows: [] }), "ca", "x")).toMatchObject({ found: false, absence: "aucun_pole" });
    expect(composePoleClassement(data({ space: [] }), "ca_par_m2", "x")).toMatchObject({ found: false, absence: "aucune_mesure" });
    const sans = data().rows.map((r) => ({ ...r, gross_margin_ht: null, revenue_costed: null }));
    expect(composePoleClassement(data({ rows: sans }), "marge_brute", "x")).toMatchObject({ found: false, absence: "aucune_marge" });
    expect(poleClassementToText(composePoleClassement(data({ rows: [] }), "ca", "x"))).toBe("Aucune vente rattachée à un pôle sur cette période.");
  });
  it("chaque nombre du tableau est dans les faits : la porte laisse passer", () => {
    for (const ind of ["ca", "ventes", "marge_brute", "ca_par_metre", "ca_par_m2"] as const) {
      const l = composePoleClassement(data(), ind, "sur vos 30 derniers jours");
      const cells = (l.blocks[0] as any).rows.flatMap((r: any) => r.cells.map((c: any) => c.v)).join(" ");
      expect(groundAgentText(cells, l.facts).register, ind).toBe("vetted");
    }
  });
  it("les chaînes visibles passent les gardes du français", () => {
    const visibles = (["ca", "ventes", "marge_brute", "ca_par_metre"] as const).flatMap((ind) => { const l = composePoleClassement(data(), ind, "sur vos 30 derniers jours"); return [...l.facts, ...(l.blocks[0] as any).cols.map((c: any) => c.label)]; });
    for (const s of visibles) {
      for (const t of TOURNURES_LLM) expect(t.motif.test(s.toLowerCase()), `${s} — ${t.faute}`).toBe(false);
      for (const mot of Object.keys(MOTS_BANNIS)) {
        const re = new RegExp(`(^|[^\\p{L}])${mot.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^\\p{L}]|$)`, "iu");
        expect(re.test(s), `${s} — « ${mot} » : ${MOTS_BANNIS[mot]}`).toBe(false);
      }
    }
  });
});

describe("readPoleClassement — vw_insight_event_pole_daily sommée sur la période, jamais mart", () => {
  it("une requête semantic bornée par @s/@e, plus le foyer listPoleSpace", async () => {
    const calls: any[] = [];
    const bq = { query: async (q: any) => { calls.push(q); return q.query.includes("pole_daily")
      ? [[{ pole_id: "p1", pole_label: "Cuisine", is_unassigned: false, n_days: 30, revenue: 20804.7, units: 6667, gross_margin_ht: 15520.59, revenue_costed: 20804.7, delta_eur: 2456.8, expected_revenue: 18347.9 }]]
      : [[]]; } };
    const d = await readPoleClassement(bq, "loc-1", "2026-08-13", "2026-09-11");
    const main = calls.find((c) => c.query.includes("pole_daily"));
    expect(main.query).toMatch(/semantic\.vw_insight_event_pole_daily/); expect(main.query).not.toMatch(/mart\./);
    expect(main.params).toEqual({ loc: "loc-1", s: "2026-08-13", e: "2026-09-11" });
    expect(d.rows[0]).toMatchObject({ pole_id: "p1", pole_label: "Cuisine", n_days: 30, units: 6667 });
    expect(d.space).toEqual([]);
  });
});
