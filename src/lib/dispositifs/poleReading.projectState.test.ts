// « Pôle en projet » (owner 11/09) — l'état se déduit des familles du pôle face aux familles réelles du site.
import { expect, it } from "vitest";
import { poleProjectState, POLE_PROJECT_FR } from "./poleReading";

it("sans vente importée : Aucune vente importée", () => {
  expect(poleProjectState(["Thé", "Gâteaux"], [])).toBe("aucune_vente");
  expect(POLE_PROJECT_FR.aucune_vente).toBe("Pôle en projet — Aucune vente importée");
});
it("des ventes, aucune famille du pôle parmi elles : À rapprocher de la caisse", () => {
  expect(poleProjectState(["Vin & Spiritueux"], ["VINS", "SPIRITUEUX"])).toBe("a_rapprocher");
});
it("une famille du pôle vendue suffit : le pôle n'est plus en projet", () => {
  expect(poleProjectState(["Thé", "Gâteaux"], ["Thé", "Coffee"])).toBeNull();
});
