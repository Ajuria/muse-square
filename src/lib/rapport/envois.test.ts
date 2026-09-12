import { describe, expect, it } from "vitest";
import { aDeLaMatiere, cadenceFr, envoyerRapport, estDue, htmlDuRapport, momentParis, newScheduleRow, normalizeDestinataires, periodeDeCadence, rapportPourCourriel, texteDuRapport, type Rails } from "./envois";
import type { RapportBlock } from "../explorer/blocks";

const doc = (): RapportBlock => ({
  type: "rapport", titre: "Rapport de ventes — la semaine dernière, du 31/08/2026 au 06/09/2026",
  periode: { du: "2026-08-31", au: "2026-09-06", relative: "semaine_derniere", libelle_fr: "la semaine dernière, du 31/08/2026 au 06/09/2026" },
  sections: [
    { cle: "volume", titre: "Nombre de ventes", blocs: [{ type: "table", cols: [{ label: "" }, { label: "P" }], rows: [{ cells: [{ v: "Nombre de ventes" }, { v: "2 426" }] }] }, { type: "facts", items: ["Vous avez réalisé 2 426 ventes."] }], provenance: { outil: "lire_ventes", params: {}, periode: { du: "2026-08-31", au: "2026-09-06" }, calcule_le: "2026-09-12T10:00:00.000Z" } },
    { cle: "jours", titre: "CA moyen par jour de la semaine", blocs: [{ type: "barres", items: [{ label: "lundi", value: 100, value_fr: "100 €" }] }, { type: "table", cols: [{ label: "Jour" }, { label: "CA" }], rows: [{ cells: [{ v: "lundi" }, { v: "100 €" }] }] }], provenance: { outil: "lire_ventes", params: {}, periode: { du: "2026-08-31", au: "2026-09-06" }, calcule_le: "2026-09-12T10:00:00.000Z" } },
    { cle: "actions", titre: "Actions recommandées", blocs: [{ type: "absence", manque: "Aucune action issue de vos signaux de vente.", geste: null }, { type: "note", text: "On a fermé lundi.", auteur: "Nadia", date: "2026-09-12T11:00:00.000Z" }], provenance: null },
  ],
  synthese: null, non_reconnu: [],
});

describe("envois — la période d'une cadence est la période DÉCALÉE, en français", () => {
  it("chaque jour = hier ; chaque semaine = la semaine civile dernière ; chaque mois = le mois civil dernier", () => {
    expect(periodeDeCadence("quotidien", "2026-09-14")).toEqual({ du: "2026-09-13", au: "2026-09-13", relative: null, libelle_fr: "hier, le 13/09/2026" });
    expect(periodeDeCadence("hebdomadaire", "2026-09-14")).toMatchObject({ du: "2026-09-07", au: "2026-09-13", relative: "semaine_derniere" });
    expect(periodeDeCadence("mensuel", "2026-09-01")).toMatchObject({ du: "2026-08-01", au: "2026-08-31", relative: "mois_dernier" });
  });
  it("chaque trimestre = le trimestre civil dernier, sur les quatre trimestres et le passage d'année", () => {
    expect(periodeDeCadence("trimestriel", "2026-01-01")).toMatchObject({ du: "2025-10-01", au: "2025-12-31", libelle_fr: "le trimestre dernier, du 01/10/2025 au 31/12/2025" });
    expect(periodeDeCadence("trimestriel", "2026-04-01")).toMatchObject({ du: "2026-01-01", au: "2026-03-31" });
    expect(periodeDeCadence("trimestriel", "2026-08-20")).toMatchObject({ du: "2026-04-01", au: "2026-06-30" });
    expect(periodeDeCadence("trimestriel", "2026-11-30")).toMatchObject({ du: "2026-07-01", au: "2026-09-30" });
    expect(periodeDeCadence("annuel", "2026-01-01")).toMatchObject({ du: "2025-01-01", au: "2025-12-31", libelle_fr: "l’année dernière, du 01/01/2025 au 31/12/2025" });
  });
});

describe("envois — l'échéance : le jour est là et l'heure est passée", () => {
  const lundi8h = momentParis(new Date("2026-09-14T06:30:00Z"));   // lundi 14/09/2026, 08 h 30 à Paris (UTC+2)
  it("momentParis lit la date, l'heure, le jour de semaine (1 = lundi) et le jour du mois à Paris", () => {
    expect(lundi8h).toEqual({ date: "2026-09-14", heure: 8, jour_semaine: 1, jour_mois: 14, mois: 9 });
    expect(momentParis(new Date("2026-09-13T22:30:00Z"))).toMatchObject({ date: "2026-09-14", heure: 0, jour_semaine: 1 });  // minuit passé à Paris
  });
  it("quotidien à 8 h : dû à 8 h et après, pas à 7 h ; hebdomadaire lundi : dû le lundi seulement ; un envoi arrêté n'est jamais dû", () => {
    expect(estDue({ cadence: "quotidien", jour: null, heure: 8, actif: true }, lundi8h)).toBe(true);
    expect(estDue({ cadence: "quotidien", jour: null, heure: 9, actif: true }, lundi8h)).toBe(false);
    expect(estDue({ cadence: "hebdomadaire", jour: 1, heure: 7, actif: true }, lundi8h)).toBe(true);
    expect(estDue({ cadence: "hebdomadaire", jour: 2, heure: 7, actif: true }, lundi8h)).toBe(false);
    expect(estDue({ cadence: "mensuel", jour: 14, heure: 8, actif: true }, lundi8h)).toBe(true);
    expect(estDue({ cadence: "mensuel", jour: 1, heure: 8, actif: true }, lundi8h)).toBe(false);
    expect(estDue({ cadence: "quotidien", jour: null, heure: 8, actif: false }, lundi8h)).toBe(false);
    const premierOctobre = momentParis(new Date("2026-10-01T07:00:00Z"));
    expect(estDue({ cadence: "trimestriel", jour: null, heure: 8, actif: true }, premierOctobre)).toBe(true);
    expect(estDue({ cadence: "annuel", jour: null, heure: 8, actif: true }, premierOctobre)).toBe(false);
  });
  it("la cadence en mots : les mots du lexique (chaque lundi, chaque jour, chaque 1er du mois)", () => {
    expect(cadenceFr({ cadence: "hebdomadaire", jour: 1, heure: 8 })).toBe("chaque lundi à 8 h");
    expect(cadenceFr({ cadence: "quotidien", jour: null, heure: 7 })).toBe("chaque jour à 7 h");
    expect(cadenceFr({ cadence: "mensuel", jour: 1, heure: 9 })).toBe("chaque 1er du mois à 9 h");
    expect(cadenceFr({ cadence: "mensuel", jour: 15, heure: 9 })).toBe("chaque 15 du mois à 9 h");
    expect(cadenceFr({ cadence: "trimestriel", jour: null, heure: 8 })).toBe("chaque trimestre, le 1er à 8 h");
  });
});

describe("envois — la ligne d'un envoi programmé", () => {
  const author = { user_id: "user_1", role: "owner" as const };
  it("valide la cadence, le jour, l'heure, le canal et les destinataires ; email en minuscules, dédoublonnés", () => {
    const r = newScheduleRow({ location_id: "loc", author, modele_id: "ventes", modele_nom: "Rapport de ventes", cadence: "hebdomadaire", jour: 1, heure: 8, canal: "email", destinataires: ["A@x.fr", "a@x.fr", "b@y.com"], now: new Date("2026-09-12T10:00:00Z") });
    expect(r).toMatchObject({ version: 1, modele_id: "ventes", cadence: "hebdomadaire", jour: 1, heure: 8, canal: "email", destinataires_json: JSON.stringify(["a@x.fr", "b@y.com"]), actif: true });
    expect(newScheduleRow({ location_id: "loc", author, modele_id: "ventes", modele_nom: "x", cadence: "quotidien", canal: "email", destinataires: "a@x.fr" }).jour).toBeNull();
    expect(() => newScheduleRow({ location_id: "loc", author, modele_id: "ventes", modele_nom: "x", cadence: "toutes_les_heures", canal: "email", destinataires: "a@x.fr" })).toThrow("cadence inconnue");
    expect(() => newScheduleRow({ location_id: "loc", author, modele_id: "ventes", modele_nom: "x", cadence: "hebdomadaire", jour: 8, canal: "email", destinataires: "a@x.fr" })).toThrow("jour de semaine");
    expect(() => newScheduleRow({ location_id: "loc", author, modele_id: "ventes", modele_nom: "x", cadence: "mensuel", jour: 31, canal: "email", destinataires: "a@x.fr" })).toThrow("jour du mois 1 à 28");
    expect(() => newScheduleRow({ location_id: "loc", author, modele_id: "ventes", modele_nom: "x", cadence: "quotidien", heure: 24, canal: "email", destinataires: "a@x.fr" })).toThrow("heure 0 à 23");
    expect(() => newScheduleRow({ location_id: "loc", author, modele_id: "ventes", modele_nom: "x", cadence: "quotidien", canal: "email", destinataires: [] })).toThrow("au moins un destinataire");
    expect(() => normalizeDestinataires("email", ["pas-un-email"])).toThrow("destinataire email invalide");
    expect(normalizeDestinataires("slack", ["#ventes", "#ventes"])).toEqual(["#ventes"]);
    expect(normalizeDestinataires("slack", [])).toEqual([]);   // Slack sans canal choisi : le canal par défaut de la configuration
  });
});

describe("envois — la matière, le texte, le HTML par le kit", () => {
  it("un document dont une section porte un tableau a de la matière ; un document fait d'absences et de notes n'en a pas", () => {
    expect(aDeLaMatiere(doc())).toBe(true);
    const vide = doc(); vide.sections = [vide.sections[2]];
    expect(aDeLaMatiere(vide)).toBe(false);
  });
  it("le texte : titre, période, faits par section, l'absence dite, la note signée, le lien", () => {
    const t = texteDuRapport(doc(), "https://www.musesquare.com/app/insightevent/rapports?document_id=d");
    expect(t.startsWith("Rapport de ventes — la semaine dernière, du 31/08/2026 au 06/09/2026\nla semaine dernière, du 31/08/2026 au 06/09/2026\n\nNOMBRE DE VENTES\n• Vous avez réalisé 2 426 ventes.")).toBe(true);
    expect(t).toContain("ACTIONS RECOMMANDÉES\nAucune action issue de vos signaux de vente.\nVotre note (Nadia) : On a fermé lundi.");
    expect(t.endsWith("Ouvrir le Rapport : https://www.musesquare.com/app/insightevent/rapports?document_id=d")).toBe(true);
  });
  it("le courriel : le kit rend les sections et leurs tableaux à styles inline, sans SVG, avec « Ouvrir le Rapport »", async () => {
    const h = await htmlDuRapport(doc(), { url: "https://www.musesquare.com/app/insightevent/rapports?document_id=d", site: "Muse Square" });
    expect(h).toContain("<!doctype html>");
    expect(h).toContain("NOMBRE DE VENTES".length ? "Nombre de ventes" : "");
    expect(h).toContain("<table style=");
    expect(h).toContain("2 426");
    expect(h).toContain("Vous avez réalisé 2 426 ventes.");
    expect(h).not.toContain("<svg");
    expect(h).toContain('href="https://www.musesquare.com/app/insightevent/rapports?document_id=d"');
    expect(h).toContain("Ouvrir le Rapport");
    expect(h).toContain("Votre note");
    expect(rapportPourCourriel(doc()).sections[1].blocs.map((b) => b.type)).toEqual(["table"]);
    expect(doc().sections[1].blocs.map((b) => b.type)).toEqual(["barres", "table"]);
  });
});

describe("envois — envoyerRapport : sans matière rien ne part et la trace le dit ; avec matière, chaque destinataire, la trace compte ce qui est parti", () => {
  const inserted: Array<{ table: string; rows: any[] }> = [];
  const bqStub = (ventes: "avec" | "sans") => ({
    dataset: () => ({ table: (name: string) => ({ insert: async (rows: any[]) => { inserted.push({ table: name, rows }); }, exists: async () => [true] }), createTable: async () => {} }),
    query: async ({ query }: { query: string }) => {
      if (/report_templates/.test(query)) return [[]];
      // lire_ventes : computeSalesReport interroge le mart ; on simule « aucune vente » par des lignes vides, « avec » n'est pas rejoué ici (la sonde réelle le fait).
      return [[]];
    },
  });
  const rails: Rails = {
    sendEmail: async (_c, m) => (m.recipient === "ko@x.fr" ? { ok: false, error: "refusé" } : { ok: true }),
    sendSlack: async () => ({ ok: true }),
    loadChannelConfig: async () => ({}),
  };
  it("sans aucune vente lue, le document est sans matière : pas de Rapport enregistré, une trace à 0 destinataire", async () => {
    inserted.length = 0;
    const r = await envoyerRapport(bqStub("sans"), { location_id: "loc", author: { user_id: "u", role: "owner" }, modele_id: "ventes", canal: "email", destinataires: ["a@x.fr"], periode: periodeDeCadence("hebdomadaire", "2026-09-14"), schedule_id: "s1", today: "2026-09-14", base_url: "https://www.musesquare.com" }, rails);
    expect(r.ok).toBe(false);
    expect(r.raison).toMatch(/^sans matière/);
    expect(inserted.map((i) => i.table)).toEqual(["report_sends"]);
    expect(inserted[0].rows[0]).toMatchObject({ schedule_id: "s1", modele_id: "ventes", periode_du: "2026-09-07", periode_au: "2026-09-13", document_id: null, n_recipients: 0, recipients: "[]" });
  });
  it("un Modèle inconnu ne compose rien", async () => {
    inserted.length = 0;
    const r = await envoyerRapport(bqStub("sans"), { location_id: "loc", author: { user_id: "u", role: "owner" }, modele_id: "00000000-0000-0000-0000-000000000000", canal: "email", destinataires: ["a@x.fr"], periode: periodeDeCadence("quotidien", "2026-09-14"), today: "2026-09-14", base_url: "https://www.musesquare.com" }, rails);
    expect(r).toMatchObject({ ok: false, raison: "Modèle introuvable sur ce site" });
    expect(inserted).toEqual([]);
  });
});
