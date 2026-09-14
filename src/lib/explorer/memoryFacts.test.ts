// La mémoire du site en FAITS CITABLES (owner 14/09, point 3). Ce qui se garde, et c'est tout le point :
// `lire_memoire` ne rendait que du texte — ni bloc, ni fait. Une note citée était donc hors des blocs PAR
// CONSTRUCTION, et la porte de restitution la comptait comme inventée : le registre tombait. Sans ces
// faits, la mémoire était inutilisable, quoi qu'on mette dans le contexte.
import { describe, expect, it } from "vitest";
import { memoryFacts } from "./siteMemory";

const m = (subject: string, body: string, over: any = {}) =>
  ({ memory_id: "m", location_id: "l", subject, body, author_user_id: "u",
     author_role: "owner", source: "conversation", created_at: "2026-09-11T10:00:00Z", ...over }) as any;

describe("memoryFacts", () => {
  it("chaque mémoire devient UNE phrase attribuée et datée", () => {
    expect(memoryFacts([m("comptoir", "Nous avons un seul comptoir, à gauche en entrant.")]))
      .toEqual(["comptoir — vous avez noté le 11/09/2026 : Nous avons un seul comptoir, à gauche en entrant."]);
  });

  it("le VERBE s'accorde avec son sujet — jamais « un membre de l'équipe avez noté »", () => {
    const f = memoryFacts([m("caisse", "La caisse est à droite.", { author_role: "member" })])[0];
    expect(f).toContain("un membre de l'équipe a noté");
    expect(f).not.toContain("avez noté");
  });

  it("une note prise sous une section d'un Rapport DIT d'où elle vient", () => {
    expect(memoryFacts([m("Chiffre d'affaires — août 2026", "On a fermé le lundi.", { source: "note_rapport" })])[0])
      .toBe("Chiffre d'affaires — août 2026 — vous avez noté sous une section d'un Rapport le 11/09/2026 : On a fermé le lundi.");
  });

  it("une mémoire posée par une lecture le dit aussi — la provenance ne se perd pas", () => {
    expect(memoryFacts([m("étagère", "Deux niveaux.", { source: "outil" })])[0]).toContain("noté par une lecture le");
  });

  it("une mémoire sans sujet ou sans corps ne devient PAS un fait — on ne cite pas du vide", () => {
    expect(memoryFacts([m("", "x"), m("s", ""), m("ok", "du corps")])).toHaveLength(1);
  });

  it("aucune mémoire : aucun fait, jamais une phrase de remplissage", () => {
    expect(memoryFacts([])).toEqual([]);
  });

  it("la date est FRANÇAISE — jamais l'ISO interne (CLAUDE.md § Localization)", () => {
    const f = memoryFacts([m("s", "corps")])[0];
    expect(f).toContain("11/09/2026");
    expect(f).not.toContain("2026-09-11");
  });
});

// ── 14/09 — LE VALIDEUR D'ÉCRITURE NE CONNAISSAIT PAS LA SOURCE QU'ON VENAIT D'AJOUTER ──
// `note_rapport` est entrée dans le TYPE et dans le LECTEUR, jamais dans `newSiteMemoryRow` : chaque note
// écrite sous une section levait « source conversation | outil », attrapée par le try/catch de la route,
// et rendait `memoire: false` EN SILENCE. Zéro note en mémoire pendant des heures, fonctionnalité annoncée
// livrée. TypeScript ne pouvait rien : la garde est une comparaison de chaînes à l'exécution.
import { newSiteMemoryRow, MEMORY_SOURCES } from "./siteMemory";

describe("newSiteMemoryRow — la liste des sources a UN foyer", () => {
  const base = { location_id: "l1", subject: "Chiffre d'affaires — août", body: "On a fermé le lundi.", author_user_id: "u1", author_role: "owner" as const };

  it("CHAQUE source déclarée est acceptée à l'écriture — c'est le défaut du 14/09", () => {
    for (const source of MEMORY_SOURCES) {
      expect(() => newSiteMemoryRow({ ...base, source }), source).not.toThrow();
      expect(newSiteMemoryRow({ ...base, source }).source).toBe(source);
    }
  });

  it("une source INCONNUE est toujours refusée — la garde n'est pas désarmée", () => {
    expect(() => newSiteMemoryRow({ ...base, source: "inventee" as any })).toThrow(/source/);
  });

  it("le message d'erreur NOMME les sources admises — il en listait deux sur trois", () => {
    try { newSiteMemoryRow({ ...base, source: "x" as any }); expect.unreachable(); }
    catch (e: any) { for (const s of MEMORY_SOURCES) expect(e.message).toContain(s); }
  });
});
