// @vitest-environment happy-dom
// Suite CLIENT — J1.6 : état « Consulté le JJ/MM » des suggestions (serveur, action_log).
// (1) une marque existante rend la mention sur SA carte au chargement — indication positive,
// la carte garde son encre ; (2) un clic écrit la marque (POST user × item × date) et l'affiche.

import { it, expect, beforeAll } from "vitest";
import { ACTION_LOG, bootOnce, slotCards } from "./explorerTestKit";

// La clé du slot rapport est ancrée au 1er du mois précédent — calculée comme le fait le code.
const lastMonth = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1);
const reportDate = lastMonth.getFullYear() + "-" + String(lastMonth.getMonth() + 1).padStart(2, "0") + "-01";

beforeAll(async () => {
  ACTION_LOG.marks = [{ key: "explorer_sugg_report", date: reportDate, consulted_ymd: "2026-08-20" }];
  await bootOnce([
    { date: "2026-08-07", daily_revenue: 1169, revenue_robust_z: -2.6, revenue_vs_30d_avg_pct: -24, alert_level_max: 0 },
  ]);
});

it("une marque serveur rend « Consulté le JJ/MM » sur sa carte, et seulement la sienne", () => {
  const cards = slotCards();
  expect(cards.length).toBe(2);
  const report = cards.find((c) => (c.getAttribute("data-sugg-key") || "") === "explorer_sugg_report")!;
  expect(report).toBeTruthy();
  expect(report.getAttribute("data-sugg-date")).toBe(reportDate);
  expect(report.querySelector(".ie-sugg-consulted")?.textContent).toContain("Consulté le 20/08");
  const anomaly = cards.find((c) => (c.getAttribute("data-sugg-key") || "") === "explorer_sugg_anomaly")!;
  expect(anomaly.querySelector(".ie-sugg-consulted")).toBeNull();
});

it("un clic écrit la marque (user × item × date) et l'affiche sans re-chargement", () => {
  const anomaly = slotCards().find((c) => (c.getAttribute("data-sugg-key") || "") === "explorer_sugg_anomaly")!;
  (anomaly as HTMLElement).click();
  const post = ACTION_LOG.posts.find((p) => p && p.change_subtype === "explorer_sugg_anomaly");
  expect(post).toBeTruthy();
  expect(post.event).toBe("explorer_consulted");
  expect(post.affected_date).toBe("2026-08-07");
  expect(typeof post.location_id).toBe("string");
  expect(anomaly.querySelector(".ie-sugg-consulted")?.textContent).toMatch(/Consulté le \d{2}\/\d{2}/);
});
