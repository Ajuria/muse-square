// Blocs du plan de période (27/08) — le constructeur PUR : sections dans l'ordre, sources
// vides DITES vides, « estimé, facteurs mêlés » sur la base marginale, rejeu prioritaire.
import { describe, it, expect } from "vitest";
import { buildPlanBlocks, type PlanPeriodResult } from "./planPeriod";

const base = (over: Partial<PlanPeriodResult> = {}): PlanPeriodResult => ({
  start: "2026-09-01", end: "2026-09-30",
  inventory: [{ title: "Corner de vente producteur", saved_item_id: "s1", recurring: true, dates: ["2026-09-05", "2026-09-12"] }],
  open_count: 1,
  calm_weeks: [{ wk: "2026-09-14", label: "14/09", count: 0, state: "quiet" }],
  motifs: [
    { key: "rain", mot_fr: "pluie", n_days: 4, dates: [], med_gap_eur: -205, hist_days: 20, entangled: true },
    { key: "tourism_peak", mot_fr: "pic touristique", n_days: 30, dates: [], med_gap_eur: null, hist_days: null, entangled: false },
  ],
  replay: [], series_due: [],
  ...over,
});

describe("buildPlanBlocks", () => {
  it("sections dans l'ordre, motif mesuré avec sa base dite, non mesuré = « — »", () => {
    const b = buildPlanBlocks(base());
    expect(b.headline).toBe("Votre plan — du 01/09/2026 au 30/09/2026");
    expect(b.sections.map((s) => s.title)).toEqual(["Déjà en place", "Les fenêtres", "À placer"]);
    const rain = b.sections[1].table!.rows[0];
    expect(rain.cells[2].v).toBe("−205 €/jour");
    expect(rain.cells[2].sub).toBe("20 jours d'historique — estimé, facteurs mêlés");
    expect(b.sections[1].table!.rows[1].cells[2].v).toBe("—");
    expect(b.sections[1].facts).toContain("Semaine du 14/09 : aucun événement concurrent relevé ne vise votre public.");
  });
  it("les vides se DISENT : inventaire vide, aucune semaine couverte, rien à placer", () => {
    const b = buildPlanBlocks(base({ inventory: [], open_count: 0, calm_weeks: [], motifs: [], replay: [], series_due: [] }));
    expect(b.sections[0].facts).toContain("Rien de daté sur la période.");
    expect(b.sections[1].facts!.join(" ")).toContain("s'arrêtent à ~6 semaines");
    expect(b.sections[2].facts!.join(" ")).toContain("le plan n'invente pas");
  });
  it("une série à cadence non tenue se nomme ; un rejeu positif porte le prefill prioritaire", () => {
    const b = buildPlanBlocks(base({
      series_due: [{ title: "Producteurs invités", saved_item_id: "s2", recurring: true, dates: [] }],
      replay: [{ date: "2026-09-14", date_fr: "14/09/2026", conditions: ["forte chaleur"], dispositif: "Coupon café glacé",
        direction: "positive", say_fr: "Le 14/09 réunit les conditions où « Coupon café glacé » a été prouvé (+12 %).",
        prefill: { committed_action_text: "Coupon café glacé", window_kind: "day_of" } } as any],
    }));
    expect(b.sections[2].facts!.join(" ")).toContain("Producteurs invités » (série) — rien de daté");
    expect(b.sections[2].facts![0]).toContain("Coupon café glacé");
    expect(b.replay_prefill).not.toBeNull();
  });
});
