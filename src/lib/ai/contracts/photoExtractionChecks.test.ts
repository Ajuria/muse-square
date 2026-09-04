// Lie-bait de la lecture des photos : chaque invention plantée doit TOMBER ; une personne visible
// doit être signalée (l'appelant efface). Un test vert ici sans le rouge d'à côté ne prouve rien.
import { describe, it, expect } from "vitest";
import { validatePhotoExtraction } from "./photoExtractionChecks";
import { photoExtractionSchema, photoExtractionSystem, photoQuestions } from "../photoExtraction";
import { ALL_CHECKLIST_KEYS } from "../../dispositifTypes";

const KEYS = photoQuestions({ type: "lineaire", role: "expert" }).map((q) => q.key);
const CODES = ["CF-001", "CF-002"];
const good = () => ({
  person_visible: false, coverage: "entier",
  checklist: Object.fromEntries(KEYS.map((k) => [k, "non_visible"])),
  items: [{ item_code: "CF-001", confidence: "haute" }],
  prices: [{ label: "Poivre de Kampot 12,90", price_eur: 12.9, item_code: "CF-001" }],
});

describe("validatePhotoExtraction — lie-bait", () => {
  it("une réponse conforme passe", () => {
    const r = validatePhotoExtraction(good(), KEYS, CODES);
    expect(r).toEqual({ ok: true, errors: [], rejected_person: false });
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
    const r = validatePhotoExtraction(o, KEYS, CODES);
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
  it("la consigne porte chaque question et chaque article, et dit l'absence d'articles", () => {
    const qs = photoQuestions({ type: "vitrine", role: null });
    const sys = photoExtractionSystem({ type: "vitrine", role: null, items: [{ item_code: "A1", item_description: "Ethiopia 250 g" }] }, qs);
    expect(sys).toContain("vt_prix_visible : Au moins un prix est-il affiché ?");
    expect(sys).toContain("- A1 — Ethiopia 250 g");
    expect(photoExtractionSystem({ type: "vitrine", role: null, items: [] }, qs)).toContain("(aucun article connu pour ce site)");
  });
});
