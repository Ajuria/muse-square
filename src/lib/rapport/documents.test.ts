import { describe, expect, it } from "vitest";
import { isRapportBlock, listReportDocuments, newReportDocumentRow, readReportDocument, writeReportDocument, SCHEMA_FIELDS } from "./documents";
import type { RapportBlock } from "../explorer/blocks";

const rapport = (): RapportBlock => ({
  type: "rapport", titre: "  Rapport — la semaine dernière  ", periode: { du: "2026-08-31", au: "2026-09-06", relative: "semaine_derniere", libelle_fr: "la semaine dernière, du 31/08/2026 au 06/09/2026" },
  sections: [{ cle: "volume", titre: "Volume de ventes", blocs: [{ type: "facts", items: ["Vous avez réalisé 2 426 ventes."] }], provenance: { outil: "lire_ventes", params: {}, periode: { du: "2026-08-31", au: "2026-09-06" }, calcule_le: "2026-09-12T10:00:00.000Z" } }],
  synthese: { text: "Vous avez généré 11 015 €.", register: "vetted" }, non_reconnu: [],
});

describe("documents — la ligne d'un Rapport (PUR)", () => {
  it("un document nouveau : id neuf, version 1, titre replié, période du bloc, JSON du bloc entier", () => {
    const row = newReportDocumentRow({ location_id: "loc-1", author: { user_id: "user_a", role: "owner" }, rapport: rapport(), now: new Date("2026-09-12T10:00:00Z") });
    expect(row.document_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(row).toMatchObject({ version: 1, location_id: "loc-1", author_user_id: "user_a", author_role: "owner", titre: "Rapport — la semaine dernière", periode_du: "2026-08-31", periode_au: "2026-09-06", periode_relative: "semaine_derniere", modele_id: null, created_at: "2026-09-12T10:00:00.000Z" });
    expect(JSON.parse(row.rapport_json).sections[0].provenance.outil).toBe("lire_ventes");
    expect(Object.keys(row).sort()).toEqual(SCHEMA_FIELDS.map((f) => f.name).sort());
  });
  it("une version suivante garde l'id et prend la version donnée ; un id étranger est remplacé", () => {
    const r1 = newReportDocumentRow({ location_id: "loc-1", author: { user_id: "u", role: "member" }, rapport: rapport() });
    const r2 = newReportDocumentRow({ location_id: "loc-1", author: { user_id: "u", role: "member" }, rapport: rapport(), document_id: r1.document_id, version: 2 });
    expect(r2.document_id).toBe(r1.document_id); expect(r2.version).toBe(2); expect(r2.author_role).toBe("member");
    expect(newReportDocumentRow({ location_id: "loc-1", author: { user_id: "u", role: "owner" }, rapport: rapport(), document_id: "pas-un-uuid" }).document_id).not.toBe("pas-un-uuid");
  });
  it("refuse ce qui n'a pas la forme d'un Rapport, une période invalide, un titre vide", () => {
    expect(isRapportBlock({ type: "table" })).toBe(false);
    expect(() => newReportDocumentRow({ location_id: "loc-1", author: { user_id: "u", role: "owner" }, rapport: { type: "table" } as any })).toThrow(/forme d'un Rapport/);
    expect(() => newReportDocumentRow({ location_id: "loc-1", author: { user_id: "u", role: "owner" }, rapport: { ...rapport(), periode: { du: "2026-09-06", au: "2026-08-31", relative: null, libelle_fr: "" } } })).toThrow(/période invalide/);
    expect(() => newReportDocumentRow({ location_id: "loc-1", author: { user_id: "u", role: "owner" }, rapport: { ...rapport(), titre: "   " } })).toThrow(/titre requis/);
    expect(() => newReportDocumentRow({ location_id: "", author: { user_id: "u", role: "owner" }, rapport: rapport() })).toThrow(/location_id/);
  });
});

describe("documents — écriture en flux dans analytics.report_documents, relecture producteur", () => {
  it("écrit dans analytics.report_documents ; la table naît à la première écriture (404)", async () => {
    const inserted: any[] = []; let created: any = null; let first = true;
    const bq = { dataset: (d: string) => ({
      table: (t: string) => ({ insert: async (rows: any[]) => { if (first) { first = false; const e: any = new Error("Not found: Table x"); e.code = 404; throw e; } inserted.push([d, t, rows]); } }),
      createTable: async (t: string, opts: any) => { created = [d, t, opts]; },
    }) };
    const row = newReportDocumentRow({ location_id: "loc-1", author: { user_id: "u", role: "owner" }, rapport: rapport() });
    await writeReportDocument(bq, row);
    expect(created[0]).toBe("analytics"); expect(created[1]).toBe("report_documents"); expect(created[2].schema.fields).toEqual(SCHEMA_FIELDS);
    expect(inserted).toEqual([["analytics", "report_documents", [row]]]);
  });
  it("une table qui vient de naître refuse encore le flux quelques secondes : l'écriture reprend, puis jette au-delà des reprises", async () => {
    let attempts = 0;
    const bq404 = (okAt: number) => ({ dataset: () => ({
      table: () => ({ insert: async () => { attempts++; if (attempts < okAt) { const e: any = new Error("Not found: Table x"); e.code = 404; throw e; } } }),
      createTable: async () => {},
    }) });
    const row = newReportDocumentRow({ location_id: "loc-1", author: { user_id: "u", role: "owner" }, rapport: rapport() });
    await writeReportDocument(bq404(4), row, 6, 1);          // 1 essai, création, 2 reprises en 404, la 3e passe
    expect(attempts).toBe(4);
    attempts = 0;
    await expect(writeReportDocument(bq404(99), row, 3, 1)).rejects.toThrow(/Not found/);
    expect(attempts).toBe(4);                                 // 1 essai + 3 reprises, pas plus
  });
  it("liste la dernière version de chaque document du site (QUALIFY), lit un document par id, rend [] si la table n'existe pas", async () => {
    const calls: any[] = [];
    const rowOut = { document_id: "d1", version: 2, location_id: "loc-1", author_user_id: "u", author_role: "owner", titre: "Rapport", periode_du: "2026-08-31", periode_au: "2026-09-06", periode_relative: null, modele_id: null, rapport_json: JSON.stringify(rapport()), created_at: "2026-09-12 10:00:00" };
    const bq = { query: async (q: any) => { calls.push(q); return [[rowOut]]; } };
    const list = await listReportDocuments(bq, "loc-1");
    expect(calls[0].query).toMatch(/analytics\.report_documents/); expect(calls[0].query).toMatch(/QUALIFY ROW_NUMBER\(\) OVER \(PARTITION BY document_id ORDER BY version DESC/);
    expect(calls[0].query).not.toMatch(/raw\.|staging\.|intermediate\./);
    expect(list[0]).toMatchObject({ document_id: "d1", version: 2, titre: "Rapport" }); expect(list[0].rapport.sections[0].cle).toBe("volume");
    const one = await readReportDocument(bq, "loc-1", "d1");
    expect(calls[1].params).toEqual({ location_id: "loc-1", document_id: "d1" }); expect(one?.rapport.synthese?.text).toBe("Vous avez généré 11 015 €.");
    const absent = { query: async () => { const e: any = new Error("Not found: Table muse-square-open-data:analytics.report_documents"); e.code = 404; throw e; } };
    expect(await listReportDocuments(absent, "loc-1")).toEqual([]);
    expect(await readReportDocument(absent, "loc-1", "d1")).toBeNull();
  });
});
