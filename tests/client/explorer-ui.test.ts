// @vitest-environment happy-dom
// Suite CLIENT 1/3 — fil frais restauré, « Nouvelle conversation », état vide C (repli), chips de
// provenance via le VRAI adaptateur. Un seul bootOnce (voir explorerTestKit — deux copies du module
// se disputent le DOM). États A/B + expiration : explorer-slots-anomaly / explorer-thread-expiry.

import { describe, it, expect, beforeAll } from "vitest";
import { bootOnce, slotCards, OUT, THREAD_KEY } from "./explorerTestKit";

beforeAll(async () => {
  sessionStorage.setItem(THREAD_KEY, JSON.stringify([{ q: "Pourquoi le 18/07 ?", out: OUT, t: Date.now() - 60000 }]));
  await bootOnce([]);   // aucun signal → le slot contextuel doit être l'ÉTAT C
});

describe("fil persistant (frais) + Nouvelle conversation", () => {
  it("échange < 1 h → restauré : 2 bulles, texte, chips, bouton visible", () => {
    const thread = document.getElementById("ie-thread")!;
    expect(thread.querySelectorAll(".ie-msg").length).toBe(2);
    expect(thread.textContent).toContain("1 150");
    expect(thread.textContent).toContain("Vos ventes");
    expect(document.getElementById("ie-new-thread-row")!.hasAttribute("hidden")).toBe(false);
  });

  it("chips de provenance : segments couvrants chipés, écho headline sauté (adaptateur réel)", () => {
    const blocks = (window as any).__ieBlocksFromResponse(OUT);
    const sourced = blocks.find((b: any) => b.type === "sourced");
    expect(sourced.segments.length).toBe(2);
    expect(sourced.segments[0].chips).toEqual(["Vos ventes"]);
    expect(sourced.segments[1].chips).toEqual(["Veille concurrence"]);
  });

  it("PROVFB : provenance non couvrante → repli byte-identique au rendu sans provenance", () => {
    const kit = (window as any).MSCardKit;
    const broken = JSON.parse(JSON.stringify(OUT));
    broken.ai.output.sentence_provenance = [{ text: "Phrase étrangère à la réponse.", fact_ids: ["f0"] }];
    const noProv = JSON.parse(JSON.stringify(OUT));
    delete noProv.ai.output.sentence_provenance;
    expect(kit.renderAnswerBlocks((window as any).__ieBlocksFromResponse(broken)))
      .toBe(kit.renderAnswerBlocks((window as any).__ieBlocksFromResponse(noProv)));
  });

  it("état vide C (aucun signal) → repli météo mesurable + rapport, jamais zéro carte", () => {
    const cards = slotCards();
    expect(cards.length).toBe(2);
    expect(cards[0].textContent).toContain("météo");
    expect(cards[1].getAttribute("data-dynamic-q")).toMatch(/^Génère le rapport de /);
  });

  it("« Nouvelle conversation » → fil vidé, état vide de retour, store purgé", async () => {
    (document.querySelector("[data-ie-new-thread]") as HTMLElement).click();
    await new Promise((r) => setTimeout(r, 20));
    const thread = document.getElementById("ie-thread")!;
    expect(thread.children.length).toBe(0);
    expect(thread.hasAttribute("hidden")).toBe(true);
    expect(document.getElementById("ie-prompt-empty")!.hasAttribute("hidden")).toBe(false);
    expect(sessionStorage.getItem(THREAD_KEY)).toBeNull();
  });
});
