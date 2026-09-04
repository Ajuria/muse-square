// Blocs du plan de période (27/08, refonte diagnostic — owner : « si c'est un plan, il faut
// un diagnostic ») : sections dans l'ordre diagnostic→plan, sources vides DITES vides,
// planchers « Données insuffisantes », coût de période composé des mesures, semaine par
// semaine avec les personnes.
import { describe, it, expect } from "vitest";
import { buildPlanBlocks, type PlanPeriodResult } from "./planPeriod";

const base = (over: Partial<PlanPeriodResult> = {}): PlanPeriodResult => ({
  start: "2026-09-01", end: "2026-09-30",
  inventory: [{ title: "Corner de vente producteur", saved_item_id: "s1", recurring: true, author: "Julen", dates: ["2026-09-05", "2026-09-12"] }],
  open_count: 1,
  calm_weeks: [{ wk: "2026-09-14", label: "14/09", count: 0, count_overlap: 0, state: "quiet" }],
  motifs: [
    { key: "rain", mot_fr: "pluie", n_days: 4, dates: ["2026-09-02", "2026-09-03", "2026-09-16", "2026-09-17"], med_gap_eur: -205, hist_days: 20, corr_r: -0.2, a_confirmer: false, entangled: true, entangled_with: [{ mot_fr: "pic touristique", n: 100 }, { mot_fr: "vacances scolaires", n: 45 }] },
    { key: "tourism_peak", mot_fr: "pic touristique", n_days: 30, dates: [], med_gap_eur: null, hist_days: null, corr_r: null, a_confirmer: false, entangled: false, entangled_with: [] },
  ],
  replay: [], series_due: [], web_plays: [],
  health: { eur_day_win: 1979, eur_day_base: 1304, delta_pct: 51.7, n_win: 26, n_base: 77 },
  poles: [{ name: "Périssables", rev_eur: 59703, share_pct: 50.7, delta_pct: 51.7, n_win: 26, margin_eur: 20674, margin_cov_pct: 67 }],
  roster: ["Julen", "Camille"],
  ...over,
});

const TITLES = [
  "La santé de l'entreprise", "Vos pôles", "Ce que la période va vous coûter",
  "Menaces", "À portée de main", "Chantiers de fond", "Le plan, semaine par semaine",
  // Pied (owner 28/08) : une ligne par relation MESURÉE utilisée — présent quand un motif
  // porte un indice (la fixture pluie a corr_r = −0,2).
  "Indices de corrélation",
];

describe("buildPlanBlocks — diagnostic d'abord, plan ensuite", () => {
  it("sections dans l'ordre diagnostic → plan ; santé et pôles chiffrés avec leurs fenêtres", () => {
    const b = buildPlanBlocks(base());
    expect(b.headline).toBe("Votre plan — du 01/09/2026 au 30/09/2026");
    expect(b.sections.map((s) => s.title)).toEqual(TITLES);
    const sante = b.sections[0].table!.rows[0];
    expect(sante.cells[1].v).toBe("1\u202f979 €");
    expect(sante.cells[1].sub).toBe("26 j vendus");
    expect(sante.cells[3].v).toBe("+51,7 %");
    const pole = b.sections[1].table!.rows[0];
    expect(pole.cells[0].v).toBe("Périssables");
    expect(pole.cells[2].v).toBe("51 % du CA");
    expect(pole.cells[4].v).toBe("≈ 20\u202f674 €");
    expect(pole.cells[4].sub).toBe("sur 67 % du CA du pôle");
  });
  it("le coût de la période compose les mesures × jours prévus, motif mêlé en infobulle", () => {
    const b = buildPlanBlocks(base());
    const cost = b.sections[2];
    const rain = cost.table!.rows[0];
    expect(rain.cells[2].v).toBe("−205 €/jour");
    expect(rain.cells[2].sub).toBe("20 j d'historique — facteurs multiples");
    expect(rain.cells[2].tip).toBe("Facteurs multiples présents les mêmes jours : pic touristique (100 % de ses jours), vacances scolaires (45 % de ses jours).");
    expect(cost.table!.rows[1].cells[2].v).toBe("—");
    expect(cost.facts![0]).toBe("Si la période ressemble à votre historique : ≈ −820 € sur les 4 jours à motif négatif mesuré.");
  });
  it("planchers : santé et pôle sans assez de jours vendus → « Données insuffisantes » + détail en infobulle", () => {
    const b = buildPlanBlocks(base({
      health: { eur_day_win: 900, eur_day_base: null, delta_pct: null, n_win: 3, n_base: 0 },
      poles: [{ name: "Corner", rev_eur: 1200, share_pct: 4, delta_pct: null, n_win: 3, margin_eur: null, margin_cov_pct: null }],
    }));
    expect(b.sections[0].table!.rows[0].cells[3].v).toBe("Données insuffisantes");
    const pole = b.sections[1].table!.rows[0];
    expect(pole.cells[3].v).toBe("Données insuffisantes");
    expect(String(pole.cells[3].tip)).toContain("plancher : 5");
    expect(pole.cells[4].v).toBe("—");
    expect(String(pole.cells[4].tip)).toContain("déclarant vos marges");
  });
  it("menaces : semaine chargée chiffrée + série à cadence non tenue ; à gagner vite : semaine calme + vide dit", () => {
    const b = buildPlanBlocks(base({
      calm_weeks: [
        { wk: "2026-09-07", label: "07/09", count: 5, count_overlap: 3, state: "busy" },
        { wk: "2026-09-14", label: "14/09", count: 0, count_overlap: 0, state: "quiet" },
      ],
      series_due: [{ title: "Producteurs invités", saved_item_id: "s2", recurring: true, author: null, dates: [] }],
    }));
    expect(b.sections[3].facts).toContain("Semaine du 07/09 : 3 événements concurrents visent votre public.");
    expect(b.sections[3].facts!.join(" ")).toContain("Producteurs invités » (série) — rien de daté");
    expect(b.sections[4].facts).toContain("Semaine du 14/09 : aucun événement concurrent relevé ne vise votre public.");
    expect(b.sections[4].facts!.join(" ")).toContain("Aucun dispositif prouvé n'est rejouable");
  });
  it("chantiers de fond : pôle en retrait ≤ −10 % nommé ; les références crawlées suivent en registre WEB", () => {
    const b = buildPlanBlocks(base({
      poles: [{ name: "Épicerie", rev_eur: 9000, share_pct: 12, delta_pct: -14.2, n_win: 20, margin_eur: null, margin_cov_pct: null }],
      web_plays: [
        { play_id: "p", industry_code: "live_event", lever: "yield", intent: "pivot",
          title: "Tarification dynamique du soir", context: "salle 400 places",
          move: "Prix modulés selon le remplissage à J-3.", outcome: "+12 % de recettes sur 2 mois",
          steps: [], source_name: "EventBiz", source_url: "https://x", published_at: "2026-05",
          confidence: "moyenne", venue_named: true, source_tier: 1 } as any,
      ],
    }));
    expect(b.sections[5].facts).toContain("Pôle Épicerie : −14,2 % (30 j vs les 90 précédents).");
    const web = b.sections.find((s2) => s2.register === "web")!;
    expect(web.title).toBe("Des lieux comparables ont fait");
    expect(web.facts![0]).toContain("(EventBiz, 2026-05)");
    expect(b.sources.join(" ")).toContain("Références web");
  });
  it("le plan semaine par semaine : l'existant posé avec son auteur, la semaine calme confiée au roster, les jours à motif chiffrés", () => {
    const b = buildPlanBlocks(base());
    const plan = b.sections[6];
    expect(plan.table!.cols.map((c: any) => c.label)).toEqual(["Semaine", "Déjà placé", "À faire", "Qui"]);
    const rows = plan.table!.rows;
    expect(rows[0].cells[0].v).toBe("Semaine du 31/08/2026");
    expect(rows[0].cells[1].v).toContain("Corner de vente producteur — 05/09/2026");
    expect(rows[0].cells[2].v).toContain("pluie 2 j (205 €/j de moins, mesuré)");
    expect(rows[0].cells[3].v).toBe("Julen");
    const calmRow = rows.find((r2: any) => r2.cells[0].v === "Semaine du 14/09/2026")!;
    expect(calmRow.cells[2].v).toContain("Testez une opération — calme autour de vous");
    expect(calmRow.cells[3].v).toBe("à confier : Julen · Camille");
    expect(plan.facts).toContain("1 engagement en cours sur la période.");
  });
  it("porte de concordance : « Signal à confirmer » — lisible, hors coût projeté, hors À faire, pied suffixé", () => {
    const b = buildPlanBlocks(base({ motifs: [
      { key: "rain", mot_fr: "pluie", n_days: 4, dates: ["2026-09-02", "2026-09-03"], med_gap_eur: -154, hist_days: 20, corr_r: 0.07, a_confirmer: true, entangled: true, entangled_with: [] },
      { key: "heat", mot_fr: "forte chaleur", n_days: 5, dates: ["2026-09-08"], med_gap_eur: -143, hist_days: 32, corr_r: -0.34, a_confirmer: false, entangled: true, entangled_with: [] },
    ] }));
    const cost = b.sections[2];
    expect(cost.table!.rows[0].cells[2].v).toBe("Signal à confirmer");
    expect(String(cost.table!.rows[0].cells[2].tip)).toContain("pointent en sens opposés");
    // le coût projeté n'inclut QUE la chaleur (143 × 5 = 715) — jamais le signal à confirmer
    expect(cost.facts![0]).toContain("−715 €");
    expect(cost.facts![0]).toContain("5 jours");
    // la colonne « À faire » de la semaine du 31/08 (pluie le 02-03/09) ne pousse plus la pluie
    const plan = b.sections.find((s2) => s2.title === "Le plan, semaine par semaine")!;
    expect(String(plan.table!.rows[0].cells[2].v)).not.toContain("pluie");
    // le pied garde la relation, suffixée
    const pied = b.sections.find((s2) => s2.title === "Indices de corrélation")!;
    expect(pied.facts!.join(" ")).toContain("pluie ↔ CA : indice de corrélation faible (r = 0,07) · 20 j d'historique — signal à confirmer.");
  });
  it("un rejeu positif porte le prefill prioritaire", () => {
    const b = buildPlanBlocks(base({
      replay: [{ date: "2026-09-14", date_fr: "14/09/2026", conditions: ["forte chaleur"], dispositif: "Coupon café glacé",
        direction: "positive", say_fr: "Le 14/09 réunit les conditions où « Coupon café glacé » a été prouvé (+12 %).",
        prefill: { committed_action_text: "Coupon café glacé", window_kind: "day_of" } } as any],
    }));
    expect(b.sections[4].facts!.join(" ")).toContain("Coupon café glacé");
    expect(b.replay_prefill).not.toBeNull();
  });
});
