import { describe, expect, it } from "vitest";
import { composeVentesFacts, contexteFacts, actionsFacts, resolvePeriode, ventesToText, VENTES_ABSENCE_FR, type SalesReportResult } from "./ventes";
import { groundAgentText } from "../explorer/blocks";
// fr-FR sépare les milliers par U+202F : les attendus s'écrivent avec une espace, la comparaison les rapproche.
const nb = (x: string): string => x.replace(/[\u202f\u00a0]/g, " ");
import { TOURNURES_LLM } from "../fr/tournures.fr";
import { MOTS_BANNIS } from "../fr/evenement.fr";

// Un rapport tel que computeSalesReport le rend (les champs que composeVentesFacts lit), chiffres du compte de test.
function rapport(over: Record<string, unknown> = {}): SalesReportResult {
  return {
    prev_revenue: 33_400, actions_fr: [],
    body: {
      ok: true, location_id: "loc", location_label: "Muse Square", period: { start: "2026-08-12", end: "2026-09-10" },
      summary: { revenue: 34_512, transactions: 2_410, avg_basket: 14.32, vs_prev_pct: 3.3, vs_yoy_pct: null, yoy_available: false,
        layers: { volume_pct: 4.1, basket_pct: -0.7, volume_term_eur: 1_355, basket_term_eur: -241, prev_transactions: 2_316, prev_avg_basket: 14.42,
          mix: [{ label: "Coffee", share_pct: 39.1, prev_share_pct: 38.2, delta_pt: 0.9 }, { label: "Tea", share_pct: 27.4, prev_share_pct: 29.0, delta_pt: -1.6 }] } },
      best_day: { date: "2026-09-05", revenue: 1_620 }, worst_day: { date: "2026-09-08", revenue: 410 },
      weekday: [{ label: "lundi", avg: 640 }, { label: "samedi", avg: 1_320 }, { label: "mardi", avg: 900 }],
      category_mix: [{ label: "Coffee", revenue: 13_500 }, { label: "Tea", revenue: 9_450 }, { label: "Autres", revenue: 11_562 }],
      signals: { down_days: 2, surge_days: 1, driver: "transactions" },
      ...over,
    },
  };
}

describe("resolvePeriode — les mots de période en dates, le jour de référence injecté", () => {
  const today = "2026-09-12"; // un samedi
  it("30 derniers jours par défaut : les 30 jours qui finissent hier", () => {
    expect(resolvePeriode({}, today)).toEqual({ start: "2026-08-13", end: "2026-09-11", libelle_fr: "vos 30 derniers jours, du 13/08/2026 au 11/09/2026" });
  });
  it("semaine dernière : du lundi au dimanche de la semaine civile précédente", () => {
    expect(resolvePeriode({ periode: "semaine_derniere" }, today)).toMatchObject({ start: "2026-08-31", end: "2026-09-06" });
    expect(resolvePeriode({ periode: "semaine_derniere" }, "2026-09-07")).toMatchObject({ start: "2026-08-31", end: "2026-09-06" }); // un lundi
    expect(resolvePeriode({ periode: "semaine_derniere" }, "2026-09-06")).toMatchObject({ start: "2026-08-24", end: "2026-08-30" }); // un dimanche : la semaine finie
  });
  it("mois dernier : le mois civil précédent", () => {
    expect(resolvePeriode({ periode: "mois_dernier" }, today)).toMatchObject({ start: "2026-08-01", end: "2026-08-31" });
    expect(resolvePeriode({ periode: "mois_dernier" }, "2026-01-15")).toMatchObject({ start: "2025-12-01", end: "2025-12-31" });
  });
  it("des dates explicites l'emportent ; invalides → null", () => {
    expect(resolvePeriode({ periode: "mois_dernier", du: "2026-07-14" }, today)).toMatchObject({ start: "2026-07-14", end: "2026-07-14" });
    expect(resolvePeriode({ du: "2026-07-20", au: "2026-07-14" }, today)).toBeNull();
    expect(resolvePeriode({ du: "14/07/2026" }, today)).toBeNull();
  });
});

describe("composeVentesFacts — les phrases du rapport et du chat, les tableaux du kit", () => {
  it("dit le CA avec son sujet, la comparaison, les trois couches, les journées, le profil, la répartition", () => {
    const l = composeVentesFacts(rapport());
    expect(l.found).toBe(true);
    expect(nb(l.facts[0])).toBe("Du 12/08/2026 au 10/09/2026, vous avez généré 34 512 € de chiffre d'affaires, en hausse de 3,3 % par rapport à la période précédente (33 400 €).");
    expect(nb(l.facts[1])).toBe("Vous avez réalisé 2 410 ventes, pour un panier moyen de 14,32 € par vente.");
    expect(nb(l.facts[2])).toBe("Ce qui a bougé par rapport à la période précédente : le nombre de ventes +4,1 % (2 410 contre 2 316, soit +1 355 €) ; le panier moyen −0,7 % (14,32 € contre 14,42 € par vente, soit −241 €) ; le mix : Tea recule de 29 % à 27,4 % de votre CA.");
    expect(nb(l.facts[3])).toBe("Votre meilleure journée a été le samedi 05/09/2026, avec 1 620 € ; la plus faible, le mardi 08/09/2026, avec 410 €.");
    expect(nb(l.facts[4])).toBe("Votre meilleur jour de la semaine : le samedi (1 320 € en moyenne) ; le plus calme, le lundi (640 € en moyenne).");
    expect(nb(l.facts[5])).toBe("Répartition par famille : Coffee 13 500 € (39,1 % de votre CA), Tea 9 450 € (27,4 % de votre CA), Autres 11 562 € (33,5 % de votre CA).");
    expect(nb(l.facts[6])).toBe("1 journée nettement au-dessus de votre résultat habituel, 2 en dessous.");
  });
  it("les tableaux : les trois couches (période, précédente, écart) puis le mix — format msTable", () => {
    const l = composeVentesFacts(rapport());
    expect(l.blocks.map((b) => b.type)).toEqual(["table", "table", "sources"]);
    const t = l.blocks[0] as any;
    expect(t.cols.map((c: any) => c.label)).toEqual(["", "Du 12/08/2026 au 10/09/2026", "Période précédente", "Écart"]);
    expect(t.rows.map((r: any) => r.cells.map((c: any) => nb(c.v)))).toEqual([
      ["Chiffre d’affaires", "34 512 €", "33 400 €", "+3,3 %"],
      ["Nombre de ventes", "2 410", "2 316", "+4,1 %"],
      ["Panier moyen", "14,32 €", "14,42 €", "−0,7 %"],
    ]);
    expect((l.blocks[1] as any).cols[0].label).toBe("Mix produits & services");
  });
  it("sans période précédente : le CA seul, pas de couches, tirets dans le tableau", () => {
    const l = composeVentesFacts(rapport({ summary: { revenue: 34_512, transactions: 2_410, avg_basket: 14.32, vs_prev_pct: null, vs_yoy_pct: null, yoy_available: false, layers: null } }));
    expect(nb(l.facts[0])).toBe("Du 12/08/2026 au 10/09/2026, vous avez généré 34 512 € de chiffre d'affaires sur la période.");
    expect(l.facts.some((f) => f.startsWith("Ce qui a bougé"))).toBe(false);
    expect((l.blocks[0] as any).rows[1].cells.map((c: any) => nb(c.v))).toEqual(["Nombre de ventes", "2 410", "—", "—"]);
  });
  it("l'an dernier quand il existe ; mix stable dit stable", () => {
    const l = composeVentesFacts(rapport({ summary: { ...(rapport().body as any).summary, vs_yoy_pct: -2.5, yoy_available: true,
      layers: { ...(rapport().body as any).summary.layers, mix: [{ label: "Coffee", share_pct: 39.1, prev_share_pct: 38.9, delta_pt: 0.2 }] } } }));
    expect(nb(l.facts[1])).toBe("Par rapport à la même période l'an dernier, votre chiffre d'affaires est en baisse de 2,5 %.");
    expect(nb(l.facts[3])).toContain("le mix par famille reste stable (aucune famille ne bouge de plus d’un point de part de CA)");
  });
  it("grain jour : une ligne par jour de vente (CA, ventes, panier moyen), en toutes lettres, jusqu'à 31 jours", () => {
    const l = composeVentesFacts(rapport({ daily: [{ d: "2026-08-31", rev: 1649.4, txns: 340 }, { d: "2026-09-02", rev: 1439, txns: 0 }] }), { grain: "jour" });
    expect(l.parts.par_jour!.map(nb)).toEqual(["Le lundi 31/08/2026 : 1 649 € de CA, 340 ventes, panier moyen 4,85 €.", "Le mercredi 02/09/2026 : 1 439 € de CA, 0 ventes."]);
    expect(l.facts).toEqual(expect.arrayContaining(l.parts.par_jour!));
    const t = l.tables.par_jour as any;
    expect(t.cols.map((c: any) => c.label)).toEqual(["Jour", "CA", "Ventes", "Panier moyen"]);
    expect(t.rows.map((r: any) => r.cells.map((c: any) => nb(c.v)))).toEqual([["lundi 31/08/2026", "1 649 €", "340", "4,85 €"], ["mercredi 02/09/2026", "1 439 €", "0", "—"]]);
    expect(l.blocks.map((b) => b.type)).toEqual(["table", "table", "table", "sources"]);
    const long = composeVentesFacts(rapport({ daily: Array.from({ length: 40 }, (_, i) => ({ d: `2026-07-${String(1 + (i % 28)).padStart(2, "0")}`, rev: 100, txns: 10 })) }), { grain: "jour" });
    expect(long.facts).toContain("Le détail par jour se lit jusqu'à 31 jours : la période en compte 40.");
    expect(long.tables.par_jour).toBeUndefined();
    expect(composeVentesFacts(rapport()).tables.par_jour).toBeUndefined(); // sans grain, rien de plus
  });
  it("NO_DATA et rapport mono-canal : rien à lire, absence dite", () => {
    expect(composeVentesFacts({ body: { ok: false, error: "NO_DATA" }, prev_revenue: null, actions_fr: [] }).found).toBe(false);
    expect(composeVentesFacts({ body: { ok: true, channel_report: true }, prev_revenue: null, actions_fr: [] }).found).toBe(false);
    expect(ventesToText({ found: false, facts: [], blocks: [], parts: {}, tables: {} })).toBe(VENTES_ABSENCE_FR);
  });
  it("chaque nombre des tableaux existe dans les faits : la porte de l'agent les laisse passer", () => {
    const l = composeVentesFacts(rapport());
    const cells = l.blocks.filter((b) => b.type === "table").flatMap((b: any) => b.rows.flatMap((r: any) => r.cells.map((c: any) => c.v))).join(" ");
    expect(groundAgentText(cells, l.facts).register).toBe("vetted");
  });
  it("les chaînes visibles passent les gardes du français", () => {
    const l = composeVentesFacts(rapport());
    const visibles = [...l.facts, ...l.blocks.flatMap((b: any) => (b.cols || []).map((c: any) => c.label)), VENTES_ABSENCE_FR];
    for (const s of visibles) {
      for (const t of TOURNURES_LLM) expect(t.motif.test(s.toLowerCase()), `${s} — ${t.faute}`).toBe(false);
      for (const mot of Object.keys(MOTS_BANNIS)) {
        const re = new RegExp(`(^|[^\\p{L}])${mot.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^\\p{L}]|$)`, "iu");
        expect(re.test(s), `${s} — « ${mot} » : ${MOTS_BANNIS[mot]}`).toBe(false);
      }
    }
  });
});

describe("contexte externe et actions (12/09, owner : « tout ce qui impacte le business ») — les phrases de rapport.astro, sans balise", () => {
  it("météo avec association mesurée, saison et tourisme, événements, mobilité, fériés", () => {
    const c = { hot_days: 6, max_heat: 3, rain_days: 4, cold_days: 0, school_days: 12, public_days: 1, mobility_days: 2, tourism_peak_days: 9, tourism_status: "high", events_avg_5km: 1239.7, events_peak_5km: 1800,
      named_events: [{ label: "Fête de la musique", days: 1 }], foreign_visitors: ["Spain", "United Kingdom"],
      assoc: { heat: { with_avg: 1500, with_n: 6, without_avg: 1700, without_n: 25, corr: -0.3 }, events: { with_avg: 1600, with_n: 10, without_avg: 1650, without_n: 21, corr: 0.05 } } };
    const f = contexteFacts(c).map(nb);
    expect(f[0]).toBe("Météo — vos 6 journées de forte chaleur tournent à 1 500 € en moyenne, sous vos 25 journées tempérées (1 700 €).");
    expect(f[1]).toBe("Saison & tourisme — Pic touristique (9 j, statut « élevé »), pendant les vacances scolaires. Clientèle internationale présente sur la période : Espagne, Royaume-Uni.");
    expect(f[2]).toBe("Événements à proximité — 1 240 événements/j en moyenne dans un rayon de 5 km, sans lien mesurable avec vos ventes sur la période. À noter : Fête de la musique. 2 j de perturbation de mobilité.");
    expect(f[3]).toBe("1 jour férié sur la période.");
    const sans = contexteFacts({ hot_days: 0, rain_days: 0, cold_days: 0, school_days: 0, public_days: 0, mobility_days: 0, events_avg_5km: 0, named_events: [], foreign_visitors: [], assoc: {} });
    expect(sans[0]).toBe("Météo — sans particularité notable. Pas d'effet marqué sur vos ventes.");
    expect(sans[1]).toBe("Saison & tourisme — hors vacances scolaires françaises.");
    expect(contexteFacts(null)).toEqual([]);
  });
  it("les actions de la période en clair : titre, détail, date", () => {
    expect(actionsFacts([{ action_type: "family_discount_move", headline_fr: "Vos remises sur Coffee ne rapportent pas", detail_fr: "Testez une remise plus courte.", date: "2026-08-20" }, { action_type: "x", headline_fr: "", detail_fr: null, date: null }]))
      .toEqual(["Vos remises sur Coffee ne rapportent pas — Testez une remise plus courte. (20/08/2026)"]);
    const l = composeVentesFacts({ ...rapport(), actions_fr: [{ action_type: "a", headline_fr: "Un titre", detail_fr: null, date: null }] });
    expect(l.parts.actions).toEqual(["Un titre"]); expect(l.parts.contexte?.length).toBe(0);
  });
});
