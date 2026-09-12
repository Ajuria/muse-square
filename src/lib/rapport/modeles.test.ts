import { describe, expect, it } from "vitest";
import { findTemplateByName, listReportTemplates, newReportTemplateRow, templateFromDocument, writeReportTemplate, SCHEMA_FIELDS, type ReportTemplate } from "./modeles";
import type { RapportBlock } from "../explorer/blocks";

const doc = (): RapportBlock => ({
  type: "rapport", titre: "Rapport — la semaine dernière, du 31/08/2026 au 06/09/2026",
  periode: { du: "2026-08-31", au: "2026-09-06", relative: "semaine_derniere", libelle_fr: "la semaine dernière, du 31/08/2026 au 06/09/2026" },
  sections: [
    { cle: "poles", titre: "Vos pôles · du plus au moins performant", blocs: [{ type: "table", cols: [], rows: [] }], provenance: { outil: "lire_poles_classement", params: { indicateur: "ventes", du: "2026-08-31", au: "2026-09-06" }, periode: { du: "2026-08-31", au: "2026-09-06" }, calcule_le: "x" } },
    { cle: "volume", titre: "Nombre de ventes", blocs: [{ type: "facts", items: ["2 426 ventes."] }, { type: "note", text: "ma note", auteur: null, date: "x" }], provenance: { outil: "lire_ventes", params: { periode: "semaine_derniere", du: "2026-08-31", au: "2026-09-06" }, periode: { du: "2026-08-31", au: "2026-09-06" }, calcule_le: "x" } },
    { cle: "sources", titre: "Sources et fiabilité", blocs: [{ type: "sources", items: ["Vos ventes"] }], provenance: null },
  ],
  synthese: { text: "…", register: "vetted" }, non_reconnu: [],
});

describe("modeles — un Rapport sans ses chiffres (PUR)", () => {
  it("garde les sections à provenance dans l'ordre, l'indicateur des pôles, la période relative ; laisse notes, synthèse, sources", () => {
    const t = templateFromDocument(doc(), "  Hebdo   ventes ") as any;
    expect(t.sections).toEqual([{ cle: "poles", params: { indicateur: "ventes" } }, { cle: "volume", params: {} }]);
    expect(t.periode_relative).toBe("semaine_derniere"); expect(t.indicateur).toBe("ventes"); expect(t.periode_par_defaut).toBe(false);
    expect(templateFromDocument({ ...doc(), periode: { du: "2026-08-01", au: "2026-08-31", relative: null, libelle_fr: "x" } }, "Août")).toMatchObject({ periode_relative: "30_derniers_jours", periode_par_defaut: true });
    expect(templateFromDocument(doc(), "  ")).toEqual({ erreur: "nom requis" });
    expect(templateFromDocument({ ...doc(), sections: [doc().sections[2]] }, "vide")).toMatchObject({ erreur: expect.stringMatching(/aucune section/) });
  });
  it("la ligne : nom replié, version 1, sections en JSON, mêmes colonnes que le schéma", () => {
    const t = templateFromDocument(doc(), "Hebdo ventes") as any;
    const row = newReportTemplateRow({ location_id: "loc-1", author: { user_id: "u", role: "owner" }, nom: "Hebdo  ventes", sections: t.sections, periode_relative: t.periode_relative, indicateur: t.indicateur, source_document_id: "d1", now: new Date("2026-09-12T10:00:00Z") });
    expect(row).toMatchObject({ version: 1, nom: "Hebdo ventes", periode_relative: "semaine_derniere", indicateur: "ventes", source_document_id: "d1", created_at: "2026-09-12T10:00:00.000Z" });
    expect(JSON.parse(row.sections_json)).toEqual([{ cle: "poles", params: { indicateur: "ventes" } }, { cle: "volume", params: {} }]);
    expect(Object.keys(row).sort()).toEqual(SCHEMA_FIELDS.map((f) => f.name).sort());
    expect(() => newReportTemplateRow({ location_id: "loc-1", author: { user_id: "u", role: "owner" }, nom: "x", sections: [], periode_relative: "mois_dernier" })).toThrow(/au moins une section/);
    expect(() => newReportTemplateRow({ location_id: "loc-1", author: { user_id: "u", role: "owner" }, nom: "x", sections: t.sections, periode_relative: "hier" as any })).toThrow(/période relative/);
  });
  it("le modèle par son nom : accents et casse ignorés, nom entier d'abord, contenu ensuite", () => {
    const ts: ReportTemplate[] = [
      { template_id: "t1", version: 1, location_id: "l", author_user_id: "u", author_role: "owner", nom: "Hebdo ventes", periode_relative: "semaine_derniere", indicateur: "ventes", source_document_id: null, created_at: "x", sections: [] },
      { template_id: "t2", version: 1, location_id: "l", author_user_id: "u", author_role: "owner", nom: "Point mensuel pôles", periode_relative: "mois_dernier", indicateur: "ca", source_document_id: null, created_at: "x", sections: [] },
    ];
    expect(findTemplateByName(ts, "hebdo ventes")?.template_id).toBe("t1");
    expect(findTemplateByName(ts, "mon rapport hebdo ventes")?.template_id).toBe("t1");
    expect(findTemplateByName(ts, "POLES")?.template_id).toBe("t2");
    expect(findTemplateByName(ts, "trimestriel")).toBeNull();
    expect(findTemplateByName(ts, "")).toBeNull();
  });
});

describe("modeles — écriture en flux dans analytics.report_templates, relecture producteur", () => {
  it("écrit, crée la table au premier 404, liste la dernière version par modèle, [] si la table n'existe pas", async () => {
    const inserted: any[] = []; let created: any = null; let first = true;
    const bq = { dataset: (d: string) => ({
      table: (t: string) => ({ insert: async (rows: any[]) => { if (first) { first = false; const e: any = new Error("Not found: Table x"); e.code = 404; throw e; } inserted.push([d, t, rows]); } }),
      createTable: async (t: string, opts: any) => { created = [d, t, opts]; },
    }) };
    const row = newReportTemplateRow({ location_id: "loc-1", author: { user_id: "u", role: "owner" }, nom: "Hebdo", sections: [{ cle: "volume", params: {} }], periode_relative: "semaine_derniere" });
    await writeReportTemplate(bq, row, 6, 1);
    expect(created[1]).toBe("report_templates"); expect(inserted[0][1]).toBe("report_templates");
    const calls: any[] = [];
    const bq2 = { query: async (q: any) => { calls.push(q); return [[{ ...row, created_at: "2026-09-12 10:00:00" }]]; } };
    const list = await listReportTemplates(bq2, "loc-1");
    expect(calls[0].query).toMatch(/analytics\.report_templates/); expect(calls[0].query).toMatch(/PARTITION BY template_id ORDER BY version DESC/);
    expect(list[0]).toMatchObject({ nom: "Hebdo", periode_relative: "semaine_derniere", sections: [{ cle: "volume", params: {} }] });
    const absent = { query: async () => { const e: any = new Error("Not found: Table x"); e.code = 404; throw e; } };
    expect(await listReportTemplates(absent, "loc-1")).toEqual([]);
  });
});
