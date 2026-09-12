import { describe, expect, it } from "vitest";
import { actualiserAvec, ajouterNote, approfondirPrompt, approfondirSection, chiffresDuDocument, clesARecalculer, deplacerSection, dupliquerSection, periodeActualisee, retirerNote, retirerSection } from "./gestes";
import type { RapportBlock } from "../explorer/blocks";

const doc = (): RapportBlock => ({
  type: "rapport", titre: "Rapport — la semaine dernière, du 31/08/2026 au 06/09/2026",
  periode: { du: "2026-08-31", au: "2026-09-06", relative: "semaine_derniere", libelle_fr: "la semaine dernière, du 31/08/2026 au 06/09/2026" },
  sections: [
    { cle: "volume", titre: "Volume de ventes", blocs: [{ type: "table", cols: [{ label: "" }, { label: "P" }], rows: [{ cells: [{ v: "Volume de ventes" }, { v: "2 426" }] }] }, { type: "facts", items: ["Vous avez réalisé 2 426 ventes."] }], provenance: { outil: "lire_ventes", params: {}, periode: { du: "2026-08-31", au: "2026-09-06" }, calcule_le: "2026-09-12T10:00:00.000Z" } },
    { cle: "panier", titre: "Panier moyen", blocs: [{ type: "facts", items: ["Panier moyen 4,54 €."] }], provenance: { outil: "lire_ventes", params: {}, periode: { du: "2026-08-31", au: "2026-09-06" }, calcule_le: "2026-09-12T10:00:00.000Z" } },
    { cle: "sources", titre: "Sources et fiabilité", blocs: [{ type: "sources", items: ["Vos ventes"] }], provenance: null },
  ],
  synthese: { text: "Vous avez généré 11 015 €.", register: "vetted" }, non_reconnu: [],
});

describe("gestes — déplacer, retirer, dupliquer : aucun recalcul, l'original n'est pas muté", () => {
  it("déplacer change l'ordre et rien d'autre", () => {
    const d = doc(); const r = deplacerSection(d, 0, 1) as RapportBlock;
    expect(r.sections.map((s) => s.cle)).toEqual(["panier", "volume", "sources"]);
    expect(d.sections.map((s) => s.cle)).toEqual(["volume", "panier", "sources"]);
    expect(chiffresDuDocument(r)).toEqual(chiffresDuDocument(d));
    expect((deplacerSection(d, 0, 99) as RapportBlock).sections.map((s) => s.cle)).toEqual(["panier", "sources", "volume"]);
    expect(deplacerSection(d, 7, 0)).toEqual({ erreur: "section inconnue" });
  });
  it("retirer et dupliquer", () => {
    expect((retirerSection(doc(), 1) as RapportBlock).sections.map((s) => s.cle)).toEqual(["volume", "sources"]);
    const dup = dupliquerSection(doc(), 0) as RapportBlock;
    expect(dup.sections.map((s) => s.cle)).toEqual(["volume", "volume", "panier", "sources"]);
    expect(dup.sections[1]).toEqual(dup.sections[0]); expect(dup.sections[1]).not.toBe(dup.sections[0]);
  });
});

describe("gestes — Votre note : sous la section, registre distinct, jamais mêlée", () => {
  it("ajoute une note datée avec son auteur, refuse le vide et le trop long, se retire par rang", () => {
    const r = ajouterNote(doc(), 0, "  Semaine de rentrée,\n\n\n\nnous avions fermé le lundi.  ", "Nadia", new Date("2026-09-12T11:00:00Z")) as RapportBlock;
    const last = r.sections[0].blocs[r.sections[0].blocs.length - 1];
    expect(last).toEqual({ type: "note", text: "Semaine de rentrée,\n\nnous avions fermé le lundi.", auteur: "Nadia", date: "2026-09-12T11:00:00.000Z" });
    expect(chiffresDuDocument(r)).toEqual(chiffresDuDocument(doc()));
    expect(ajouterNote(doc(), 0, "   ", null)).toEqual({ erreur: "note vide" });
    expect(ajouterNote(doc(), 0, "x".repeat(4001), null)).toEqual({ erreur: "note : 4000 caractères au plus" });
    const deux = ajouterNote(r, 0, "seconde", null) as RapportBlock;
    const moins = retirerNote(deux, 0, 0) as RapportBlock;
    expect(moins.sections[0].blocs.filter((b) => b.type === "note").map((b: any) => b.text)).toEqual(["seconde"]);
    expect(retirerNote(moins, 0, 3)).toEqual({ erreur: "note inconnue" });
  });
});

describe("gestes — Approfondir : le message à la boucle porte la période de la section ; le résultat s'insère après elle, vérifié", () => {
  it("le message dit la section, les dates du/au et la question", () => {
    const p = approfondirPrompt(doc(), 0, "Pourquoi le volume a-t-il tenu ?") as string;
    expect(p).toContain("Approfondir la section « Volume de ventes » du Rapport « Rapport — la semaine dernière, du 31/08/2026 au 06/09/2026 », période du 31/08/2026 au 06/09/2026.");
    expect(p).toContain("(du=2026-08-31, au=2026-09-06)");
    expect(p).toContain("• Vous avez réalisé 2 426 ventes.");
    expect(p).toContain("Question de l'exploitant : Pourquoi le volume a-t-il tenu ?");
    expect(approfondirPrompt(doc(), 0, " ")).toEqual({ erreur: "question vide" });
  });
  it("le résultat s'insère après les blocs de la section, avant ses notes ; la pastille du tour est celle du résultat", () => {
    const avecNote = ajouterNote(doc(), 0, "ma note", null) as RapportBlock;
    const r = approfondirSection(avecNote, 0, { question: "Et par jour ?", register: "vetted", text: "Le samedi porte 40 %.", blocks: [{ type: "register", register: "vetted" }, { type: "table", cols: [{ label: "Jour" }], rows: [{ cells: [{ v: "samedi" }] }] }] }) as RapportBlock;
    expect(r.sections[0].blocs.map((b) => b.type)).toEqual(["table", "facts", "prose", "register", "table", "prose", "note"]);
    expect((r.sections[0].blocs[2] as any).md).toBe("**Approfondir — Et par jour ?**");
    expect((r.sections[0].blocs[3] as any).register).toBe("vetted");
    expect((r.sections[0].blocs[5] as any).md).toBe("Le samedi porte 40 %.");
  });
});

describe("gestes — Actualiser : les sections à provenance se recalculent sur la période relative, les notes restent, la Synthèse tombe", () => {
  it("la période relative se résout sur le jour donné ; sans relative, les dates restent", () => {
    expect(periodeActualisee(doc(), "2026-09-19")).toMatchObject({ du: "2026-09-07", au: "2026-09-13", relative: "semaine_derniere" });
    expect(periodeActualisee({ ...doc(), periode: { du: "2026-08-01", au: "2026-08-31", relative: null, libelle_fr: "du 01/08/2026 au 31/08/2026" } }, "2026-09-19")).toEqual({ du: "2026-08-01", au: "2026-08-31", relative: null, libelle_fr: "du 01/08/2026 au 31/08/2026" });
    expect(clesARecalculer(doc())).toEqual(["volume", "panier"]);
  });
  it("fusion : ordre gardé, sections recalculées remplacées, notes reportées, sources gardées, synthèse retirée, titre suivi si c'était le titre par défaut", () => {
    const ancien = ajouterNote(doc(), 1, "note sur le panier", "Nadia") as RapportBlock;
    const nouveau: RapportBlock = { ...doc(), periode: { du: "2026-09-07", au: "2026-09-13", relative: "semaine_derniere", libelle_fr: "la semaine dernière, du 07/09/2026 au 13/09/2026" },
      sections: [
        { cle: "panier", titre: "Panier moyen", blocs: [{ type: "facts", items: ["Panier moyen 4,90 €."] }], provenance: { outil: "lire_ventes", params: {}, periode: { du: "2026-09-07", au: "2026-09-13" }, calcule_le: "2026-09-19T08:00:00.000Z" } },
        { cle: "volume", titre: "Volume de ventes", blocs: [{ type: "facts", items: ["Vous avez réalisé 2 600 ventes."] }], provenance: { outil: "lire_ventes", params: {}, periode: { du: "2026-09-07", au: "2026-09-13" }, calcule_le: "2026-09-19T08:00:00.000Z" } },
      ] };
    const r = actualiserAvec(ancien, nouveau);
    expect(r.sections.map((s) => s.cle)).toEqual(["volume", "panier", "sources"]);
    expect((r.sections[0].blocs[0] as any).items).toEqual(["Vous avez réalisé 2 600 ventes."]);
    expect(r.sections[1].blocs.map((b) => b.type)).toEqual(["facts", "note"]);
    expect((r.sections[1].blocs[1] as any).text).toBe("note sur le panier");
    expect(r.sections[2].blocs).toEqual(doc().sections[2].blocs);
    expect(r.synthese).toBeNull();
    expect(r.titre).toBe("Rapport — la semaine dernière, du 07/09/2026 au 13/09/2026");
    expect(r.periode.du).toBe("2026-09-07");
    expect(actualiserAvec({ ...ancien, titre: "Mon hebdo" }, nouveau).titre).toBe("Mon hebdo");
  });
});
