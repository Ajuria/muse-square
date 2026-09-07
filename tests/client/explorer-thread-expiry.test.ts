// @vitest-environment happy-dom
// Suite CLIENT 2/3 — expiration 1 h du fil + état vide B (alerte météo). Fichier dédié : l'expiration
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

it("état vide B (alerte météo, pas d'anomalie) → question effet-chaleur", () => {
  const cards = slotCards();
  expect(cards.length).toBe(2);
  expect(cards[0].textContent).toContain("chaleur");
  expect(cards[0].getAttribute("data-dynamic-q")).toBe("Quel est l’effet de la chaleur sur mes ventes ?");
});
