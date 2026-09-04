// @vitest-environment happy-dom
// Suite CLIENT 3/3 — état vide A : anomalie du dernier jour mesuré (|z| ≥ 2) → carte contextuelle
// CHIFFRÉE (données du compte, chiffre d'abord) + question éprouvée par la batterie.

import { it, expect, beforeAll } from "vitest";
import { bootOnce, slotCards } from "./explorerTestKit";

beforeAll(async () => {
  await bootOnce([
    { date: "2026-08-07", daily_revenue: 1169, revenue_robust_z: -2.6, revenue_vs_30d_avg_pct: -24, alert_level_max: 0 },
    { date: "2099-01-02", alert_level_max: 2, temperature_2m_max: 34 },   // l'anomalie PRIME l'alerte
  ]);
});

it("état vide A → carte anomalie d'abord (prime l'alerte météo), sous-titre chiffré, question éprouvée", () => {
  const cards = slotCards();
  expect(cards.length).toBe(2);
  expect(cards[0].textContent).toContain("décroché");
  expect(cards[0].textContent).toMatch(/1\s*169\s*€/);   // frInt fr-FR → espace fine insécable
  expect(cards[0].textContent).toContain("−24 %");
  expect(cards[0].getAttribute("data-dynamic-q")).toBe("Pourquoi le 07/08 ?");
  expect(cards[1].getAttribute("data-dynamic-q")).toMatch(/^Génère le rapport de /);
});
