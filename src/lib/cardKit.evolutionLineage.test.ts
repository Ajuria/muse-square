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
      effect_pct: -78.3, effect_proven: true, kpi_mention_fr: "sur le CA famille produits & services", is_current: false },
    { commitment_id: "c-v2", version_no: 2, status: "open", verdict: null,
      window_start: "2026-08-29", window_end: "2026-08-29",
      effect_pct: null, effect_proven: false, kpi_mention_fr: "", is_current: true },
  ];
  const html = String(kit.renderEvolution(data, EVOL_COPY));
  expect(html).toContain("Historique du dispositif");
  // « produits & services » (owner 31/08) : le rendu ÉCHAPPE le & en &amp; — on asserte la
  // forme RENDUE, jamais la source (même piège que les href, harnais 15/08).
  expect(html).toContain("Version 1 — du 22/08/2026 au 22/08/2026 : objectif manqué — −78,3 % sur le CA famille produits &amp; services vs votre résultat habituel (effet prouvé).");
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
      effect_pct: -78.3, effect_proven: true, kpi_mention_fr: "sur le CA famille produits & services", is_current: false },
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

// ── Lecture du jour (étape 4, 27/08) ───────────────────────────────────────────────────────────

const kpiData = (daily: Array<{ date: string; v: number }>) => {
  const data: any = baseData();
  data.commitment.status = "open";
  data.commitment.kpi_noise_se = 2;
  data.kpi = { metric: "transactions", label_fr: "Transactions", baseline: 10, goal: 12, realized: null, daily };
  return data;
};

it("lecture du jour : au-dessus de l'objectif et hors bruit sur ≥3 jours → « atteint à ce jour » + doubler recommandé", () => {
  const html = String(kit.renderEvolution(kpiData([
    { date: "2026-08-24", v: 14 }, { date: "2026-08-25", v: 15 }, { date: "2026-08-26", v: 13 },
  ]), EVOL_COPY));
  expect(html).toContain("Lecture du 26/08/2026 — 3 jours reçus : objectif atteint à ce jour.");
  expect(html).toContain("relevez l'objectif de la version suivante");
  const iDb = html.indexOf('data-move="doubler"');
  expect(html.slice(iDb, html.indexOf("</button>", iDb)).toLowerCase()).toContain("recommand");
});

it("lecture du jour : ≥3 journées négatives → « pas atteint à ce jour » + modifier + pivoter recommandé", () => {
  const html = String(kit.renderEvolution(kpiData([
    { date: "2026-08-24", v: 8 }, { date: "2026-08-25", v: 7 }, { date: "2026-08-26", v: 9 }, { date: "2026-08-27", v: 8 },
  ]), EVOL_COPY));
  expect(html).toContain("Lecture du 27/08/2026 — 4 jours reçus : objectif pas atteint à ce jour.");
  expect(html).toContain("4 journées sous votre résultat habituel — modifiez le dispositif ou l'opération sans attendre la fin.");
  const iPv = html.indexOf('data-move="pivoter"');
  expect(html.slice(iPv, html.indexOf("</button>", iPv)).toLowerCase()).toContain("recommand");
});

it("porte des 3 bilans : à 2 jours la lecture s'affiche SANS proposition, même très au-dessus ou très en dessous", () => {
  const up = String(kit.renderEvolution(kpiData([{ date: "2026-08-24", v: 20 }, { date: "2026-08-25", v: 22 }]), EVOL_COPY));
  expect(up).toContain("Lecture du 25/08/2026 — 2 jours reçus : objectif atteint à ce jour.");
  expect(up).not.toContain("relevez l'objectif");
  const down = String(kit.renderEvolution(kpiData([{ date: "2026-08-24", v: 2 }, { date: "2026-08-25", v: 1 }]), EVOL_COPY));
  expect(down).toContain("objectif pas atteint à ce jour.");
  expect(down).not.toContain("modifiez le dispositif");
});

it("C3 : la section porte le mot owner « Ajuster le dispositif », jamais l'ancien titre", () => {
  const html = String(kit.renderEvolution(kpiData([{ date: "2026-08-24", v: 14 }]), EVOL_COPY));
  expect(html).toContain("Ajuster le dispositif");
  expect(html).not.toContain("Votre prochaine action");
});

// ── Pôle / dispositif permanent (P3, 27/08) — le document du pôle ──────────────────────────────

it("un pôle rend la lecture continue et les opérations rattachées — sans UN SEUL mot de verdict", () => {
  const data: any = {
    commitment: {
      commitment_id: "pole-1", status: "open", dispositif_nature: "permanent",
      committed_action_text: "Pôle périssables — vendeur dédié, réassort quotidien",
      owner_person_name: "Camille Robin", pole_families: '["Coffee","Bakery"]',
      dispositif_plus: "Fraîcheur visible en vitrine", dispositif_why: "Le public vacances achète le matin",
      dispositif_resources: "1 vendeur, vitrine réfrigérée", created_at: "2026-08-27T10:00:00Z",
      components: [
        { key: "c1", type: "lineaire", role: "expert", label: "Linéaire poivres", type_label_fr: "Linéaire", role_label_fr: "Produits d'expert" },
        { key: "c2", type: "vitrine", role: null, label: null, type_label_fr: "Vitrine", role_label_fr: "" },
      ],
    },
    pole: {
      totals: { rev30_eur: 24965, share_pct: 51.1, avg30_eur_day: 832.18, base_eur_day: 543.93, delta_pct: 53, n30: 30 },
      families: [
        { family: "Coffee", avg30_eur_day: 412.5, n30: 26, base_eur_day: 380.2, n_base: 78, delta_pct: 8.5 },
        { family: "Bakery", avg30_eur_day: 96, n30: 3, base_eur_day: null, n_base: 0, delta_pct: null },
      ],
      operations: [
        { commitment_id: "op-1", status: "open", verdict: null, committed_action_text: "Producteur invité — fromages", window_start: "2026-09-14", window_end: "2026-09-14", version_no: 1 },
      ],
    },
    lineage: [],
  };
  const html = String(kit.renderEvolution(data, EVOL_COPY));
  expect(html).toContain("Pôle périssables");
  expect(html).toContain("Dispositif en continu");
  expect(html).toContain("Résultats — 30 derniers jours");
  expect(html).toMatch(/24[\s\u00a0\u202f]965 € sur 30 j · 51,1 % du CA/);
  expect(html).toContain("Coffee");
  expect(html).toContain("+8,5 %");
  // Famille sous les planchers : jamais un % — le compte réel à la place
  expect(html).toContain("Données insuffisantes");
  expect(html).toContain("3 jours vendus sur les 30 derniers");
  expect(html).not.toContain("pas encore comparable");
  expect(html.toLowerCase()).not.toContain("lecture continue");
  // Composants (03/09) : le libellé libre, sinon le type ; type · rôle en méta ; section présente
  expect(html).toContain("Composants");
  expect(html).toContain("Linéaire poivres");
  expect(html).toContain("Linéaire · Produits d&#39;expert".replace("&#39;", "'"));
  expect(html).toContain(">Vitrine<");
  expect(html).not.toContain("Aucun composant");
  // Photos (étape 4) : un emplacement par composant, le CTA « Documenter → » sur un pôle ouvert,
  // l'absence dite ; la section porte le dispositif et la version pour la page.
  expect(html).toContain('data-eg-photo="c1"');
  expect(html).toContain('data-eg-photo-add="c2"');
  expect(html).toContain("Documenter →");
  expect(html).toContain("Aucune photo pour l'instant.");
  expect(html).toContain('data-eg-dispositif=""');
  expect(html).toContain("Opérations sur ce pôle");
  expect(html).toContain('/app/insightevent/engagement?id=op-1');
  expect(html).toContain("14/09/2026");
  // Aucun registre de verdict, aucune machinerie datée
  for (const banned of ["objectif", "verdict", "Ajuster le dispositif", "La version suivante"]) {
    expect(html.toLowerCase()).not.toContain(banned.toLowerCase());
  }
});

it("coût de l'opération (ROI) : la ligne rend le coût, et le net SEULEMENT quand la fenêtre est mesurée", () => {
  const data: any = baseData();
  data.commitment.operation_cost_eur = 120;
  const open = String(kit.renderEvolution(data, EVOL_COPY));
  expect(open).toContain("Coût de l’opération : 120 €");
  expect(open).not.toContain("net après coût");
  data.commitment.window_actual_revenue = 900;
  data.commitment.window_expected_revenue = 1100;
  const measured = String(kit.renderEvolution(data, EVOL_COPY));
  expect(measured).toContain("Coût de l’opération : 120 € · net après coût : −320 €");
});

it("un pôle SANS composant dit l'absence (lexique règle 7), jamais une section vide", () => {
  const data: any = {
    commitment: { commitment_id: "pole-2", status: "open", dispositif_nature: "permanent",
      committed_action_text: "Pôle traiteur", pole_families: '["Traiteur"]', created_at: "2026-08-27T10:00:00Z" },
    pole: { totals: {}, families: [], operations: [] }, lineage: [],
  };
  const html = String(kit.renderEvolution(data, EVOL_COPY));
  expect(html).toContain("Composants");
  expect(html).toContain("Aucun composant déclaré pour l'instant.");
});

it("renderComponentPhoto : vignette servie par l'API, date, comptes, question → réponse, articles par désignation", () => {
  const html = String(kit.renderComponentPhoto({
    url: "/api/dispositifs/photos?dispositif_id=d&file=p", created_at: "2026-09-03T10:00:00Z",
    checklist: { ls_moyen_essai: "non", ls_prix_par_article: "oui", ls_facing_vide: "non_visible" },
    questions: [{ key: "ls_moyen_essai", question_fr: "Y a-t-il un moyen d'essayer : sentir, goûter, toucher, un échantillon ?" }, { key: "ls_prix_par_article", question_fr: "Chaque article porte-t-il son prix ?" }, { key: "ls_facing_vide", question_fr: "Un emplacement est-il vide au moment de la photo ?" }],
    items_matched: [{ item_code: "CF-1", confidence: "haute", item_description: "Ethiopia" }],
  }, EVOL_COPY));
  expect(html).toContain('src="/api/dispositifs/photos?dispositif_id=d&amp;file=p"');
  expect(html).toContain("03/09/2026 · 1 oui · 1 non · 1 non visible");
  expect(html).toContain("Y a-t-il un moyen d'essayer");
  expect(html).toContain("Articles reconnus : Ethiopia");
  expect(html).not.toContain("CF-1");
  expect(String(kit.renderComponentPhoto(null, EVOL_COPY))).toBe("Aucune photo pour l'instant.");
});
