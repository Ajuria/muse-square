// src/lib/rapport/modeles.ts — LE MODÈLE DE RAPPORT (docs/explorer-outil-spec.md § 6.3, incrément 4 ; lexique l. 120).
//
// Un Modèle de rapport est un Rapport sans ses chiffres : la liste de ses sections (leur clé et les paramètres de leur
// provenance — l'indicateur des pôles, le grain), l'ordre, et une période RELATIVE (« la semaine dernière », « les 30
// derniers jours », « le mois dernier »). « Enregistrer comme modèle » le tire d'un document enregistré ; « génère mon
// rapport hebdomadaire » le nomme par son nom et composer_rapport le remplit sur la période courante. Table app-write
// `analytics.report_templates`, grain template_id × version, append-only (le patron de report_documents) ; côté
// producteur : écrire et relire, jamais une lecture métier. Les deux modèles par défaut (ventes, famille) ne sont pas
// des lignes : « ventes » est MODELE_VENTES (rapport.fr.ts) ; « famille » viendra avec la migration de ses couches (§ 7).
import { randomUUID } from "node:crypto";
import type { RapportBlock } from "../explorer/blocks";
import { SECTION_BY_CLE, type SectionCle } from "../fr/rapport.fr";
import type { PeriodeMot } from "./ventes";

const PROJECT = "muse-square-open-data";
const DATASET = "analytics";
const TABLE = "report_templates";
export const NOM_MAX = 80;
const PERIODES: PeriodeMot[] = ["30_derniers_jours", "semaine_derniere", "mois_dernier"];

export type AuthorRole = "owner" | "member";
export interface TemplateSection { cle: SectionCle; params: Record<string, unknown> }
export interface ReportTemplateRow {
  template_id: string;
  version: number;
  location_id: string;
  author_user_id: string;
  author_role: AuthorRole;
  nom: string;
  periode_relative: PeriodeMot;
  indicateur: string | null;
  sections_json: string;
  source_document_id: string | null;
  created_at: string;
}
export interface ReportTemplate extends Omit<ReportTemplateRow, "sections_json"> { sections: TemplateSection[] }

export const SCHEMA_FIELDS = [
  { name: "template_id", type: "STRING", mode: "REQUIRED" },
  { name: "version", type: "INT64", mode: "REQUIRED" },
  { name: "location_id", type: "STRING", mode: "REQUIRED" },
  { name: "author_user_id", type: "STRING", mode: "REQUIRED" },
  { name: "author_role", type: "STRING", mode: "REQUIRED" },
  { name: "nom", type: "STRING", mode: "REQUIRED" },
  { name: "periode_relative", type: "STRING", mode: "REQUIRED" },
  { name: "indicateur", type: "STRING", mode: "NULLABLE" },
  { name: "sections_json", type: "STRING", mode: "REQUIRED" },
  { name: "source_document_id", type: "STRING", mode: "NULLABLE" },
  { name: "created_at", type: "TIMESTAMP", mode: "REQUIRED" },
];

/** Le nom est une CLÉ lisible : espaces repliés, accents gardés, casse gardée pour l'affichage. */
export function normalizeNom(nom: unknown): string {
  return String(nom ?? "").replace(/\s+/g, " ").trim().slice(0, NOM_MAX);
}
const cle = (s: string): string => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, " ").trim();

/**
 * PUR — un Rapport → son Modèle : les sections à provenance (clé + paramètres), dans l'ordre ; les notes, la Synthèse,
 * les blocs d'Approfondir et les sections sans provenance (sources) ne sont pas des chiffres à garder, elles tombent.
 * La période relative du document, ou « 30 derniers jours » s'il portait des dates fixes (dit à l'appelant).
 */
export function templateFromDocument(r: RapportBlock, nom: unknown): { sections: TemplateSection[]; periode_relative: PeriodeMot; indicateur: string | null; periode_par_defaut: boolean } | { erreur: string } {
  const n = normalizeNom(nom);
  if (!n) return { erreur: "nom requis" };
  const sections: TemplateSection[] = [];
  let indicateur: string | null = null;
  for (const s of r.sections) {
    if (!s.provenance || !(s.cle in SECTION_BY_CLE)) continue;
    const params: Record<string, unknown> = {};
    const p = s.provenance.params ?? {};
    if (typeof (p as any).indicateur === "string") { params.indicateur = (p as any).indicateur; indicateur = (p as any).indicateur; }
    if (typeof (p as any).grain === "string") params.grain = (p as any).grain;
    if (!sections.some((x) => x.cle === s.cle)) sections.push({ cle: s.cle as SectionCle, params });
  }
  if (!sections.length) return { erreur: "aucune section à garder : ce Rapport n'a pas de section calculée" };
  const rel = r.periode.relative && PERIODES.includes(r.periode.relative as PeriodeMot) ? (r.periode.relative as PeriodeMot) : null;
  return { sections, periode_relative: rel ?? "30_derniers_jours", indicateur, periode_par_defaut: rel == null };
}

/** PUR : la ligne à insérer. */
export function newReportTemplateRow(input: {
  location_id: string;
  author: { user_id: string; role: AuthorRole };
  nom: unknown;
  sections: TemplateSection[];
  periode_relative: PeriodeMot;
  indicateur?: string | null;
  source_document_id?: string | null;
  template_id?: string | null;
  version?: number | null;
  now?: Date;
}): ReportTemplateRow {
  const location_id = String(input.location_id ?? "").trim();
  if (!location_id) throw new Error("modèle : location_id requis");
  if (!input.author?.user_id) throw new Error("modèle : auteur requis");
  const nom = normalizeNom(input.nom);
  if (!nom) throw new Error("modèle : nom requis");
  if (!Array.isArray(input.sections) || !input.sections.length) throw new Error("modèle : au moins une section");
  if (!PERIODES.includes(input.periode_relative)) throw new Error("modèle : période relative inconnue");
  const version = input.version == null ? 1 : Number(input.version);
  if (!Number.isInteger(version) || version < 1) throw new Error("modèle : version entière ≥ 1");
  return {
    template_id: input.template_id && /^[0-9a-f-]{36}$/i.test(input.template_id) ? input.template_id : randomUUID(),
    version, location_id,
    author_user_id: String(input.author.user_id).slice(0, 120), author_role: input.author.role === "member" ? "member" : "owner",
    nom, periode_relative: input.periode_relative, indicateur: input.indicateur ?? null,
    sections_json: JSON.stringify(input.sections.map((s) => ({ cle: s.cle, params: s.params ?? {} }))),
    source_document_id: input.source_document_id ?? null,
    created_at: (input.now ?? new Date()).toISOString(),
  };
}

const isNotFound = (err: any): boolean => err?.code === 404 || String(err?.message || "").includes("Not found");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Insertion en flux ; la table naît à la première écriture, avec les reprises de report_documents. */
export async function writeReportTemplate(bq: any, row: ReportTemplateRow, retries = 6, waitMs = 2000): Promise<void> {
  const table = bq.dataset(DATASET).table(TABLE);
  try { await table.insert([row]); return; } catch (err: any) { if (!isNotFound(err)) throw err; }
  await bq.dataset(DATASET).createTable(TABLE, { schema: { fields: SCHEMA_FIELDS } }).catch((e: any) => { if (!/Already Exists/i.test(String(e?.message || ""))) throw e; });
  for (let i = 0; ; i++) {
    try { await table.insert([row]); return; }
    catch (err: any) { if (!isNotFound(err) || i >= retries - 1) throw err; await sleep(waitMs * (i + 1)); }
  }
}

const flat = (x: any): any => (x && typeof x === "object" && "value" in x ? x.value : x);
function toTemplate(r: any): ReportTemplate | null {
  let sections: TemplateSection[];
  try { sections = JSON.parse(String(flat(r.sections_json))); } catch { return null; }
  if (!Array.isArray(sections) || !sections.every((s) => s && typeof s.cle === "string" && s.cle in SECTION_BY_CLE)) return null;
  return {
    template_id: String(flat(r.template_id)), version: Number(flat(r.version)), location_id: String(flat(r.location_id)),
    author_user_id: String(flat(r.author_user_id)), author_role: String(flat(r.author_role)) === "member" ? "member" : "owner",
    nom: String(flat(r.nom)), periode_relative: String(flat(r.periode_relative)) as PeriodeMot, indicateur: flat(r.indicateur) == null ? null : String(flat(r.indicateur)),
    source_document_id: flat(r.source_document_id) == null ? null : String(flat(r.source_document_id)),
    created_at: String(flat(r.created_at)), sections: sections.map((s) => ({ cle: s.cle as SectionCle, params: s.params && typeof s.params === "object" ? s.params : {} })),
  };
}

/** Les Modèles d'un site : la dernière version de chaque modèle, le plus récent d'abord. Une table absente = aucun modèle. */
export async function listReportTemplates(bq: any, location_id: string, limit = 50): Promise<ReportTemplate[]> {
  const [rows] = await bq.query({
    query: `SELECT template_id, version, location_id, author_user_id, author_role, nom, periode_relative, indicateur, sections_json, source_document_id, CAST(created_at AS STRING) AS created_at
            FROM \`${PROJECT}.${DATASET}.${TABLE}\` WHERE location_id = @location_id
            QUALIFY ROW_NUMBER() OVER (PARTITION BY template_id ORDER BY version DESC, created_at DESC) = 1
            ORDER BY created_at DESC LIMIT @limit`,
    params: { location_id, limit }, location: "EU",
  }).catch((e: any) => { if (isNotFound(e)) return [[]]; throw e; });
  return (rows as any[]).map(toTemplate).filter((t): t is ReportTemplate => !!t);
}

/** PUR — le modèle qu'un nom désigne (accents et casse ignorés, mot entier ou contenu) ; null si aucun. */
export function findTemplateByName(templates: ReportTemplate[], nom: unknown): ReportTemplate | null {
  const n = cle(String(nom ?? ""));
  if (!n) return null;
  return templates.find((t) => cle(t.nom) === n) ?? templates.find((t) => cle(t.nom).includes(n) || n.includes(cle(t.nom))) ?? null;
}
