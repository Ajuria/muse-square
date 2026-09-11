// src/lib/explorer/agentTools.ts — LES OUTILS de l'agent Explorer (docs/explorer-agentique-spec.md § 3).
//
// Cinq outils, chacun ne lit que la couche semantic ou une lib existante, et n'écrit que dans une table
// raw que l'app produit :
//   · lire_poles     → listPoles (analytics.action_commitments + semantic.vw_insight_event_dispositif_components) ;
//   · lire_familles  → semantic.vw_insight_event_client_offering_daily, 30 derniers jours MESURÉS du site
//                      (listSiteFamilies de kpiRegistry lit raw.client_transactions : la règle owner du 10/09
//                      l'interdit à une lecture nouvelle) ;
//   · lire_photos    → le contrat GET de /api/dispositifs/photos, appelé en interne par l'endpoint (jamais
//                      réécrit ici) ; l'image elle-même entre dans le résultat d'outil quand elle tient ;
//   · lire_memoire / ecrire_memoire → siteMemory.ts (vue semantic en lecture, raw en écriture).
// Le module est PUR vis-à-vis de l'auth et du réseau : l'endpoint lui passe des fonctions (deps) — c'est ce
// qui le rend testable sans BigQuery ni Clerk. Chaque appel est ENREGISTRÉ (record) : nom, entrée, issue,
// résumé en français, durée — c'est ce que le proto affiche et ce que raw.explorer_agent_turns garde.
import { z } from "zod/v4";
import type { ZodType as ZodV3Type } from "zod";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { BetaRunnableTool } from "@anthropic-ai/sdk/lib/tools/BetaRunnableTool";
import type { BetaToolResultContentBlockParam } from "@anthropic-ai/sdk/resources/beta";

// zod 3.25.76 est celui d'Astro (^3.25.76, `npm ls zod`) : sa racine « zod » est l'API v3, « zod/v4 » l'API v4.
// Le helper du SDK (@anthropic-ai/sdk 0.88.0, helpers/beta/zod.mjs) APPELLE `z.toJSONSchema` de zod/v4 —
// un schéma v3 y jette « Cannot read properties of undefined (reading 'def') » — mais sa déclaration
// (zod.d.ts) TYPE `inputSchema` sur la racine « zod » (v3). D'où ce seul passage : les schémas sont v4
// (exécution juste), les arguments de `run` restent typés par le schéma, et l'unique cast vit ici.
function outil<S extends z.ZodObject<any>>(o: {
  name: string;
  description: string;
  inputSchema: S;
  run: (args: z.infer<S>) => Promise<string | BetaToolResultContentBlockParam[]>;
}): BetaRunnableTool {
  return betaZodTool({ name: o.name, description: o.description, inputSchema: o.inputSchema as unknown as ZodV3Type, run: o.run as any });
}
import type { PoleListRow } from "../dispositifs/poleReading";
import { frDate, memoryToText, newSiteMemoryRow, type AuthorRole, type SiteMemoryEntry, type SiteMemoryRow } from "./siteMemory";

const PROJECT = "muse-square-open-data";
const flat = (v: any): any => (v && typeof v === "object" && "value" in v ? v.value : v);

export interface ToolCallRecord {
  name: string;
  input: unknown;
  ok: boolean;
  summary: string;   // français, affiché par le proto
  ms: number;
}

export interface FamilyRow { category: string; revenue_30d: number; n_days: number; avg_day_eur: number; first_day: string; last_day: string }

/** Une photo telle que GET /api/dispositifs/photos la rend (publicRow) — on ne dépend que de ces champs. */
export interface PhotoInfo {
  photo_id: string;
  dispositif_id: string;
  component_key: string;
  created_at?: string | null;
  [k: string]: unknown;
}
export interface PhotoBytes { media_type: "image/jpeg" | "image/png" | "image/webp" | "image/gif"; base64: string; bytes: number }

export interface AgentToolDeps {
  location_id: string;
  author: { user_id: string; role: AuthorRole };
  listPoles: () => Promise<PoleListRow[]>;
  readFamilies: () => Promise<FamilyRow[]>;
  readPhotos: (dispositif_id: string) => Promise<PhotoInfo[]>;
  readPhotoBytes: (dispositif_id: string, photo_id: string) => Promise<PhotoBytes | null>;
  readMemory: (subject?: string) => Promise<SiteMemoryEntry[]>;
  writeMemory: (row: SiteMemoryRow) => Promise<void>;
  record: (r: ToolCallRecord) => void;
}

export const MAX_IMAGES_PER_CALL = 8;
export const MAX_IMAGE_BYTES = 1_500_000;      // au-delà, la photo est décrite par ses champs, pas regardée
export const MAX_IMAGES_TOTAL_BYTES = 6_000_000;

// ── Lecture des familles : la vue semantic jour × famille, bornée à aujourd'hui, sur les 30 derniers
// jours MESURÉS du site (pas 30 jours calendaires : un site dont l'import s'arrête garde une lecture).
export async function readSiteFamilies30d(bq: any, location_id: string, limit = 20): Promise<FamilyRow[]> {
  const rows = await bq.query({
    query: `WITH b AS (
              SELECT MAX(transaction_date) AS last_day
              FROM \`${PROJECT}.semantic.vw_insight_event_client_offering_daily\`
              WHERE location_id = @location_id
            )
            SELECT item_category,
                   ROUND(SUM(revenue), 0) AS revenue_30d,
                   COUNT(DISTINCT transaction_date) AS n_days,
                   ROUND(SUM(revenue) / COUNT(DISTINCT transaction_date), 0) AS avg_day_eur,
                   CAST(MIN(transaction_date) AS STRING) AS first_day,
                   CAST(MAX(transaction_date) AS STRING) AS last_day
            FROM \`${PROJECT}.semantic.vw_insight_event_client_offering_daily\`, b
            WHERE location_id = @location_id
              AND item_category IS NOT NULL
              AND transaction_date > DATE_SUB(b.last_day, INTERVAL 30 DAY)
            GROUP BY 1 ORDER BY 2 DESC LIMIT ${Math.max(1, Math.min(50, limit))}`,
    params: { location_id },
    location: "EU",
  }).then((r: any) => (Array.isArray(r?.[0]) ? r[0] : [])).catch(() => []);
  return (rows as any[]).map((r) => ({
    category: String(flat(r.item_category)),
    revenue_30d: Number(flat(r.revenue_30d) ?? 0),
    n_days: Number(flat(r.n_days) ?? 0),
    avg_day_eur: Number(flat(r.avg_day_eur) ?? 0),
    first_day: String(flat(r.first_day) ?? ""),
    last_day: String(flat(r.last_day) ?? ""),
  }));
}

const frInt = (n: number): string => Math.round(n).toLocaleString("fr-FR");
const plural = (n: number, un: string, des: string): string => `${n} ${n > 1 ? des : un}`;
const norm = (s: string): string => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

// ── Les textes rendus AU MODÈLE (jamais à l'écran) ────────────────────────────────────────────────
export function polesToText(poles: PoleListRow[]): string {
  if (!poles.length) return "Aucun pôle déclaré sur ce site.";
  return poles.map((p) => {
    const comps = p.components.length
      ? p.components.map((c) => `${c.type_label_fr ?? c.type}${c.role_label_fr ? ` (${c.role_label_fr})` : ""}${c.label ? ` « ${c.label} »` : ""}`).join(" ; ")
      : "aucun composant déclaré";
    return `• ${p.name} — familles : ${p.families.length ? p.families.join(", ") : "aucune"} ; responsable : ${p.responsable ?? "non désigné"}${p.lever ? ` ; levier : ${p.lever}` : ""} ; composants : ${comps}`;
  }).join("\n");
}

export function familiesToText(fams: FamilyRow[]): string {
  if (!fams.length) return "Aucune vente lue sur ce site dans la vue jour × famille.";
  const first = fams.reduce((a, f) => (a && a < f.first_day ? a : f.first_day), "");
  const last = fams.reduce((a, f) => (a > f.last_day ? a : f.last_day), "");
  const head = `Familles vendues sur les 30 derniers jours mesurés (du ${frDate(first)} au ${frDate(last)}), CA total et CA par jour vendu :`;
  return head + "\n" + fams.map((f) => `• ${f.category} — ${frInt(f.revenue_30d)} € sur ${plural(f.n_days, "jour", "jours")}, soit ${frInt(f.avg_day_eur)} € par jour`).join("\n");
}

function photoToText(poleName: string, p: PhotoInfo): string {
  const skip = new Set(["url", "questions", "photo_id", "dispositif_id", "version_no"]);
  const fields = Object.entries(p)
    .filter(([k, v]) => !skip.has(k) && v != null && v !== "" && !(Array.isArray(v) && v.length === 0))
    .map(([k, v]) => `${k} : ${typeof v === "string" ? v : JSON.stringify(v)}`);
  return `• ${poleName} — composant ${String(p.component_key)}${p.created_at ? ` (photo du ${frDate(String(p.created_at))})` : ""}\n  ${fields.join("\n  ")}`;
}

// ── Les outils ─────────────────────────────────────────────────────────────────────────────────────
export function buildAgentTools(deps: AgentToolDeps): BetaRunnableTool[] {
  const timed = async <T>(name: string, input: unknown, fn: () => Promise<{ out: T; summary: string }>): Promise<T> => {
    const t0 = Date.now();
    try {
      const { out, summary } = await fn();
      deps.record({ name, input, ok: true, summary, ms: Date.now() - t0 });
      return out;
    } catch (e: any) {
      deps.record({ name, input, ok: false, summary: `échec : ${String(e?.message || e)}`, ms: Date.now() - t0 });
      throw e;
    }
  };

  const lirePoles = outil({
    name: "lire_poles",
    description: "Les pôles déclarés du site (familles de produits & services, responsable, levier) et les composants de leur version courante (type, rôle, libellé). À lire avant de parler de l'espace.",
    inputSchema: z.object({}),
    run: () => timed("lire_poles", {}, async () => {
      const poles = await deps.listPoles();
      const nComp = poles.reduce((n, p) => n + p.components.length, 0);
      return { out: polesToText(poles), summary: poles.length ? `${plural(poles.length, "pôle", "pôles")}, ${plural(nComp, "composant", "composants")}` : "aucun pôle déclaré" };
    }),
  });

  const lireFamilles = outil({
    name: "lire_familles",
    description: "Les familles de produits & services vendues sur les 30 derniers jours mesurés du site : CA total, jours vendus, CA par jour, et la fenêtre exacte. Ne dit rien d'un jour isolé.",
    inputSchema: z.object({}),
    run: () => timed("lire_familles", {}, async () => {
      const fams = await deps.readFamilies();
      const summary = fams.length
        ? `${plural(fams.length, "famille", "familles")} sur 30 jours mesurés (du ${frDate(fams.reduce((a, f) => (a && a < f.first_day ? a : f.first_day), ""))} au ${frDate(fams.reduce((a, f) => (a > f.last_day ? a : f.last_day), ""))})`
        : "aucune vente lue";
      return { out: familiesToText(fams), summary };
    }),
  });

  const lirePhotos = outil({
    name: "lire_photos",
    description: "La dernière photo lue de chaque composant des pôles du site : ce qu'elle montre, les articles reconnus ou confirmés, les prix lus — et l'image quand elle tient. Sans « pole », tous les pôles ; avec, le pôle dont le nom contient ce texte.",
    inputSchema: z.object({
      pole: z.string().optional().describe("Le nom (ou une partie du nom) du pôle. Vide = tous les pôles."),
      avec_images: z.boolean().optional().describe("Joindre les images elles-mêmes (vrai par défaut)."),
    }),
    run: (args) => timed("lire_photos", args, async () => {
      const all = await deps.listPoles();
      const wanted = args.pole ? all.filter((p) => norm(p.name).includes(norm(args.pole!))) : all;
      if (!all.length) return { out: [{ type: "text", text: "Aucun pôle déclaré, donc aucune photo." }] as BetaToolResultContentBlockParam[], summary: "aucun pôle, aucune photo" };
      if (!wanted.length) return { out: [{ type: "text", text: `Aucun pôle dont le nom contient « ${args.pole} ». Pôles du site : ${all.map((p) => p.name).join(", ")}.` }] as BetaToolResultContentBlockParam[], summary: `aucun pôle nommé « ${args.pole} »` };
      const perPole = await Promise.all(wanted.map(async (p) => ({ pole: p, photos: await deps.readPhotos(p.dispositif_id).catch(() => [] as PhotoInfo[]) })));
      const lines: string[] = [];
      const blocks: BetaToolResultContentBlockParam[] = [];
      let nPhotos = 0, nSans = 0, nImages = 0, nLourdes = 0, totalBytes = 0;
      for (const { pole, photos } of perPole) {
        const withPhoto = new Set(photos.map((ph) => ph.component_key));
        const sans = pole.components.filter((c) => !withPhoto.has(c.component_key));
        nSans += sans.length;
        if (!photos.length) { lines.push(`• ${pole.name} — aucune photo (${plural(pole.components.length, "composant", "composants")} sans photo)`); continue; }
        for (const ph of photos) { nPhotos++; lines.push(photoToText(pole.name, ph)); }
        if (sans.length) lines.push(`  ${pole.name} — sans photo : ${sans.map((c) => c.type_label_fr ?? c.type).join(", ")}`);
        if (args.avec_images !== false) {
          for (const ph of photos) {
            if (nImages >= MAX_IMAGES_PER_CALL) break;
            const img = await deps.readPhotoBytes(ph.dispositif_id, ph.photo_id).catch(() => null);
            if (!img) continue;
            if (img.bytes > MAX_IMAGE_BYTES || totalBytes + img.bytes > MAX_IMAGES_TOTAL_BYTES) { nLourdes++; continue; }
            totalBytes += img.bytes; nImages++;
            blocks.push({ type: "text", text: `Image — ${pole.name}, composant ${ph.component_key} :` });
            blocks.push({ type: "image", source: { type: "base64", media_type: img.media_type, data: img.base64 } });
          }
        }
      }
      const header = nPhotos ? `${plural(nPhotos, "photo lue", "photos lues")}${nSans ? `, ${plural(nSans, "composant sans photo", "composants sans photo")}` : ""}${nLourdes ? ` ; ${plural(nLourdes, "image trop lourde pour être regardée", "images trop lourdes pour être regardées")}` : ""}.` : "Aucune photo lue.";
      const out: BetaToolResultContentBlockParam[] = [{ type: "text", text: header + "\n" + lines.join("\n") }, ...blocks];
      return { out, summary: nPhotos ? `${plural(nPhotos, "photo lue", "photos lues")}${nImages ? `, ${plural(nImages, "image regardée", "images regardées")}` : ""}${nSans ? `, ${plural(nSans, "composant sans photo", "composants sans photo")}` : ""}` : "aucune photo" };
    }),
  });

  const lireMemoire = outil({
    name: "lire_memoire",
    description: "Ce que l'exploitant a déjà dit de son espace, par sujet, avec l'auteur et la date (la dernière version de chaque sujet). Sans « sujet », tout ; avec, ce sujet seul.",
    inputSchema: z.object({ sujet: z.string().optional().describe("Un sujet précis (deux ou trois mots). Vide = tous les sujets.") }),
    run: (args) => timed("lire_memoire", args, async () => {
      const entries = await deps.readMemory(args.sujet);
      return { out: memoryToText(entries), summary: entries.length ? `${plural(entries.length, "sujet noté", "sujets notés")}` : "rien de noté sur cet espace" };
    }),
  });

  const ecrireMemoire = outil({
    name: "ecrire_memoire",
    description: "Enregistrer ce que l'exploitant vient de dire de son espace : un sujet court (minuscules, deux ou trois mots) et le contenu fidèle à ce qu'il a dit. Un sujet déjà noté s'enregistre à nouveau — la dernière version fait foi. « retirer » = vrai efface le sujet.",
    inputSchema: z.object({
      sujet: z.string().min(1).max(120).describe("Le sujet, deux ou trois mots en minuscules (ex. « vitrine », « sens de circulation »)."),
      contenu: z.string().max(4000).describe("Ce qui a été dit, fidèlement. Vide seulement pour retirer."),
      origine: z.enum(["conversation", "outil"]).optional().describe("« conversation » (l'exploitant l'a dit — défaut) ou « outil » (lu par toi sur un fichier)."),
      retirer: z.boolean().optional().describe("Vrai pour retirer le sujet : il ne sera plus rendu."),
    }),
    run: (args) => timed("ecrire_memoire", args, async () => {
      const row = newSiteMemoryRow({
        location_id: deps.location_id,
        subject: args.sujet,
        body: args.contenu,
        author_user_id: deps.author.user_id,
        author_role: deps.author.role,
        source: args.origine ?? "conversation",
        superseded: Boolean(args.retirer),
      });
      await deps.writeMemory(row);
      return {
        out: args.retirer ? `Sujet « ${row.subject} » retiré.` : `Enregistré — sujet « ${row.subject} », le ${frDate(row.created_at)}.`,
        summary: args.retirer ? `« ${row.subject} » retiré` : `« ${row.subject} » enregistré`,
      };
    }),
  });

  return [lirePoles, lireFamilles, lirePhotos, lireMemoire, ecrireMemoire];
}
