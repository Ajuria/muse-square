// Le guichet de la mémoire — pur (spec docs/explorer-etat-vide-spec.md § 3, § 6). Lignes calquées sur
// f10c3e58 au 07/09 : le Dispositif vacances scolaires (resolved, +904 € sur 7 j, sans bilan), le
// Corner du 08/08 (resolved missed, −394 €). Chaque assertion vue tomber par mutation (score, tri,
// garde « jamais trois de la même nature », libellés).
import { describe, it, expect } from "vitest";
import { commitmentCandidates, dayNoteCandidates, decisionCandidates, occurrenceCandidates, alertCandidates, rankSlots, shortTitle, markId, verdictFr, type CommitmentSlotRow, type DayNoteSlotRow, type OccurrenceSlotRow, type AlertSlotRow } from "./explorerSlots";

const TODAY = "2026-09-07";
// toLocaleString("fr-FR") écrit les milliers en U+202F : on compare sur l'espace simple.
const plain = (s: string) => s.replace(/[\u202f\u00a0]/g, " ");
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
    expect(plain(c.text)).toBe("Dispositif vacances scolaires centré sur les retraités : objectif atteint, +904 € sur 7 jours");
    expect(c.sub).toBe("Atteint — ce qui a porté le résultat, la mesure ne le dit pas : votre bilan le garde pour la prochaine fois.");
    expect(c.cta).toBe("Bilan →");
    expect(c.href).toBe("/app/insightevent/engagement?id=c2");
    expect(c.date).toBe("2026-09-02");
    expect(c.anciennete_jours).toBe(5);
    expect(c.enjeu_eur).toBe(904);
    expect(c.score).toBe(904 * 5);
  });
  it("objectif manqué, écart négatif, un jour : le Corner du 08/08", () => {
    const [c] = commitmentCandidates([{ ...base, commitment_id: "c1", verdict: "missed", saved_item_title: "Corner de vente producteur", window_start: "2026-08-08", window_end: "2026-08-08", window_days_expected: 1, window_expected_revenue: 2263, window_actual_revenue: 1869.15, resolved_at: "2026-08-28" }], TODAY);
    expect(plain(c.text)).toBe("Corner de vente producteur : objectif manqué, −394 € sur 1 jour");
    expect(c.sub).toBe("Manqué — ce qui n'a pas marché et ce que vous changeriez, la mesure ne le dit pas : votre bilan le garde pour le prochain « Corner de vente producteur ».");
    expect(c.anciennete_jours).toBe(10);
  });
  it("owner 07/09 : le verdict dit son objectif — « objectif de +20 % manqué, +904 € sur 7 jours » (le Dispositif vacances scolaires)", () => {
    const r: CommitmentSlotRow = { ...base, verdict: "missed", threshold_basis: "pct", threshold_value: 20, window_expected_revenue: 10421, window_actual_revenue: 11324.85 };
    expect(plain(commitmentCandidates([r], TODAY)[0].text)).toBe("Dispositif vacances scolaires centré sur les retraités : objectif de +20 % manqué, +904 € sur 7 jours");
    // L'objectif nomme son KPI : CA sans le dire ; famille en toutes lettres (owner 27/08) ; KPI sans mot → verdict nu.
    expect(verdictFr({ verdict: "missed", threshold_basis: "pct", threshold_value: 11, action_done_status: null, measured_metric: "family_revenue", saved_item_family: "Coffee" })).toBe("objectif de +11 % de CA de la famille « Coffee » manqué");
    expect(verdictFr({ verdict: "met", threshold_basis: "pct", threshold_value: 11, action_done_status: null, measured_metric: "family_revenue", saved_item_family: null })).toBe("objectif atteint");
    expect(verdictFr({ verdict: "met", threshold_basis: "pct", threshold_value: 11, action_done_status: null, measured_metric: "transactions" })).toBe("objectif atteint");
    expect(verdictFr({ verdict: "met", threshold_basis: "z", threshold_value: 1.5, action_done_status: null })).toBe("objectif atteint");
  });
  it("owner 07/09 : une action déclarée non menée remplace le verdict — « action non menée, +904 € sur 7 jours »", () => {
    const r: CommitmentSlotRow = { ...base, verdict: "missed", threshold_basis: "pct", threshold_value: 20, action_done_status: "pas_encore", window_expected_revenue: 10421, window_actual_revenue: 11324.85 };
    expect(plain(commitmentCandidates([r], TODAY)[0].text)).toBe("Dispositif vacances scolaires centré sur les retraités : action non menée, +904 € sur 7 jours");
    expect(commitmentCandidates([r], TODAY)[0].sub).toMatch(/^Non menée — pourquoi, et si c'est à reproduire, la mesure ne le dit pas/);
    const [d] = decisionCandidates([{ ...r, resolved_at: "2026-09-04", has_child: 0 }], TODAY);
    expect(d.text).toContain("action non menée");
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

describe("dayNoteCandidates (E3)", () => {
  // f10c3e58 au 07/09 : mardi 01/09, 1 603 € réalisés pour 920 attendus, residual_z 2,35, +74 %.
  const day: DayNoteSlotRow = { date: "2026-09-01", daily_revenue: 1603, expected_revenue: 920, residual_z: 2.35, residual_pct: 74.2 };
  it("jour inexpliqué sans note → carte note : le fait du jour, la forme owner, « Enregistrer », score = |écart| × jours", () => {
    const [c] = dayNoteCandidates([day], TODAY);
    expect(c.kind).toBe("note");
    expect(c.nature).toBe("memoire");
    expect(c.key).toBe("explorer_slot_note");
    expect(c.date).toBe("2026-09-01");
    expect(plain(c.text)).toBe("Mardi 01/09 : 1 603 €, +74 % vs votre CA habituel");
    expect(c.sub).toBe("Un souvenir ? Notez-le · sinon, laissez");
    expect(c.cta).toBe("Enregistrer");
    expect(c.href).toBe("");
    expect(c.anciennete_jours).toBe(6);
    expect(c.enjeu_eur).toBe(683);
    expect(c.score).toBe(683 * 6);
  });
  it("un jour sous le seuil, un jour d'aujourd'hui ou sans mesure → aucune carte", () => {
    expect(dayNoteCandidates([{ ...day, residual_z: 1.9 }, { ...day, date: TODAY }, { ...day, expected_revenue: null }], TODAY)).toEqual([]);
  });
  it("un jour en baisse : le signe suit", () => {
    const [c] = dayNoteCandidates([{ ...day, date: "2026-08-08", daily_revenue: 1869, expected_revenue: 2151, residual_z: -2.1, residual_pct: -13.1 }], TODAY);
    expect(plain(c.text)).toBe("Samedi 08/08 : 1 869 €, −13 % vs votre CA habituel");
    expect(c.enjeu_eur).toBe(282);
  });
  // Forme MEMBRE (owner 08/09 : « x, y and z "ventes" ») — f10c3e58 au 08/09 : mardi 01/09, 350 tickets pour 198 attendus, z ventes 2,68.
  const dayVol: DayNoteSlotRow = { ...day, tickets: 350, expected_transactions: 198, transactions_residual_z: 2.68 };
  it("unité « ventes » : le même gabarit, le compte de ventes à la place du CA, l'écart en % dans la couche volume", () => {
    const [c] = dayNoteCandidates([dayVol], TODAY, "ventes");
    expect(plain(c.text)).toBe("Mardi 01/09 : 350 ventes, +77 % vs vos ventes habituelles");
    expect(c.text).not.toMatch(/€/);
    expect(c.kind).toBe("note"); expect(c.sub).toBe("Un souvenir ? Notez-le · sinon, laissez"); expect(c.cta).toBe("Enregistrer");
    expect(c.enjeu_eur).toBe(683);
  });
  it("unité « ventes » : le seuil se lit dans SA couche — un jour inexpliqué en CA mais pas en ventes ne sort pas, et inversement", () => {
    expect(dayNoteCandidates([{ ...dayVol, transactions_residual_z: 1.9 }], TODAY, "ventes")).toEqual([]);
    expect(dayNoteCandidates([{ ...dayVol, tickets: null }], TODAY, "ventes")).toEqual([]);
    const [c] = dayNoteCandidates([{ ...dayVol, residual_z: 0.4, residual_pct: 3 }], TODAY, "ventes");
    expect(plain(c.text)).toBe("Mardi 01/09 : 350 ventes, +77 % vs vos ventes habituelles");
    expect(dayNoteCandidates([{ ...dayVol, residual_z: 0.4, residual_pct: 3 }], TODAY, "eur")).toEqual([]);
  });
  it("unité « eur » par défaut : la forme owner ne bouge pas quand la couche volume est présente", () => {
    const [c] = dayNoteCandidates([dayVol], TODAY);
    expect(plain(c.text)).toBe("Mardi 01/09 : 1 603 €, +74 % vs votre CA habituel");
  });
});

describe("decisionCandidates (E2 — mots du lexique et de la page de l'engagement)", () => {
  // f10c3e58 au 07/09 : le Corner du 08/08 (missed, −394 €, résolu le 28/08, sans geste ni version suivante).
  const missed: CommitmentSlotRow = { ...base, commitment_id: "c1", verdict: "missed", saved_item_title: "Corner de vente producteur", window_start: "2026-08-08", window_end: "2026-08-08", window_days_expected: 1, window_expected_revenue: 2263, window_actual_revenue: 1869.15, resolved_at: "2026-08-28", adjustment_move: null, has_child: 0 };
  it("verdict manqué sans geste ni suite → à ajuster : « Ajuster », la ligne de la page de l'engagement", () => {
    const [c] = decisionCandidates([missed], TODAY);
    expect(c.nature).toBe("decision"); expect(c.kind).toBe("ajuster"); expect(c.key).toBe("explorer_slot_ajuster");
    expect(plain(c.text)).toBe("Corner de vente producteur : objectif manqué, −394 € sur 1 jour");
    expect(c.sub).toBe("Choisissez votre prochaine action : Poursuivre · Doubler la mise · Pivoter");
    expect(c.cta).toBe("Ajuster");
    expect(c.href).toBe("/app/insightevent/engagement?id=c1");
    expect(c.anciennete_jours).toBe(10); expect(c.enjeu_eur).toBeCloseTo(393.85, 1);
  });
  it("verdict atteint sans suite → à reconduire : « Répliquer », la phrase du fil Agir", () => {
    const [c] = decisionCandidates([{ ...missed, verdict: "met", window_expected_revenue: 925, window_actual_revenue: 1537, resolved_at: "2026-09-06" }], TODAY);
    expect(c.kind).toBe("reconduire"); expect(c.cta).toBe("Répliquer");
    expect(c.sub).toBe("Garder ce qui a marché — et le reconduire");
    expect(plain(c.text)).toBe("Corner de vente producteur : objectif atteint, +612 € sur 1 jour");
  });
  it("un geste choisi, une version suivante, plus de 14 jours, non concluant → aucune carte", () => {
    expect(decisionCandidates([
      { ...missed, adjustment_move: "pivoter" },
      { ...missed, commitment_id: "x", has_child: 1 },
      { ...missed, commitment_id: "y", resolved_at: "2026-08-20" },
      { ...missed, commitment_id: "z", verdict: "confounded" },
    ], TODAY)).toEqual([]);
  });
});

describe("occurrenceCandidates (E2 — Préparer)", () => {
  const occ: OccurrenceSlotRow = { saved_item_id: "i1", date: "2026-09-12", title: "Corner de vente producteur", consigne_enabled: false, engagements_lies: 0, kpi_target_eur: 150, ca_moyen_passe: 1694 };
  it("occurrence sous 7 jours sans consigne ni engagement → « Préparer — <titre> », « <jour> — sans action », « Préparer → »", () => {
    const [c] = occurrenceCandidates([occ], TODAY);
    expect(c.nature).toBe("decision"); expect(c.kind).toBe("preparer");
    expect(c.text).toBe("Préparer — Corner de vente producteur");
    expect(c.sub).toBe("Samedi 12/09 — sans action");
    expect(c.cta).toBe("Préparer →");
    expect(c.href).toBe("/app/insightevent/evenement?saved_item_id=i1");
    expect(c.enjeu_eur).toBe(150); expect(c.anciennete_jours).toBe(3); expect(c.score).toBe(450);
  });
  it("sans cible € → le CA moyen des occurrences passées ; consigne ou engagement lié, ou plus de 7 jours → aucune carte", () => {
    expect(occurrenceCandidates([{ ...occ, kpi_target_eur: null }], TODAY)[0].enjeu_eur).toBe(1694);
    expect(occurrenceCandidates([{ ...occ, consigne_enabled: true }, { ...occ, engagements_lies: 1 }, { ...occ, date: "2026-09-20" }], TODAY)).toEqual([]);
  });
});

describe("alertCandidates (E4 — la ligne du fil Agir)", () => {
  const al: AlertSlotRow = { competitor_alert_id: "a1", competitor_id: "k1", competitor_name: "Musée de l'Orangerie", change_subtype: "proximity", alert_level: 2, event_label: "Chefs-d'œuvre, de Monet à Picasso", affected_date: "2026-09-12", distance_m: 4212.39, entity_threat_score: 0.4894, created_at: "2026-09-07" };
  it("l'alerte du niveau maximal, non consultée → « <Concurrent> — <événement>, à 4,2 km. », « Menace : Proximité géographique », « Consulter → »", () => {
    const [c] = alertCandidates([al, { ...al, competitor_alert_id: "a0", alert_level: 1 }], TODAY);
    expect(alertCandidates([al, { ...al, competitor_alert_id: "a0", alert_level: 1 }], TODAY)).toHaveLength(1);
    expect(c.nature).toBe("decision"); expect(c.kind).toBe("alerte"); expect(c.key).toBe("explorer_slot_alerte:a1");
    expect(c.text).toBe("Musée de l'Orangerie — Chefs-d'œuvre, de Monet à Picasso, à 4,2 km.");
    expect(c.sub).toBe("Menace : Proximité géographique");
    expect(c.cta).toBe("Consulter →");
    expect(c.href).toBe("/app/insightevent/competitor?id=k1");
    expect(c.enjeu_eur).toBeNull(); expect(c.score).toBe(0.4894);
  });
  it("une alerte consultée est traitée : elle ne revient pas", () => {
    expect(alertCandidates([al], TODAY, new Set([markId("explorer_slot_alerte:a1", "2026-09-12")]))).toEqual([]);
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
  it("un objet = une carte : le bilan d'un engagement passe avant sa décision (même score, mémoire d'abord)", () => {
    const bilan = { ...mk("c1", 394, 10), key: "explorer_slot_bilan" };
    const ajuster = { ...mk("c1", 394, 10, "decision"), kind: "ajuster" as const, key: "explorer_slot_ajuster" };
    expect(rankSlots([bilan, ajuster, mk("b", 10, 1)]).map((c) => c.key)).toEqual(["explorer_slot_bilan", "k"]);
  });
  it("sans chiffre : le score de menace classe, puis l'ancienneté", () => {
    const a = { ...mk("a", null, 1, "decision"), score: 0.9 }, b = { ...mk("b", null, 5, "decision"), score: 0.4 };
    expect(rankSlots([b, a]).map((c) => c.objet_id)).toEqual(["a", "b"]);
  });
  it("aucun candidat → aucune carte, jamais de remplissage", () => {
    expect(rankSlots([])).toEqual([]);
  });
  it("E5 : une carte consultée sans réponse redescend derrière les autres, et sort du top 3 s'il y a mieux", () => {
    const a = { ...mk("a", 100, 9), key: "explorer_slot_bilan", date: "2026-08-28" };
    const marks = new Set([markId("explorer_slot_bilan", "2026-08-28")]);
    expect(rankSlots([a, mk("b", 50, 8), mk("c", 1, 1, "decision")], 3, marks).map((c) => c.objet_id)).toEqual(["b", "c", "a"]);
    expect(rankSlots([a, mk("b", 50, 8), mk("c", 40, 7), mk("d", 1, 1, "decision")], 3, marks).map((c) => c.objet_id)).toEqual(["b", "c", "d"]);
    // une autre date de la même clé n'est pas la même marque
    expect(rankSlots([{ ...a, date: "2026-08-29" }, mk("b", 50, 8)], 3, marks).map((c) => c.objet_id)).toEqual(["a", "b"]);
  });
});

describe("13/09 — retour owner 12/09 : deux référentiels dits, et la ponctuation du titre", () => {
  it("l'objectif sur une famille : l'écart en euros est celui du lieu, dit « votre lieu » (le Corner, +39 € du lieu, objectif Branded manqué)", () => {
    const r: CommitmentSlotRow = { ...base, verdict: "missed", threshold_basis: "pct", threshold_value: 11, measured_metric: "family_revenue", saved_item_family: "Branded", saved_item_title: "Corner de vente producteur", window_expected_revenue: 1000, window_actual_revenue: 1039, window_days_expected: 1 };
    expect(plain(commitmentCandidates([r], TODAY)[0].text)).toBe("Corner de vente producteur : objectif de +11 % de CA de la famille « Branded » manqué · votre lieu +39 € sur 1 jour");
  });
  it("la tête d'un texte d'engagement qui finit par un point ne met pas ce point avant les deux-points", () => {
    expect(shortTitle({ committed_action_text: "Tenir la vitrine sans casser vos prix. — le détail", saved_item_title: null })).toBe("Tenir la vitrine sans casser vos prix");
    const r: CommitmentSlotRow = { ...base, saved_item_title: null, committed_action_text: "Tenir la vitrine sans casser vos prix. — le détail" };
    expect(plain(commitmentCandidates([r], TODAY)[0].text)).toMatch(/^Tenir la vitrine sans casser vos prix : objectif atteint/);
  });
});
