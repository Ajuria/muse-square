// src/lib/commitments/journalEngagements.test.ts — la composition du journal pour l'agent.
// Ce que ces cas gardent : les chiffres ne se disent pas DEUX fois (une carte ou un conseil les porte
// déjà), l'absence garde la phrase en production depuis le 27/08, et les deux gestes ne coexistent jamais
// — la contre-indication prime sur le rejeu (règle J2.3, owner 27/08).
import { describe, expect, it } from "vitest";
import { composeJournalEngagements, journalToText, JOURNAL_ABSENCE_FR, type JournalSource, type JournalJour } from "./journalEngagements";

const source = (over: Partial<JournalSource> = {}, data: Partial<JournalSource["data"]> = {}): JournalSource => ({
  found: true,
  facts: [{ fact_fr: "3 engagements jugés : 2 atteints, 1 manqué." }, { fact_fr: "Corner de vente producteur : objectif atteint, +612 €." }],
  sources: ["Vos engagements"],
  data: { advice: [], advice_texts: [], card_fact_texts: [], pole_cards: [], dated_cards: [], adjust_commitment_id: null, ...data },
  ...over,
});
const jour = (over: Partial<JournalJour> = {}): JournalJour => ({
  date: "2026-09-20", direction: "positive", say_fr: "Samedi 20/09 : les conditions du Corner de vente producteur se reforment.", prefill: { committed_action_text: "Corner" }, ...over,
});
const types = (j: ReturnType<typeof composeJournalEngagements>) => j.blocks.map((b) => b.type);

describe("le journal sans matière", () => {
  it("rend l'absence avec la phrase en production, et le geste qui la débloque", () => {
    const j = composeJournalEngagements({ source: source({ found: false }), jours: [] });
    expect(j.found).toBe(false);
    expect(j.blocks).toEqual([{ type: "absence", manque: JOURNAL_ABSENCE_FR, geste: { label_fr: "Vos opérations", url: "/app/insightevent/evenement" } }]);
    expect(journalToText(j)).toBe(JOURNAL_ABSENCE_FR);
    expect(JOURNAL_ABSENCE_FR).toContain("dates de l'opération");     // « fenêtre » est banni pour la période mesurée
  });
});

describe("le journal avec matière", () => {
  it("les faits passent en prose, les sources suivent, et le modèle reçoit une ligne par fait", () => {
    const j = composeJournalEngagements({ source: source(), jours: [] });
    expect(j.found).toBe(true);
    expect(types(j)).toEqual(["facts", "sources"]);
    expect(j.facts).toHaveLength(2);
    expect(journalToText(j)).toContain("• 3 engagements jugés");
  });

  it("un fait DÉJÀ dit par une carte ou par le conseil ne se redit pas en prose", () => {
    const j = composeJournalEngagements({
      source: source({}, {
        card_fact_texts: ["Corner de vente producteur : objectif atteint, +612 €."],
        advice: ["arrêter « Vitrine froide »"], advice_texts: ["3 engagements jugés : 2 atteints, 1 manqué."],
        pole_cards: [{ nom: "Cuisine" }],
      }),
      jours: [],
    });
    const proses = j.blocks.filter((b) => b.type === "facts") as Array<{ items: string[] }>;
    expect(proses.flatMap((b) => b.items)).toEqual(["Action conseillée : arrêter « Vitrine froide »."]);
  });

  it("des pôles répondent : le titre devient « Vos dispositifs » et leurs cartes viennent en tête", () => {
    const j = composeJournalEngagements({ source: source({}, { pole_cards: [{ nom: "Cuisine" }, { nom: "Cave" }] }), jours: [] });
    expect(j.titre).toBe("Vos dispositifs");
    expect(types(j).slice(0, 2)).toEqual(["headline", "datecards"]);
    expect((j.blocks[0] as any).text).toBe("Vos pôles");
    expect((j.blocks[1] as any).items).toHaveLength(2);
  });

  it("sans pôle, le titre reste « Vos engagements » ; les opérations datées ont leur propre section", () => {
    const j = composeJournalEngagements({ source: source({}, { dated_cards: [{ nom: "Corner" }] }), jours: [] });
    expect(j.titre).toBe("Vos engagements");
    expect((j.blocks[0] as any).text).toBe("Vos opérations datées");
  });

  it("les jours à venir font leur section, plafonnée à trois", () => {
    const j = composeJournalEngagements({
      source: source(),
      jours: [jour({ date: "2026-09-20" }), jour({ date: "2026-09-21" }), jour({ date: "2026-09-22" }), jour({ date: "2026-09-23" })],
    });
    const i = j.blocks.findIndex((b) => b.type === "headline" && (b as any).text === "Vos jours à venir");
    expect(i).toBeGreaterThan(-1);
    expect((j.blocks[i + 1] as any).items).toHaveLength(3);
    expect(j.facts.filter((f) => f.includes("se reforment"))).toHaveLength(3);
  });
});

describe("le geste — jamais les deux à la fois, et la contre-indication prime", () => {
  it("un dispositif à ajuster : « Ajuster » vers sa page, et AUCUN rejeu", () => {
    const j = composeJournalEngagements({ source: source({}, { adjust_commitment_id: "c-9" }), jours: [jour()] });
    const ctas = j.blocks.filter((b) => b.type === "cta") as any[];
    expect(ctas).toHaveLength(1);
    expect(ctas[0]).toMatchObject({ label: "Ajuster", url: "/app/insightevent/engagement?id=c-9" });
    expect(ctas[0].prefill).toBeUndefined();
  });

  it("rien à ajuster mais un jour prouvé qui revient : « M'engager » pré-rempli, avec sa date", () => {
    const j = composeJournalEngagements({ source: source(), jours: [jour()] });
    const cta = j.blocks.find((b) => b.type === "cta") as any;
    expect(cta).toMatchObject({ label: "M'engager", prefill: { committed_action_text: "Corner" } });
    expect(cta.origin).toEqual({ origin_action_type: "chat_journal_replay", origin_affected_date: "2026-09-20" });
  });

  it("un jour NÉGATIF ne propose jamais de rejeu, et un jour sans pré-remplissage non plus", () => {
    expect(composeJournalEngagements({ source: source(), jours: [jour({ direction: "negative" })] }).blocks.some((b) => b.type === "cta")).toBe(false);
    expect(composeJournalEngagements({ source: source(), jours: [jour({ prefill: null })] }).blocks.some((b) => b.type === "cta")).toBe(false);
  });

  it("aucun jour, rien à ajuster : aucun geste inventé", () => {
    expect(composeJournalEngagements({ source: source(), jours: [] }).blocks.some((b) => b.type === "cta")).toBe(false);
  });
});
