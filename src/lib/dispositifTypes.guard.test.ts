// Garde du registre des types de composant (docs/dispositifs-typologie-spec.md § 3-4).
// Ce que le test attrape : une valeur dupliquée, une liste métier qui ne finit pas par « autre »
// ou qui cite une valeur inconnue, une question dont le rôle n'existe pas pour son type, une clé de
// question dupliquée (la porte d'extraction s'appuie sur l'unicité), un libellé vide, un mot banni
// du lexique dans un libellé ou une question.
import { describe, it, expect } from "vitest";
import {
  DISPOSITIF_TYPES, ROLES_BY_TYPE, CHECKLIST_BY_TYPE, ALL_CHECKLIST_KEYS,
  dispositifTypesFor, dispositifRolesFor, checklistFor, dispositifTypeLabelFr, dispositifRoleLabelFr,
} from "./dispositifTypes";
import { MOTS_BANNIS } from "./fr/evenement.fr";

const INDUSTRIES = [
  "commercial", "food_nightlife", "market_hall", "wine_tourism", "culture", "gallery", "cinema_theatre",
  "science_innovation", "hotel_lodging", "camping_outdoor", "theme_park", "sport", "wellness",
  "pro_event", "convention_center", "coworking", "live_event",
];
const KNOWN = new Set(DISPOSITIF_TYPES.map((o) => o.value));
const banned = Object.keys(MOTS_BANNIS);
const hasBanned = (s: string) =>
  banned.filter((w) => new RegExp(`(^|[^\\p{L}])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=$|[^\\p{L}])`, "iu").test(s));

describe("dispositifTypes — liste fermée", () => {
  it("les valeurs de type sont uniques et « autre » ferme la liste", () => {
    const values = DISPOSITIF_TYPES.map((o) => o.value);
    expect(new Set(values).size).toBe(values.length);
    expect(values[values.length - 1]).toBe("autre");
  });
  it("chaque type a une entrée de rôles et de check-list, même vide", () => {
    for (const v of KNOWN) {
      expect(ROLES_BY_TYPE[v], `rôles manquants pour ${v}`).toBeDefined();
      expect(CHECKLIST_BY_TYPE[v], `check-list manquante pour ${v}`).toBeDefined();
    }
    expect(Object.keys(ROLES_BY_TYPE).every((k) => KNOWN.has(k))).toBe(true);
    expect(Object.keys(CHECKLIST_BY_TYPE).every((k) => KNOWN.has(k))).toBe(true);
  });
  it("les rôles d'un type sont uniques", () => {
    for (const [t, roles] of Object.entries(ROLES_BY_TYPE)) {
      const vs = roles.map((r) => r.value);
      expect(new Set(vs).size, `rôles dupliqués sur ${t}`).toBe(vs.length);
    }
  });
});

describe("dispositifTypes — curation par métier", () => {
  it("chaque liste métier ne cite que des valeurs connues et finit par « autre »", () => {
    for (const ind of INDUSTRIES) {
      const list = dispositifTypesFor(ind);
      expect(list.length, ind).toBeGreaterThan(1);
      expect(list.every((o) => KNOWN.has(o.value)), ind).toBe(true);
      expect(list[list.length - 1].value, ind).toBe("autre");
      expect(new Set(list.map((o) => o.value)).size, ind).toBe(list.length);
    }
  });
  it("métier inconnu ou vide → la liste complète", () => {
    expect(dispositifTypesFor(null)).toBe(DISPOSITIF_TYPES);
    expect(dispositifTypesFor("zzz")).toBe(DISPOSITIF_TYPES);
  });
  it("la culture propose la médiation en premier ; le commerce ne la propose pas", () => {
    expect(dispositifTypesFor("culture")[0].value).toBe("mediation");
    expect(dispositifTypesFor("commercial").some((o) => o.value === "mediation")).toBe(false);
  });
});

describe("dispositifTypes — check-lists", () => {
  it("les clés de question sont uniques sur tout le registre", () => {
    const keys = Object.values(CHECKLIST_BY_TYPE).flat().map((q) => q.key);
    // Une même liste partagée par plusieurs types compte une fois.
    const perType = Object.values(CHECKLIST_BY_TYPE).map((qs) => qs.map((q) => q.key));
    for (const ks of perType) expect(new Set(ks).size).toBe(ks.length);
    expect(ALL_CHECKLIST_KEYS.length).toBe(new Set(keys).size);
    expect(Object.isFrozen(ALL_CHECKLIST_KEYS)).toBe(true);
  });
  it("chaque question ne vise que des rôles qui existent pour son type", () => {
    for (const [t, qs] of Object.entries(CHECKLIST_BY_TYPE)) {
      const roles = new Set(ROLES_BY_TYPE[t].map((r) => r.value));
      for (const q of qs) {
        if (q.roles === "all") continue;
        expect(q.roles.length, `${t}.${q.key} : rôles vides`).toBeGreaterThan(0);
        for (const r of q.roles) expect(roles.has(r), `${t}.${q.key} vise le rôle inconnu ${r}`).toBe(true);
      }
    }
  });
  it("checklistFor filtre par rôle : le moyen d'essayer ne se pose qu'au rôle expert", () => {
    expect(checklistFor("lineaire", "expert").some((q) => q.key === "ls_moyen_essai")).toBe(true);
    expect(checklistFor("lineaire", "courant").some((q) => q.key === "ls_moyen_essai")).toBe(false);
    expect(checklistFor("lineaire", null).some((q) => q.key === "ls_moyen_essai")).toBe(false);
    expect(checklistFor("lineaire", null).some((q) => q.key === "ls_prix_par_article")).toBe(true);
    expect(checklistFor("autre")).toEqual([]);
    expect(checklistFor("inconnu")).toEqual([]);
  });
  it("chaque question est une question (finit par « ? »)", () => {
    for (const q of Object.values(CHECKLIST_BY_TYPE).flat()) expect(q.question_fr.trim().endsWith("?"), q.key).toBe(true);
  });
});

describe("dispositifTypes — libellés", () => {
  it("aucun libellé vide ; libellé d'une valeur inconnue = passthrough lisible", () => {
    for (const o of DISPOSITIF_TYPES) expect(o.label_fr.trim().length, o.value).toBeGreaterThan(0);
    for (const r of Object.values(ROLES_BY_TYPE).flat()) expect(r.label_fr.trim().length, r.value).toBeGreaterThan(0);
    expect(dispositifTypeLabelFr("tete_de_gondole")).toBe("Tête de gondole");
    expect(dispositifTypeLabelFr("zz_inconnu")).toBe("zz inconnu");
    expect(dispositifTypeLabelFr(null)).toBe("");
    expect(dispositifRoleLabelFr("cartel")).toBe("Cartel");
    expect(dispositifRolesFor("vitrine")).toEqual([]);
    expect(dispositifRolesFor("mediation").map((r) => r.value)).toContain("multimedia");
  });
  it("aucun mot banni du lexique dans un libellé ou une question", () => {
    const strings = [
      ...DISPOSITIF_TYPES.map((o) => o.label_fr),
      ...Object.values(ROLES_BY_TYPE).flat().map((r) => r.label_fr),
      ...Object.values(CHECKLIST_BY_TYPE).flat().map((q) => q.question_fr),
    ];
    for (const s of strings) expect(hasBanned(s), s).toEqual([]);
  });
  it("les libellés sans mot owner sont marqués provisoires (et seulement eux)", () => {
    const owner = new Set(["vitrine", "lineaire", "gondole", "tete_de_gondole", "point_assiste", "mediation", "autre"]);
    for (const o of DISPOSITIF_TYPES) expect(!!o.provisoire, o.value).toBe(!owner.has(o.value));
  });
});
