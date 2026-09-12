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
    // 12/09 : lire_ventes — le rapport de ventes tel que computeSalesReport le rend (champs lus par composeVentesFacts).
    runVentes: async (start, end) => start > "2026-09-01"
      ? { body: { ok: false, error: "NO_DATA" }, prev_revenue: null }
      : { prev_revenue: 33_400, body: { ok: true, period: { start, end },
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
    today: () => "2026-09-12",
    record: (r) => records.push(r),
    ...over,
  };
  return Object.assign(base, { records, written });
}
const byName = (tools: any[], name: string) => tools.find((t) => t.name === name);

describe("agentTools — cinq outils, chacun enregistré avec un résumé en français", () => {
  it("expose les cinq outils de lecture d'espace et les trois lecteurs chiffrés (12/09) — et chacun a son libellé", () => {
    const names = buildAgentTools(deps()).map((t: any) => t.name);
    expect(names).toEqual(["lire_poles", "lire_familles", "lire_photos", "lire_memoire", "ecrire_memoire", "lire_marge", "lire_espace", "lire_familles_face_aux_jours", "lire_ventes", "lire_resultat", "lire_poles_classement", "composer_rapport"]);
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
    expect(rec).toMatchObject({ name: "lire_marge", ok: true, summary: "1 fait lus" });
    expect(rec.blocks?.map((b) => b.type)).toEqual(["card", "sources"]);
    expect((rec.blocks?.[0] as any).render).toBe("renderMarge");
    expect(rec.facts).toEqual(["Sur vos 30 derniers jours, votre marge brute est de 19 845 €, soit un taux de marge brute de 40 %."]);
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
    expect(d.records[1].blocks).toEqual([{ type: "absence", manque: "Aucune vente du 02/09/2026 au 04/09/2026.", geste: null }]);
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
  it("composer_rapport avec modele « ventes » : les sections du rapport de ventes dans son ordre, Contexte et Actions dits « pas encore composés », titre par défaut", async () => {
    const d = deps();
    const tool = byName(buildAgentTools(d), "composer_rapport");
    const out = await tool.run({ modele: "ventes", periode: "mois_dernier" });
    const b = d.records[0].blocks?.[0] as any;
    expect(b.sections.map((s: any) => s.cle)).toEqual(["chiffre_affaires", "volume", "panier", "mix", "jours", "marge_brute", "contexte", "actions", "sources"]);
    expect(b.titre).toBe("Rapport de ventes — le mois dernier, du 01/08/2026 au 31/08/2026");
    expect(b.sections.find((s: any) => s.cle === "contexte").blocs[0]).toMatchObject({ type: "absence", geste: { label_fr: "Rapport de ventes", url: "/app/insightevent/rapport" } });
    expect(out).toContain("Sections sans matière");
    expect(await tool.run({})).toContain("Aucune section demandée");
  });
});
