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
// 14/09 — « note_rapport » : une note écrite par l'exploitant SOUS une section d'un Rapport. Sa
// provenance compte : ce n'est ni une déclaration chiffrée (« ma marge est de 62 % ») ni un fait
// d'outil, c'est un constat de terrain, en mots libres. L'agent doit pouvoir la pondérer pour ce
// qu'elle est — d'où une source à elle, jamais fondue dans « conversation ».
export type MemorySource = "conversation" | "outil" | "note_rapport";
const SOURCES: MemorySource[] = ["conversation", "outil", "note_rapport"];

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
    source: (SOURCES.includes(String(flat(r.source)) as MemorySource) ? String(flat(r.source)) : "conversation") as MemorySource,
    created_at: String(flat(r.created_at)),
  }));
}

/**
 * PUR — CE QUE L'EXPLOITANT A NOTÉ, mis sous les yeux du modèle À CHAQUE TOUR (owner 14/09 : « peut
 * permettre à l'app d'apprendre beaucoup de choses sur le business du user »).
 *
 * POURQUOI DANS LE CONTEXTE ET PAS SEULEMENT DANS UN OUTIL. `lire_memoire` existe depuis le 12/09, mais un
 * outil ne sert que si le modèle pense à l'appeler — et il n'y pense pas, puisque rien ne lui dit qu'il y a
 * quelque chose à y lire. Une mémoire qu'on n'ouvre jamais est un tiroir. Elle entre donc dans le tour,
 * bornée : les plus récentes d'abord, le corps coupé, un plafond dur.
 *
 * CE QU'ELLE N'EST PAS, et le bloc le dit au modèle : une mesure. « On a fermé le lundi en août » est la
 * parole de l'exploitant, datée et signée. Elle éclaire un chiffre, elle ne le remplace jamais, et elle ne
 * se cite pas comme un fait vérifié.
 */
export function blocMemoires(entries: SiteMemoryEntry[], max = 20, corpsMax = 400): string | null {
  const l = (entries ?? []).filter((e) => e && e.subject && e.body).slice(0, max);
  if (!l.length) return null;
  const lignes = l.map((e) => {
    const corps = e.body.length > corpsMax ? e.body.slice(0, corpsMax).trimEnd() + "…" : e.body;
    const quand = frDate(e.created_at);
    const d = e.source === "note_rapport" ? "note sur un Rapport" : e.source === "outil" ? "relevé d'un outil" : "dit en conversation";
    return `- ${e.subject}${quand ? ` (${quand}, ${d})` : ` (${d})`} : ${corps}`;
  });
  return [
    "CE QUE L'EXPLOITANT A NOTÉ SUR SON COMMERCE — sa parole, datée. Ce n'est PAS une mesure : ça éclaire un",
    "chiffre, ça ne le remplace jamais, et ça ne se cite pas comme un fait vérifié. Quand une de ces notes",
    "porte sur la période ou le sujet dont tu parles, DIS-LA, en l'attribuant (« vous aviez noté que… ») ;",
    "sinon n'en parle pas. N'invente jamais une note qui n'est pas dans cette liste.",
    ...lignes,
  ].join("\n");
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
