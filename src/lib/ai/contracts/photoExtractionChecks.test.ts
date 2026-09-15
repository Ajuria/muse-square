// Lie-bait de la lecture des photos : chaque invention plantée doit TOMBER ; une personne visible
// doit être signalée (l'appelant efface). Un test vert ici sans le rouge d'à côté ne prouve rien.
// 13/09 — la porte reçoit un champ de plus : l'ÉTAGÈRE de chaque article (en partant du bas), celle qui
// permettra de croiser la hauteur avec la marge. Elle rend désormais les ARTICLES normalisés — c'est ce
// que l'appelant écrit, jamais la sortie brute du modèle.
import { describe, it, expect } from "vitest";
import { validatePhotoExtraction } from "./photoExtractionChecks";
import { photoExtractionSchema, photoExtractionSystem, photoQuestions } from "../photoExtraction";
import { ALL_CHECKLIST_KEYS } from "../../dispositifs/dispositifTypes";

const KEYS = photoQuestions({ type: "lineaire", role: "expert" }).map((q) => q.key);
const CODES = ["CF-001", "CF-002"];
const FAMS = ["Épices", "Thés"];
const good = () => ({
  person_visible: false, coverage: "entier",
  exposition: "rayonnage", levels: 3, base_visible: true, families_present: ["Épices"],
  checklist: Object.fromEntries(KEYS.map((k) => [k, "non_visible"])),
  items: [{ item_code: "CF-001", confidence: "haute" }],
  prices: [{ label: "Poivre de Kampot 12,90", price_eur: 12.9, item_code: "CF-001" }],
});

describe("validatePhotoExtraction — lie-bait", () => {
  it("une réponse conforme passe, et rend l'exposition, les étagères et les familles normalisés", () => {
    const r = validatePhotoExtraction(good(), KEYS, CODES, FAMS);
    // 13/09 — une ligne écrite AVANT ce jour n'a pas d'étagère : l'article passe, sa position vaut null.
    expect(r).toEqual({
      ok: true, errors: [], rejected_person: false, exposition: "rayonnage", levels: 3, families_present: ["Épices"],
      items: [{ item_code: "CF-001", confidence: "haute", etagere: null }], base_visible: true,
    });
  });
  it("v2 — une exposition hors des cinq mots owner tombe ; une exposition absente aussi", () => {
    const o: any = good(); o.exposition = "etagere";
    const r = validatePhotoExtraction(o, KEYS, CODES, FAMS);
    expect(r.ok).toBe(false); expect(r.errors.join(" ")).toContain("exposition inconnue « etagere »");
    const o2: any = good(); delete o2.exposition;
    expect(validatePhotoExtraction(o2, KEYS, CODES, FAMS).ok).toBe(false);
  });
  // 13/09 (owner : « lève la restriction de rayonnage ») — les étagères se comptent sur TOUT composant qui en
  // porte : la vitrine des couteaux d'Épices et Tout en a quatre, et la règle « rayonnage seulement » les jetait.
  it("v2 — les étagères d'un comptoir arrière ou d'une vitrine sont GARDÉES ; un compte non entier ou nul tombe", () => {
    const o: any = good(); o.exposition = "comptoir"; o.levels = 4;
    const r = validatePhotoExtraction(o, KEYS, CODES, FAMS);
    expect(r.ok).toBe(true); expect(r.levels).toBe(4); expect(r.exposition).toBe("comptoir");
    const oV: any = good(); oV.exposition = "vitrine"; oV.levels = 4;
    expect(validatePhotoExtraction(oV, KEYS, CODES, FAMS)).toMatchObject({ ok: true, levels: 4 });
    const o2: any = good(); o2.levels = 2.5;
    expect(validatePhotoExtraction(o2, KEYS, CODES, FAMS).errors.join(" ")).toContain("étagères invalides « 2.5 »");
    const o3: any = good(); o3.levels = 0;
    expect(validatePhotoExtraction(o3, KEYS, CODES, FAMS).ok).toBe(false);
    const o4: any = good(); o4.levels = null;   // un composant sans étagère, ou qu'on ne peut pas compter : accepté
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

// ── 13/09 — L'ÉTAGÈRE DE CHAQUE ARTICLE (owner : « le gain étagère »). Sans elle, on ne sait que compter
// les étagères d'un meuble ; avec elle, on pourra dire ce qui se vend en haut et ce qui se vend en bas.
// La règle de la porte : une INVENTION rejette (code, confiance), une position qu'on ne peut pas BORNER
// est ramenée à null — on perd la position, jamais la photo.
describe("l'étagère d'un article — bornée par les étagères du composant", () => {
  const avecEtagere = (etagere: unknown, levels: unknown = 3, base_visible: unknown = true) => {
    const o: any = good(); o.levels = levels; o.base_visible = base_visible;
    o.items = [{ item_code: "CF-001", confidence: "haute", etagere }];
    return validatePhotoExtraction(o, KEYS, CODES, FAMS);
  };

  it("une position tenable est gardée, et c'est elle que l'appelant écrit", () => {
    const r = avecEtagere(2);
    expect(r.ok).toBe(true);
    expect(r.items).toEqual([{ item_code: "CF-001", confidence: "haute", etagere: 2 }]);
  });

  it("les bornes tiennent : la première et la dernière étagère du composant passent", () => {
    expect(avecEtagere(1).items[0].etagere).toBe(1);
    expect(avecEtagere(3).items[0].etagere).toBe(3);
  });

  it("au-dessus des étagères du composant : ramenée à null, et la photo est GARDÉE", () => {
    const r = avecEtagere(5, 3);
    expect(r.ok, "une position intenable ne fait pas perdre la photo").toBe(true);
    expect(r.items[0].etagere).toBeNull();
  });

  // 13/09 — ce cas a fait tomber la porte, et c'est elle qui a cédé : `Number(true)` vaut 1, un booléen
  // entrait donc comme « première étagère ». Une position est un NOMBRE, sinon elle n'existe pas.
  it("zéro, négative, décimale, écrite en toutes lettres, ou d'un autre type : null", () => {
    for (const v of [0, -1, 1.5, "deuxième", "2", true, false, [], {}]) {
      expect(avecEtagere(v).items[0].etagere, `étagère « ${JSON.stringify(v)} »`).toBeNull();
    }
  });

  it("le composant n'a pas d'étagères comptées : AUCUNE position n'est retenue — rien ne la borne", () => {
    expect(avecEtagere(2, null).items[0].etagere).toBeNull();
  });

  // ── 15/09 — L'ANCRE EST LE MEUBLE, PAS LE CADRE (mesure `data/shots/verdict-lecture-etageres-2026-09-15.md`).
  // Ce que la mesure a montré : le modèle place JUSTE (11 positions sur 11 sur un rayonnage droit), mais
  // le NUMÉRO qu'il rendait se comptait depuis le bas de la PHOTO. La même étagère cadrée un peu plus haut
  // le mois suivant changeait de numéro sans que rien n'ait bougé dans le magasin — le produit aurait
  // annoncé un déplacement qui n'a pas eu lieu. La porte le rend mécanique : sans le bas du meuble, rien.
  it("le bas du meuble est hors cadre : la position la plus tenable du monde vaut null", () => {
    const r = avecEtagere(2, 3, false);
    expect(r.ok, "on perd la position, jamais la photo").toBe(true);
    expect(r.items[0].etagere, "2 sur 3 est tenable — et pourtant on ne sait pas ce qu'il y a sous le cadre").toBeNull();
  });

  it("le bas du meuble est hors cadre : le COMPTE d'étagères ne sort pas non plus", () => {
    const r = avecEtagere(null, 3, false);
    expect(r.levels, "compter les rangées visibles serait compter le cadrage, pas le meuble").toBeNull();
    expect(r.base_visible).toBe(false);
  });

  // LE PRIX DE L'ANCRE, dit ici plutôt que découvert dans six mois : une photo cadrée trop serré ne rend
  // plus RIEN de sa hauteur, même quand le modèle avait vu juste. C'est le prix d'un numéro comparable.
  it("le prix : une lecture entière ne perd que sa hauteur, tout le reste est gardé", () => {
    const r = avecEtagere(2, 3, false);
    expect(r.items[0]).toEqual({ item_code: "CF-001", confidence: "haute", etagere: null });
    expect(r.exposition).toBe("rayonnage");
    expect(r.families_present).toEqual(["Épices"]);
  });

  it("base_visible absent ou d'un autre type : la lecture est REJETÉE, pas devinée", () => {
    const o: any = good(); delete o.base_visible;
    expect(validatePhotoExtraction(o, KEYS, CODES, FAMS).errors.join(" ")).toContain("base_visible manquant");
    for (const v of ["oui", 1, null]) {
      const o2: any = good(); o2.base_visible = v;
      expect(validatePhotoExtraction(o2, KEYS, CODES, FAMS).ok, `base_visible « ${JSON.stringify(v)} »`).toBe(false);
    }
  });

  it("le schéma EXIGE base_visible : le modèle ne peut pas l'omettre", () => {
    const sch: any = photoExtractionSchema(photoQuestions({ type: "lineaire", role: "expert" }), FAMS);
    expect(sch.required).toContain("base_visible");
    expect(sch.properties.base_visible).toEqual({ type: "boolean" });
  });

  it("un article REJETÉ n'est jamais écrit, même avec une étagère plausible", () => {
    const o: any = good(); o.items = [{ item_code: "XX-999", confidence: "haute", etagere: 2 }];
    const r = validatePhotoExtraction(o, KEYS, CODES, FAMS);
    expect(r.ok).toBe(false);
    expect(r.items).toEqual([]);
  });

  it("une réponse absente rend une liste d'articles vide, jamais undefined", () => {
    expect(validatePhotoExtraction(null, KEYS, CODES, FAMS).items).toEqual([]);
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
  it("v2 — le schéma porte l'exposition (cinq valeurs), les étagères (entier ou null) et les familles du site ; sans famille, pas de propriété", () => {
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
  // 13/09 — chaque article porte son étagère : le modèle ne peut ni l'omettre (required) ni inventer un champ.
  it("13/09 — le schéma d'un article porte etagere (entier ou null), exigé, et rien de plus", () => {
    const s = photoExtractionSchema(photoQuestions({ type: "lineaire", role: "expert" }));
    const art = s.properties.items.items;
    expect(art.properties.etagere.type).toEqual(["integer", "null"]);
    expect(art.required).toEqual(["item_code", "confidence", "etagere"]);
    expect(art.additionalProperties).toBe(false);
  });
  it("la consigne porte chaque question et chaque article, et dit l'absence d'articles", () => {
    const qs = photoQuestions({ type: "vitrine", role: null });
    const sys = photoExtractionSystem({ type: "vitrine", role: null, items: [{ item_code: "A1", item_description: "Ethiopia 250 g" }], families: ["Épices"] }, qs);
    expect(sys).toContain("vt_prix_visible : Au moins un prix est-il affiché ?");
    expect(sys).toContain("- A1 — Ethiopia 250 g");
    expect(sys).toContain("Quelle exposition ?"); expect(sys).toContain("Combien d'étagères ?");   // 13/09 (owner) : le mot est « étagère »
    expect(sys).toContain("- rayonnage : Rayonnage");
    expect(sys).toContain("FAMILLES DU SITE\n- Épices");
    const sans = photoExtractionSystem({ type: "vitrine", role: null, items: [], families: [] }, qs);
    expect(sans).toContain("(aucun article connu pour ce site)");
    expect(sans).not.toContain("FAMILLES DU SITE"); expect(sans).not.toContain("families_present");
  });
  // 15/09 — l'assertion du 13/09 vérifiait « EN PARTANT DU BAS », ce qui était vrai de la consigne
  // FAUSSE comme de la juste : le bas de QUOI n'y était pas dit. Elle dit maintenant l'ANCRE.
  it("la consigne ancre la position au MEUBLE, pas au cadre, et interdit de deviner une rangée", () => {
    const qs = photoQuestions({ type: "lineaire", role: "expert" });
    const sys = photoExtractionSystem({ type: "lineaire", role: "expert", items: [{ item_code: "A1", item_description: "Ethiopia 250 g" }], families: [] }, qs);
    expect(sys).toContain("en partant du BAS DU MEUBLE");
    expect(sys).toContain("Tu ne comptes PAS depuis le bas de la photo.");
    expect(sys, "une rangée coupée par le bord compte, sinon le numéro dépend du cadrage").toContain("COMPTE comme une rangée");
    expect(sys, "une table d'exposition n'est pas une étagère (mesuré sur IMG_0171)").toContain("Ne sont PAS des étagères");
    expect(sys).toContain("Ne devine jamais une rangée");
    expect(sys, "le champ qui commande tout le reste").toContain("base_visible");
  });
});
