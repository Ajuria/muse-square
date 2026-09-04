// @vitest-environment happy-dom
// Journal pôles (proto v2, owner 27/08) — le producteur deterministic_engagements_v1 avec des
// cartes serveur (pole_cards / dated_cards) rend : titre, section pôles en datecards (pill =
// résultats, infobulle Données insuffisantes), section opérations datées (carte ambre + prose),
// CTA Ajuster. Vérifié via les VRAIS card-kit.js + ie-prompt.js (le harnais est la page).
import { describe, it, expect, beforeAll } from "vitest";
import { bootOnce, THREAD_KEY } from "./explorerTestKit";

const OUT_POLES = {
  ok: true,
  meta: { producer: "deterministic_engagements_v1", register: "vetted" },
  ai: {
    headline: "Vos dispositifs", verdict: "",
    answer: "Dispositif « Vacances scolaires » — version 2 en cours, du 27/08/2026 au 02/09/2026.",
    key_facts: [], reasons: [], caveats: [],
    output: {
      headline: "Vos dispositifs", verdict: "",
      answer: "Dispositif « Vacances scolaires » — version 2 en cours, du 27/08/2026 au 02/09/2026.",
      key_facts: [], reasons: [], caveats: [],
      pole_section_title: "Vos pôles", dated_section_title: "Vos opérations datées",
      pole_cards: [
        { label: "Pôle périssables",
          pill: "24 965 € sur 30 j · 51,1 % du CA · +53 % vs les 90 jours précédents",
          rows: [{ k: "Familles", v: "Coffee +53,5 % · Bakery +51,3 %" }, { k: "Responsable(s)", v: "Camille Robin" }] },
        { label: "Pôle traiteur", pill: "Données insuffisantes ⓘ",
          tip: "3 jours vendus sur les 30 derniers — la comparaison demande au moins 5 jours vendus de chaque côté.",
          rows: [{ k: "Familles", v: "Traiteur" }] },
      ],
      dated_cards: [
        { label: "Corner de vente producteur", tone: "amber",
          pill: "Version 3 en cours (pivoter) — verdict d'ici le 27/08/2026",
          rows: [{ k: "Historique", v: "2 tests sur le CA famille : −50,2 % et −78,3 % (effet prouvé)." }] },
      ],
    },
  },
  actions: { primary: { type: "redirect", url: "/app/insightevent/engagement?id=x", label: "Ajuster" } },
  decision_payload: { used_dates: [] },
};

beforeAll(async () => {
  sessionStorage.setItem(THREAD_KEY, JSON.stringify([{ q: "mes pôles", out: OUT_POLES, t: Date.now() - 60000 }]));
  await bootOnce([]);
});

describe("journal pôles — blocs rendus par le vrai adaptateur", () => {
  it("les cartes de pôle rendent avec leurs résultats, l'infobulle, l'ambre et le CTA", () => {
    const html = document.getElementById("ie-thread")!.innerHTML;
    expect(html).toContain("Vos dispositifs");
    expect(html).toContain("Vos pôles");
    expect(html).toContain("Pôle périssables");
    expect(html).toMatch(/24[\s  ]965 € sur 30 j · 51,1 % du CA/);
    expect(html).toContain("Données insuffisantes");
    expect(html).toContain('title="3 jours vendus sur les 30 derniers');
    expect(html).toContain("Vos opérations datées");
    expect(html).toContain("Corner de vente producteur");
    expect(html).toContain("#BA7517"); // rail ambre (datecards tone amber)
    expect(html).toContain("Vacances scolaires"); // la prose garde le daté non-carte
    expect(html).toContain("Ajuster");
  });
  it("la prose ne redit PAS les chiffres des cartes (pas de double vérité)", () => {
    const html = document.getElementById("ie-thread")!.innerHTML;
    const occurrences = html.split("51,1 % du CA").length - 1;
    expect(occurrences).toBe(1);
  });
});
