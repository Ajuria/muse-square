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
import type { FamilyResult } from "../insightFamilies/types";
import { blocksFromFamilyResult, factsToText, ABSENCE_FR, type AnswerBlock } from "./blocks";
import { composeVentesFacts, resolvePeriode, ventesToText, type PeriodeMot, type SalesReportResult } from "../rapport/ventes";
import { composeResultatFacts, resultatToText, type Resultat } from "../kpi/resultat";
import { composePoleClassement, poleClassementToText, POLES_ABSENCE_FR, type Indicateur, type PoleClassementData } from "../dispositifs/poleClassement";
import { composeRapport, rapportToText, SECTIONS_VENTES } from "../rapport/composer";
import { resolveSections, SECTIONS, MODELE_VENTES, type SectionCle } from "../fr/rapport.fr";
import { findTemplateByName, type ReportTemplate } from "../rapport/modeles";
import { frDate, memoryToText, newSiteMemoryRow, type AuthorRole, type SiteMemoryEntry, type SiteMemoryRow } from "./siteMemory";
import { composerProposition, OBJECTIF_FR } from "./proposition";
import { JOURS, margeToText, type JoursMot, type MargeLecture } from "../kpi/margeLecture";
import { EVENT_TYPES_ALL } from "../events/eventTypes";

const PROJECT = "muse-square-open-data";
const flat = (v: any): any => (v && typeof v === "object" && "value" in v ? v.value : v);

export interface ToolCallRecord {
  name: string;
  input: unknown;
  ok: boolean;
  summary: string;   // français, affiché par le proto
  ms: number;
  // 12/09 (docs/explorer-outil-spec.md § 4-5) : ce que l'outil rend à l'EXPLOITANT (blocs du kit) et au
  // VALIDATEUR (faits) — la boucle assemble les blocs, et vérifie le texte du modèle contre les faits.
  blocks?: AnswerBlock[];
  facts?: string[];
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
  // 12/09 : LES lecteurs par famille d'Explorer (registre FAMILIES, src/lib/insightFamilies) — un outil est un
  // adaptateur d'une ligne autour du provider, jamais une copie. `date` = le jour de référence (AAAA-MM-JJ).
  runFamily: (key: "marge" | "espace" | "signaux", date: string) => Promise<FamilyResult>;
  // 13/09 (§ 7, couche 1) — lire_marge : la mesure d'abord, sinon les marges déclarées (lib/kpi/margeLecture.ts), les jours de la question.
  runMarge: (jours: JoursMot | null, date: string) => Promise<MargeLecture>;
  // 12/09 : LE cœur du rapport de ventes (lib/rapport/ventes.ts computeSalesReport) sur une période.
  runVentes: (start: string, end: string) => Promise<SalesReportResult>;
  // 12/09 : le résultat net par mois et le seuil de rentabilité du dernier jour (lib/kpi/resultat.ts readResultat).
  runResultat: () => Promise<Resultat>;
  // 12/09 : les pôles sur une période (lib/dispositifs/poleClassement.ts readPoleClassement : pole_daily + espace).
  runPolesClassement: (start: string, end: string) => Promise<PoleClassementData>;
  // 12/09 (incrément 4) : les Modèles de rapport du site (lib/rapport/modeles.ts) — « génère mon rapport hebdo » les nomme.
  listModeles: () => Promise<ReportTemplate[]>;
  today: () => string;   // AAAA-MM-JJ, Europe/Paris — injecté pour être testable
  record: (r: ToolCallRecord) => void;
  // 12/09 (incrément 6) — les faits rendus par les outils déjà appelés dans CE tour : ce que proposer_operation
  // accepte comme « pourquoi » (une phrase dont un chiffre n'y est pas tombe).
  faitsDuTour: () => string[];
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
  const timed = async <T>(name: string, input: unknown, fn: () => Promise<{ out: T; summary: string; blocks?: AnswerBlock[]; facts?: string[] }>): Promise<T> => {
    const t0 = Date.now();
    try {
      const { out, summary, blocks, facts } = await fn();
      deps.record({ name, input, ok: true, summary, ms: Date.now() - t0, ...(blocks ? { blocks } : {}), ...(facts ? { facts } : {}) });
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
      const out = polesToText(poles);
      // 12/09 : le texte rendu au modèle EST le fait — sans lui, la porte compterait comme non fondé un nombre
      // que l'outil a bel et bien rendu (mesuré : « Branded sur 19 jours » de lire_familles → registre « model »).
      return { out, summary: poles.length ? `${plural(poles.length, "pôle", "pôles")}, ${plural(nComp, "composant", "composants")}` : "aucun pôle déclaré", facts: poles.length ? out.split("\n") : [] };
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
      const out = familiesToText(fams);
      return { out, summary, facts: fams.length ? out.split("\n") : [] };
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

  // ── 12/09 — les lecteurs chiffrés, adaptateurs des providers FAMILIES (docs/explorer-outil-spec.md § 4) ──
  // Chaque outil rend au modèle les FAITS du provider (une ligne par fait), à l'exploitant la carte du kit
  // (bloc `card`, même rendu que le rapport de famille) ou l'absence, et au validateur les mêmes faits.
  const familyTool = (name: string, key: "marge" | "espace" | "signaux", render: string, description: string, schema: z.ZodObject<any>, filter?: (r: FamilyResult, args: any) => FamilyResult) =>
    outil({
      name, description, inputSchema: schema,
      run: (args) => timed(name, args, async () => {
        const raw = await deps.runFamily(key, deps.today());
        const r = filter ? filter(raw, args) : raw;
        const facts = r.found ? r.facts.map((f) => f.fact_fr) : [];
        const blocks = blocksFromFamilyResult(key, render, r);
        const absence = ABSENCE_FR[key]?.manque ?? "Aucune donnée pour l’instant.";
        return { out: factsToText(r, absence), summary: r.found ? `${plural(facts.length, "fait", "faits")} lus` : "rien à lire — absence dite", blocks, facts };
      }),
    });

  // 13/09 — lire_marge (spec § 4, § 7 couche 1) : ce que les sorties anticipées marge de prompt.ts faisaient — la mesure
  // d'abord (mode mesure / mixte), sinon l'estimation par les marges déclarées (par famille, puis globale), sinon
  // l'absence ; « le week-end », « le samedi » filtrent les jours et la fenêtre le dit.
  const lireMarge = outil({
    name: "lire_marge",
    description: "La marge du site sur les 30 derniers jours : la marge brute MESURÉE (montant, taux, part du CA couverte par les prix d'achat, marge par famille, lignes vendues sous leur prix d'achat) quand les prix d'achat couvrent assez de CA ; sinon une ESTIMATION par les marges déclarées par famille (CA × % déclaré, couverture dite) ou par la marge moyenne déclarée ; sinon l'absence (aucun prix d'achat, aucune marge déclarée). « jours » restreint aux jours de week-end ou à un jour de semaine.",
    inputSchema: z.object({
      jours: z.enum(JOURS as [JoursMot, ...JoursMot[]]).optional().describe("Les jours : week_end (samedi et dimanche vendus) ou un jour de semaine (lundi … dimanche). Vide = tous les jours."),
    }),
    run: (args) => timed("lire_marge", args, async () => {
      const l = await deps.runMarge((args.jours as JoursMot | undefined) ?? null, deps.today());
      const facts = l.result.found ? l.result.facts.map((f) => f.fact_fr) : [];
      const modeFr: Record<string, string> = { mesure: "marge brute mesurée", mixte: "marge brute mesurée (couverture partielle)", declaree_familles: "estimation par vos marges déclarées par famille", declaree_globale: "estimation par votre marge moyenne déclarée", aucune: "rien à lire — absence dite" };
      return { out: margeToText(l), summary: `${modeFr[l.mode]}${l.result.found ? `, ${plural(facts.length, "fait", "faits")}` : ""} — ${l.window_fr}`, blocks: l.blocks, facts };
    }),
  });

  const lireEspace = familyTool("lire_espace", "espace", "renderEspace",
    "L'espace du site : mètres linéaires de façade et surface de vente par pôle, Part de linéaire, CA, CA net HT et marge brute par mètre et par m² sur 30 jours, part de marge contre Part de linéaire. Ne rend rien sans pôle mesuré.",
    z.object({}));

  const lireFamillesFaceAuxJours = familyTool("lire_familles_face_aux_jours", "signaux", "renderSignauxFamille",
    "Ce que chaque classe de jours (pluie, chaleur, vacances scolaires, jours fériés, forte activité autour du site…) déplace sur le CA/jour de chaque famille de produits & services, vs vos jours comparables, à saison égale — avec le panier moyen et la part de la famille quand ils bougent. Filtre possible par famille.",
    z.object({ famille: z.string().optional().describe("Le nom (ou une partie du nom) d'une famille. Vide = toutes.") }),
    (r, args) => {
      if (!args?.famille || !r.found) return r;
      const want = norm(String(args.famille));
      const lines = (r.data.lines as any[] || []).filter((l) => norm(String(l.family)).includes(want));
      const facts = r.facts.filter((f) => norm(f.fact_fr).includes(want));
      if (!lines.length) return { found: false, data: { found: false, date: r.data.date }, facts: [], sources: [] };
      return { ...r, data: { ...r.data, lines, lead: facts[0]?.fact_fr ?? r.data.lead }, facts };
    });

  // ── 12/09 — lire_ventes : LE cœur du rapport de ventes (lib/rapport/ventes.ts), sur la période demandée ──
  // Au modèle les faits (les phrases que rapport.astro et le chat rendent déjà), à l'exploitant deux tableaux du
  // kit (les trois couches ; le mix par famille), au validateur les mêmes faits.
  const lireVentes = outil({
    name: "lire_ventes",
    description: "Vos ventes sur une période : chiffre d'affaires, nombre de ventes, panier moyen, ce qui a bougé par rapport à la période précédente (ventes, panier, mix par famille), meilleure et plus faible journée, profil par jour de semaine (à partir de 4 semaines), répartition par famille ; avec grain « jour », une ligne par jour de vente (jusqu'à 31 jours). Période : « 30_derniers_jours » (défaut, les 30 jours qui finissent hier), « semaine_derniere » (du lundi au dimanche précédents), « mois_dernier » (le mois civil précédent), ou deux dates du/au au format AAAA-MM-JJ.",
    inputSchema: z.object({
      periode: z.enum(["30_derniers_jours", "semaine_derniere", "mois_dernier"]).optional().describe("Le mot de la période. Ignoré si du/au sont donnés."),
      du: z.string().optional().describe("Premier jour, AAAA-MM-JJ."),
      au: z.string().optional().describe("Dernier jour, AAAA-MM-JJ (défaut : du)."),
      grain: z.enum(["jour"]).optional().describe("« jour » : une ligne par jour de vente (CA, ventes, panier moyen), jusqu'à 31 jours — pour « quel jour a porté… »."),
    }),
    run: (args) => timed("lire_ventes", args, async () => {
      const p = resolvePeriode({ periode: (args.periode as PeriodeMot | undefined) ?? null, du: args.du ?? null, au: args.au ?? null }, deps.today());
      if (!p) return { out: "Période invalide : donne deux dates AAAA-MM-JJ, la première avant la seconde.", summary: "période invalide" };
      const res = await deps.runVentes(p.start, p.end);
      const l = composeVentesFacts(res, { grain: args.grain === "jour" ? "jour" : null });
      const blocks: AnswerBlock[] = l.found ? l.blocks : [{ type: "absence", manque: `Aucune vente ${p.libelle_fr}.`, geste: null }];
      // La période lue est un fait de l'outil (« vos 30 derniers jours ») : sans elle, le « 30 » du modèle
      // serait un nombre non fondé pour la porte (mesuré sur le compte de test, 12/09).
      const periode = `Période lue : ${p.libelle_fr}.`;
      return {
        out: l.found ? `${periode}\n` + ventesToText(l) : `Aucune vente ${p.libelle_fr}.`,
        summary: l.found ? `${plural(l.facts.length, "fait", "faits")} lus, ${p.libelle_fr}` : `aucune vente ${p.libelle_fr}`,
        blocks, facts: l.found ? [periode, ...l.facts] : [],
      };
    }),
  });

  // ── 12/09 — lire_resultat : le résultat net d'un mois complet et le seuil de rentabilité du jour (lib/kpi/resultat.ts) ──
  const lireResultat = outil({
    name: "lire_resultat",
    description: "Le résultat net d'un mois complet (marge brute moins charges fixes moins masse salariale, avec la couverture des prix d'achat et la part de la masse salariale dans le CA net HT), les deux mois complets précédents, et le seuil de rentabilité du dernier jour de vente (le CA net HT que la journée doit générer, l'heure où il est atteint). Sans « mois », le dernier mois complet. Le mois en cours n'a pas de résultat net.",
    inputSchema: z.object({ mois: z.string().optional().describe("Le mois demandé, AAAA-MM. Vide = le dernier mois complet.") }),
    run: (args) => timed("lire_resultat", args, async () => {
      const mois = args.mois && /^\d{4}-\d{2}$/.test(args.mois) ? args.mois : null;
      const r = await deps.runResultat();
      const l = composeResultatFacts(r, mois);
      if (!l.found) {
        const a = l.absence === "couverture" ? ABSENCE_FR.resultat_couverture : l.absence === "charges" ? ABSENCE_FR.resultat : { manque: "Aucun mois de vente lu pour l’instant.", geste: undefined };
        return { out: a.manque, summary: "rien à lire — absence dite", blocks: [{ type: "absence", manque: a.manque, geste: a.geste ?? null }] as AnswerBlock[], facts: [] };
      }
      return { out: resultatToText(l, ABSENCE_FR.resultat.manque), summary: `${plural(l.facts.length, "fait", "faits")} lus`, blocks: l.blocks, facts: l.facts };
    }),
  });

  // ── 12/09 — lire_poles_classement : vos pôles du plus au moins performant, l'indicateur nommé (lib/dispositifs/poleClassement.ts) ──
  const lirePolesClassement = outil({
    name: "lire_poles_classement",
    description: "Vos pôles du plus au moins performant sur un indicateur : « ca », « ventes » (unités vendues), « marge_brute » (avec l'écart au résultat habituel et la part du CA ou de la marge, sur la période demandée), ou « ca_par_metre », « ca_par_m2 », « marge_par_metre » (sur les 30 jours des mesures d'espace, la période ne s'y applique pas). Les familles qu'aucun pôle ne porte apparaissent en « Non rattaché ». Période : comme lire_ventes.",
    inputSchema: z.object({
      indicateur: z.enum(["ca", "ventes", "marge_brute", "ca_par_metre", "ca_par_m2", "marge_par_metre"]).describe("L'indicateur du classement."),
      periode: z.enum(["30_derniers_jours", "semaine_derniere", "mois_dernier"]).optional().describe("Le mot de la période (défaut : 30 derniers jours). Ignoré si du/au sont donnés."),
      du: z.string().optional().describe("Premier jour, AAAA-MM-JJ."),
      au: z.string().optional().describe("Dernier jour, AAAA-MM-JJ (défaut : du)."),
    }),
    run: (args) => timed("lire_poles_classement", args, async () => {
      const p = resolvePeriode({ periode: (args.periode as PeriodeMot | undefined) ?? null, du: args.du ?? null, au: args.au ?? null }, deps.today());
      if (!p) return { out: "Période invalide : donne deux dates AAAA-MM-JJ, la première avant la seconde.", summary: "période invalide" };
      const d = await deps.runPolesClassement(p.start, p.end);
      const l = composePoleClassement(d, args.indicateur as Indicateur, `sur ${p.libelle_fr}`);
      if (!l.found) {
        const manque = POLES_ABSENCE_FR[l.absence ?? "aucun_pole"];
        const geste = l.absence === "aucune_mesure" ? ABSENCE_FR.espace.geste ?? null : l.absence === "aucune_marge" ? ABSENCE_FR.marge.geste ?? null : null;
        return { out: manque, summary: "rien à lire — absence dite", blocks: [{ type: "absence", manque, geste }] as AnswerBlock[], facts: [] };
      }
      return { out: poleClassementToText(l), summary: `${plural(l.facts.length - 1, "pôle classé", "pôles classés")} en ${l.indicateur.replace(/_/g, " ")}`, blocks: l.blocks, facts: l.facts };
    }),
  });

  // ── 12/09 — composer_rapport : LE Rapport (spec § 6) — les sections demandées, lues par les outils ci-dessus en une
  // vague, composées en un bloc `rapport` avec la provenance de chaque section ; la Synthèse est le texte du tour, posé
  // par la route après la porte. Une section inconnue est dite, jamais inventée (registre src/lib/fr/rapport.fr.ts).
  const composerRapport = outil({
    name: "composer_rapport",
    description: "Composer un Rapport : une période (comme lire_ventes) et la liste des sections demandées, en mots libres — " + SECTIONS.map((s) => `« ${s.titre} »`).join(", ") + " — ou « modele » = « ventes » (le rapport de ventes complet : ses sections dans l'ordre du rapport imprimable). Chaque section est lue par l'outil qui la porte et rendue avec sa provenance ; « indicateur » sert au classement des pôles (ca par défaut). Le texte que tu écris ensuite est la Synthèse du Rapport : trois à cinq phrases, sans titre ni liste, à partir des faits rendus, sans réénumérer ce que les tableaux montrent. Ne lis pas séparément ce que le Rapport contient déjà.",
    inputSchema: z.object({
      sections: z.string().optional().describe("Les sections demandées, en mots libres, séparées par des virgules (ex. « volume, panier, mix, pôles »). Vide si « modele » est donné."),
      modele: z.string().max(80).optional().describe("Un Modèle de rapport, par son nom : « ventes » (le rapport de ventes par défaut : Synthèse, Chiffre d'affaires, Nombre de ventes, Panier moyen, Mix, CA moyen par jour de la semaine, Marge brute, Contexte externe, Actions recommandées, Sources), ou le nom d'un Modèle que l'exploitant a enregistré (« Hebdo ventes », « Point mensuel pôles »…). La période du Modèle s'applique sauf si periode/du/au sont donnés."),
      periode: z.enum(["30_derniers_jours", "semaine_derniere", "mois_dernier"]).optional().describe("Le mot de la période (défaut : 30 derniers jours). Ignoré si du/au sont donnés."),
      du: z.string().optional().describe("Premier jour, AAAA-MM-JJ."),
      au: z.string().optional().describe("Dernier jour, AAAA-MM-JJ (défaut : du)."),
      indicateur: z.enum(["ca", "ventes", "marge_brute", "ca_par_metre", "ca_par_m2", "marge_par_metre"]).optional().describe("L'indicateur du classement des pôles (défaut : ca)."),
      titre: z.string().max(120).optional().describe("Le titre du Rapport, si l'exploitant l'a donné."),
    }),
    run: (args) => timed("composer_rapport", args, async () => {
      // 12/09 (spec § 6.3) : « ventes » = les sections du rapport de ventes d'aujourd'hui, dans son ordre — le premier Modèle
      // par défaut, composé par les outils ; les sections demandées en plus s'ajoutent à la suite.
      const demande = resolveSections(args.sections ?? "");
      // Le Modèle : « ventes » (par défaut, MODELE_VENTES) ou un Modèle enregistré du site, par son nom ; sa période et son
      // indicateur s'appliquent sauf demande explicite ; les sections demandées en plus s'ajoutent à la suite.
      let modeleCles: SectionCle[] = []; let modeleNom: string | null = null; let modelePeriode: PeriodeMot | null = null; let modeleIndicateur: Indicateur | null = null;
      const nomModele = (args.modele ?? "").trim();
      if (nomModele) {
        if (/^ventes?$/i.test(nomModele.normalize("NFD").replace(/[̀-ͯ]/g, "")) || /rapport de ventes/i.test(nomModele)) { modeleCles = [...MODELE_VENTES]; modeleNom = "Rapport de ventes"; }
        else {
          const t = findTemplateByName(await deps.listModeles(), nomModele);
          if (!t) return { out: `Aucun Modèle de rapport nommé « ${nomModele} » sur ce site. Modèles disponibles : Rapport de ventes${(await deps.listModeles()).map((x) => `, ${x.nom}`).join("")}.`, summary: `modèle « ${nomModele} » inconnu` };
          modeleCles = t.sections.map((s) => s.cle); modeleNom = t.nom; modelePeriode = t.periode_relative; modeleIndicateur = (t.indicateur as Indicateur | null) ?? null;
        }
      }
      const cles = modeleCles.length ? [...modeleCles, ...demande.cles.filter((c) => !modeleCles.includes(c))] : demande.cles;
      const inconnues = demande.inconnues;
      if (!cles.length && !inconnues.length) return { out: "Aucune section demandée : nomme des sections (« volume, panier, mix, pôles ») ou un Modèle (« ventes », ou le nom d'un Modèle enregistré).", summary: "aucune section demandée" };
      const indicateur = (args.indicateur as Indicateur | undefined) ?? modeleIndicateur ?? "ca";
      const p = resolvePeriode({ periode: (args.periode as PeriodeMot | undefined) ?? modelePeriode ?? null, du: args.du ?? null, au: args.au ?? null }, deps.today());
      if (!p) return { out: "Période invalide : donne deux dates AAAA-MM-JJ, la première avant la seconde.", summary: "période invalide" };
      const besoin = (k: string[]) => cles.some((c) => k.includes(c));
      const [ventes, marge, resultat, espace, poles, signaux] = await Promise.all([
        besoin(SECTIONS_VENTES) ? deps.runVentes(p.start, p.end).then(composeVentesFacts) : null,
        besoin(["marge_brute"]) ? deps.runFamily("marge", deps.today()) : null,
        besoin(["resultat_net", "seuil_rentabilite"]) ? deps.runResultat().then((r) => composeResultatFacts(r)) : null,
        besoin(["espace"]) ? deps.runFamily("espace", deps.today()) : null,
        besoin(["poles"]) ? deps.runPolesClassement(p.start, p.end).then((d) => composePoleClassement(d, indicateur, `sur ${p.libelle_fr}`)) : null,
        besoin(["contexte"]) ? deps.runFamily("signaux", deps.today()) : null,
      ]);
      const r = composeRapport({
        cles, non_reconnu: inconnues,
        periode: { du: p.start, au: p.end, relative: args.du || args.au ? null : (args.periode ?? modelePeriode ?? "30_derniers_jours"), libelle_fr: p.libelle_fr },
        indicateur, titre: args.titre ?? (modeleNom ? `${modeleNom} — ${p.libelle_fr}` : null), calcule_le: new Date().toISOString(),
        lectures: { ventes, marge, resultat, espace, poles, signaux },
      });
      const n = r.block.sections.length;
      return { out: rapportToText(r), summary: `${plural(n, "section composée", "sections composées")}, ${p.libelle_fr}${inconnues.length ? ` ; ${plural(inconnues.length, "demande non reconnue", "demandes non reconnues")}` : ""}`, blocks: [r.block], facts: r.facts };
    }),
  });

  // ── 12/09 — proposer_operation : LA Proposition d'opération (spec § 4-5, incrément 6 ; lexique l. 127). Aucune écriture :
  // le corps prêt pour le formulaire existant, une carte avec « Préparer l'opération → ». Le « pourquoi » n'est fait que de
  // faits lus dans ce tour (lib/explorer/proposition.ts, pur) ; les familles sont celles du site (lire_familles).
  const proposerOperation = outil({
    name: "proposer_operation",
    description: "Préparer une Proposition d'opération à partir de faits LUS dans ce tour (appelle d'abord les lecteurs). Rien n'est créé : l'exploitant ouvre le formulaire pré-rempli et décide. Les phrases de « pourquoi » sont reprises telles quelles des outils ; une phrase dont un chiffre ne vient d'aucun outil est écartée. Types d'opération : " + EVENT_TYPES_ALL.map((t) => `${t.value} (${t.label_fr})`).join(", ") + ".",
    inputSchema: z.object({
      titre: z.string().max(120).describe("Le nom de l'opération, en français, sans mot de commande ni de stock."),
      dispositif: z.string().max(240).describe("Ce que l'exploitant va faire ce jour-là, en une phrase (le dispositif de vente, la mise en avant, l'animation)."),
      type: z.string().max(60).optional().describe("Le type d'opération (valeur de la liste ; défaut : autre)."),
      familles: z.array(z.string()).optional().describe("Les familles de produits & services concernées, par leur nom exact (lire_familles)."),
      objectif: z.enum(["revenue_residual", "family_revenue", "tickets", "basket"]).optional().describe("Le KPI jugé : " + Object.entries(OBJECTIF_FR).map(([k, v]) => `${k} = ${v}`).join(" ; ") + ". Défaut : family_revenue si des familles sont données, sinon revenue_residual."),
      cible: z.number().optional().describe("La cible : en € (CA des familles visé sur la journée) pour family_revenue, en % au-dessus du résultat habituel sinon (défaut 15)."),
      dates: z.array(z.string()).min(1).max(7).describe("Les dates candidates, AAAA-MM-JJ, à venir (7 au plus)."),
      pourquoi: z.array(z.string()).min(1).describe("Les faits qui motivent la proposition : les phrases rendues par tes outils dans ce tour, reprises telles quelles."),
    }),
    run: (args) => timed("proposer_operation", args, async () => {
      const familles_site = (await deps.readFamilies()).map((f) => f.category);
      const r = composerProposition(args, { location_id: deps.location_id, today: deps.today(), familles_site, types: EVENT_TYPES_ALL, faits_du_tour: deps.faitsDuTour() });
      if ("erreur" in r) return { out: r.erreur, summary: "proposition refusée : " + r.erreur.slice(0, 80) };
      return { out: r.texte, summary: `Proposition d'opération « ${r.block.titre} » ${r.block.dates_fr}${r.non_retenu.length ? ` ; ${plural(r.non_retenu.length, "phrase écartée", "phrases écartées")}` : ""}`, blocks: [r.block], facts: r.facts };
    }),
  });

  return [lirePoles, lireFamilles, lirePhotos, lireMemoire, ecrireMemoire, lireMarge, lireEspace, lireFamillesFaceAuxJours, lireVentes, lireResultat, lirePolesClassement, composerRapport, proposerOperation];
}
