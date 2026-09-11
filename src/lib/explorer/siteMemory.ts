// src/lib/explorer/siteMemory.ts — LA mémoire de travail d'un site (docs/explorer-agentique-spec.md § 2).
//
// Ce que l'exploitant a dit de son espace à l'agent Explorer et que la mesure ne voit pas — l'entrée,
// le sens de circulation, ce qui est en vitrine, une contrainte du local. Par SITE, avec l'AUTEUR de
// chaque note (author_user_id, author_role), comme les notes-cause (analytics.day_notes).
//
// Deux côtés, deux tables — la règle owner du 10/09 (l'app ne lit JAMAIS raw) :
//   · ÉCRIRE : raw.explorer_site_memory (app-write, insertion en flux, append-only) — le côté producteur ;
//   · LIRE   : semantic.vw_insight_event_site_memory — la dernière ligne de chaque (location_id, subject),
//              quand elle n'est pas un retrait (superseded = false). Vue livrée par la PR ms_database
//              `feat/explorer-site-memory` ; tant qu'elle n'est pas construite, la lecture rend [] (le
//              .catch ci-dessous) et l'agent le dit.
// Une ligne ne s'édite jamais (insertion en flux : pas de DML pendant 90 min) : retirer un sujet = écrire
// une ligne superseded = true.
import { randomUUID } from "node:crypto";

const PROJECT = "muse-square-open-data";

export type AuthorRole = "owner" | "member";
export type MemorySource = "conversation" | "outil";

export const SUBJECT_MAX = 120;
export const BODY_MAX = 4000;

/** La ligne telle qu'elle s'écrit dans raw.explorer_site_memory (9 colonnes REQUIRED). */
export interface SiteMemoryRow {
  memory_id: string;
  location_id: string;
  subject: string;
  body: string;
  author_user_id: string;
  author_role: AuthorRole;
  source: MemorySource;
  created_at: string;   // ISO
  superseded: boolean;
}

/** La ligne telle que la vue semantic la rend (la dernière par sujet, jamais un retrait). */
export interface SiteMemoryEntry {
  memory_id: string;
  location_id: string;
  subject: string;
  body: string;
  author_user_id: string;
  author_role: AuthorRole;
  source: MemorySource;
  created_at: string;   // ISO
}

const flat = (v: any): any => (v && typeof v === "object" && "value" in v ? v.value : v);

/** Le sujet est une CLÉ : espaces repliés, minuscules — « Vitrine » et « vitrine  » sont le même sujet. */
export function normalizeSubject(subject: unknown): string {
  return String(subject ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

export function normalizeBody(body: unknown): string {
  return String(body ?? "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

/** PUR : la ligne à insérer. Jette si un champ manque ou dépasse — jamais une ligne vide en base. */
export function newSiteMemoryRow(input: {
  location_id: string;
  subject: string;
  body: string;
  author_user_id: string;
  author_role: AuthorRole;
  source?: MemorySource;
  superseded?: boolean;
  now?: Date;
}): SiteMemoryRow {
  const location_id = String(input.location_id ?? "").trim();
  const subject = normalizeSubject(input.subject);
  const body = normalizeBody(input.body);
  const author_user_id = String(input.author_user_id ?? "").trim();
  if (!location_id) throw new Error("siteMemory: location_id requis");
  if (!subject) throw new Error("siteMemory: subject requis");
  if (subject.length > SUBJECT_MAX) throw new Error(`siteMemory: subject — ${SUBJECT_MAX} caractères au plus`);
  if (!input.superseded && !body) throw new Error("siteMemory: body requis");
  if (body.length > BODY_MAX) throw new Error(`siteMemory: body — ${BODY_MAX} caractères au plus`);
  if (!author_user_id) throw new Error("siteMemory: author_user_id requis");
  if (input.author_role !== "owner" && input.author_role !== "member") throw new Error("siteMemory: author_role owner | member");
  const source = input.source ?? "conversation";
  if (source !== "conversation" && source !== "outil") throw new Error("siteMemory: source conversation | outil");
  return {
    memory_id: randomUUID(),
    location_id,
    subject,
    body: body || "(retiré)",
    author_user_id,
    author_role: input.author_role,
    source,
    created_at: (input.now ?? new Date()).toISOString(),
    superseded: Boolean(input.superseded),
  };
}

/** Côté producteur : une insertion en flux dans la table raw que l'app produit. Jette si BigQuery refuse. */
export async function writeSiteMemory(bq: any, row: SiteMemoryRow): Promise<void> {
  await bq.dataset("raw").table("explorer_site_memory").insert([row]);
}

/** Côté lecture : la vue semantic — la dernière ligne par sujet, jamais un retrait. */
export async function readSiteMemory(
  bq: any,
  location_id: string,
  opts: { subject?: string; limit?: number } = {},
): Promise<SiteMemoryEntry[]> {
  const subject = opts.subject != null ? normalizeSubject(opts.subject) : null;
  const limit = Math.max(1, Math.min(200, opts.limit ?? 50));
  const rows = await bq.query({
    query: `SELECT memory_id, location_id, subject, body, author_user_id, author_role, source,
                   CAST(created_at AS STRING) AS created_at
            FROM \`${PROJECT}.semantic.vw_insight_event_site_memory\`
            WHERE location_id = @location_id${subject ? " AND subject = @subject" : ""}
            ORDER BY created_at DESC LIMIT ${limit}`,
    params: subject ? { location_id, subject } : { location_id },
    location: "EU",
  }).then((r: any) => (Array.isArray(r?.[0]) ? r[0] : [])).catch(() => []);
  return (rows as any[]).map((r) => ({
    memory_id: String(flat(r.memory_id)),
    location_id: String(flat(r.location_id)),
    subject: String(flat(r.subject)),
    body: String(flat(r.body)),
    author_user_id: String(flat(r.author_user_id)),
    author_role: (String(flat(r.author_role)) === "member" ? "member" : "owner") as AuthorRole,
    source: (String(flat(r.source)) === "outil" ? "outil" : "conversation") as MemorySource,
    created_at: String(flat(r.created_at)),
  }));
}

/** JJ/MM/AAAA depuis un ISO / une chaîne BigQuery (« 2026-09-11 08:00:00+00 »). */
export function frDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso || "");
}

/** Le texte que l'outil rend au modèle — une ligne par sujet, l'auteur et la date toujours dits. */
export function memoryToText(entries: SiteMemoryEntry[]): string {
  if (!entries.length) return "Aucune note en mémoire pour ce site.";
  return entries
    .map((e) => `• ${e.subject} — ${e.body} (${e.author_role === "member" ? "membre" : "exploitant"}, ${frDate(e.created_at)}${e.source === "outil" ? ", lu par un outil" : ""})`)
    .join("\n");
}
