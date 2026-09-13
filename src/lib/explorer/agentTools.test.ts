import { describe, expect, it } from "vitest";
import {
  MAX_IMAGE_BYTES, buildAgentTools, familiesToText, polesToText, readSiteFamilies30d, type AgentToolDeps, type ToolCallRecord,
} from "./agentTools";
import { OUTILS_FR } from "./agentSystem.fr";
import { TOURNURES_LLM } from "../fr/tournures.fr";
import { MOTS_BANNIS } from "../fr/evenement.fr";

// Les dépendances simulées : ni BigQuery, ni Clerk, ni réseau — chaque outil se prouve sur sa forme.
function deps(over: Partial<AgentToolDeps> = {}): AgentToolDeps & { records: ToolCallRecord[]; written: any[] } {
  const records: ToolCallRecord[] = [];
  const written: any[] = [];
  const pole = {
    dispositif_id: "d1", name: "Épicerie fine", families: ["Épices", "Thés"], lever: "mise en avant", responsable: "Nadia", commitment_id: "c1",
    components: [
      { dispositif_id: "d1", component_key: "k1", type: "lineaire", type_label_fr: "Linéaire", type_provisoire: false, role: "courant", role_label_fr: "Produits du quotidien", role_provisoire: false, label: "mur d'épices", version_no: 1, created_at: null, pole_name: "Épicerie fine", pole_families: ["Épices", "Thés"] },
      { dispositif_id: "d1", component_key: "k2", type: "caisse", type_label_fr: "Caisse", type_provisoire: false, role: null, role_label_fr: null, role_provisoire: false, label: null, version_no: 1, created_at: null, pole_name: "Épicerie fine", pole_families: ["Épices", "Thés"] },
    ],
  };
  const base: AgentToolDeps = {
    location_id: "loc-1",
    author: { user_id: "user_a", role: "owner" },
    listPoles: async () => [pole as any],
    readFamilies: async () => [{ category: "Épices", revenue_30d: 12000, n_days: 26, avg_day_eur: 462, first_day: "2026-08-12", last_day: "2026-09-10" }],
    readPhotos: async () => [{ photo_id: "p1", dispositif_id: "d1", component_key: "k1", status: "read", checklist: { visible: "oui" }, items_matched: [{ item_code: "E1", item_description: "Zaatar 40 g" }], created_at: "2026-09-01T10:00:00Z", url: "/api/dispositifs/photos?x" }],
    readPhotoBytes: async () => ({ media_type: "image/jpeg", base64: "AAAA", bytes: 4 }),
    readMemory: async () => [],
    writeMemory: async (row) => { written.push(row); },
    // 12/09 : les lecteurs chiffrés — un résultat de provider simulé par famille (found / absence).
    runFamily: async (key) => key === "marge"
      ? { found: true, data: { found: true, lead: "Marge brute : 19 845 € sur vos 30 derniers jours", gross_margin_ht: 19845, coverage_pct: 92 }, facts: [{ fact_fr: "Sur vos 30 derniers jours, votre marge brute est de 19 845 €, soit un taux de marge brute de 40 %.", claim_type: "observed" }], sources: ["Votre caisse et vos prix d'achat"] }
      : key === "signaux"
        ? { found: true, data: { found: true, date: "2026-09-12", lead: "CA/jour Tea sur vos jours de pluie marquée : −52 €", lines: [{ family: "Tea", class_key: "rain" }, { family: "Coffee", class_key: "school_holiday" }] }, facts: [{ fact_fr: "CA/jour Tea sur vos jours de pluie marquée : −52 € vs vos jours comparables, sur 20 jours.", claim_type: "observed_difference" }, { fact_fr: "CA/jour Coffee sur vos jours de vacances scolaires : −64 € vs vos jours comparables, sur 36 jours.", claim_type: "observed_difference" }], sources: ["Vos ventes par famille face aux classes de jours"] }
        : { found: false, data: { found: false, date: "2026-09-12" }, facts: [], sources: [] },
    // 13/09 (§ 7, couche 1) : lire_marge — la lecture composée (mesure ici) ; `over` peut rendre une estimation ou l'absence.
    runMarge: async (jours, date) => {
      const r = await base.runFamily("marge", date);
      return { mode: "mesure", window_fr: jours === "week_end" ? "vos jours de week-end des 30 derniers jours" : "vos 30 derniers jours", result: r, blocks: [{ type: "card", render: "renderMarge", data: r.data }, { type: "sources", items: r.sources }] };
    },
    // 12/09 : lire_ventes — le rapport de ventes tel que computeSalesReport le rend (champs lus par composeVentesFacts).
    runVentes: async (start, end) => start > "2026-09-01"
      ? { body: { ok: false, error: "NO_DATA" }, prev_revenue: null, actions_fr: [] }
      : { prev_revenue: 33_400, actions_fr: [], body: { ok: true, period: { start, end },
          summary: { revenue: 34_512, transactions: 2_410, avg_basket: 14.32, vs_prev_pct: 3.3, vs_yoy_pct: null, yoy_available: false, layers: null },
          best_day: { date: "2026-09-05", revenue: 1_620 }, worst_day: { date: "2026-09-08", revenue: 410 }, weekday: [], category_mix: [], signals: {} } },
    // 12/09 : lire_resultat — un mois complet lisible et le seuil du jour ; `over` peut vider les charges.
    runResultat: async () => ({
      mois: [{ month: "2026-08-01", is_complete_month: true, sales_days: 31, revenue_net_ht: 50499.2, gross_margin_ht: 36503.09, coverage_pct: 1, fixed_costs_month_eur: 6500, payroll_month_eur: 17000, net_result_eur: 13003.09, payroll_to_revenue_pct: 0.3366 }],
      jour: { date: "2026-09-12", gross_margin_ht: 1368.97, charges_day_eur: 758.06, break_even_revenue_ht: 1051.63, break_even_hour: 10, is_break_even_reached: true, margin_rate_30d: 0.7208, opening_days_ref: 31 },
    }),
    // 12/09 : lire_poles_classement — deux pôles vendus, un Non rattaché, aucune mesure d'espace.
    runPolesClassement: async (start, end) => ({
      start, end, space: [],
      rows: [
        { pole_id: "p1", pole_label: "Cuisine", is_unassigned: false, n_days: 30, revenue: 20804.7, units: 6667, gross_margin_ht: 15520.59, revenue_costed: 20804.7, delta_eur: 2456.8, expected_revenue: 18347.9 },
        { pole_id: "p2", pole_label: "Cave", is_unassigned: false, n_days: 22, revenue: 2562.85, units: 118, gross_margin_ht: 910.41, revenue_costed: 2562.85, delta_eur: 1005.8, expected_revenue: 1557.05 },
        { pole_id: "nr", pole_label: "Non rattaché", is_unassigned: true, n_days: 10, revenue: 300, units: 40, gross_margin_ht: 100, revenue_costed: 300, delta_eur: -20, expected_revenue: 320 },
      ],
    }),
    // 12/09 (incrément 4) : un Modèle enregistré du site.
    listModeles: async () => [{ template_id: "t1", version: 1, location_id: "loc-1", author_user_id: "u", author_role: "owner", nom: "Hebdo pôles", periode_relative: "semaine_derniere", indicateur: "ventes", source_document_id: null, created_at: "x", sections: [{ cle: "poles", params: { indicateur: "ventes" } }, { cle: "volume", params: {} }] }],
    // 13/09 (§ 7, couche 3) : une fiche documentée ; le site porte une opération « Corner producteur » et la famille Épices.
    listDispositifsDocumentes: async () => [{ practice_id: "pr1", practice_text: "une table de dégustation à l'entrée", confirmation_test: "La prochaine occurrence dépasse l’attendu du jour", day_class_key: null, tier: "declaree", commitment_status: "cancelled", commitment_verdict: null, effect_direction: null, effect_residual_pct: null, effect_residual_z: null, replay_threshold_value: 10, replay_threshold_basis: "pct", replay_adjustment_move: "stop", created_date: "2026-08-10" } as any],
    siteEntities: async () => ({ entities: [{ kind: "operation", id: "op1", name: "Corner producteur", families: [] }, { kind: "famille", id: null, name: "Épices", families: [] }] as any }),
    operationLife: async () => ({ start: "2026-08-08", end: "2026-09-12" }),
    runOperationFamille: async (op, fams, start, end, kpi) => ({
      operation: op, familles: fams, start, end, kpi_demande: kpi,
      operation_blocks: { table: { cols: [{ label: "Occurrence", align: "left" }, { label: "CA" }], rows: [{ cells: [{ v: "08/08/2026" }, { v: "1 200 €" }] }] }, prose: "1 occurrence.", funnel_table: null, sources: ["Vos ventes"] } as any,
      familles_reading: [{ famille: fams[0].name, steps: [
        { step: "ventes", occ_value: 34, base_value: 22.5, delta_pct: 51.1, occ_days: 4, base_days: 20 },
        { step: "panier", occ_value: 12.4, base_value: 13.5, delta_pct: -8.1, occ_days: 4, base_days: 20 },
        { step: "ca", occ_value: 420, base_value: 298, delta_pct: 41, occ_days: 4, base_days: 20 },
        { step: "part", occ_value: 0.31, base_value: 0.305, delta_pct: 1.7, occ_days: 4, base_days: 20 },
      ] }],
      mix: [{ famille: fams[0].name, occ_share: 0.31, base_share: 0.305, delta_pct: 1.7, occ_days: 4, base_days: 20 }],
    }),
    // 13/09 (§ 7, couche 4) : un plan minimal — la santé, un pôle, aucun motif ; le rejeu absent.
    runPlan: async (start, end) => ({
      start, end, inventory: [], open_count: 0, calm_weeks: [], motifs: [], replay: [], series_due: [], web_plays: [],
      health: { ca_day_30: 1200, ca_day_90: 1100, delta_pct: 9.1, n_30: 26, n_90: 78, transactions_day_30: 80, transactions_day_90: 75, basket_30: 15, basket_90: 14.7 } as any,
      poles: [], roster: [],
    }),
    // 13/09 (§ 7, couche 5) : les écritures simulées — la marge n'avait pas de valeur, la clientèle valait 250.
    writeDeclaration: async (type, valeur) => { written.push({ declaration: type, valeur }); return { prior_fr: type === "clientele" ? "250 clients" : null, declarant_name: "Nadia" }; },
    forgetDeclaration: async (type) => { written.push({ oubli: type }); return type === "clientele" ? { prior_fr: "250 clients" } : null; },
    // 13/09 (incrément 8) : deux zones (un pôle en deux polygones, un pôle en un), l'espace du pôle, deux périodes de familles costées.
    listZones: async () => [
      { zone_id: "z1", location_id: "loc-1", dispositif_id: "d1", pole_label: "Épicerie fine", polygon_index: 0, area_m2: 40, points: [[0, 0], [100, 0], [100, 80], [0, 80]], scale_pt_per_m: 28.344, page_w_pt: null, page_h_pt: null, source: "plan", measured_at: "2026-09-12", declarant_user_id: null, created_at: "2026-09-13T00:00:00Z" },
      { zone_id: "z2", location_id: "loc-1", dispositif_id: "d1", pole_label: "Épicerie fine", polygon_index: 1, area_m2: 5, points: [[110, 0], [140, 0], [140, 30]], scale_pt_per_m: 28.344, page_w_pt: null, page_h_pt: null, source: "plan", measured_at: "2026-09-12", declarant_user_id: null, created_at: "2026-09-13T00:00:00Z" },
      { zone_id: "z3", location_id: "loc-1", dispositif_id: "d2", pole_label: "Cave", polygon_index: 0, area_m2: 30, points: [[0, 90], [100, 90], [100, 150], [0, 150]], scale_pt_per_m: 28.344, page_w_pt: null, page_h_pt: null, source: "plan", measured_at: "2026-09-12", declarant_user_id: null, created_at: "2026-09-13T00:00:00Z" },
    ],
    listPoleSpace: async () => [
      { grain: "pole", pole_id: "d1", pole_label: "Épicerie fine", family: null, window_start: "2026-08-14", window_end: "2026-09-12", linear_m: 10, linear_share: 0.6, surface_m2: 45, n_components: 2, revenue: 12000, revenue_net_ht: 10000, revenue_share: 0.7, margin_share: 0.72, coverage_pct: 100, revenue_per_m: 1200, revenue_net_ht_per_m: 1000, margin_per_m: 600, revenue_per_m2: 266.7, revenue_net_ht_per_m2: 222.2, margin_per_m2: 133.3 } as any,
      { grain: "pole", pole_id: "d2", pole_label: "Cave", family: null, window_start: "2026-08-14", window_end: "2026-09-12", linear_m: 6, linear_share: 0.4, surface_m2: 30, n_components: 1, revenue: 3000, revenue_net_ht: 2500, revenue_share: 0.3, margin_share: 0.28, coverage_pct: 100, revenue_per_m: 500, revenue_net_ht_per_m: 416, margin_per_m: 200, revenue_per_m2: 100, revenue_net_ht_per_m2: 83.3, margin_per_m2: 40 } as any,
    ],
    runFamillesPeriode: async (du) => du < "2026-08-13"
      ? [{ family: "Épices", units: 100, revenue: 1200, discount: 20, revenue_net_ht: 1000, revenue_costed: 1200, revenue_net_ht_costed: 1000, cost_ht: 400, gross_margin_ht: 600, units_costed: 100 }, { family: "Thés", units: 50, revenue: 600, discount: 0, revenue_net_ht: 500, revenue_costed: 600, revenue_net_ht_costed: 500, cost_ht: 250, gross_margin_ht: 250, units_costed: 50 }]
      : [{ family: "Épices", units: 120, revenue: 1560, discount: 30, revenue_net_ht: 1320, revenue_costed: 1560, revenue_net_ht_costed: 1320, cost_ht: 540, gross_margin_ht: 780, units_costed: 120 }, { family: "Thés", units: 40, revenue: 480, discount: 0, revenue_net_ht: 400, revenue_costed: 480, revenue_net_ht_costed: 400, cost_ht: 180, gross_margin_ht: 220, units_costed: 40 }, { family: "Branded", units: 10, revenue: 100, discount: 0, revenue_net_ht: 83, revenue_costed: 0, revenue_net_ht_costed: 0, cost_ht: 0, gross_margin_ht: 0, units_costed: 0 }],
    today: () => "2026-09-12",
    record: (r) => records.push(r),
    faitsDuTour: () => records.flatMap((r) => r.facts ?? []),
    ...over,
  };
  return Object.assign(base, { records, written });
}
const byName = (tools: any[], name: string) => tools.find((t) => t.name === name);

describe("agentTools — cinq outils, chacun enregistré avec un résumé en français", () => {
  it("expose les cinq outils de lecture d'espace et les trois lecteurs chiffrés (12/09) — et chacun a son libellé", () => {
    const names = buildAgentTools(deps()).map((t: any) => t.name);
    expect(names).toEqual(["lire_poles", "lire_familles", "lire_photos", "lire_memoire", "ecrire_memoire", "lire_marge", "lire_espace", "lire_familles_face_aux_jours", "lire_ventes", "lire_resultat", "lire_poles_classement", "composer_rapport", "proposer_operation", "lire_dispositifs_documentes", "lire_operation_famille", "composer_plan", "ecrire_declaration", "lire_plan", "pont_de_marge"]);
    for (const n of names) expect(OUTILS_FR[n], n).toBeTruthy();
  });

  it("lire_poles rend les pôles et leurs composants en clair, sans identifiant, et résume « N pôles, M composants »", async () => {
    const d = deps();
    const out = await byName(buildAgentTools(d), "lire_poles").run({});
    expect(out).toContain("Épicerie fine");
    expect(out).toContain("Linéaire (Produits du quotidien) « mur d'épices »");
    expect(out).toContain("responsable : Nadia");
    expect(out).not.toContain("d1");
    expect(d.records[0]).toMatchObject({ name: "lire_poles", ok: true, summary: "1 pôle, 2 composants" });
  });

  it("lire_poles dit l'absence quand aucun pôle n'est déclaré", async () => {
    const d = deps({ listPoles: async () => [] });
    expect(await byName(buildAgentTools(d), "lire_poles").run({})).toBe("Aucun pôle déclaré sur ce site.");
    expect(d.records[0].summary).toBe("aucun pôle déclaré");
  });

  it("lire_familles porte la fenêtre (du JJ/MM/AAAA au JJ/MM/AAAA) et le CA par jour", async () => {
    const d = deps();
    const out = await byName(buildAgentTools(d), "lire_familles").run({});
    expect(out).toContain("du 12/08/2026 au 10/09/2026");
    expect(out).toMatch(/Épices — 12\s?000 € sur 26 jours, soit 462 € par jour/);
    expect(d.records[0].summary).toBe("1 famille sur 30 jours mesurés (du 12/08/2026 au 10/09/2026)");
    // 12/09 : les lignes rendues sont des faits pour la porte — « sur 26 jours » du modèle n'est pas un nombre non fondé.
    expect(d.records[0].facts?.length).toBeGreaterThan(0);
    expect(d.records[0].facts?.some((f) => /Épices — 12\s?000 € sur 26 jours/.test(f))).toBe(true);
  });

  it("lire_photos rend le texte de la photo, l'image en bloc, et compte les composants sans photo", async () => {
    const d = deps();
    const out = await byName(buildAgentTools(d), "lire_photos").run({});
    expect(Array.isArray(out)).toBe(true);
    expect(out[0].type).toBe("text");
    expect(out[0].text).toContain("1 photo lue, 1 composant sans photo.");
    expect(out[0].text).toContain("Zaatar 40 g");
    expect(out[0].text).not.toContain("/api/dispositifs/photos");
    expect(out[0].text).toContain("sans photo : Caisse");
    expect(out.find((b: any) => b.type === "image")).toMatchObject({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: "AAAA" } });
    expect(d.records[0].summary).toBe("1 photo lue, 1 image regardée, 1 composant sans photo");
  });

  it("lire_photos filtre par nom de pôle (accents et casse ignorés) et refuse un nom inconnu en listant les pôles", async () => {
    const d = deps();
    const t = byName(buildAgentTools(d), "lire_photos");
    expect((await t.run({ pole: "epicerie" }))[0].text).toContain("1 photo lue");
    expect((await t.run({ pole: "traiteur" }))[0].text).toContain("Aucun pôle dont le nom contient « traiteur ». Pôles du site : Épicerie fine.");
  });

  it("lire_photos laisse une image trop lourde et le dit", async () => {
    const d = deps({ readPhotoBytes: async () => ({ media_type: "image/jpeg", base64: "x", bytes: MAX_IMAGE_BYTES + 1 }) });
    const out = await byName(buildAgentTools(d), "lire_photos").run({});
    expect(out[0].text).toContain("1 image trop lourde pour être regardée");
    expect(out.some((b: any) => b.type === "image")).toBe(false);
  });

  it("lire_memoire lit par sujet et résume le compte", async () => {
    const d = deps({ readMemory: async (s) => (s === "vitrine" ? [{ memory_id: "m", location_id: "loc-1", subject: "vitrine", body: "Épices côté rue.", author_user_id: "u", author_role: "owner", source: "conversation", created_at: "2026-09-11T08:00:00Z" }] : []) });
    const t = byName(buildAgentTools(d), "lire_memoire");
    expect(await t.run({ sujet: "vitrine" })).toContain("• vitrine — Épices côté rue. (exploitant, 11/09/2026)");
    expect(await t.run({})).toBe("Aucune note en mémoire pour ce site.");
    expect(d.records.map((r) => r.summary)).toEqual(["1 sujet noté", "rien de noté sur cet espace"]);
  });

  it("ecrire_memoire écrit une ligne au nom de l'auteur (site, rôle), source conversation par défaut", async () => {
    const d = deps();
    const out = await byName(buildAgentTools(d), "ecrire_memoire").run({ sujet: "Sens de circulation", contenu: "Nous entrons par la droite." });
    expect(out).toMatch(/^Enregistré — sujet « sens de circulation », le \d{2}\/\d{2}\/\d{4}\.$/);
    expect(d.written[0]).toMatchObject({ location_id: "loc-1", subject: "sens de circulation", body: "Nous entrons par la droite.", author_user_id: "user_a", author_role: "owner", source: "conversation", superseded: false });
    expect(d.records[0].summary).toBe("« sens de circulation » enregistré");
  });

  it("ecrire_memoire avec retirer écrit un retrait ; un échec d'écriture est enregistré comme tel et remonte", async () => {
    const d = deps();
    await byName(buildAgentTools(d), "ecrire_memoire").run({ sujet: "vitrine", contenu: "", retirer: true });
    expect(d.written[0]).toMatchObject({ subject: "vitrine", superseded: true });
    const bad = deps({ writeMemory: async () => { throw new Error("insert refusé"); } });
    await expect(byName(buildAgentTools(bad), "ecrire_memoire").run({ sujet: "x", contenu: "y" })).rejects.toThrow("insert refusé");
    expect(bad.records[0]).toMatchObject({ name: "ecrire_memoire", ok: false, summary: "échec : insert refusé" });
  });
});

describe("agentTools — la lecture des familles passe par la vue semantic jour × famille", () => {
  it("lit vw_insight_event_client_offering_daily sur 30 jours MESURÉS (bornés au dernier jour du site), jamais raw", async () => {
    const calls: any[] = [];
    const bq = { query: async (q: any) => { calls.push(q); return [[{ item_category: "Thés", revenue_30d: { value: 900 }, n_days: 20, avg_day_eur: 45, first_day: "2026-08-12", last_day: "2026-09-10" }]]; } };
    const out = await readSiteFamilies30d(bq, "loc-1");
    expect(calls[0].query).toMatch(/semantic\.vw_insight_event_client_offering_daily/);
    expect(calls[0].query).not.toMatch(/raw\.client_transactions/);
    expect(calls[0].query).toMatch(/DATE_SUB\(b\.last_day, INTERVAL 30 DAY\)/);
    expect(calls[0].params).toEqual({ location_id: "loc-1" });
    expect(out).toEqual([{ category: "Thés", revenue_30d: 900, n_days: 20, avg_day_eur: 45, first_day: "2026-08-12", last_day: "2026-09-10" }]);
  });
  it("polesToText et familiesToText disent l'absence", () => {
    expect(polesToText([])).toBe("Aucun pôle déclaré sur ce site.");
    expect(familiesToText([])).toBe("Aucune vente lue sur ce site dans la vue jour × famille.");
  });
});

// Les chaînes VISIBLES de l'agent (libellés d'outils du proto, résumés) passent les deux gardes du français
// que evenement.fr.guard.test.ts et tournures.fr.guard.test.ts appliquent aux surfaces listées — ce module
// n'y est pas listé, le même contrôle vit donc ici.
describe("agentTools — les chaînes visibles passent les gardes du français", () => {
  const visibles = [
    ...Object.values(OUTILS_FR),
    "1 pôle, 2 composants", "aucun pôle déclaré", "1 famille sur 30 jours mesurés (du 12/08/2026 au 10/09/2026)", "aucune vente lue",
    "1 photo lue, 1 image regardée, 1 composant sans photo", "aucune photo", "1 sujet noté", "rien de noté sur cet espace",
    "« vitrine » enregistré", "« vitrine » retiré",
  ];
  it("aucune tournure de machine", () => {
    for (const s of visibles) for (const t of TOURNURES_LLM) expect(t.motif.test(s.toLowerCase()), `${s} — ${t.faute}`).toBe(false);
  });
  it("aucun mot banni", () => {
    for (const s of visibles) for (const mot of Object.keys(MOTS_BANNIS)) {
      const re = new RegExp(`(^|[^\\p{L}])${mot.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^\\p{L}]|$)`, "iu");
      expect(re.test(s), `${s} — « ${mot} » : ${MOTS_BANNIS[mot]}`).toBe(false);
    }
  });
});

describe("agentTools — les lecteurs chiffrés (12/09) : faits au modèle, blocs à l'exploitant, absence dite", () => {
  it("lire_marge rend les faits du provider, un bloc card + sources, et les mêmes faits pour la porte", async () => {
    const d = deps();
    const out = await byName(buildAgentTools(d), "lire_marge").run({});
    expect(out).toBe("• Sur vos 30 derniers jours, votre marge brute est de 19 845 €, soit un taux de marge brute de 40 %.");
    const rec = d.records[0];
    expect(rec).toMatchObject({ name: "lire_marge", ok: true, summary: "marge brute mesurée, 1 fait — vos 30 derniers jours" });
    expect(rec.blocks?.map((b) => b.type)).toEqual(["card", "sources"]);
    expect((rec.blocks?.[0] as any).render).toBe("renderMarge");
    expect(rec.facts).toEqual(["Sur vos 30 derniers jours, votre marge brute est de 19 845 €, soit un taux de marge brute de 40 %."]);
  });
  it("lire_marge (13/09, § 7 couche 1) : les jours passent à la lecture, et une estimation déclarée rend ses faits sans carte", async () => {
    const d = deps({ runMarge: async (jours) => ({ mode: "declaree_familles", window_fr: jours === "week_end" ? "vos jours de week-end des 30 derniers jours" : "vos 30 derniers jours",
      result: { found: true, data: { found: true, estimation: true }, facts: [{ fact_fr: "Marge estimée : ≈ 18 000 € sur vos jours de week-end des 30 derniers jours — calculée sur 60 % de votre CA", claim_type: "observed" }], sources: ["Votre caisse × vos marges déclarées"] },
      blocks: [{ type: "prose", md: "**Marge estimée**" }, { type: "facts", items: ["x"] }] }) });
    const out = await byName(buildAgentTools(d), "lire_marge").run({ jours: "week_end" });
    expect(out).toBe("• Marge estimée : ≈ 18 000 € sur vos jours de week-end des 30 derniers jours — calculée sur 60 % de votre CA");
    expect(d.records[0]).toMatchObject({ summary: "estimation par vos marges déclarées par famille, 1 fait — vos jours de week-end des 30 derniers jours", input: { jours: "week_end" } });
    expect(d.records[0].blocks?.map((b) => b.type)).toEqual(["prose", "facts"]);
  });
  it("lire_espace sans pôle mesuré : l'absence est un résultat (bloc absence, aucun fait)", async () => {
    const d = deps();
    const out = await byName(buildAgentTools(d), "lire_espace").run({});
    expect(out).toContain("Aucune mesure d’espace pour l’instant");
    expect(d.records[0].blocks).toEqual([{ type: "absence", manque: "Aucune mesure d’espace pour l’instant — les mètres se saisissent sur le formulaire de pôle.", geste: { label_fr: "Vos pôles", url: "/profile?tab=poles" } }]);
    expect(d.records[0].facts).toEqual([]);
  });
  it("lire_familles_face_aux_jours filtre par famille (accents ignorés) et dit l'absence quand la famille n'y est pas", async () => {
    const d = deps();
    const tool = byName(buildAgentTools(d), "lire_familles_face_aux_jours");
    const out = await tool.run({ famille: "tea" });
    expect(out).toContain("Tea"); expect(out).not.toContain("Coffee");
    expect((d.records[0].blocks?.[0] as any).data.lines.length).toBe(1);
    const none = await tool.run({ famille: "Bougies" });
    expect(none).toContain("Aucune réponse famille × jours mesurable");
  });
  it("lire_ventes lit la période demandée (30 derniers jours par défaut), rend les faits, deux blocs table + sources, et l'absence sur une période sans vente", async () => {
    const d = deps();
    const tool = byName(buildAgentTools(d), "lire_ventes");
    const out = await tool.run({});
    expect(out).toContain("Période lue : vos 30 derniers jours, du 13/08/2026 au 11/09/2026.");
    expect(out.replace(/[\u202f\u00a0]/g, " ")).toContain("• Du 13/08/2026 au 11/09/2026, vous avez généré 34 512 € de chiffre d'affaires, en hausse de 3,3 % par rapport à la période précédente (33 400 €).");
    expect(d.records[0]).toMatchObject({ name: "lire_ventes", ok: true, summary: "3 faits lus, vos 30 derniers jours, du 13/08/2026 au 11/09/2026" });
    expect(d.records[0].blocks?.map((b) => b.type)).toEqual(["table", "sources"]);
    expect(d.records[0].facts?.length).toBe(4); // la période lue + 3 faits : le « 30 » du modèle est fondé
    expect(d.records[0].facts?.[0]).toBe("Période lue : vos 30 derniers jours, du 13/08/2026 au 11/09/2026.");
    const none = await tool.run({ du: "2026-09-02", au: "2026-09-04" });
    expect(none).toBe("Aucune vente du 02/09/2026 au 04/09/2026.");
    expect(d.records[1].blocks).toEqual([{ type: "absence", manque: "Aucune vente du 02/09/2026 au 04/09/2026. Importez vos ventes ou connectez votre caisse, puis reposez la question.", geste: null }, { type: "cta", action: "upload", label: "Importer un fichier de ventes" }]);
    const bad = await tool.run({ du: "2026-09-04", au: "2026-09-02" });
    expect(bad).toContain("Période invalide");
  });
  it("lire_resultat rend le résultat net du dernier mois complet et le seuil du jour ; sans charges déclarées, l'absence avec le geste de Piloter", async () => {
    const d = deps();
    const out = await byName(buildAgentTools(d), "lire_resultat").run({});
    expect(out.replace(/[\u202f\u00a0]/g, " ")).toContain("• En août 2026, votre résultat net est de 13 003 € : 36 503 € de marge brute sur 50 499 € de CA net HT, moins 6 500 € de charges fixes et 17 000 € de masse salariale, calculé sur 100 % de votre CA.");
    expect(out).toContain("il est atteint à 10 h.");
    expect(d.records[0]).toMatchObject({ name: "lire_resultat", ok: true, summary: "3 faits lus" });
    expect(d.records[0].blocks?.map((b) => b.type)).toEqual(["table", "facts", "sources"]);
    const sans = deps({ runResultat: async () => ({ mois: [{ month: "2026-08-01", is_complete_month: true, sales_days: 31, revenue_net_ht: 50499.2, gross_margin_ht: 36503.09, coverage_pct: 1, fixed_costs_month_eur: null, payroll_month_eur: null, net_result_eur: null, payroll_to_revenue_pct: null }], jour: null }) });
    const none = await byName(buildAgentTools(sans), "lire_resultat").run({});
    expect(none).toBe("Aucun résultat net pour l’instant — vos charges fixes et votre masse salariale ne sont pas déclarées.");
    expect(sans.records[0].blocks).toEqual([{ type: "absence", manque: "Aucun résultat net pour l’instant — vos charges fixes et votre masse salariale ne sont pas déclarées.", geste: { label_fr: "Déclarer vos charges fixes et votre masse salariale", url: "/app/insightevent/tableau" } }]);
  });
  it("lire_poles_classement classe sur l'indicateur et la période, Non rattaché compris ; par m² sans mesure → l'absence espace avec son geste", async () => {
    const d = deps();
    const tool = byName(buildAgentTools(d), "lire_poles_classement");
    const out = await tool.run({ indicateur: "ventes", periode: "semaine_derniere" });
    expect(out).toContain("Vos pôles du plus au moins performant en ventes, sur la semaine dernière, du 31/08/2026 au 06/09/2026 :");
    expect(out.replace(/[\u202f\u00a0]/g, " ")).toContain("• Cuisine réalise 6 667 ventes");
    expect(out).toContain("• Non rattaché réalise 40 ventes");
    expect(d.records[0]).toMatchObject({ name: "lire_poles_classement", ok: true, summary: "3 pôles classés en ventes" });
    expect(d.records[0].blocks?.map((b) => b.type)).toEqual(["table", "sources"]);
    expect(d.records[0].facts?.length).toBe(4);
    const none = await tool.run({ indicateur: "ca_par_m2" });
    expect(none).toBe("Aucune mesure d’espace pour l’instant — les mètres se saisissent sur le formulaire de pôle.");
    expect(d.records[1].blocks?.[0]).toMatchObject({ type: "absence", geste: { label_fr: "Vos pôles", url: "/profile?tab=poles" } });
  });
  it("composer_rapport lit en une vague ce que les sections demandent et rend UN bloc rapport avec la provenance ; l'inconnu est dit", async () => {
    const d = deps();
    const out = await byName(buildAgentTools(d), "composer_rapport").run({ sections: "volume, panier, mix, résultat net, et les pôles en nombre de ventes, la couleur des murs", periode: "30_derniers_jours", indicateur: "ventes" });
    expect(out).toContain("Rapport composé, vos 30 derniers jours, du 13/08/2026 au 11/09/2026 : Nombre de ventes · Panier moyen · Mix produits & services · Résultat net · Vos pôles · du plus au moins performant · Sources et fiabilité.");
    expect(out).toContain("Aucune section du Rapport ne correspond à : « la couleur des murs ».");
    const rec = d.records[0];
    expect(rec).toMatchObject({ name: "composer_rapport", ok: true, summary: "6 sections composées, vos 30 derniers jours, du 13/08/2026 au 11/09/2026 ; 1 demande non reconnue" });
    expect(rec.blocks?.length).toBe(1);
    const b = rec.blocks?.[0] as any;
    expect(b.type).toBe("rapport"); expect(b.synthese).toBeNull();
    expect(b.sections.map((s: any) => s.cle)).toEqual(["volume", "panier", "mix", "resultat_net", "poles", "sources"]);
    expect(b.sections[0].provenance.outil).toBe("lire_ventes");
    expect(b.sections[4].provenance.params).toEqual({ indicateur: "ventes", du: "2026-08-13", au: "2026-09-11" });
    expect(b.sections[4].blocs[0].type).toBe("table");
    expect(rec.facts?.some((f) => f.startsWith("Cuisine réalise"))).toBe(true);
  });
  it("composer_rapport avec modele « ventes » : les sections du rapport de ventes dans son ordre, Contexte composé (familles face aux jours), Actions dites absentes, titre par défaut", async () => {
    const d = deps();
    const tool = byName(buildAgentTools(d), "composer_rapport");
    const out = await tool.run({ modele: "ventes", periode: "mois_dernier" });
    const b = d.records[0].blocks?.[0] as any;
    expect(b.sections.map((s: any) => s.cle)).toEqual(["chiffre_affaires", "volume", "panier", "mix", "jours", "marge_brute", "contexte", "actions", "sources"]);
    expect(b.titre).toBe("Rapport de ventes — le mois dernier, du 01/08/2026 au 31/08/2026");
    // 12/09 (owner : le contexte est le différenciateur) — Contexte externe porte la carte « familles face aux jours » ; sans action sur la période, Actions dit l'absence.
    expect(b.sections.find((s: any) => s.cle === "contexte").blocs[0]).toMatchObject({ type: "card", render: "renderSignauxFamille" });
    expect(b.sections.find((s: any) => s.cle === "actions").blocs[0]).toMatchObject({ type: "absence", manque: "Aucune action issue de vos signaux de vente le mois dernier, du 01/08/2026 au 31/08/2026." });
    expect(out).toContain("Sections sans matière");
    expect(await tool.run({})).toContain("Aucune section demandée");
  });
  it("composer_rapport avec un Modèle enregistré, par son nom : ses sections, sa période et son indicateur ; un nom inconnu liste les Modèles", async () => {
    const d = deps();
    const tool = byName(buildAgentTools(d), "composer_rapport");
    await tool.run({ modele: "hebdo pôles" });
    const b = d.records[0].blocks?.[0] as any;
    expect(b.sections.map((s: any) => s.cle)).toEqual(["poles", "volume", "sources"]);
    expect(b.periode).toMatchObject({ du: "2026-08-31", au: "2026-09-06", relative: "semaine_derniere" });
    expect(b.titre).toBe("Hebdo pôles — la semaine dernière, du 31/08/2026 au 06/09/2026");
    expect(b.sections[0].provenance.params.indicateur).toBe("ventes");
    const out = await tool.run({ modele: "trimestriel" });
    expect(out).toBe("Aucun Modèle de rapport nommé « trimestriel » sur ce site. Modèles disponibles : Rapport de ventes, Hebdo pôles.");
    expect(d.records[1].summary).toBe("modèle « trimestriel » inconnu");
  });
});

describe("proposer_operation — une Proposition d'opération faite de faits lus dans le tour, jamais créée (12/09, incrément 6)", () => {
  it("sans lecture préalable, refuse : aucun fait ne motive la proposition", async () => {
    const d = deps();
    const out = await byName(buildAgentTools(d), "proposer_operation").run({ titre: "Samedi des épices", dispositif: "Une dégustation de mélanges à l'entrée", dates: ["2026-09-19"], pourquoi: ["Épices génère 462 € par jour."] });
    expect(out).toMatch(/^Aucun fait lu ne motive cette proposition \(1 phrase\(s\) écartée\(s\)/);
    expect(d.records[0]).toMatchObject({ name: "proposer_operation", ok: true });
    expect(d.records[0].blocks).toBeUndefined();
  });
  it("après lire_familles, une phrase reprise de l'outil motive la proposition ; la famille, les dates, l'objectif et la cible sont dans le bloc et l'URL du formulaire", async () => {
    const d = deps();
    const tools = buildAgentTools(d);
    await byName(tools, "lire_familles").run({});
    const fait = d.records[0].facts?.find((f) => f.includes("462")) ?? "";
    expect(fait).toBeTruthy();
    const out = await byName(tools, "proposer_operation").run({ titre: "Samedi des épices", dispositif: "Une dégustation de mélanges à l'entrée, de 10 h à 13 h", type: "degustation", familles: ["Épices"], cible: 600, dates: ["2026-09-19", "2026-09-26"], pourquoi: [fait, "Le samedi, Épices génère 900 € par jour."] });
    const rec = d.records[1];
    expect(rec.summary).toBe("Proposition d'opération « Samedi des épices » les 19/09/2026 et 26/09/2026 ; 1 phrase écartée");
    const b = rec.blocks?.[0] as any;
    expect(b).toMatchObject({ type: "proposition_operation", titre: "Samedi des épices", event_type: { value: "degustation", label_fr: "Dégustation" }, familles: ["Épices"], objectif: { kpi: "family_revenue" }, cible: { valeur: 600, unite: "€" }, dates: ["2026-09-19", "2026-09-26"], pourquoi: [fait] });
    expect(b.url).toBe("/app/insightevent/evenement?location_id=loc-1&new=1&titre=Samedi+des+%C3%A9pices&dispositif=Une+d%C3%A9gustation+de+m%C3%A9langes+%C3%A0+l%27entr%C3%A9e%2C+de+10+h+%C3%A0+13+h&type=degustation&dates=2026-09-19%2C2026-09-26&kpi=family_revenue&cible=600&familles=%C3%89pices");
    expect(rec.facts?.[0]).toBe("Proposition d'opération « Samedi des épices » (Dégustation) les 19/09/2026 et 26/09/2026, sur la famille « Épices » — objectif : CA de ce que le dispositif vend vs votre résultat habituel, cible 600 € visés sur la journée.");
    expect(out).toContain("Non retenu (chiffres absents des lectures de ce tour) : « Le samedi, Épices génère 900 € par jour. »");
    expect(out).toContain("Rien n'est créé");
  });
  it("refuse une famille inconnue, une date passée, un mot de commande dans le dispositif", async () => {
    const d = deps();
    const tools = buildAgentTools(d);
    await byName(tools, "lire_familles").run({});
    const fait = d.records[0].facts?.[0] ?? "";
    const tool = byName(tools, "proposer_operation");
    expect(await tool.run({ titre: "x", dispositif: "y", familles: ["Thés"], dates: ["2026-09-19"], pourquoi: [fait] })).toBe("Famille inconnue sur ce site : « Thés ». Familles vendues : Épices.");
    expect(await tool.run({ titre: "x", dispositif: "y", dates: ["2026-09-11"], pourquoi: [fait] })).toMatch(/^La date 11\/09\/2026 est passée/);
    expect(await tool.run({ titre: "x", dispositif: "Commandez plus de stock pour le week-end", dates: ["2026-09-19"], pourquoi: [fait] })).toMatch(/^Le nom ou le dispositif ne passe pas la relecture/);
  });
});

describe("couche 3 (13/09) — lire_dispositifs_documentes et lire_operation_famille", () => {
  it("les fiches : une ligne par fiche (la formulation du journal), un bloc facts + sources ; sans fiche, l'absence", async () => {
    const d = deps();
    const out = await byName(buildAgentTools(d), "lire_dispositifs_documentes").run({});
    expect(out).toMatch(/^• Documenté le 10\/08\/2026 : « une table de dégustation à l'entrée » — /);
    expect(out).toContain("test : « La prochaine occurrence dépasse l’attendu du jour »");
    expect(d.records[0]).toMatchObject({ summary: "1 fiche" });
    expect(d.records[0].blocks?.map((b) => b.type)).toEqual(["facts", "sources"]);
    const d2 = deps({ listDispositifsDocumentes: async () => [] });
    await byName(buildAgentTools(d2), "lire_dispositifs_documentes").run({});
    expect(d2.records[0].blocks?.[0]).toMatchObject({ type: "absence", geste: { label_fr: "Vos opérations" } });
  });
  it("une opération × une famille : l'opération et la famille reconnues par leur nom, la période = la vie de l'opération, chaque ligne de table redite comme un fait", async () => {
    const d = deps();
    const out = await byName(buildAgentTools(d), "lire_operation_famille").run({ operation: "corner producteur", familles: ["épices"] });
    expect(d.records[0].summary).toBe("Corner producteur × Épices, du 08/08/2026 au 12/09/2026");
    expect(out).toContain("• Ventes/jour avec Épices : 34 pendant l'opération, 23 habituellement (+51,1 %).");
    expect(out).toContain("• Ce qui bouge pendant l'opération pour la famille Épices : Ventes/jour avec Épices +51,1 %, CA/jour Épices +41 %, Part de Épices dans le CA +1,7 % · ce qui ne suit pas : Panier moyen avec Épices −8,1 %.");
    expect(d.records[0].blocks?.some((b) => b.type === "table")).toBe(true);
    // 13/09 (§ 7, couche 6) — une entrée qui manque = une clarification : les choix réels du site en puces, envoyables tels quels.
    expect(await byName(buildAgentTools(d), "lire_operation_famille").run({ operation: "Soldes", familles: ["Épices"] })).toBe("Aucune opération nommée « Soldes » sur ce site. Laquelle ? Opérations du site : « Corner producteur ».");
    expect(d.records[1].blocks).toEqual([{ type: "prose", md: "Aucune opération nommée « Soldes » sur ce site. Laquelle ?" }, { type: "clarification", chips: [{ label_fr: "Corner producteur", send: "Pendant « Corner producteur », qu'a fait la famille Épices ?" }] }]);
    expect(await byName(buildAgentTools(d), "lire_operation_famille").run({ operation: "Corner producteur", familles: ["Thés"] })).toBe("Famille inconnue sur ce site : « Thés ». Laquelle ? Familles : Épices.");
    expect(d.records[2].blocks?.[1]).toEqual({ type: "clarification", chips: [{ label_fr: "Épices", send: "Pendant « Corner producteur », qu'a fait la famille Épices ?" }] });
    await byName(buildAgentTools(d), "lire_ventes").run({ du: "2026-09-10", au: "2026-09-01" });
    expect(d.records[3].blocks?.[1]).toMatchObject({ type: "clarification", chips: [{ label_fr: "Les 30 derniers jours", send: "Mes ventes des 30 derniers jours" }, { label_fr: "La semaine dernière", send: "Mes ventes de la semaine dernière" }, { label_fr: "Le mois dernier", send: "Mes ventes du mois dernier" }] });
  });
});

describe("couche 4 (13/09) — composer_plan", () => {
  it("refuse une période passée (composer_rapport), compose le plan à venir en blocs (titres, table de santé, sources) et redit chaque ligne de table comme un fait", async () => {
    const d = deps();
    const tool = byName(buildAgentTools(d), "composer_plan");
    expect(await tool.run({ du: "2026-08-01", au: "2026-08-31" })).toMatch(/avant aujourd'hui : un plan porte sur ce qui vient/);
    const out = await tool.run({ du: "2026-10-01", au: "2026-10-31" });
    expect(d.records[1].summary).toMatch(/^le plan, du 01\/10\/2026 au 31\/10\/2026 : \d+ sections$/);
    expect(out.split("\n")[0]).toBe("• Votre plan — du 01/10/2026 au 31/10/2026");
    const types = d.records[1].blocks?.map((b) => b.type) ?? [];
    expect(types[0]).toBe("prose"); expect(types).toContain("table"); expect(types).toContain("sources");
    expect(d.records[1].facts?.some((f) => f.startsWith("La santé de l'entreprise — "))).toBe(true);
  });
});

describe("couche 5 (13/09) — ecrire_declaration", () => {
  it("écrit une marge (bornes du registre), confirme avec le mot approuvé, refuse hors bornes ; la clientèle dit la valeur précédente ; oublier retire", async () => {
    const d = deps();
    const tool = byName(buildAgentTools(d), "ecrire_declaration");
    const out = await tool.run({ type: "marge_pct", valeur: 62 });
    expect(out).toBe("Marge notée : 62 %\nMarge de 62 % — déclarée par Nadia, retenue. Je l'utiliserai pour vos questions (estimations, jamais présentées comme mesurées). Modifiable à tout moment : redéclarez une valeur, ou « Oublier » dans le panneau mémoire.");
    expect(d.written[0]).toEqual({ declaration: "marge_pct", valeur: 62 });
    expect(d.records[0]).toMatchObject({ summary: "marge notée : 62 %" });
    expect(d.records[0].blocks?.map((b) => b.type)).toEqual(["prose", "facts"]);
    expect(await tool.run({ type: "marge_pct", valeur: 120 })).toBe("La marge moyenne s'écrit en % entre 1 et 95.");
    expect(await tool.run({ type: "clientele", valeur: 300 })).toContain("Votre clientèle déclarée passe de 250 clients à 300 clients (déclarée par Nadia).");
    expect(await tool.run({ type: "clientele", action: "oublier" })).toBe("Clientèle déclarée oubliée (elle valait 250 clients).");
    expect(await tool.run({ type: "marge_pct", action: "oublier" })).toBe("Aucune marge déclarée à oublier.");
    expect(await tool.run({ type: "surface_vente_m2", action: "oublier" })).toMatch(/^Une surface de vente déclarée ne s'oublie pas/);
    expect(await tool.run({ type: "surface_vente_m2", valeur: 120.5 })).toContain("Surface de vente notée : 120,5 m²");
  });
});

describe("incrément 8 (13/09) — lire_plan et pont_de_marge", () => {
  it("lire_plan : les contours en vigueur teintés par le CA par m², un fait par pôle, le plus fort dit ; sans contour, l'absence", async () => {
    const d = deps();
    const out = await byName(buildAgentTools(d), "lire_plan").run({});
    expect(d.records[0].summary).toBe("2 pôles sur le plan, CA par m² sur 30 jours");
    const b = d.records[0].blocks?.[0] as any;
    expect(b.type).toBe("plan"); expect(b.zones.map((z: any) => [z.label, z.polygons.length, z.rang, z.value_fr])).toEqual([["Cave", 1, 2, "100 €"], ["Épicerie fine", 2, 1, "267 €"]]);
    expect(b.viewBox[2]).toBeGreaterThan(140); expect(b.surface_totale_m2).toBe(75);
    expect(nb(out)).toContain("• Épicerie fine : 45,00 m² de surface de vente · 267 € de CA par m² sur 30 jours (du 14/08/2026 au 12/09/2026) — le plus fort.");
    const d2 = deps({ listZones: async () => [] });
    await byName(buildAgentTools(d2), "lire_plan").run({ mesure: "marge_par_m2" });
    expect(d2.records[0].blocks?.[0]).toMatchObject({ type: "absence" });
  });
  it("pont_de_marge : quatre effets dont la somme est l'écart, les familles sans prix d'achat hors pont et dites, les périodes par défaut", async () => {
    const d = deps();
    const out = await byName(buildAgentTools(d), "pont_de_marge").run({});
    expect(out.split("\n")[0]).toBe("Périodes lues : A du 14/07/2026 au 12/08/2026, B du 13/08/2026 au 11/09/2026.");
    const rec = d.records[0];
    expect(rec.summary).toBe("écart +150 € en 4 effets, 2 familles");
    expect(nb(out)).toContain("Marge brute des familles costées : 850 € les 30 jours précédents (du 14/07/2026 au 12/08/2026) → 1 000 € vos 30 derniers jours (du 13/08/2026 au 11/09/2026), soit +150 €.");
    expect(nb(out)).toContain("Hors pont (sans prix d'achat sur l'une des deux périodes) : Branded (0 € → 100 € de CA).");
    expect(rec.blocks?.map((b) => b.type)).toEqual(["table", "barres_h", "table", "facts", "sources"]);
  });
});
const nb = (s: string) => s.replace(/[\u202f\u00a0]/g, " ");
