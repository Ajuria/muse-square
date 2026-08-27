// La section « Historique du dispositif » de renderEvolution — vérifiée en exécutant le VRAI
// public/card-kit.js dans un vm Node (le harnais est la page), jamais à la regex sur la source.
import { readFileSync } from "node:fs";
import * as vm from "node:vm";
import { beforeAll, expect, it } from "vitest";

let kit: any;
beforeAll(() => {
  const sandbox: any = { window: {}, console };
  sandbox.window.window = sandbox.window;
  vm.createContext(sandbox);
  vm.runInContext(readFileSync("public/card-kit.js", "utf8"), sandbox, { filename: "card-kit.js" });
  kit = sandbox.window.MSCardKit;
});

const baseData = () => ({
  commitment: {
    commitment_id: "c-v2", status: "open", window_kind: "day_of",
    committed_action_text: "Corner de vente producteur — X",
    window_start: "2026-08-29", window_end: "2026-08-29", created_at: "2026-08-24T10:00:00Z",
  },
  series: [], kpi: null, move_stats: [], best_in_class: [], site_name: "Muse Square",
});

it("chaîne >1 version : la section rend chaque version avec verdict, effet SUR SON KPI et registre de preuve", () => {
  const data: any = baseData();
  data.lineage = [
    { commitment_id: "c-v1", version_no: 1, status: "resolved", verdict: "missed",
      window_start: "2026-08-22", window_end: "2026-08-22",
      effect_pct: -78.3, effect_proven: true, kpi_mention_fr: "sur le CA famille", is_current: false },
    { commitment_id: "c-v2", version_no: 2, status: "open", verdict: null,
      window_start: "2026-08-29", window_end: "2026-08-29",
      effect_pct: null, effect_proven: false, kpi_mention_fr: "", is_current: true },
  ];
  const html = String(kit.renderEvolution(data, {}));
  expect(html).toContain("Historique du dispositif");
  expect(html).toContain("Version 1 — du 22/08/2026 au 22/08/2026 : objectif manqué — −78,3 % sur le CA famille vs votre résultat habituel (effet prouvé).");
  // « fenêtre » est BANNI (lexique l.23) — la forme est celle de la carte owner du 27/08.
  expect(html).toContain("Version 2 — du 29/08/2026 au 29/08/2026 : en cours, verdict d’ici le 29/08/2026.");
  expect(html).not.toContain("fenêtre");
  expect(html).toContain("(ce test)");
});

it("V1 seule (lineage vide) : aucune section — une racine n'a pas d'historique à raconter", () => {
  const html = String(kit.renderEvolution(baseData() as any, {}));
  expect(html).not.toContain("Historique du dispositif");
});
