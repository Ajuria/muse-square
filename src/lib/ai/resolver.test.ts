// I2 (03/09) — garde-fou 2bis du résolveur : LE CODE VALIDE LES DATES. L'appel modèle est mocké
// (une réponse canonique aux bornes FAUSSES) ; frPeriod doit reprendre la main. Mesuré 03/09 en
// vrai : Haiku lisait « la semaine dernière » comme les 7 derniers jours.
import { describe, it, expect, vi } from "vitest";

const CANNED = { current: "" };
vi.mock("./runtime/claude", () => ({
  callClaudeMessagesAPI: async () => ({ ok: true, rawText: CANNED.current }),
}));

import { resolveTurn } from "./resolver";

const site = { entities: [{ kind: "famille" as const, id: null, name: "Coffee", families: ["Coffee"] }] };
const TODAY = "2026-09-03"; // jeudi

describe("resolveTurn — frPeriod reprend les bornes du modèle quand il parse l'expression", () => {
  it("« la semaine dernière » : 7 derniers jours (modèle) → semaine civile 24/08→30/08 (code)", async () => {
    CANNED.current = JSON.stringify({
      intent: "entity_period", entites: [], kpi: null, suite: false, changements: ["periode"], confiance: "haute",
      periode: { start: "2026-08-27", end: "2026-09-02", expression: "la semaine dernière" }, periode_comparaison: null,
    });
    const r = await resolveTurn({ qRaw: "c'était comment la semaine dernière ?", site, today: TODAY, frame: null, history: [] });
    expect(r).not.toBeNull();
    expect(r!.periode).toEqual({ start: "2026-08-24", end: "2026-08-30", expression: "la semaine dernière" });
    expect(r!.periode_validee).toBe(true);
  });
  it("« hier » : un seul jour, la veille — même si le modèle a mis aujourd'hui", async () => {
    CANNED.current = JSON.stringify({
      intent: "entity_period", entites: [], kpi: null, suite: false, changements: [], confiance: "haute",
      periode: { start: "2026-09-03", end: "2026-09-03", expression: "hier" }, periode_comparaison: null,
    });
    const r = await resolveTurn({ qRaw: "combien j'ai vendu hier ?", site, today: TODAY, frame: null, history: [] });
    expect(r!.periode).toEqual({ start: "2026-09-02", end: "2026-09-02", expression: "hier" });
  });
  it("expression inconnue de frPeriod → les bornes du modèle restent, validée = false", async () => {
    CANNED.current = JSON.stringify({
      intent: "entity_period", entites: [], kpi: null, suite: false, changements: [], confiance: "haute",
      periode: { start: "2026-08-10", end: "2026-08-12", expression: "les trois jours de la foire" }, periode_comparaison: null,
    });
    const r = await resolveTurn({ qRaw: "x", site, today: TODAY, frame: null, history: [] });
    expect(r!.periode).toEqual({ start: "2026-08-10", end: "2026-08-12", expression: "les trois jours de la foire" });
    expect(r!.periode_validee).toBe(false);
  });
  it("intent plan : le biais est FUTUR (« septembre » demandé le 03/09 = ce mois-ci, pas 2025)", async () => {
    CANNED.current = JSON.stringify({
      intent: "plan", entites: [], kpi: null, suite: false, changements: [], confiance: "haute",
      periode: { start: "2025-09-01", end: "2025-09-30", expression: "septembre" }, periode_comparaison: null,
    });
    const r = await resolveTurn({ qRaw: "planifie-moi septembre", site, today: TODAY, frame: null, history: [] });
    expect(r!.periode!.start).toBe("2026-09-01");
    expect(r!.periode!.end).toBe("2026-09-30");
  });
});

describe("resolveTurn — I6, questions supplémentaires (mot pour mot, cap 3)", () => {
  it("le tableau du modèle est repris tel quel, vide sinon", async () => {
    CANNED.current = JSON.stringify({
      intent: "entity_period", entites: [], kpi: "basket", suite: false, changements: [], confiance: "haute",
      periode: { start: "2026-07-01", end: "2026-07-31", expression: "juillet" }, periode_comparaison: null,
      questions_supplementaires: ["quels sont mes meilleurs jours en septembre"],
    });
    const r = await resolveTurn({ qRaw: "x", site, today: TODAY, frame: null, history: [] });
    expect(r!.questions_supplementaires).toEqual(["quels sont mes meilleurs jours en septembre"]);
    CANNED.current = JSON.stringify({ intent: "journal", entites: [], kpi: null, suite: false, changements: [], confiance: "haute", periode: null, periode_comparaison: null });
    const r2 = await resolveTurn({ qRaw: "mes engagements", site, today: TODAY, frame: null, history: [] });
    expect(r2!.questions_supplementaires).toEqual([]);
  });
});
