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
