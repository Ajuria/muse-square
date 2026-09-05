// @vitest-environment happy-dom
// 04/09 (retour owner : « qui est Jésus ? » → pas de résultat ; rejeu : le verdict du renvoi rapport jamais
// affiché) — les DIALOGUES SYSTÈME passent le VRAI adaptateur (`__ieBlocksFromResponse`) : headline +
// prose visibles, aucune pilule de registre. La branche DAY_DIMENSION_DETAIL avalait la prose d'un
// paragraphe. Mutation vue rouge : retirer la branche report_nav → la prose disparaît.
import { describe, it, expect, beforeAll } from "vitest";
import { bootOnce } from "./explorerTestKit";

const env = (producer: string, headline: string, answer: string, extra: Record<string, any> = {}) => ({
  ok: true,
  meta: { location_id: "f10c3e58-326e-4e38-947c-d59fcbe51df5", resolved_horizon: "day", resolved_intent: "DAY_DIMENSION_DETAIL", producer, register: null, mode: "planning" },
  ai: { ok: true, mode: producer, output: { headline, answer, key_facts: [], reasons: [], caveats: [] } },
  actions: extra.actions ?? {}, top_dates: [], decision_payload: { used_dates: [] },
});

beforeAll(async () => { await bootOnce([]); });

const types = (blocks: any[]) => blocks.map((b) => b.type);

describe("dialogues système — headline + prose rendus, sans pilule", () => {
  it("hors périmètre (I1) : la phrase option A est un bloc prose", () => {
    const out = env("deterministic_hors_perimetre_v1", "Aucune donnée pour cette question",
      "Je réponds sur vos ventes par jour, vos familles de produits (Coffee, Tea, Bakery…), vos pôles, vos opérations et vos suivis. Rien ici ne répond à « qui est Jésus ? ». Par exemple : « Pourquoi le 02/09 ? »");
    const blocks = (window as any).__ieBlocksFromResponse(out);
    expect(types(blocks)).toEqual(["headline", "prose"]);
    expect(blocks[1].md).toContain("Rien ici ne répond à « qui est Jésus ? »");
    expect(blocks.some((b: any) => b.type === "register")).toBe(false);
  });
  it("renvoi rapport : le verdict chiffré est un bloc prose, puis le CTA", () => {
    const out = env("deterministic_report_nav_v1", "Rapport de ventes",
      "Vous avez fait 12 574 €, +0,7 % vs période précédente. Votre meilleure journée a été le jeudi 27/08/2026, avec 2 243 €. Période : du 24/08/2026 au 30/08/2026 — le document complet, imprimable et partageable.",
      { actions: { primary: { type: "redirect", url: "/app/insightevent/rapport?start=2026-08-24&end=2026-08-30", label: "Générer le rapport pour cette période →" } } });
    const blocks = (window as any).__ieBlocksFromResponse(out);
    expect(types(blocks)).toEqual(["headline", "prose", "cta"]);
    expect(blocks[1].md).toContain("12 574 €");
    expect(blocks[2].label).toBe("Générer le rapport pour cette période →");
  });
});
