// Lie-bait de la lecture des photos : chaque invention plantée doit TOMBER ; une personne visible
// doit être signalée (l'appelant efface). Un test vert ici sans le rouge d'à côté ne prouve rien.
import { describe, it, expect } from "vitest";
import { validatePhotoExtraction } from "./photoExtractionChecks";
import { photoExtractionSchema, photoExtractionSystem, photoQuestions } from "../photoExtraction";
import { ALL_CHECKLIST_KEYS } from "../../dispositifs/dispositifTypes";

const KEYS = photoQuestions({ type: "lineaire", role: "expert" }).map((q) => q.key);
const CODES = ["CF-001", "CF-002"];
const FAMS = ["Épices", "Thés"];
const good = () => ({
  person_visible: false, coverage: "entier",
  exposition: "rayonnage", levels: 3, families_present: ["Épices"],
  checklist: Object.fromEntries(KEYS.map((k) => [k, "non_visible"])),
  items: [{ item_code: "CF-001", confidence: "haute" }],
  prices: [{ label: "Poivre de Kampot 12,90", price_eur: 12.9, item_code: "CF-001" }],
});

describe("validatePhotoExtraction — lie-bait", () => {
  it("une réponse conforme passe, et rend l'exposition, les niveaux et les familles normalisés", () => {
    const r = validatePhotoExtraction(good(), KEYS, CODES, FAMS);
    expect(r).toEqual({ ok: true, errors: [], rejected_person: false, exposition: "rayonnage", levels: 3, families_present: ["Épices"] });
  });
  it("v2 — une exposition hors des cinq mots owner tombe ; une exposition absente aussi", () => {
    const o: any = good(); o.exposition = "etagere";
    const r = validatePhotoExtraction(o, KEYS, CODES, FAMS);
    expect(r.ok).toBe(false); expect(r.errors.join(" ")).toContain("exposition inconnue « etagere »");
    const o2: any = good(); delete o2.exposition;
    expect(validatePhotoExtraction(o2, KEYS, CODES, FAMS).ok).toBe(false);
  });
  it("v2 — des niveaux posés sur un comptoir sont NORMALISÉS à null, sans erreur ; sur un rayonnage ils doivent être un entier > 0", () => {
    const o: any = good(); o.exposition = "comptoir"; o.levels = 4;
    const r = validatePhotoExtraction(o, KEYS, CODES, FAMS);
    expect(r.ok).toBe(true); expect(r.levels).toBeNull(); expect(r.exposition).toBe("comptoir");
    const o2: any = good(); o2.levels = 2.5;
    expect(validatePhotoExtraction(o2, KEYS, CODES, FAMS).errors.join(" ")).toContain("niveaux invalides « 2.5 »");
    const o3: any = good(); o3.levels = 0;
    expect(validatePhotoExtraction(o3, KEYS, CODES, FAMS).ok).toBe(false);
    const o4: any = good(); o4.levels = null;   // un rayonnage dont on ne compte pas les niveaux : accepté
    expect(validatePhotoExtraction(o4, KEYS, CODES, FAMS)).toMatchObject({ ok: true, levels: null });
  });
  it("v2 — une famille INVENTÉE tombe (même porte que les codes d'article) ; les doublons sont fondus", () => {
    const o: any = good(); o.families_present = ["Épices", "Poissons"];
    const r = validatePhotoExtraction(o, KEYS, CODES, FAMS);
    expect(r.ok).toBe(false); expect(r.errors.join(" ")).toContain("famille hors liste « Poissons »");
    const o2: any = good(); o2.families_present = ["Thés", "Thés", "Épices"];
    expect(validatePhotoExtraction(o2, KEYS, CODES, FAMS).families_present).toEqual(["Thés", "Épices"]);
  });
  it("v2 — site sans famille : rien n'est accepté (aucun texte inventé), l'absence et le tableau vide passent", () => {
    const o: any = good(); o.families_present = ["Épices"];
    expect(validatePhotoExtraction(o, KEYS, CODES, []).ok).toBe(false);
    const o2: any = good(); delete o2.families_present;
    expect(validatePhotoExtraction(o2, KEYS, CODES, [])).toMatchObject({ ok: true, families_present: [] });
    const o3: any = good(); o3.families_present = [];
    expect(validatePhotoExtraction(o3, KEYS, CODES, [])).toMatchObject({ ok: true, families_present: [] });
  });
  it("un code d'article INVENTÉ tombe", () => {
    const o: any = good(); o.items.push({ item_code: "XX-999", confidence: "haute" });
    const r = validatePhotoExtraction(o, KEYS, CODES);
    expect(r.ok).toBe(false); expect(r.errors.join(" ")).toContain("article hors liste « XX-999 »");
  });
  it("une clé de check-list hors registre tombe ; une question sans réponse aussi", () => {
    const o: any = good(); o.checklist.ry_invention = "oui";
    expect(validatePhotoExtraction(o, KEYS, CODES).errors.join(" ")).toContain("clé hors registre « ry_invention »");
    const o2: any = good(); delete o2.checklist[KEYS[0]];
    expect(validatePhotoExtraction(o2, KEYS, CODES).errors.join(" ")).toContain(`question sans réponse « ${KEYS[0]} »`);
  });
  it("une réponse hors oui/non/non_visible tombe ; un prix rattaché à un code inconnu tombe", () => {
    const o: any = good(); o.checklist[KEYS[0]] = "peut-être";
    expect(validatePhotoExtraction(o, KEYS, CODES).ok).toBe(false);
    const o2: any = good(); o2.prices[0].item_code = "XX-1";
    expect(validatePhotoExtraction(o2, KEYS, CODES).errors.join(" ")).toContain("hors liste « XX-1 »");
  });
  it("une personne visible n'est pas une erreur : elle est SIGNALÉE pour effacement", () => {
    const o: any = good(); o.person_visible = true;
    const r = validatePhotoExtraction(o, KEYS, CODES, FAMS);
    expect(r.ok).toBe(true); expect(r.rejected_person).toBe(true);
  });
});

describe("photoExtraction — consigne et schéma générés depuis le registre", () => {
  it("le schéma énumère EXACTEMENT les clés du type × rôle, rien d'autre", () => {
    const qs = photoQuestions({ type: "lineaire", role: "expert" });
    const s = photoExtractionSchema(qs);
    expect(Object.keys(s.properties.checklist.properties)).toEqual(qs.map((q) => q.key));
    expect(s.properties.checklist.additionalProperties).toBe(false);
    expect(qs.some((q) => q.key === "ls_moyen_essai")).toBe(true);
    expect(photoQuestions({ type: "lineaire", role: "courant" }).some((q) => q.key === "ls_moyen_essai")).toBe(false);
    for (const q of qs) expect(ALL_CHECKLIST_KEYS).toContain(q.key);
  });
  it("v2 — le schéma porte l'exposition (cinq valeurs), les niveaux (entier ou null) et les familles du site ; sans famille, pas de propriété", () => {
    const qs = photoQuestions({ type: "vitrine", role: null });
    const s = photoExtractionSchema(qs, ["Épices", "Thés", "Thés"]);
    expect(s.properties.exposition.enum).toEqual(["comptoir", "vitrine", "rayonnage", "caisses_au_sol", "ilot"]);
    expect(s.properties.levels.type).toEqual(["integer", "null"]);
    expect(s.properties.families_present.items.enum).toEqual(["Épices", "Thés"]);
    expect(s.required).toEqual(expect.arrayContaining(["exposition", "levels", "families_present"]));
    const s0 = photoExtractionSchema(qs, []);
    expect(s0.properties.families_present).toBeUndefined();
    expect(s0.required).not.toContain("families_present");
    expect(s0.additionalProperties).toBe(false);
  });
  it("la consigne porte chaque question et chaque article, et dit l'absence d'articles", () => {
    const qs = photoQuestions({ type: "vitrine", role: null });
    const sys = photoExtractionSystem({ type: "vitrine", role: null, items: [{ item_code: "A1", item_description: "Ethiopia 250 g" }], families: ["Épices"] }, qs);
    expect(sys).toContain("vt_prix_visible : Au moins un prix est-il affiché ?");
    expect(sys).toContain("- A1 — Ethiopia 250 g");
    expect(sys).toContain("Quelle exposition ?"); expect(sys).toContain("Combien de niveaux ?");
    expect(sys).toContain("- rayonnage : Rayonnage");
    expect(sys).toContain("FAMILLES DU SITE\n- Épices");
    const sans = photoExtractionSystem({ type: "vitrine", role: null, items: [], families: [] }, qs);
    expect(sans).toContain("(aucun article connu pour ce site)");
    expect(sans).not.toContain("FAMILLES DU SITE"); expect(sans).not.toContain("families_present");
  });
});
