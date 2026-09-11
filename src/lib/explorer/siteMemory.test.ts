import { describe, expect, it } from "vitest";
import {
  BODY_MAX, SUBJECT_MAX, frDate, memoryToText, newSiteMemoryRow, normalizeSubject, readSiteMemory, writeSiteMemory,
} from "./siteMemory";

// Client BigQuery simulé : la vue semantic n'existe pas encore en base (PR ms_database
// feat/explorer-site-memory) — le contrat de lecture se prouve ici, sur des lignes en forme BigQuery
// (timestamps rendus { value }), jamais contre la vraie table.
function bqStub(rows: any[], calls: any[] = [], inserted: any[] = []) {
  return {
    calls,
    inserted,
    query: async (q: any) => { calls.push(q); return [rows]; },
    dataset: (ds: string) => ({
      table: (name: string) => ({
        insert: async (r: any[]) => { inserted.push({ ds, name, rows: r }); },
      }),
    }),
  };
}

const base = { location_id: "loc-1", subject: "Vitrine", body: "Épices en vrac côté rue, deux étagères.", author_user_id: "user_a", author_role: "owner" as const };

describe("siteMemory — la ligne à écrire", () => {
  it("normalise le sujet en clé (espaces repliés, minuscules) et pose l'auteur, la source et l'horodatage", () => {
    const row = newSiteMemoryRow({ ...base, subject: "  Vitrine   rue ", now: new Date("2026-09-11T08:00:00Z") });
    expect(row.subject).toBe("vitrine rue");
    expect(row.body).toBe("Épices en vrac côté rue, deux étagères.");
    expect(row.author_user_id).toBe("user_a");
    expect(row.author_role).toBe("owner");
    expect(row.source).toBe("conversation");
    expect(row.superseded).toBe(false);
    expect(row.created_at).toBe("2026-09-11T08:00:00.000Z");
    expect(row.memory_id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("refuse une ligne sans sujet, sans corps, sans auteur ou avec un rôle inconnu", () => {
    expect(() => newSiteMemoryRow({ ...base, subject: "  " })).toThrow(/subject/);
    expect(() => newSiteMemoryRow({ ...base, body: "" })).toThrow(/body/);
    expect(() => newSiteMemoryRow({ ...base, author_user_id: "" })).toThrow(/author_user_id/);
    expect(() => newSiteMemoryRow({ ...base, author_role: "admin" as any })).toThrow(/author_role/);
    expect(() => newSiteMemoryRow({ ...base, source: "web" as any })).toThrow(/source/);
  });

  it("borne les longueurs (sujet 120, corps 4000)", () => {
    expect(() => newSiteMemoryRow({ ...base, subject: "x".repeat(SUBJECT_MAX + 1) })).toThrow(/120/);
    expect(() => newSiteMemoryRow({ ...base, body: "x".repeat(BODY_MAX + 1) })).toThrow(/4000/);
  });

  it("un retrait (superseded) accepte un corps vide et le dit", () => {
    const row = newSiteMemoryRow({ ...base, body: "", superseded: true });
    expect(row.superseded).toBe(true);
    expect(row.body).toBe("(retiré)");
  });

  it("écrit dans raw.explorer_site_memory, côté producteur", async () => {
    const bq = bqStub([]);
    const row = newSiteMemoryRow(base);
    await writeSiteMemory(bq, row);
    expect(bq.inserted).toEqual([{ ds: "raw", name: "explorer_site_memory", rows: [row] }]);
  });
});

describe("siteMemory — la lecture passe par la vue semantic", () => {
  it("lit semantic.vw_insight_event_site_memory, jamais raw, filtrée par site", async () => {
    const bq = bqStub([]);
    await readSiteMemory(bq, "loc-1");
    const q = bq.calls[0];
    expect(q.query).toMatch(/semantic\.vw_insight_event_site_memory/);
    expect(q.query).not.toMatch(/FROM\s+`[^`]*\.raw\./i);
    expect(q.query).toMatch(/location_id = @location_id/);
    expect(q.params).toEqual({ location_id: "loc-1" });
    expect(q.location).toBe("EU");
  });

  it("filtre sur un sujet normalisé quand il est donné", async () => {
    const bq = bqStub([]);
    await readSiteMemory(bq, "loc-1", { subject: "  Vitrine " });
    expect(bq.calls[0].query).toMatch(/subject = @subject/);
    expect(bq.calls[0].params).toEqual({ location_id: "loc-1", subject: "vitrine" });
  });

  it("aplatit les valeurs BigQuery ({ value }) et rend des entrées typées", async () => {
    const bq = bqStub([{
      memory_id: "m1", location_id: "loc-1", subject: "vitrine", body: "Épices côté rue.",
      author_user_id: "user_a", author_role: "member", source: "outil", created_at: { value: "2026-09-11 08:00:00+00" },
    }]);
    const out = await readSiteMemory(bq, "loc-1");
    expect(out).toEqual([{
      memory_id: "m1", location_id: "loc-1", subject: "vitrine", body: "Épices côté rue.",
      author_user_id: "user_a", author_role: "member", source: "outil", created_at: "2026-09-11 08:00:00+00",
    }]);
  });

  it("une vue absente ou une requête refusée rend [] — jamais une exception vers l'agent", async () => {
    const bq = { query: async () => { throw new Error("Not found: Table"); } };
    await expect(readSiteMemory(bq, "loc-1")).resolves.toEqual([]);
  });
});

describe("siteMemory — le texte rendu à l'agent", () => {
  it("dit l'absence quand il n'y a rien", () => {
    expect(memoryToText([])).toBe("Aucune note en mémoire pour ce site.");
  });
  it("une ligne par sujet, l'auteur (exploitant / membre), la date en JJ/MM/AAAA et l'origine outil", () => {
    const txt = memoryToText([
      { memory_id: "m1", location_id: "l", subject: "vitrine", body: "Épices côté rue.", author_user_id: "u", author_role: "owner", source: "conversation", created_at: "2026-09-11T08:00:00Z" },
      { memory_id: "m2", location_id: "l", subject: "plan", body: "Deux allées.", author_user_id: "u", author_role: "member", source: "outil", created_at: "2026-09-10 07:00:00+00" },
    ]);
    expect(txt).toBe("• vitrine — Épices côté rue. (exploitant, 11/09/2026)\n• plan — Deux allées. (membre, 10/09/2026, lu par un outil)");
  });
  it("frDate et normalizeSubject", () => {
    expect(frDate("2026-01-05T10:00:00Z")).toBe("05/01/2026");
    expect(frDate("")).toBe("");
    expect(normalizeSubject(" Entrée  Principale ")).toBe("entrée principale");
  });
});
