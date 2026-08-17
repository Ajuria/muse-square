// ÉTAPE 5 (08/08, GO owner) — LE cœur du crawl « contexte réel d'une journée », extrait de
// api/insight/enrich-context.ts pour être partagé : (1) le dossier de carte (endpoint, wrapper
// inchangé), (2) le chat Explorer (sections « Web — non vérifié » avec URLs). Doctrine cercle 2 :
// on vérifie UNE journée/une affirmation à la demande — jamais un flux surveillé. Le web ne porte
// JAMAIS de tier : aucune formulation causale ne peut s'y adosser ; les URLs rendent chaque
// affirmation cassable en un clic (même doctrine que « chaque chiffre porte sa fenêtre »).
// Cache 30 j dans analytics.context_enrichment (append-only, lecture latest) ; <cite> strippé.

import { randomUUID } from "node:crypto";
import { callClaudeWithWebSearch } from "./runtime/claude";
import { modelFor } from "./models";

const BQ_PROJECT = "muse-square-open-data";
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CITE_RE = /<\/?cite[^>]*>/gi;
const stripCite = (s: any): string => String(s ?? "").replace(CITE_RE, "").replace(/\s{2,}/g, " ").trim();
const safeArr = (v: any): string[] => {
  if (Array.isArray(v)) return v.map(String);
  try { const p = JSON.parse(String(v ?? "[]")); return Array.isArray(p) ? p.map(String) : []; } catch { return []; }
};

export interface WebDayContext {
  takeaway: string | null;
  key_factors: string[];
  sources: string[];       // URLs — la seule matière du produit qui en porte
  cached: boolean;
}

export interface WebDayContextInput {
  location_id: string; date: string;
  city_name?: string | null; business_short_description?: string | null;
  driver?: string | null; is_vacation?: boolean | null; is_holiday?: boolean | null;
  commercial_event?: string | null; events_5km?: number | null;
}

// VOIX (exigence owner 08/08 : stratégique, factuel, pro — ni 101 ni robotique) : entités NOMMÉES,
// chiffres et dates tirés des pages ; zéro conseil générique, zéro remplissage ; si rien de fiable,
// des valeurs vides — le silence est une réponse.
const SYSTEM_FR = `Tu es un analyste local qui explique le contexte réel d'une journée pour un commerce/lieu en France. Tu utilises le web pour trouver ce qui se passait autour du lieu à la date donnée (événements, festivals, marchés, matchs, périodes commerciales/soldes, météo marquante, actualités locales) susceptible d'expliquer une affluence ou des ventes inhabituelles. EXIGENCES : chaque facteur porte un NOM PROPRE et, quand la page les donne, un chiffre, une heure ou une distance — jamais de généralité (« il y avait des événements ») ni de conseil. Registre professionnel, phrases nominales courtes. Tu réponds UNIQUEMENT avec du JSON valide, sans texte ni backticks. Si tu ne trouves rien de fiable, mets des valeurs nulles/vides. Ne fabrique jamais d'événement.`;

export async function getWebDayContext(bq: any, input: WebDayContextInput): Promise<WebDayContext | null> {
  const { location_id, date } = input;
  if (!location_id || !ISO_DATE_RE.test(String(date || ""))) return null;

  // 1. Cache read (30 j)
  try {
    const [rows] = await bq.query({
      query: `SELECT takeaway, key_factors, sources
              FROM \`${BQ_PROJECT}.analytics.context_enrichment\`
              WHERE location_id = @location_id AND date = DATE(@date)
                AND enriched_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)
              ORDER BY enriched_at DESC LIMIT 1`,
      params: { location_id: String(location_id), date: String(date) },
      types: { location_id: "STRING", date: "STRING" }, location: "EU",
    });
    if (rows?.length) {
      const c: any = rows[0];
      return {
        takeaway: c.takeaway ? stripCite(c.takeaway) || null : null,
        // Les lignes déjà en cache peuvent porter la coercition ratée d'un run antérieur — filtrée
        // à la lecture (le buffer streaming interdit le DELETE immédiat).
        key_factors: safeArr(c.key_factors).map(stripCite).filter((f) => f && f !== "[object Object]"),
        sources: safeArr(c.sources).map(stripCite).filter(Boolean),
        cached: true,
      };
    }
  } catch (e) { console.warn("[webContext] cache read failed:", e); }

  // 2. Claude + web_search
  const userPayload = {
    lieu: { ville: input.city_name ?? null, activite: input.business_short_description ?? null },
    jour: {
      date,
      facteur_dominant: input.driver ?? null,
      vacances_scolaires: input.is_vacation ?? null,
      jour_ferie: input.is_holiday ?? null,
      periode_commerciale: input.commercial_event ?? null,
      evenements_a_5km: input.events_5km ?? null,
    },
    expected_output: {
      takeaway: "1 à 2 phrases, point de vue de l'opérateur : ce qui, ce jour-là autour du lieu, peut expliquer le signal. Concret, nommé, sourcé. null si rien de fiable.",
      key_factors: "liste de 1 à 3 CHAÎNES de caractères (jamais d'objets) : facteurs courts et concrets (événement NOMMÉ + chiffre/heure/distance quand la page les donne), ou []",
      sources: "liste d'URLs sources ou []",
    },
  };
  let parsed: any = {};
  try {
    const { text: raw } = await callClaudeWithWebSearch({
      system: SYSTEM_FR,
      userText: JSON.stringify(userPayload),
      model: modelFor("enrichment"),
      maxTokens: 4096,
    });
    const m = raw.match(/(\{[\s\S]*\})/);
    parsed = JSON.parse(m ? m[1] : raw.replace(/```json|```/g, "").trim());
  } catch (e) {
    console.warn("[webContext] crawl failed:", e);
    return null;
  }
  const takeaway = typeof parsed.takeaway === "string" ? stripCite(parsed.takeaway) || null : null;
  // Le modèle renvoie parfois des OBJETS facteurs malgré la consigne (mesuré : « [object Object] »
  // rendu) — coercition : les valeurs chaînes de l'objet, jointes.
  const coerce = (f: any): string => typeof f === "string" ? f
    : (f && typeof f === "object" ? Object.values(f).filter((v) => typeof v === "string").join(" — ") : String(f ?? ""));
  const key_factors = Array.isArray(parsed.key_factors) ? parsed.key_factors.map((f: any) => stripCite(coerce(f))).filter(Boolean).slice(0, 3) : [];
  const sources = Array.isArray(parsed.sources) ? parsed.sources.map(stripCite).filter((s: string) => /^https:\/\//.test(s)).slice(0, 4) : [];

  // 3. Cache write (fire and forget)
  if (takeaway || key_factors.length) {
    bq.dataset("analytics").table("context_enrichment").insert([{
      enrichment_id: randomUUID(),
      location_id: String(location_id),
      date: String(date),
      takeaway,
      key_factors: JSON.stringify(key_factors),
      sources: JSON.stringify(sources),
      enriched_at: new Date().toISOString(),
    }]).catch((err: any) => console.warn("[webContext] cache write failed:", err));
  }
  return { takeaway, key_factors, sources, cached: false };
}

// ── ACTUALITÉ COMMERCIALE d'un suivi (chantier fiche enrichie, validé owner 17/08) ────────────
// Même doctrine que le contexte de jour : le web ne porte JAMAIS de tier, chaque affirmation
// garde son URL. Cache 7 j SUR LA FICHE annuaire (raw.competitor_directory.commercial_news_json,
// même motif que auto_enriched_description / competitive_analysis_json — pas de table fourche).
// Rafraîchi par le balayage nocturne de snapshot-competitors (cap 2 suivis/nuit) — jamais un
// crawl à l'ouverture d'une page.

export interface CompetitorCommercialNews {
  lead: string | null;
  mises_en_avant: Array<{ titre: string; detail: string; dates: string | null }>;
  autres_offres: string | null;
  sources: string[];
  read_at: string | null;
  cached: boolean;
}

const NEWS_SYSTEM_FR = `Tu es un analyste concurrentiel pour un lieu culturel/commerce en France. On te donne le NOM d'un concurrent suivi et SES pages officielles (programme, tarifs). Tu lis le web (en priorité ces pages) pour dire son ACTUALITÉ COMMERCIALE du moment : expositions ou événements phares (avec dates), offres ou tarifs poussés (avec prix), nouveautés. EXIGENCES : chaque élément porte un NOM PROPRE et, quand la page les donne, une date, un prix ou un chiffre — jamais de généralité ni de conseil. Registre professionnel, phrases nominales courtes, en français. Tu réponds UNIQUEMENT avec du JSON valide, sans texte ni backticks : {"lead": string|null, "mises_en_avant": [{"titre": string, "detail": string, "dates": string|null}], "autres_offres": string|null, "sources": [string]}. "lead" = UNE phrase : ce que sa communication pousse d'abord. 2 à 4 mises en avant maximum. Si tu ne trouves rien de fiable, mets des valeurs nulles/vides. Ne fabrique jamais.`;

export async function getCompetitorCommercialNews(bq: any, args: {
  competitor_id: string; competitor_name: string; urls: string[]; force?: boolean;
}): Promise<CompetitorCommercialNews | null> {
  const flatv = (v: any): any => (v && typeof v === "object" && "value" in v ? v.value : v);
  // 1. Cache sur la fiche (7 j).
  try {
    const [[row]] = await bq.query({
      query: `SELECT commercial_news_json, CAST(commercial_news_at AS STRING) AS at,
                     TIMESTAMP_DIFF(CURRENT_TIMESTAMP(), commercial_news_at, DAY) AS age_j
              FROM \`${BQ_PROJECT}.raw.competitor_directory\`
              WHERE competitor_id = @id AND deleted_at IS NULL LIMIT 1`,
      params: { id: args.competitor_id }, location: "EU",
    });
    const ageJ = row && flatv(row.age_j) != null ? Number(flatv(row.age_j)) : null;
    if (!args.force && row && flatv(row.commercial_news_json) && ageJ != null && ageJ < 7) {
      const cachedParsed = JSON.parse(String(flatv(row.commercial_news_json)));
      return { ...cachedParsed, read_at: String(flatv(row.at) || ""), cached: true };
    }
  } catch (e) {
    console.warn("[commercialNews] cache read failed:", e);
  }
  // 2. Lecture web (même runtime que le contexte de jour).
  let parsed: any = {};
  try {
    const { text: raw } = await callClaudeWithWebSearch({
      system: NEWS_SYSTEM_FR,
      userText: `Concurrent suivi : ${args.competitor_name}. Ses pages officielles : ${args.urls.filter(Boolean).join(" · ")}. Quelle est son actualité commerciale en ce moment ?`,
      model: modelFor("enrichment"),
      maxUses: 5,
      timeoutMs: 120_000, // 30 s par défaut — trop court pour plusieurs recherches
    });
    const m = raw.match(/(\{[\s\S]*\})/);
    parsed = JSON.parse(m ? m[1] : raw.replace(/```json|```/g, "").trim());
  } catch (e) {
    console.warn("[commercialNews] crawl failed:", e);
    return null;
  }
  const news: CompetitorCommercialNews = {
    lead: typeof parsed.lead === "string" ? stripCite(parsed.lead) || null : null,
    mises_en_avant: (Array.isArray(parsed.mises_en_avant) ? parsed.mises_en_avant : [])
      .map((x: any) => ({ titre: stripCite(x?.titre), detail: stripCite(x?.detail), dates: x?.dates ? stripCite(x.dates) : null }))
      .filter((x: any) => x.titre).slice(0, 4),
    autres_offres: typeof parsed.autres_offres === "string" ? stripCite(parsed.autres_offres) || null : null,
    sources: (Array.isArray(parsed.sources) ? parsed.sources : []).map(stripCite).filter((s: string) => /^https:\/\//.test(s)).slice(0, 4),
    read_at: new Date().toISOString(),
    cached: false,
  };
  // 3. Écriture cache sur la fiche (colonnes posées par migration 17/08 + ALTER du balayage).
  if (news.lead || news.mises_en_avant.length) {
    const { read_at, cached, ...payload } = news;
    bq.query({
      query: `UPDATE \`${BQ_PROJECT}.raw.competitor_directory\`
              SET commercial_news_json = @j, commercial_news_at = CURRENT_TIMESTAMP()
              WHERE competitor_id = @id`,
      params: { j: JSON.stringify(payload), id: args.competitor_id }, location: "EU",
    }).catch((err: any) => console.warn("[commercialNews] cache write failed:", err?.message));
  }
  return news;
}
