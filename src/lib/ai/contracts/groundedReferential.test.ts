// I4 (spec docs/explorer-routage-inversion-spec.md § 3.7) — LE RÉFÉRENTIEL PAR PHRASE. Lie-bait pour
// deux règles ajoutées au validateur du jour, toutes deux nées d'une réponse réelle (03/09, f10c3e58,
// « combien j'ai vendu hier ? ») : « 1 439 € contre 1 533 € pour un jeudi — un écart de +70 % vs cette
// référence ». Chaque nombre existait dans le payload : 1 533 € = moyenne des jeudis (fait A), +70 % =
// résidu du mercredi 02/09 vs 847 € (fait B). L'ancien contrôle (« le nombre existe QUELQUE PART dans
// le payload ») laissait passer ; un lecteur calcule −6 % et lit +70 %.
//   Règle 1 — COHÉRENCE D'UNE COMPARAISON : une phrase qui porte deux montants en €, un marqueur de
//   comparaison et un écart signé en % doit vérifier écart ≈ (a−b)/b (à 1 point près, arrondis compris).
//   Règle 2 — LOCALITÉ : avec sentence_provenance, un nombre d'une phrase doit figurer dans les faits que
//   CETTE phrase cite (ou se recomposer d'eux), plus seulement quelque part dans le payload.
import { describe, it, expect } from "vitest";
import { validate_packager_output_grounded_day } from "./packagerGroundedDayValidator";
import { comparisonInconsistency, extractNumbersWithUnits } from "./groundingChecks";

// Les DEUX faits réels du 03/09 (buildDayPerformanceFacts, branche TODAY/FUTURE), plus un fait météo.
const payload = () => ({
  horizon: "day", question: "combien j'ai vendu hier ?", date: "2026-09-03", display_date: "03/09/2026",
  citable_facts: [
    { id: "fA", fact_fr: "Votre CA habituel pour un jeudi : ~1 533 € (moyenne de vos 10 derniers jeudis mesurés).", claim_type: "observed" },
    { id: "fB", fact_fr: "Dernier jour mesuré (02/09/2026) : 1 439 € — +70 % vs votre CA habituel.", claim_type: "observed_difference" },
    { id: "fC", fact_fr: "CA réalisé le 02/09/2026 : 1 439 € — +70 % vs votre CA habituel (847 €, base jour de semaine et tendance).", claim_type: "observed_difference" },
    { id: "fW", fact_fr: "Forte chaleur — 34 °C ressenti.", claim_type: "observed_acute" },
  ],
  signals: { changes: [], cards: [] },
  driver: { value: null, claim_type: "observed_ranking" },
  engines: { sensitivities: [], decomposition: [], track_record: {} },
  forbidden: [],
  venue: { site_name: null, location_type: null, business_description: null },
});

const out = (answer: string, cited: string[], provenance?: Array<{ text: string; fact_ids: string[] }>) => ({
  headline: "Verdict du jour.", answer, key_facts: [], caveats: [], cited_fact_ids: cited,
  ...(provenance ? { sentence_provenance: provenance } : {}),
});

describe("comparisonInconsistency (la primitive)", () => {
  it("la phrase réelle du 03/09 : +70 % ne relie pas 1 439 € et 1 533 € (écart réel −6 %)", () => {
    const r = comparisonInconsistency("Hier votre CA a atteint 1 439 €, contre un CA habituel d'environ 1 533 € pour un jeudi — un écart de +70 % vs cette référence.");
    expect(r).not.toBeNull();
    expect(r!.stated).toBe(70);
    expect(Math.round(r!.actual)).toBe(-6);
  });
  it("la même forme, cohérente : 1 439 € vs 847 €, +70 % → null", () => {
    expect(comparisonInconsistency("CA de 1 439 € au lieu de 847 € habituels, soit +70 %.")).toBeNull();
  });
  it("tolérance d'arrondi : 1 240 € contre 1 500 €, −17 % (réel −17,33) → null ; −12 % → incohérent", () => {
    expect(comparisonInconsistency("1 240 € contre 1 500 € habituel, soit −17 %.")).toBeNull();
    expect(comparisonInconsistency("1 240 € contre 1 500 € habituel, soit −12 %.")).not.toBeNull();
  });
  it("faux positif mesuré 04/09 (« Pourquoi le 28/08 ? ») : le % qualifie le panier, pas les deux montants → null", () => {
    expect(comparisonInconsistency("La tranche horaire de 12 h a particulièrement porté la journée avec 149 € contre 49 € attendus, même si le panier moyen était en repli (−10 % vs sa base).")).toBeNull();
    expect(comparisonInconsistency("CA de 1 439 € contre 847 € habituels ; le panier moyen recule de −3 %.")).toBeNull();
  });
  it("vrais positifs mesurés 04/09 (deux formes réelles) : rejet", () => {
    expect(comparisonInconsistency("Hier (02/09/2026), le CA s'est élevé à 1 439 €, soit +70 % au-dessus de votre CA habituel du jeudi (~1 533 € en moyenne).")).not.toBeNull();
    expect(comparisonInconsistency("Le dernier jour mesuré (02/09/2026) affiche 1 439 € contre un CA habituel de jeudi d'environ 1 533 € — l'écart annoncé (+70 %) se lit vs cette même base de comparaison.")).not.toBeNull();
  });
  it("arrondi des montants (batterie qualité 04/09) : « 35 € contre 25 € (+38 %) » depuis 35,2 / 25,5 → null ; +50 % → rejet", () => {
    expect(comparisonInconsistency("Par pluie, Flavours atteint 35 € en moyenne contre 25 € hors condition (+38 %, sur 7 jours).")).toBeNull();
    expect(comparisonInconsistency("Par pluie, Flavours atteint 35 € en moyenne contre 25 € hors condition (+50 %, sur 7 jours).")).not.toBeNull();
    // Les grands montants ne gagnent presque rien : 1 439 € contre 1 533 €, +70 % reste rejeté.
    expect(comparisonInconsistency("1 439 € contre 1 533 € habituels, soit +70 %.")).not.toBeNull();
  });
  it("hors champ : pas de marqueur de comparaison, ou % non signé, ou trois montants → null (pas de faux rejet)", () => {
    expect(comparisonInconsistency("CA 1 439 €, panier 4,81 €, la famille Coffee pèse 39 % du CA.")).toBeNull();
    expect(comparisonInconsistency("1 439 € contre 1 533 € : 70 % du CA vient du matin.")).toBeNull();
    expect(comparisonInconsistency("1 439 € contre 1 533 € et 847 €, +70 %.")).toBeNull();
  });
});

describe("validate_packager_output_grounded_day — règle 1, cohérence d'une comparaison", () => {
  it("LIE-BAIT (réponse réelle du 03/09) : tous les nombres existent dans le payload, la comparaison est fausse → rejet", () => {
    const s = "Hier (02/09/2026) votre CA a atteint 1 439 €, contre un CA habituel d'environ 1 533 € pour un jeudi — un écart de +70 % vs cette référence.";
    const [ok, errs] = validate_packager_output_grounded_day(
      out(s, ["fA", "fB"], [{ text: s, fact_fr: undefined, fact_ids: ["fA", "fB"] } as any]), payload());
    expect(ok).toBe(false);
    expect(errs.join(" ")).toMatch(/référentiel|referentiel/i);
    expect(errs.join(" ")).toContain("1533");
  });
  it("la même comparaison, au bon référentiel (847 €) → passe", () => {
    const s = "Le 02/09/2026, votre CA a atteint 1 439 €, contre 847 € habituels — un écart de +70 %.";
    const [ok, errs] = validate_packager_output_grounded_day(
      out(s, ["fC"], [{ text: s, fact_ids: ["fC"] }]), payload());
    expect(errs).toEqual([]);
    expect(ok).toBe(true);
  });
  it("sans provenance, la règle 1 s'applique quand même (elle ne dépend que de la phrase)", () => {
    const s = "1 439 € contre 1 533 € habituels pour un jeudi, soit +70 %.";
    const [ok, errs] = validate_packager_output_grounded_day(out(s, ["fA", "fB"]), payload());
    expect(ok).toBe(false);
    expect(errs.join(" ")).toMatch(/référentiel|referentiel/i);
  });
});

describe("validate_packager_output_grounded_day — règle 2, localité des nombres", () => {
  it("un nombre présent dans le payload mais dans un fait que la phrase ne cite PAS → rejet", () => {
    const s = "Votre CA habituel d'un jeudi est de 1 533 €.";
    const [ok, errs] = validate_packager_output_grounded_day(
      out(s, ["fB"], [{ text: s, fact_ids: ["fB"] }]), payload());   // 1 533 vit dans fA, la phrase cite fB
    expect(ok).toBe(false);
    expect(errs.join(" ")).toContain("1533");
  });
  it("le même nombre, la phrase cite le bon fait → passe", () => {
    const s = "Votre CA habituel d'un jeudi est de 1 533 €.";
    const [ok, errs] = validate_packager_output_grounded_day(
      out(s, ["fA"], [{ text: s, fact_ids: ["fA"] }]), payload());
    expect(errs).toEqual([]);
    expect(ok).toBe(true);
  });
  it("la date affichée et les nombres du payload hors faits (signaux, date) restent permis partout", () => {
    const s = "Le 03/09/2026, aucune alerte.";
    const [ok, errs] = validate_packager_output_grounded_day(
      out(s, ["fW"], [{ text: s, fact_ids: ["fW"] }]), payload());
    expect(errs).toEqual([]);
    expect(ok).toBe(true);
  });
  it("sans provenance : repli global inchangé (le nombre existe dans le payload → passe)", () => {
    const [ok, errs] = validate_packager_output_grounded_day(out("Votre CA habituel d'un jeudi est de 1 533 €.", ["fB"]), payload());
    expect(errs).toEqual([]);
    expect(ok).toBe(true);
  });
  it("le nombre de la QUESTION (« chuté de 40 % ») peut être repris pour être contesté → passe (batterie qualité 04/09)", () => {
    const p = { ...payload(), question: "Mon CA a chuté de 40 % samedi dernier, pourquoi ?" };
    const s = "Vous parlez de −40 % : le 02/09/2026, votre CA a atteint 1 439 €, contre 847 € habituels — un écart de +70 %.";
    const [ok, errs] = validate_packager_output_grounded_day(out(s, ["fC"], [{ text: s, fact_ids: ["fC"] }]), p);
    expect(errs).toEqual([]);
    expect(ok).toBe(true);
  });
  it("arithmétique bornée : 260 € recomposé des faits CITÉS PAR LA PHRASE passe encore", () => {
    const p = payload();
    p.citable_facts.push({ id: "f0", fact_fr: "CA réalisé 1 240 € contre 1 500 € habituel un mercredi.", claim_type: "measured" } as any);
    const s = "Le CA affiche 1 240 € contre 1 500 € habituel, soit un écart de 260 €.";
    const [ok, errs] = validate_packager_output_grounded_day(out(s, ["f0"], [{ text: s, fact_ids: ["f0"] }]), p);
    expect(errs).toEqual([]);
    expect(ok).toBe(true);
  });
});

describe("extractNumbersWithUnits — milliers en insécable (défaut latent trouvé le 04/09)", () => {
  it("« 1\u202f439 € » et « 1\u00a0439 € » donnent 1439, jamais 1 et 439", () => {
    expect(extractNumbersWithUnits("CA de 1\u202f439 € hier").map((x) => x.v)).toEqual([1439]);
    expect(extractNumbersWithUnits("CA de 1\u00a0439 € hier").map((x) => x.v)).toEqual([1439]);
    expect(extractNumbersWithUnits("CA de 1 439 € hier").map((x) => x.v)).toEqual([1439]);
  });
});
