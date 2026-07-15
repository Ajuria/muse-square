// Per-sentence cite-with-reasoning (Phase 1 change #6) — lie-bait suite for the provenance tightening.
// Spec acceptance, verbatim: "A planted 'Festival Imaginaire de Nîmes' in a sentence citing an unrelated
// fact is rejected; a legitimate composed name in a correctly-cited sentence passes." Plus the strict-
// stronger case the old global scan waved through (entity real in fact f7, surfaced citing f2) and the
// graceful fallback when provenance is absent.
import { describe, it, expect } from "vitest";
import { validate_packager_output_grounded_day } from "./packagerGroundedDayValidator";

// f0 measured · f2 competitor "Café Guimet" · f7 competitor "Musée Rodin" (real, but a DIFFERENT fact)
const payload = () => ({
  horizon: "day", question: "q", date: "2026-07-15", display_date: "15/07/2026",
  citable_facts: [
    { id: "f0", fact_fr: "CA réalisé 1 240 € contre 1 500 € habituel un mercredi.", claim_type: "measured", tier: "preliminaire" },
    { id: "f2", fact_fr: "Concurrent à 300 m · Café Guimet", claim_type: "observed_proximity" },
    { id: "f7", fact_fr: "Concurrent à 800 m · Musée Rodin", claim_type: "observed_proximity" },
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

describe("per-sentence provenance (Phase 1 #6)", () => {
  it("spec: planted entity in a sentence citing an unrelated fact -> rejected", () => {
    const [ok, errs] = validate_packager_output_grounded_day(
      out("Le Festival Imaginaire de Nîmes a marqué la journée.", ["f0"],
          [{ text: "Le Festival Imaginaire de Nîmes a marqué la journée.", fact_ids: ["f0"] }]), payload());
    expect(ok).toBe(false);
    expect(errs.join(" ")).toMatch(/Festival Imaginaire/);
  });
  it("spec: legitimate composed name in a correctly-cited sentence -> passes", () => {
    const [ok, errs] = validate_packager_output_grounded_day(
      out("Un concurrent, le Café Guimet, est à proximité.", ["f2"],
          [{ text: "Un concurrent, le Café Guimet, est à proximité.", fact_ids: ["f2"] }]), payload());
    expect(errs).toEqual([]);
    expect(ok).toBe(true);
  });
  it("strict-stronger: entity REAL in f7 but surfaced in a sentence citing f2 -> rejected (global scan missed this)", () => {
    const [ok, errs] = validate_packager_output_grounded_day(
      out("Le concurrent Musée Rodin pèse sur la journée.", ["f2", "f7"],
          [{ text: "Le concurrent Musée Rodin pèse sur la journée.", fact_ids: ["f2"] }]), payload());
    expect(ok).toBe(false);
    expect(errs.join(" ")).toMatch(/Musée Rodin/);
  });
  it("same entity, correctly cited to f7 -> passes", () => {
    const [ok, errs] = validate_packager_output_grounded_day(
      out("Le concurrent Musée Rodin est à proximité.", ["f7"],
          [{ text: "Le concurrent Musée Rodin est à proximité.", fact_ids: ["f7"] }]), payload());
    expect(errs).toEqual([]);
    expect(ok).toBe(true);
  });
  it("hiding hole: entity in answer with NO covering provenance entry -> rejected (undeclared claim)", () => {
    const [ok, errs] = validate_packager_output_grounded_day(
      out("Le Café Guimet est à proximité.", ["f2"],
          [{ text: "Une phrase sans nom propre.", fact_ids: ["f0"] }]), payload());
    expect(ok).toBe(false);
    expect(errs.join(" ")).toMatch(/undeclared claim/);
  });
  it("unknown fact_id in provenance -> rejected", () => {
    const [ok, errs] = validate_packager_output_grounded_day(
      out("Le Café Guimet est à proximité.", ["f2"],
          [{ text: "Le Café Guimet est à proximité.", fact_ids: ["f99"] }]), payload());
    expect(ok).toBe(false);
    expect(errs.join(" ")).toMatch(/unknown fact_id/);
  });
  it("fallback: NO sentence_provenance -> global entity scan still applies (never weaker)", () => {
    // Planted entity, no provenance at all: the old global path must still reject it.
    const [ok, errs] = validate_packager_output_grounded_day(
      out("Le Festival Imaginaire de Nîmes a marqué la journée.", ["f0"]), payload());
    expect(ok).toBe(false);
    expect(errs.join(" ")).toMatch(/ungrounded named entity/);
  });
  it("fallback: NO provenance, grounded entity -> passes via global scan", () => {
    // Mid-sentence so the entity regex extracts just "Café Guimet" (a leading capitalized article like
    // "Le" at sentence start would be grabbed into the token — pre-existing global-scan behaviour).
    const [ok, errs] = validate_packager_output_grounded_day(
      out("Un concurrent, le Café Guimet, est à proximité.", ["f2"]), payload());
    expect(errs).toEqual([]);
    expect(ok).toBe(true);
  });
});
