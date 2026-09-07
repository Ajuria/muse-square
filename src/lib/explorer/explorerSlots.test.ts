// Le guichet de la mémoire — pur (spec docs/explorer-etat-vide-spec.md § 3, § 6). Lignes calquées sur
// f10c3e58 au 07/09 : le Dispositif vacances scolaires (resolved, +904 € sur 7 j, sans bilan), le
// Corner du 08/08 (resolved missed, −394 €). Chaque assertion vue tomber par mutation (score, tri,
// garde « jamais trois de la même nature », libellés).
import { describe, it, expect } from "vitest";
import { commitmentCandidates, rankSlots, shortTitle, type CommitmentSlotRow } from "./explorerSlots";

const TODAY = "2026-09-07";
const base: CommitmentSlotRow = {
  commitment_id: "c2", status: "resolved", verdict: "met", committed_action_text: "Dispositif vacances scolaires centré sur les retraités — texte",
  saved_item_title: null, window_start: "2026-08-26", window_end: "2026-09-01", window_days_expected: 7,
  retro_worked: null, window_expected_revenue: 8000, window_actual_revenue: 8904, resolved_at: "2026-09-02",
};

describe("commitmentCandidates", () => {
  it("résolu sans bilan → carte bilan : verdict du lexique, écart de la fenêtre, chaîne de la page Évaluer, score = |écart| × jours", () => {
    const [c] = commitmentCandidates([base], TODAY);
    expect(c.kind).toBe("bilan");
    expect(c.nature).toBe("memoire");
    expect(c.key).toBe("explorer_slot_bilan");
    expect(c.text.replace(/ /g, " ")).toBe("Dispositif vacances scolaires centré sur les retraités : objectif atteint, +904 € sur 7 jours");
    expect(c.sub).toBe("Votre bilan ajoute ce que la mesure ne voit pas — 2 minutes.");
    expect(c.cta).toBe("Bilan →");
    expect(c.href).toBe("/app/insightevent/engagement?id=c2");
    expect(c.date).toBe("2026-09-02");
    expect(c.anciennete_jours).toBe(5);
    expect(c.enjeu_eur).toBe(904);
    expect(c.score).toBe(904 * 5);
  });
  it("objectif manqué, écart négatif, un jour : le Corner du 08/08", () => {
    const [c] = commitmentCandidates([{ ...base, commitment_id: "c1", verdict: "missed", saved_item_title: "Corner de vente producteur", window_start: "2026-08-08", window_end: "2026-08-08", window_days_expected: 1, window_expected_revenue: 2263, window_actual_revenue: 1869.15, resolved_at: "2026-08-28" }], TODAY);
    expect(c.text.replace(/ /g, " ")).toBe("Corner de vente producteur : objectif manqué, −394 € sur 1 jour");
    expect(c.anciennete_jours).toBe(10);
  });
  it("rien à demander → aucune carte (bilan fait, ouvert — même fenêtre finie —, annulé)", () => {
    const rows: CommitmentSlotRow[] = [
      { ...base, retro_worked: "oui" },
      { ...base, commitment_id: "o", status: "open", resolved_at: null, window_end: "2026-08-08" },   // le silence vaut « menée » (owner 05/08)
      { ...base, commitment_id: "z", status: "cancelled" },
    ];
    expect(commitmentCandidates(rows, TODAY)).toEqual([]);
  });
  it("fenêtre sans mesure → écart non mesuré, sans chiffre (classé dernier)", () => {
    const [c] = commitmentCandidates([{ ...base, window_actual_revenue: null }], TODAY);
    expect(c.text).toContain("écart non mesuré");
    expect(c.enjeu_eur).toBeNull();
  });
  it("le titre court : l'opération liée d'abord, sinon la tête du texte d'engagement", () => {
    expect(shortTitle({ committed_action_text: "A — B", saved_item_title: "Corner" })).toBe("Corner");
    expect(shortTitle({ committed_action_text: "A — B", saved_item_title: null })).toBe("A");
  });
});

describe("rankSlots", () => {
  const mk = (id: string, enjeu: number | null, jours: number, nature: "memoire" | "decision" = "memoire") =>
    ({ nature, kind: "bilan" as const, key: "k", date: TODAY, objet_id: id, score: (enjeu ?? 0) * jours, enjeu_eur: enjeu, anciennete_jours: jours, text: id, sub: "", cta: "", href: "" });
  it("score décroissant ; sans chiffre → dernier, le plus ancien d'abord", () => {
    // Natures mêlées : la garde « jamais trois de la même nature » ne joue pas ici, seul l'ordre est testé.
    const out = rankSlots([mk("a", 100, 2), mk("b", null, 40, "decision"), mk("c", 50, 10), mk("d", null, 60, "decision")], 4);
    expect(out.map((c) => c.objet_id)).toEqual(["c", "a", "d", "b"]);
  });
  it("trois cartes au plus, jamais trois de la même nature", () => {
    const out = rankSlots([mk("a", 100, 9), mk("b", 100, 8), mk("c", 100, 7), mk("d", 1, 1, "decision")]);
    expect(out.map((c) => c.objet_id)).toEqual(["a", "b", "d"]);
  });
  it("aucun candidat → aucune carte, jamais de remplissage", () => {
    expect(rankSlots([])).toEqual([]);
  });
});
