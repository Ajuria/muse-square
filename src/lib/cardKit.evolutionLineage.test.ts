// La section « Historique du dispositif » de renderEvolution — vérifiée en exécutant le VRAI
// public/card-kit.js dans un vm Node (le harnais est la page), jamais à la regex sur la source.
import { readFileSync } from "node:fs";
import * as vm from "node:vm";
import { beforeAll, expect, it } from "vitest";
import { EVOL_COPY } from "./commitmentCopy";

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
  const html = String(kit.renderEvolution(data, EVOL_COPY));
  expect(html).toContain("Historique du dispositif");
  expect(html).toContain("Version 1 — du 22/08/2026 au 22/08/2026 : objectif manqué — −78,3 % sur le CA famille vs votre résultat habituel (effet prouvé).");
  // « fenêtre » est BANNI (lexique l.23) — la forme est celle de la carte owner du 27/08.
  expect(html).toContain("Version 2 — du 29/08/2026 au 29/08/2026 : en cours, verdict d’ici le 29/08/2026.");
  expect(html).not.toContain("fenêtre");
  expect(html).toContain("(ce test)");
});

it("V1 seule (lineage vide) : aucune section — une racine n'a pas d'historique à raconter", () => {
  const html = String(kit.renderEvolution(baseData() as any, EVOL_COPY));
  expect(html).not.toContain("Historique du dispositif");
});

// ── « La version suivante » (étape 3, 27/08) — le sous-formulaire du re-commit ─────────────────

it("engagement ouvert : le sous-formulaire porte les mots owner, pré-remplit depuis la version courante, et calibre l'objectif sur la dernière version RÉSOLUE", () => {
  const data: any = baseData();
  data.commitment.measured_metric = "transactions";
  data.commitment.threshold_basis = "pct"; data.commitment.threshold_value = 11;
  data.commitment.owner_person_name = "Camille";
  data.commitment.dispositif_plus = "PLUS-V1"; data.commitment.dispositif_why = "WHY-V1"; data.commitment.dispositif_resources = "RES-V1";
  data.lineage = [
    { commitment_id: "c-v1", version_no: 1, status: "resolved", verdict: "missed",
      window_start: "2026-08-22", window_end: "2026-08-22",
      effect_pct: 3.4, effect_proven: true, kpi_mention_fr: "sur les transactions", is_current: false },
    { commitment_id: "c-v2", version_no: 2, status: "open", verdict: null,
      window_start: "2026-08-29", window_end: "2026-08-29",
      effect_pct: null, effect_proven: false, kpi_mention_fr: "", is_current: true },
  ];
  const html = String(kit.renderEvolution(data, EVOL_COPY));
  expect(html).toContain("La version suivante");
  expect(html).toContain("Étape de la vente : Transaction");
  for (const lbl of ["Levier", "Responsable(s)", "Ressource(s)", "Le plus du dispositif", "Pourquoi ça va marcher"]) expect(html).toContain(lbl);
  // Pré-remplissage depuis la version courante
  expect(html).toContain("PLUS-V1"); expect(html).toContain("WHY-V1"); expect(html).toContain("RES-V1"); expect(html).toContain("Camille");
  // Calibration : V1 résolue a mesuré +3,4 % → objectif proposé 4 (jamais la cible V1 reconduite)
  expect(html).toContain("La version 1 a mesuré +3,4 % — objectif proposé : 4 %.");
  expect(html).toContain('data-vform-goal type="number" min="1" max="100" step="1" value="4"');
});

it("dispositif écarté (dernier effet résolu négatif prouvé) : « pivoter » porte le badge recommandé, et aucune calibration n'est proposée", () => {
  const data: any = baseData();
  data.commitment.threshold_basis = "pct"; data.commitment.threshold_value = 11;
  data.lineage = [
    { commitment_id: "c-v1", version_no: 1, status: "resolved", verdict: "missed",
      window_start: "2026-08-22", window_end: "2026-08-22",
      effect_pct: -78.3, effect_proven: true, kpi_mention_fr: "sur le CA famille", is_current: false },
    { commitment_id: "c-v2", version_no: 2, status: "open", verdict: null,
      window_start: "2026-08-29", window_end: "2026-08-29",
      effect_pct: null, effect_proven: false, kpi_mention_fr: "", is_current: true },
  ];
  const html = String(kit.renderEvolution(data, EVOL_COPY));
  // Le badge « recommandé » est SUR la puce pivoter (l'ordre : titre Pivoter puis badge)
  const iPiv = html.indexOf('data-move="pivoter"');
  const seg = html.slice(iPiv, html.indexOf("</button>", iPiv));
  expect(seg).toContain("Pivoter");
  expect(seg.toLowerCase()).toContain("recommand");
  // Effet négatif → pas de « objectif proposé », le % reste celui du parent (11)
  expect(html).not.toContain("objectif proposé");
  expect(html).toContain('data-vform-goal type="number" min="1" max="100" step="1" value="11"');
});
