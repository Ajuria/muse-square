// src/lib/rapport/envois.ts — L'ENVOI À CADENCE D'UN MODÈLE DE RAPPORT (docs/explorer-outil-spec.md § 6.4, incrément 5).
//
// Owner 12/09 : « envoyer le même modèle avec les données actualisées à X (moi, ou des contacts du compte / de
// Communiquer) tous les Y (jour, semaine, trimestre, année) ». Un envoi programmé = un Modèle, une cadence (chaque
// jour · chaque <jour de semaine> · chaque <n> du mois · chaque trimestre · chaque année), une heure, un canal (email,
// Slack) et des destinataires — table app-write `analytics.report_schedules`, grain schedule_id × version, append-only
// (le patron de report_documents : la dernière version fait foi, `actif` = false l'arrête). Chaque envoi effectué — ou
// retenu faute de matière — laisse une trace dans `analytics.report_sends` (schedule_id × période) qui interdit le
// double envoi, le patron de `consigne_sends`. Le cron (api/cron/report-sends.ts) compose le document depuis le Modèle
// sur la période DÉCALÉE de la cadence, sans la boucle (composerSurPeriode : les mêmes lectures, déterministes, donc
// pas de Synthèse), l'enregistre comme Rapport (report_documents), le rend en HTML côté serveur PAR LE MÊME KIT que la
// page (public/js/card-kit.js : ses primitives sont des chaînes à styles inline, aucun DOM requis — les graphiques SVG
// sont retirés du courriel, chacun a son tableau à côté), et l'envoie par les rails existants (internalSend.ts).
// « Un rapport sans matière ne part pas » : un document dont aucune section ne porte un chiffre n'est pas envoyé — la
// trace le dit, le cron n'insiste pas ce jour-là. Aucune lecture métier ici : le côté producteur écrit et relit.
import { randomUUID } from "node:crypto";
import type { AnswerBlock, RapportBlock } from "../explorer/blocks";
import { MODELE_VENTES, type SectionCle } from "../fr/rapport.fr";
import type { Indicateur } from "../dispositifs/poleClassement";
import { resolvePeriode } from "./ventes";
import { composerSurPeriode } from "./gestes";
import { newReportDocumentRow, writeReportDocument } from "./documents";
import { listReportTemplates } from "./modeles";
import { sendEmail as sendEmailReel, sendSlack as sendSlackReel, loadChannelConfig as loadChannelConfigReel, type InternalMessage, type InternalSendResult, type InternalSendConfig } from "../channels/internalSend";

const PROJECT = "muse-square-open-data";
const DATASET = "analytics";
const T_SCHEDULES = "report_schedules";
const T_SENDS = "report_sends";

export type Cadence = "quotidien" | "hebdomadaire" | "mensuel" | "trimestriel" | "annuel";
export type Canal = "email" | "slack";
export const CADENCES: Cadence[] = ["quotidien", "hebdomadaire", "mensuel", "trimestriel", "annuel"];
export const CANAUX: Canal[] = ["email", "slack"];
export const DESTINATAIRES_MAX = 20;
/** Les mots du lexique (l. 126) : « Envoyer chaque lundi / chaque jour / chaque 1er du mois ». */
export const JOURS_SEMAINE_FR = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];

export interface ReportScheduleRow {
  schedule_id: string;
  version: number;
  location_id: string;
  author_user_id: string;
  author_role: "owner" | "member";
  modele_id: string;        // « ventes » (le Modèle par défaut) ou le template_id d'un Modèle du site
  modele_nom: string;
  cadence: Cadence;
  jour: number | null;      // hebdomadaire : 1 (lundi) … 7 (dimanche) ; mensuel : 1 … 28 ; sinon null
  heure: number;            // 0 … 23, heure de Paris
  canal: Canal;
  destinataires_json: string; // JSON : emails (email) ou canaux (slack)
  actif: boolean;
  created_at: string;
}
export interface ReportSchedule extends Omit<ReportScheduleRow, "destinataires_json"> { destinataires: string[] }

export interface ReportSendRow {
  send_id: string;
  schedule_id: string | null;   // null = un envoi ponctuel (« Envoyer maintenant »)
  location_id: string;
  modele_id: string;
  periode_du: string;
  periode_au: string;
  document_id: string | null;   // null = rien n'est parti (sans matière)
  canal: Canal;
  recipients: string;           // JSON
  n_recipients: number;
  sent_at: string;
}

export const SCHEDULE_FIELDS = [
  { name: "schedule_id", type: "STRING", mode: "REQUIRED" },
  { name: "version", type: "INT64", mode: "REQUIRED" },
  { name: "location_id", type: "STRING", mode: "REQUIRED" },
  { name: "author_user_id", type: "STRING", mode: "REQUIRED" },
  { name: "author_role", type: "STRING", mode: "REQUIRED" },
  { name: "modele_id", type: "STRING", mode: "REQUIRED" },
  { name: "modele_nom", type: "STRING", mode: "REQUIRED" },
  { name: "cadence", type: "STRING", mode: "REQUIRED" },
  { name: "jour", type: "INT64", mode: "NULLABLE" },
  { name: "heure", type: "INT64", mode: "REQUIRED" },
  { name: "canal", type: "STRING", mode: "REQUIRED" },
  { name: "destinataires_json", type: "STRING", mode: "REQUIRED" },
  { name: "actif", type: "BOOL", mode: "REQUIRED" },
  { name: "created_at", type: "TIMESTAMP", mode: "REQUIRED" },
];
export const SEND_FIELDS = [
  { name: "send_id", type: "STRING", mode: "REQUIRED" },
  { name: "schedule_id", type: "STRING", mode: "NULLABLE" },
  { name: "location_id", type: "STRING", mode: "REQUIRED" },
  { name: "modele_id", type: "STRING", mode: "REQUIRED" },
  { name: "periode_du", type: "DATE", mode: "REQUIRED" },
  { name: "periode_au", type: "DATE", mode: "REQUIRED" },
  { name: "document_id", type: "STRING", mode: "NULLABLE" },
  { name: "canal", type: "STRING", mode: "REQUIRED" },
  { name: "recipients", type: "STRING", mode: "REQUIRED" },
  { name: "n_recipients", type: "INT64", mode: "REQUIRED" },
  { name: "sent_at", type: "TIMESTAMP", mode: "REQUIRED" },
];

// ── La période d'une cadence (PUR) ───────────────────────────────────────────────────────────────────
export interface PeriodeEnvoi { du: string; au: string; relative: string | null; libelle_fr: string }
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const frDate = (iso: string): string => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso); return m ? `${m[3]}/${m[2]}/${m[1]}` : iso; };
const shiftDays = (iso: string, n: number): string => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

/**
 * La période DÉCALÉE que la cadence couvre : chaque jour → hier ; chaque semaine → la semaine civile dernière (lundi
 * → dimanche) ; chaque mois → le mois civil dernier ; chaque trimestre → le trimestre civil dernier ; chaque année →
 * l'année civile dernière. `today` = AAAA-MM-JJ à Paris. La période du Modèle (30 derniers jours…) ne s'applique pas
 * ici : ce qui part chaque lundi couvre la semaine qui vient de finir.
 */
export function periodeDeCadence(cadence: Cadence, today: string): PeriodeEnvoi {
  if (!ISO.test(today)) throw new Error("envoi : date du jour invalide");
  if (cadence === "quotidien") { const h = shiftDays(today, -1); return { du: h, au: h, relative: null, libelle_fr: `hier, le ${frDate(h)}` }; }
  if (cadence === "hebdomadaire") { const p = resolvePeriode({ periode: "semaine_derniere" }, today)!; return { du: p.start, au: p.end, relative: "semaine_derniere", libelle_fr: p.libelle_fr }; }
  if (cadence === "mensuel") { const p = resolvePeriode({ periode: "mois_dernier" }, today)!; return { du: p.start, au: p.end, relative: "mois_dernier", libelle_fr: p.libelle_fr }; }
  const y = Number(today.slice(0, 4)), m = Number(today.slice(5, 7));
  if (cadence === "trimestriel") {
    const qStartMonth = Math.floor((m - 1) / 3) * 3 + 1;                       // 1, 4, 7, 10
    const debutTrimestreCourant = `${y}-${String(qStartMonth).padStart(2, "0")}-01`;
    const au = shiftDays(debutTrimestreCourant, -1);
    const du = `${au.slice(0, 4)}-${String(Number(au.slice(5, 7)) - 2).padStart(2, "0")}-01`;
    return { du, au, relative: null, libelle_fr: `le trimestre dernier, du ${frDate(du)} au ${frDate(au)}` };
  }
  const du = `${y - 1}-01-01`, au = `${y - 1}-12-31`;
  return { du, au, relative: null, libelle_fr: `l’année dernière, du ${frDate(du)} au ${frDate(au)}` };
}

// ── Le moment à Paris, et l'échéance (PUR) ───────────────────────────────────────────────────────────
export interface MomentParis { date: string; heure: number; jour_semaine: number; jour_mois: number; mois: number }
export function momentParis(d = new Date()): MomentParis {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false, weekday: "short" }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const date = `${get("year")}-${get("month")}-${get("day")}`;
  const wd = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(get("weekday")) + 1;
  return { date, heure: Number(get("hour")) % 24, jour_semaine: wd || 7, jour_mois: Number(get("day")), mois: Number(get("month")) };
}

/**
 * Un envoi est dû si son jour est là et si son heure est passée (une heure manquée se rattrape le même jour — la
 * trace par période empêche qu'elle parte deux fois). Chaque trimestre / chaque année : le 1er du trimestre / de l'an.
 */
export function estDue(s: Pick<ReportSchedule, "cadence" | "jour" | "heure" | "actif">, now: MomentParis): boolean {
  if (!s.actif || now.heure < s.heure) return false;
  if (s.cadence === "quotidien") return true;
  if (s.cadence === "hebdomadaire") return now.jour_semaine === (s.jour ?? 1);
  if (s.cadence === "mensuel") return now.jour_mois === (s.jour ?? 1);
  if (s.cadence === "trimestriel") return now.jour_mois === 1 && [1, 4, 7, 10].includes(now.mois);
  return now.jour_mois === 1 && now.mois === 1;
}

/** « Envoyer chaque lundi à 8 h » — la cadence en mots (lexique l. 126). */
export function cadenceFr(s: Pick<ReportSchedule, "cadence" | "jour" | "heure">): string {
  const h = ` à ${s.heure} h`;
  if (s.cadence === "quotidien") return `chaque jour${h}`;
  if (s.cadence === "hebdomadaire") return `chaque ${JOURS_SEMAINE_FR[((s.jour ?? 1) - 1 + 7) % 7]}${h}`;
  if (s.cadence === "mensuel") return `chaque ${(s.jour ?? 1) === 1 ? "1er" : String(s.jour)} du mois${h}`;
  if (s.cadence === "trimestriel") return `chaque trimestre, le 1er${h}`;
  return `chaque année, le 1er janvier${h}`;
}

// ── Les lignes (PUR) ─────────────────────────────────────────────────────────────────────────────────
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function normalizeDestinataires(canal: Canal, x: unknown): string[] {
  const list = (Array.isArray(x) ? x : [x]).map((v) => String(v ?? "").trim()).filter(Boolean);
  const out: string[] = [];
  for (const v of list) {
    if (canal === "email" && !EMAIL.test(v)) throw new Error(`envoi : destinataire email invalide « ${v.slice(0, 40)} »`);
    if (canal === "slack" && !/^[#@]?[\w.-]{1,80}$/.test(v)) throw new Error(`envoi : canal Slack invalide « ${v.slice(0, 40)} »`);
    const k = canal === "email" ? v.toLowerCase() : v;
    if (!out.includes(k)) out.push(k);
  }
  if (out.length > DESTINATAIRES_MAX) throw new Error(`envoi : ${DESTINATAIRES_MAX} destinataires au plus`);
  return out;
}

export function newScheduleRow(input: {
  location_id: string; author: { user_id: string; role: "owner" | "member" };
  modele_id: string; modele_nom: string; cadence: unknown; jour?: unknown; heure?: unknown; canal: unknown; destinataires: unknown;
  schedule_id?: string | null; version?: number | null; actif?: boolean; now?: Date;
}): ReportScheduleRow {
  const location_id = String(input.location_id ?? "").trim();
  if (!location_id) throw new Error("envoi : location_id requis");
  if (!input.author?.user_id) throw new Error("envoi : auteur requis");
  const modele_id = String(input.modele_id ?? "").trim();
  if (!modele_id) throw new Error("envoi : Modèle requis");
  const cadence = String(input.cadence ?? "") as Cadence;
  if (!CADENCES.includes(cadence)) throw new Error("envoi : cadence inconnue");
  const canal = String(input.canal ?? "email") as Canal;
  if (!CANAUX.includes(canal)) throw new Error("envoi : canal inconnu");
  let jour: number | null = null;
  if (cadence === "hebdomadaire") { jour = input.jour == null ? 1 : Number(input.jour); if (!Number.isInteger(jour) || jour < 1 || jour > 7) throw new Error("envoi : jour de semaine 1 (lundi) à 7 (dimanche)"); }
  if (cadence === "mensuel") { jour = input.jour == null ? 1 : Number(input.jour); if (!Number.isInteger(jour) || jour < 1 || jour > 28) throw new Error("envoi : jour du mois 1 à 28"); }
  const heure = input.heure == null ? 8 : Number(input.heure);
  if (!Number.isInteger(heure) || heure < 0 || heure > 23) throw new Error("envoi : heure 0 à 23");
  const destinataires = normalizeDestinataires(canal, input.destinataires);
  if (!destinataires.length && canal === "email") throw new Error("envoi : au moins un destinataire");
  const version = input.version == null ? 1 : Number(input.version);
  if (!Number.isInteger(version) || version < 1) throw new Error("envoi : version entière ≥ 1");
  return {
    schedule_id: input.schedule_id && /^[0-9a-f-]{36}$/i.test(input.schedule_id) ? input.schedule_id : randomUUID(),
    version, location_id,
    author_user_id: String(input.author.user_id).slice(0, 120), author_role: input.author.role === "member" ? "member" : "owner",
    modele_id, modele_nom: String(input.modele_nom ?? "").replace(/\s+/g, " ").trim().slice(0, 80) || "Rapport",
    cadence, jour, heure, canal, destinataires_json: JSON.stringify(destinataires), actif: input.actif !== false,
    created_at: (input.now ?? new Date()).toISOString(),
  };
}

// ── Écriture / lecture (côté producteur) ─────────────────────────────────────────────────────────────
const isNotFound = (err: any): boolean => err?.code === 404 || String(err?.message || "").includes("Not found");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function insertAvecCreation(bq: any, table: string, fields: unknown[], rows: unknown[], retries = 6, waitMs = 2000): Promise<void> {
  const t = bq.dataset(DATASET).table(table);
  try { await t.insert(rows); return; } catch (err: any) { if (!isNotFound(err)) throw err; }
  await bq.dataset(DATASET).createTable(table, { schema: { fields } }).catch((e: any) => { if (!/Already Exists/i.test(String(e?.message || ""))) throw e; });
  for (let i = 0; ; i++) {
    try { await t.insert(rows); return; }
    catch (err: any) { if (!isNotFound(err) || i >= retries - 1) throw err; await sleep(waitMs * (i + 1)); }
  }
}
export const writeSchedule = (bq: any, row: ReportScheduleRow) => insertAvecCreation(bq, T_SCHEDULES, SCHEDULE_FIELDS, [row]);
export const writeSend = (bq: any, row: ReportSendRow) => insertAvecCreation(bq, T_SENDS, SEND_FIELDS, [row]);
/**
 * Mesuré le 12/09 (sonde réelle) : une table qui vient de naître refuse l'insertion en flux plus de 30 s — la trace du
 * premier envoi n'a pas pu s'écrire alors que le courriel était parti. D'où : les deux tables se créent AVANT de
 * composer (la composition et l'envoi absorbent le délai), et l'insertion garde ses reprises.
 */
export async function ensureTables(bq: any): Promise<void> {
  for (const [table, fields] of [[T_SCHEDULES, SCHEDULE_FIELDS], [T_SENDS, SEND_FIELDS]] as const) {
    const [exists] = await bq.dataset(DATASET).table(table).exists().catch(() => [false]);
    if (exists) continue;
    await bq.dataset(DATASET).createTable(table, { schema: { fields } }).catch((e: any) => { if (!/Already Exists/i.test(String(e?.message || ""))) throw e; });
  }
}

const flat = (x: any): any => (x && typeof x === "object" && "value" in x ? x.value : x);
function toSchedule(r: any): ReportSchedule | null {
  let destinataires: string[];
  try { destinataires = JSON.parse(String(flat(r.destinataires_json))); } catch { return null; }
  if (!Array.isArray(destinataires)) return null;
  const cadence = String(flat(r.cadence)) as Cadence, canal = String(flat(r.canal)) as Canal;
  if (!CADENCES.includes(cadence) || !CANAUX.includes(canal)) return null;
  return {
    schedule_id: String(flat(r.schedule_id)), version: Number(flat(r.version)), location_id: String(flat(r.location_id)),
    author_user_id: String(flat(r.author_user_id)), author_role: String(flat(r.author_role)) === "member" ? "member" : "owner",
    modele_id: String(flat(r.modele_id)), modele_nom: String(flat(r.modele_nom)), cadence,
    jour: flat(r.jour) == null ? null : Number(flat(r.jour)), heure: Number(flat(r.heure)), canal,
    destinataires: destinataires.map(String), actif: flat(r.actif) === true, created_at: String(flat(r.created_at)),
  };
}
const SELECT_SCHEDULES = `SELECT schedule_id, version, location_id, author_user_id, author_role, modele_id, modele_nom, cadence, jour, heure, canal, destinataires_json, actif, CAST(created_at AS STRING) AS created_at
                          FROM \`${PROJECT}.${DATASET}.${T_SCHEDULES}\``;
const DERNIERE = `QUALIFY ROW_NUMBER() OVER (PARTITION BY schedule_id ORDER BY version DESC, created_at DESC) = 1`;

/** Les envois programmés d'un site (dernière version de chacun, arrêtés compris — `actif` le dit). Table absente = aucun. */
export async function listSchedules(bq: any, location_id: string, limit = 50): Promise<ReportSchedule[]> {
  const [rows] = await bq.query({ query: `${SELECT_SCHEDULES} WHERE location_id = @location_id ${DERNIERE} ORDER BY created_at DESC LIMIT @limit`, params: { location_id, limit }, location: "EU" })
    .catch((e: any) => { if (isNotFound(e)) return [[]]; throw e; });
  return (rows as any[]).map(toSchedule).filter((s): s is ReportSchedule => !!s);
}
/** Tous les envois ACTIFS, tous sites (le cron) : la dernière version de chacun, actif = TRUE. */
export async function listActiveSchedules(bq: any, limit = 500): Promise<ReportSchedule[]> {
  const [rows] = await bq.query({ query: `SELECT * FROM (${SELECT_SCHEDULES} ${DERNIERE}) WHERE actif = TRUE ORDER BY created_at LIMIT @limit`, params: { limit }, location: "EU" })
    .catch((e: any) => { if (isNotFound(e)) return [[]]; throw e; });
  return (rows as any[]).map(toSchedule).filter((s): s is ReportSchedule => !!s);
}
/** Les périodes déjà tracées (envoyées ou retenues) pour un envoi programmé : « du|au ». */
export async function periodesTracees(bq: any, schedule_id: string): Promise<Set<string>> {
  const [rows] = await bq.query({ query: `SELECT CAST(periode_du AS STRING) AS du, CAST(periode_au AS STRING) AS au FROM \`${PROJECT}.${DATASET}.${T_SENDS}\` WHERE schedule_id = @schedule_id`, params: { schedule_id }, location: "EU" })
    .catch((e: any) => { if (isNotFound(e)) return [[]]; throw e; });
  return new Set((rows as any[]).map((r) => `${flat(r.du)}|${flat(r.au)}`));
}
/** Les derniers envois d'un site (la page « Vos envois » les montre sous chaque envoi programmé). */
export async function listSends(bq: any, location_id: string, limit = 100): Promise<Array<{ schedule_id: string | null; modele_id: string; periode_du: string; periode_au: string; document_id: string | null; canal: string; n_recipients: number; sent_at: string }>> {
  const [rows] = await bq.query({ query: `SELECT schedule_id, modele_id, CAST(periode_du AS STRING) AS periode_du, CAST(periode_au AS STRING) AS periode_au, document_id, canal, n_recipients, CAST(sent_at AS STRING) AS sent_at
                                          FROM \`${PROJECT}.${DATASET}.${T_SENDS}\` WHERE location_id = @location_id ORDER BY sent_at DESC LIMIT @limit`, params: { location_id, limit }, location: "EU" })
    .catch((e: any) => { if (isNotFound(e)) return [[]]; throw e; });
  return (rows as any[]).map((r) => ({ schedule_id: flat(r.schedule_id) == null ? null : String(flat(r.schedule_id)), modele_id: String(flat(r.modele_id)), periode_du: String(flat(r.periode_du)), periode_au: String(flat(r.periode_au)), document_id: flat(r.document_id) == null ? null : String(flat(r.document_id)), canal: String(flat(r.canal)), n_recipients: Number(flat(r.n_recipients) ?? 0), sent_at: String(flat(r.sent_at)) }));
}

// ── La matière, le texte, le HTML (PUR) ──────────────────────────────────────────────────────────────
const AVEC_CHIFFRES = new Set(["table", "facts", "card", "barres", "barres_h", "parts"]);
/** « Un rapport sans matière ne part pas » : au moins une section porte un bloc à chiffres (pas une absence, pas une note). */
export function aDeLaMatiere(r: RapportBlock): boolean {
  return r.sections.some((s) => s.blocs.some((b) => AVEC_CHIFFRES.has(b.type)));
}

/** Le texte (Slack, et le repli `text` du courriel) : titre, période, la Synthèse s'il y en a une, puis les faits de chaque section. */
export function texteDuRapport(r: RapportBlock, url: string | null): string {
  const lignes: string[] = [r.titre, r.periode.libelle_fr, ""];
  if (r.synthese?.text) lignes.push("SYNTHÈSE", r.synthese.text.trim(), "");
  for (const s of r.sections) {
    lignes.push(s.titre.toUpperCase());
    let vide = true;
    for (const b of s.blocs as AnswerBlock[]) {
      if (b.type === "facts") { for (const f of b.items) lignes.push(`• ${f}`); vide = false; }
      else if (b.type === "absence") { lignes.push(b.manque); vide = false; }
      else if (b.type === "note") { lignes.push(`Votre note${b.auteur ? ` (${b.auteur})` : ""} : ${b.text}`); vide = false; }
    }
    if (vide) lignes.push("(voir le Rapport)");
    lignes.push("");
  }
  if (url) lignes.push(`Ouvrir le Rapport : ${url}`);
  return lignes.join("\n").trim();
}

let kitCache: any = null;
/**
 * Le kit, tel quel, comme une chaîne : sous Vite (la route, le cron, vitest) l'import `?raw` l'inline à la construction ;
 * sous tsx (harnais, batterie) cet import EXÉCUTE le fichier et tombe sur `window` — on lit alors le fichier. Le kit ne
 * touche le DOM qu'à l'écoute (typeof document !== 'undefined') : sans document, il ne pose que ses fonctions.
 */
async function kit(): Promise<any> {
  if (kitCache) return kitCache;
  let source: string | null = null;
  try { const m: any = await import("../../../public/js/card-kit.js?raw"); if (typeof m?.default === "string") source = m.default; } catch { source = null; }
  if (source == null) {
    const { readFileSync } = await import("node:fs");
    source = readFileSync(new URL(["..", "..", "..", "public", "js", "card-kit.js"].join("/"), import.meta.url), "utf8");
  }
  const win: any = {};
  new Function("window", "document", source)(win, undefined);
  if (!win.MSCardKit || typeof win.MSCardKit.renderAnswerBlocks !== "function") throw new Error("envoi : le kit ne s'est pas chargé");
  kitCache = win.MSCardKit;
  return kitCache;
}
const SVG_TYPES = new Set(["barres", "barres_h", "parts"]);
/** Le document tel qu'un courriel le rend : sans les graphiques SVG (chacun a son tableau à côté — composer.ts). */
export function rapportPourCourriel(r: RapportBlock): RapportBlock {
  const out: RapportBlock = JSON.parse(JSON.stringify(r));
  out.sections = out.sections.map((s) => ({ ...s, blocs: s.blocs.filter((b) => !SVG_TYPES.has(b.type)) }));
  return out;
}
const escHtml = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
/** Le courriel HTML : le Rapport rendu par le kit (styles inline), un lien « Ouvrir le Rapport », rien d'autre. */
export async function htmlDuRapport(r: RapportBlock, opts: { url: string | null; site?: string | null }): Promise<string> {
  const k = await kit();
  const register = r.synthese?.register ?? "vetted";
  const corps: string = k.renderAnswerBlocks([{ type: "register", register }, rapportPourCourriel(r)]);
  return [
    `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${escHtml(r.titre)}</title></head>`,
    `<body style="margin:0;padding:0;background:#F9FAFB;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#111827;">`,
    `<div style="max-width:680px;margin:0 auto;padding:20px 16px;">`,
    opts.site ? `<div style="font-size:12px;color:#6B7280;margin:0 0 12px;">${escHtml(opts.site)}</div>` : "",
    corps,
    opts.url ? `<p style="margin:18px 0 0;"><a href="${escHtml(opts.url)}" style="display:inline-block;background:#1D3BB3;color:#fff;text-decoration:none;font-size:13px;font-weight:600;padding:9px 14px;border-radius:8px;">Ouvrir le Rapport</a></p>` : "",
    `<p style="font-size:11px;color:#9CA3AF;margin:22px 0 0;">Envoyé par Muse Square, depuis votre Modèle de rapport. Les graphiques se lisent dans le Rapport ouvert.</p>`,
    `</div></body></html>`,
  ].join("");
}

// ── L'envoi (lecture + rails, injectables) ───────────────────────────────────────────────────────────
export interface Rails {
  sendEmail: (config: InternalSendConfig, msg: InternalMessage) => Promise<InternalSendResult>;
  sendSlack: (config: InternalSendConfig, msg: InternalMessage) => Promise<InternalSendResult>;
  loadChannelConfig: (bq: any, userId: string, locationId: string, channel: string) => Promise<InternalSendConfig>;
}
export const RAILS_REELS: Rails = { sendEmail: sendEmailReel, sendSlack: sendSlackReel, loadChannelConfig: loadChannelConfigReel };

export interface EnvoiResultat { ok: boolean; document_id: string | null; envoyes: string[]; echecs: string[]; raison: string }

/** Le Modèle que `modele_id` désigne : « ventes » (MODELE_VENTES) ou un Modèle du site, sa dernière version. */
export async function lireModele(bq: any, location_id: string, modele_id: string): Promise<{ nom: string; cles: SectionCle[]; indicateur: Indicateur } | null> {
  if (modele_id === "ventes") return { nom: "Rapport de ventes", cles: [...MODELE_VENTES], indicateur: "ca" };
  const t = (await listReportTemplates(bq, location_id)).find((x) => x.template_id === modele_id);
  if (!t) return null;
  return { nom: t.nom, cles: t.sections.map((s) => s.cle), indicateur: ((t.indicateur as Indicateur | null) ?? "ca") };
}

/**
 * Composer depuis le Modèle sur la période, enregistrer le Rapport, envoyer, tracer. `schedule_id` null = envoi
 * ponctuel. Sans matière : rien ne part, la trace le dit (document_id null, 0 destinataire). Un rail qui échoue pour
 * un destinataire n'empêche pas les autres ; la trace ne compte que ce qui est parti.
 */
export async function envoyerRapport(bq: any, inp: {
  location_id: string; author: { user_id: string; role: "owner" | "member" }; modele_id: string; canal: Canal; destinataires: string[];
  periode: PeriodeEnvoi; schedule_id?: string | null; today: string; base_url: string; site_nom?: string | null;
}, rails: Rails = RAILS_REELS): Promise<EnvoiResultat> {
  const modele = await lireModele(bq, inp.location_id, inp.modele_id);
  if (!modele) return { ok: false, document_id: null, envoyes: [], echecs: [], raison: "Modèle introuvable sur ce site" };
  await ensureTables(bq);
  const titre = `${modele.nom} — ${inp.periode.libelle_fr}`;
  const r = await composerSurPeriode(bq, inp.location_id, [inp.location_id], { cles: modele.cles, indicateur: modele.indicateur, titre, periode: inp.periode }, inp.today);
  const trace = (document_id: string | null, envoyes: string[]): ReportSendRow => ({
    send_id: randomUUID(), schedule_id: inp.schedule_id ?? null, location_id: inp.location_id, modele_id: inp.modele_id,
    periode_du: inp.periode.du, periode_au: inp.periode.au, document_id, canal: inp.canal, recipients: JSON.stringify(envoyes), n_recipients: envoyes.length, sent_at: new Date().toISOString(),
  });
  if (!aDeLaMatiere(r.block)) {
    await writeSend(bq, trace(null, []));
    return { ok: false, document_id: null, envoyes: [], echecs: [], raison: `sans matière ${inp.periode.libelle_fr} — non envoyé` };
  }
  const row = newReportDocumentRow({ location_id: inp.location_id, author: inp.author, rapport: r.block, modele_id: inp.modele_id });
  await writeReportDocument(bq, row);
  const url = `${inp.base_url.replace(/\/$/, "")}/app/insightevent/rapports?location_id=${encodeURIComponent(inp.location_id)}&document_id=${encodeURIComponent(row.document_id)}`;
  const text = texteDuRapport(r.block, url);
  const envoyes: string[] = [], echecs: string[] = [];
  const cfg = await rails.loadChannelConfig(bq, inp.author.user_id, inp.location_id, inp.canal).catch(() => ({}));
  if (inp.canal === "email") {
    const html = await htmlDuRapport(r.block, { url, site: inp.site_nom ?? null });
    for (const to of inp.destinataires) {
      const res = await rails.sendEmail(cfg, { title: titre, body: text, html, recipient: to }).catch((e: any) => ({ ok: false, error: String(e?.message || e) }));
      if (res.ok) envoyes.push(to); else echecs.push(`${to} : ${res.error || "échec"}`);
    }
  } else {
    const cibles = inp.destinataires.length ? inp.destinataires : [String((cfg as any)?.default_channel || "")].filter(Boolean);
    if (!cibles.length) echecs.push("aucun canal Slack (ni choisi, ni par défaut)");
    for (const ch of cibles) {
      const res = await rails.sendSlack(cfg, { title: `*${titre}*`, body: text, recipient: ch }).catch((e: any) => ({ ok: false, error: String(e?.message || e) }));
      if (res.ok) envoyes.push(ch); else echecs.push(`${ch} : ${res.error || "échec"}`);
    }
  }
  if (envoyes.length || !echecs.length) await writeSend(bq, trace(row.document_id, envoyes));
  return { ok: envoyes.length > 0, document_id: row.document_id, envoyes, echecs, raison: envoyes.length ? `envoyé à ${envoyes.length} destinataire(s)` : `aucun envoi n'a abouti` };
}

/** Un tour du cron : chaque envoi actif, dû maintenant et non tracé sur sa période, part. Rend une ligne par envoi programmé examiné. */
export async function tourDesEnvois(bq: any, opts: { now?: Date; base_url: string; rails?: Rails }): Promise<string[]> {
  const now = momentParis(opts.now ?? new Date());
  const lignes: string[] = [];
  const schedules = await listActiveSchedules(bq);
  for (const s of schedules) {
    const tag = `${s.modele_nom} (${s.schedule_id.slice(0, 8)}, ${cadenceFr(s)})`;
    if (!estDue(s, now)) { lignes.push(`${tag} : pas dû`); continue; }
    const per = periodeDeCadence(s.cadence, now.date);
    const tracees = await periodesTracees(bq, s.schedule_id);
    if (tracees.has(`${per.du}|${per.au}`)) { lignes.push(`${tag} : déjà tracé ${per.libelle_fr}`); continue; }
    try {
      const r = await envoyerRapport(bq, { location_id: s.location_id, author: { user_id: s.author_user_id, role: s.author_role }, modele_id: s.modele_id, canal: s.canal, destinataires: s.destinataires, periode: per, schedule_id: s.schedule_id, today: now.date, base_url: opts.base_url }, opts.rails);
      lignes.push(`${tag} : ${r.raison}${r.echecs.length ? ` ; échecs : ${r.echecs.join(" · ")}` : ""}`);
    } catch (e: any) {
      lignes.push(`${tag} : erreur ${String(e?.message || e).slice(0, 160)}`);
    }
  }
  return lignes;
}
