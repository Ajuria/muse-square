import { describe, expect, it } from "vitest";
import { composeRapport, rapportToText, type ComposeInput } from "./composer";
import { composeVentesFacts, type SalesReportResult } from "./ventes";
import { composeResultatFacts } from "../kpi/resultat";
import { composePoleClassement } from "../dispositifs/poleClassement";
import { groundAgentText } from "../explorer/blocks";
import { resolveSections } from "../fr/rapport.fr";

const nb = (x: string): string => x.replace(/[  ]/g, " ");
const periode = { du: "2026-08-31", au: "2026-09-06", relative: "semaine_derniere", libelle_fr: "la semaine dernière, du 31/08/2026 au 06/09/2026" };

function ventes(): SalesReportResult {
  return { prev_revenue: 12_574, actions_fr: [], body: { ok: true, period: { start: "2026-08-31", end: "2026-09-06" },
    summary: { revenue: 11_015, transactions: 2_426, avg_basket: 4.54, vs_prev_pct: -12.4, vs_yoy_pct: null, yoy_available: false,
      layers: { volume_pct: 0.5, basket_pct: -12.8, volume_term_eur: 63, basket_term_eur: -1622, prev_transactions: 2_414, prev_avg_basket: 5.21, mix: [{ label: "Coffee", share_pct: 42.7, prev_share_pct: 39.6, delta_pt: 3.1 }] } },
    best_day: { date: "2026-09-05", revenue: 2_010 }, worst_day: { date: "2026-08-31", revenue: 1_120 }, weekday: [],
    category_mix: [{ label: "Coffee", revenue: 4_668 }, { label: "Tea", revenue: 3_496 }, { label: "Autres", revenue: 2_851 }], signals: {} } };
}
function poles() {
  return composePoleClassement({ start: periode.du, end: periode.au, space: [], rows: [
    { pole_id: "p1", pole_label: "Cuisine", is_unassigned: false, n_days: 7, revenue: 4_900, units: 1_602, gross_margin_ht: 3_600, revenue_costed: 4_900, delta_eur: -300, expected_revenue: 5_200 },
    { pole_id: "p2", pole_label: "Cave", is_unassigned: false, n_days: 5, revenue: 400, units: 21, gross_margin_ht: 150, revenue_costed: 400, delta_eur: 60, expected_revenue: 340 },
  ] }, "ventes", `sur ${periode.libelle_fr}`);
}
function input(over: Partial<ComposeInput> = {}): ComposeInput {
  const r = resolveSections("volume, panier, mix, et les pôles les plus et les moins performants en nombre de ventes");
  return { cles: r.cles, non_reconnu: r.inconnues, periode, indicateur: "ventes", calcule_le: "2026-09-12T10:00:00.000Z",
    lectures: { ventes: composeVentesFacts(ventes()), poles: poles() }, ...over };
}

describe("composeRapport — la demande de l'owner (§ 9) : volume, panier, mix, pôles en ventes", () => {
  it("une section par clé, dans l'ordre demandé, chacune avec sa provenance ; le tableau des couches une seule fois", () => {
    const r = composeRapport(input());
    expect(r.block.type).toBe("rapport");
    expect(r.block.titre).toBe("Rapport — la semaine dernière, du 31/08/2026 au 06/09/2026");
    expect(r.block.sections.map((s) => s.cle)).toEqual(["volume", "panier", "mix", "poles", "sources"]);
    expect(r.block.sections.map((s) => s.titre)).toEqual(["Nombre de ventes", "Panier moyen", "Mix produits & services", "Vos pôles · du plus au moins performant", "Sources et fiabilité"]);
    const types = r.block.sections.map((s) => s.blocs.map((b) => b.type));
    expect(types).toEqual([["table", "facts"], ["facts"], ["parts", "table", "facts"], ["table", "barres_h"], ["sources"]]);
    expect(r.block.sections[0].provenance).toEqual({ outil: "lire_ventes", params: { periode: "semaine_derniere", du: "2026-08-31", au: "2026-09-06" }, periode: { du: "2026-08-31", au: "2026-09-06" }, calcule_le: "2026-09-12T10:00:00.000Z" });
    expect(r.block.sections[3].provenance?.params).toEqual({ indicateur: "ventes", du: "2026-08-31", au: "2026-09-06" });
    expect(r.block.synthese).toBeNull();
    expect(r.block.non_reconnu).toEqual([]);
  });
  it("les faits du document sont ceux des lectures, sans doublon ; chaque nombre des tableaux y est (porte verte)", () => {
    const r = composeRapport(input());
    // Le tableau des couches (rendu sous Volume) porte le CA : son fait ouvre le document.
    expect(nb(r.facts[0])).toBe("Du 31/08/2026 au 06/09/2026, vous avez généré 11 015 € de chiffre d'affaires, en baisse de 12,4 % par rapport à la période précédente (12 574 €).");
    expect(nb(r.facts[1])).toBe("Vous avez réalisé 2 426 ventes, pour un panier moyen de 4,54 € par vente.");
    expect(r.facts.filter((f) => f.startsWith("Vous avez réalisé")).length).toBe(1);
    const cells = r.block.sections.flatMap((s) => s.blocs).filter((b) => b.type === "table").flatMap((b: any) => b.rows.flatMap((row: any) => row.cells.map((c: any) => c.v))).join(" ");
    const g = groundAgentText(cells, r.facts);
    expect(g.register, `nombres non fondés : ${g.ungrounded_numbers.join(", ")}`).toBe("vetted");
  });
  it("les sections sans lecture disent l'absence ; contexte et actions renvoient au rapport imprimable ; l'inconnu est dit", () => {
    const r = composeRapport(input({ cles: ["chiffre_affaires", "marge_brute", "resultat_net", "contexte"], non_reconnu: ["la couleur des murs"], lectures: { ventes: composeVentesFacts({ body: { ok: false, error: "NO_DATA" }, prev_revenue: null, actions_fr: [] }) } }));
    expect(r.block.sections.map((s) => [s.cle, s.blocs[0].type])).toEqual([["chiffre_affaires", "absence"], ["marge_brute", "absence"], ["resultat_net", "absence"], ["contexte", "absence"]]);
    expect((r.block.sections[0].blocs[0] as any).manque).toBe("Aucune vente la semaine dernière, du 31/08/2026 au 06/09/2026.");
    expect((r.block.sections[1].blocs[0] as any).geste.label_fr).toBe("Importer vos prix d'achat");
    expect(r.block.non_reconnu).toEqual(["la couleur des murs"]);
    const t = rapportToText(r);
    expect(t).toContain("Aucune section du Rapport ne correspond à : « la couleur des murs ».");
    expect(t).toContain("Sections sans matière");
  });
  it("résultat net et seuil : le tableau des mois sous l'un, le fait du seuil sous l'autre", () => {
    const res = composeResultatFacts({ mois: [{ month: "2026-08-01", is_complete_month: true, sales_days: 31, revenue_net_ht: 50_499, gross_margin_ht: 36_503, coverage_pct: 1, fixed_costs_month_eur: 6_500, payroll_month_eur: 17_000, net_result_eur: 13_003, payroll_to_revenue_pct: 0.3366 }],
      jour: { date: "2026-09-12", gross_margin_ht: 1_369, charges_day_eur: 758, break_even_revenue_ht: 1_052, break_even_hour: 10, is_break_even_reached: true, margin_rate_30d: 0.72, opening_days_ref: 31 } });
    const r = composeRapport(input({ cles: ["resultat_net", "seuil_rentabilite"], lectures: { resultat: res } }));
    expect(r.block.sections.map((s) => s.blocs.map((b) => b.type))).toEqual([["table", "facts"], ["facts"], ["sources"]]);
    expect((r.block.sections[1].blocs[0] as any).items[0]).toContain("seuil de rentabilité du jour");
  });
  it("le titre demandé l'emporte ; la synthèse reste à la route", () => {
    const r = composeRapport(input({ titre: "Rapport hebdomadaire" }));
    expect(r.block.titre).toBe("Rapport hebdomadaire");
    expect(rapportToText(r)).toMatch(/^Rapport composé, la semaine dernière, du 31\/08\/2026 au 06\/09\/2026 : Nombre de ventes · Panier moyen · Mix produits & services · Vos pôles · du plus au moins performant · Sources et fiabilité\./);
  });
});

describe("composeRapport — Contexte externe et Actions recommandées (12/09, owner : le contexte est le différenciateur)", () => {
  it("contexte = les phrases de contexte + la carte « familles face aux jours » ; actions = les actions en clair, ou l'absence", () => {
    const v = ventes(); (v.body as any).context = { hot_days: 0, rain_days: 3, cold_days: 0, school_days: 0, public_days: 0, mobility_days: 0, events_avg_5km: 12, named_events: [], foreign_visitors: [], assoc: {} };
    v.actions_fr = [{ action_type: "a", headline_fr: "Vos remises sur Coffee ne rapportent pas", detail_fr: "Testez une remise plus courte.", date: "2026-09-02" }];
    const signaux = { found: true, data: { found: true, lines: [{ family: "Tea", class_key: "rain" }] }, facts: [{ fact_fr: "CA/jour Tea sur vos jours de pluie marquée : −52 € vs vos jours comparables, sur 20 jours.", claim_type: "observed_difference" as const }], sources: ["Vos ventes par famille face aux classes de jours"] };
    const r = composeRapport(input({ cles: ["contexte", "actions"], lectures: { ventes: composeVentesFacts(v), signaux } }));
    expect(r.block.sections.map((s) => [s.cle, s.blocs.map((b) => b.type)])).toEqual([["contexte", ["card", "facts"]], ["actions", ["facts"]], ["sources", ["sources"]]]);
    expect((r.block.sections[0].blocs[1] as any).items[0]).toBe("Météo — 3 de pluie. Pas d'effet marqué sur vos ventes.");
    expect((r.block.sections[0].blocs[0] as any).render).toBe("renderSignauxFamille");
    expect(r.facts).toContain("CA/jour Tea sur vos jours de pluie marquée : −52 € vs vos jours comparables, sur 20 jours.");
    expect((r.block.sections[1].blocs[0] as any).items).toEqual(["Vos remises sur Coffee ne rapportent pas — Testez une remise plus courte. (02/09/2026)"]);
    const sansAction = composeRapport(input({ cles: ["actions"], lectures: { ventes: composeVentesFacts(ventes()) } }));
    expect(sansAction.block.sections[0].blocs[0]).toMatchObject({ type: "absence", manque: "Aucune action issue de vos signaux de vente la semaine dernière, du 31/08/2026 au 06/09/2026." });
  });
});
