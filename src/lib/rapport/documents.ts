// src/lib/rapport/documents.ts — LE RAPPORT PERSISTANT (docs/explorer-outil-spec.md § 6.1, incrément 2).
//
// Un Rapport que l'exploitant garde : table app-write `analytics.report_documents`, grain document_id × version,
// APPEND-ONLY — chaque « Enregistrer » écrit une version, la dernière fait foi (le patron des journaux existants :
// declared_parameters, day_notes). Par site, avec l'auteur. Le document = le bloc `rapport` tel que la boucle l'a rendu
// (sections, blocs, provenance, Synthèse), sérialisé tel quel : c'est ce qui rend chaque section recalculable.
// Côté PRODUCTEUR : écrire, et relire ce qu'on a écrit (la règle de declaredParameters.ts) — jamais une lecture métier ;
// une vue dbt naîtra le jour où un lecteur autre que la page en aura besoin. Insertion en flux (pas de DML) : une
// version ne s'édite ni ne s'efface. La table naît à la première écriture (le geste de day-notes.ts).
import { randomUUID } from "node:crypto";
import type { RapportBlock } from "../explorer/blocks";

const PROJECT = "muse-square-open-data";
const DATASET = "analytics";
const TABLE = "report_documents";
export const TITRE_MAX = 160;
export const RAPPORT_JSON_MAX = 2_000_000;   // octets — un Rapport pèse quelques dizaines de Ko

export type AuthorRole = "owner" | "member";

export interface ReportDocumentRow {
  document_id: string;
  version: number;
  location_id: string;
  author_user_id: string;
  author_role: AuthorRole;
  titre: string;
  periode_du: string;              // AAAA-MM-JJ
  periode_au: string;              // AAAA-MM-JJ
  periode_relative: string | null; // « semaine_derniere », « 30_derniers_jours », « mois_dernier » — ou null (dates fixes)
  modele_id: string | null;
  rapport_json: string;            // le bloc `rapport` sérialisé
  created_at: string;              // ISO
}

/** Ce que la page reçoit : la ligne, le bloc désérialisé. */
export interface ReportDocument extends Omit<ReportDocumentRow, "rapport_json"> { rapport: RapportBlock }

export const SCHEMA_FIELDS = [
  { name: "document_id", type: "STRING", mode: "REQUIRED" },
  { name: "version", type: "INT64", mode: "REQUIRED" },
  { name: "location_id", type: "STRING", mode: "REQUIRED" },
  { name: "author_user_id", type: "STRING", mode: "REQUIRED" },
  { name: "author_role", type: "STRING", mode: "REQUIRED" },
  { name: "titre", type: "STRING", mode: "REQUIRED" },
  { name: "periode_du", type: "DATE", mode: "REQUIRED" },
  { name: "periode_au", type: "DATE", mode: "REQUIRED" },
  { name: "periode_relative", type: "STRING", mode: "NULLABLE" },
  { name: "modele_id", type: "STRING", mode: "NULLABLE" },
  { name: "rapport_json", type: "STRING", mode: "REQUIRED" },
  { name: "created_at", type: "TIMESTAMP", mode: "REQUIRED" },
];

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Le bloc tel qu'il est accepté à l'enregistrement : la forme, pas le fond (les chiffres viennent des outils). */
export function isRapportBlock(x: unknown): x is RapportBlock {
  const b = x as any;
  return !!b && b.type === "rapport" && typeof b.titre === "string" && b.periode && typeof b.periode.du === "string" && typeof b.periode.au === "string"
    && Array.isArray(b.sections) && b.sections.every((s: any) => s && typeof s.cle === "string" && typeof s.titre === "string" && Array.isArray(s.blocs))
    && (b.synthese == null || (typeof b.synthese.text === "string" && typeof b.synthese.register === "string"))
    && Array.isArray(b.non_reconnu);
}

/** PUR : la ligne à insérer. `version` = la précédente + 1 (l'appelant l'a relue), 1 pour un document nouveau. */
export function newReportDocumentRow(input: {
  location_id: string;
  author: { user_id: string; role: AuthorRole };
  rapport: RapportBlock;
  document_id?: string | null;
  version?: number | null;
  modele_id?: string | null;
  now?: Date;
}): ReportDocumentRow {
  const location_id = String(input.location_id ?? "").trim();
  if (!location_id) throw new Error("rapport : location_id requis");
  if (!input.author?.user_id) throw new Error("rapport : auteur requis");
  if (!isRapportBlock(input.rapport)) throw new Error("rapport : le document n'a pas la forme d'un Rapport");
  const titre = String(input.rapport.titre ?? "").replace(/\s+/g, " ").trim().slice(0, TITRE_MAX);
  if (!titre) throw new Error("rapport : titre requis");
  const du = input.rapport.periode.du, au = input.rapport.periode.au;
  if (!ISO_DAY.test(du) || !ISO_DAY.test(au) || du > au) throw new Error("rapport : période invalide");
  const rapport_json = JSON.stringify(input.rapport);
  if (Buffer.byteLength(rapport_json, "utf8") > RAPPORT_JSON_MAX) throw new Error("rapport : document trop lourd");
  const version = input.version == null ? 1 : Number(input.version);
  if (!Number.isInteger(version) || version < 1) throw new Error("rapport : version entière ≥ 1");
  return {
    document_id: input.document_id && /^[0-9a-f-]{36}$/i.test(input.document_id) ? input.document_id : randomUUID(),
    version, location_id,
    author_user_id: String(input.author.user_id).slice(0, 120), author_role: input.author.role === "member" ? "member" : "owner",
    titre, periode_du: du, periode_au: au, periode_relative: input.rapport.periode.relative ?? null,
    modele_id: input.modele_id ?? null, rapport_json,
    created_at: (input.now ?? new Date()).toISOString(),
  };
}

const isNotFound = (err: any): boolean => err?.code === 404 || String(err?.message || "").includes("Not found");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Insertion en flux ; la table naît à la première écriture. Mesuré le 12/09 sur la sonde réelle : une table qui vient
 * d'être créée refuse encore l'insertion en flux pendant quelques secondes (404 « Not found ») — d'où les reprises
 * espacées après la création (jusqu'à `retries`, 2 s puis 4 s…). Jette si BigQuery refuse pour une autre raison.
 */
export async function writeReportDocument(bq: any, row: ReportDocumentRow, retries = 6, waitMs = 2000): Promise<void> {
  const table = bq.dataset(DATASET).table(TABLE);
  try { await table.insert([row]); return; } catch (err: any) { if (!isNotFound(err)) throw err; }
  await bq.dataset(DATASET).createTable(TABLE, { schema: { fields: SCHEMA_FIELDS } }).catch((e: any) => { if (!/Already Exists/i.test(String(e?.message || ""))) throw e; });
  for (let i = 0; ; i++) {
    try { await table.insert([row]); return; }
    catch (err: any) { if (!isNotFound(err) || i >= retries - 1) throw err; await sleep(waitMs * (i + 1)); }
  }
}

const flat = (x: any): any => (x && typeof x === "object" && "value" in x ? x.value : x);
function toDocument(r: any): ReportDocument | null {
  let rapport: RapportBlock;
  try { rapport = JSON.parse(String(flat(r.rapport_json))); } catch { return null; }
  if (!isRapportBlock(rapport)) return null;
  return {
    document_id: String(flat(r.document_id)), version: Number(flat(r.version)), location_id: String(flat(r.location_id)),
    author_user_id: String(flat(r.author_user_id)), author_role: (String(flat(r.author_role)) === "member" ? "member" : "owner"),
    titre: String(flat(r.titre)), periode_du: String(flat(r.periode_du)), periode_au: String(flat(r.periode_au)),
    periode_relative: flat(r.periode_relative) == null ? null : String(flat(r.periode_relative)),
    modele_id: flat(r.modele_id) == null ? null : String(flat(r.modele_id)),
    created_at: String(flat(r.created_at)), rapport,
  };
}

const SELECT = `SELECT document_id, version, location_id, author_user_id, author_role, titre,
                       CAST(periode_du AS STRING) AS periode_du, CAST(periode_au AS STRING) AS periode_au, periode_relative, modele_id, rapport_json,
                       CAST(created_at AS STRING) AS created_at
                FROM \`${PROJECT}.${DATASET}.${TABLE}\``;

/** Les Rapports d'un site : la dernière version de chaque document, le plus récent d'abord. Une table absente = aucun Rapport. */
export async function listReportDocuments(bq: any, location_id: string, limit = 50): Promise<ReportDocument[]> {
  const [rows] = await bq.query({
    query: `${SELECT} WHERE location_id = @location_id
            QUALIFY ROW_NUMBER() OVER (PARTITION BY document_id ORDER BY version DESC, created_at DESC) = 1
            ORDER BY created_at DESC LIMIT @limit`,
    params: { location_id, limit }, location: "EU",
  }).catch((e: any) => { if (e?.code === 404 || /Not found/.test(String(e?.message || ""))) return [[]]; throw e; });
  return (rows as any[]).map(toDocument).filter((d): d is ReportDocument => !!d);
}

/** Un Rapport (sa dernière version) ; null s'il n'existe pas sur ce site. */
export async function readReportDocument(bq: any, location_id: string, document_id: string): Promise<ReportDocument | null> {
  const [rows] = await bq.query({
    query: `${SELECT} WHERE location_id = @location_id AND document_id = @document_id ORDER BY version DESC, created_at DESC LIMIT 1`,
    params: { location_id, document_id }, location: "EU",
  }).catch((e: any) => { if (e?.code === 404 || /Not found/.test(String(e?.message || ""))) return [[]]; throw e; });
  return rows.length ? toDocument(rows[0]) : null;
}
