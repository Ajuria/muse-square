// @vitest-environment happy-dom
// Suite CLIENT 2/3 — expiration 1 h du fil + alerte météo sans carte (état B retiré). Fichier dédié : l'expiration
// se joue AU chargement du module (un seul eval par fichier — voir explorerTestKit).

import { it, expect, beforeAll } from "vitest";
import { bootOnce, slotCards, OUT, THREAD_KEY } from "./explorerTestKit";

beforeAll(async () => {
  sessionStorage.setItem(THREAD_KEY, JSON.stringify([{ q: "Q", out: OUT, t: Date.now() - 7200000 }]));
  await bootOnce([{ date: "2099-01-02", alert_level_max: 2, temperature_2m_max: 34 }]);
});

it("échange PÉRIMÉ (> 1 h) → pas de restauration, store purgé", () => {
  expect(document.getElementById("ie-thread")!.children.length).toBe(0);
  expect(sessionStorage.getItem(THREAD_KEY)).toBeNull();
});

// 07/09 (d4fbf73c, E0 owner validé — docs/explorer-etat-vide-spec.md § E0) : les états météo B/C sont
// retirés. Une alerte chaleur sans anomalie ni carte serveur ne produit AUCUNE carte : jamais de remplissage.
it("alerte météo sans anomalie ni carte serveur → aucune carte, aucun label (état B retiré)", () => {
  expect(slotCards().length).toBe(0);
  expect(document.body.textContent).not.toMatch(/chaleur|météo/);
  expect(document.getElementById("ie-prompt-actions-label")!.style.display).toBe("none");
});
