// src/pages/api/competitive/discover-competitors.ts
//
// DÉCOUVERTE de concurrents — « qui sont les concurrents de CE site ? » (23/08, point 1 du
// chantier « wow »). Différent de search-competitor, qui enrichit un concurrent dont on CONNAÎT
// le nom : ici l'entrée est le site lui-même (adresse, métier, nom), la sortie est la même forme
// de candidats que search-competitor, pour que la chaîne existante (renderCompetitorCards →
// add-competitor) les consomme sans rien changer.
//
// Deux garde-fous que search-competitor n'a pas, parce qu'il n'en a pas besoin :
//   - les concurrents DÉJÀ SUIVIS par ce site sont exclus (competitor_tracking × annuaire, location_id)
//   - le site LUI-MÊME est exclu (un agent web trouve volontiers l'entreprise qu'on lui décrit)
//
// Mesuré à la construction : 18 sites actifs avec adresse + métier + géo ; 10 ne suivent aucun
// concurrent. L'agent existait (search-competitor) ; rien ne le faisait tourner sans un nom.
import "dotenv/config";
import type { APIRoute } from "astro";
import { VALID_INDUSTRY, VALID_AUDIENCE, VALID_CONFIDENCE, BUCKET_MAP, classifySource, JUNK_URL_PATTERNS } from "../../../lib/competitive/constants";
import { modelFor } from "../../../lib/ai/models";
import { callClaudeWithWebSearch } from "../../../lib/ai/runtime/claude";
import { makeBQClient } from "../../../lib/bq";
import { requireLocationOwnership } from "../../../lib/requireLocationOwnership";

export const prerender = false;

const PROJECT = (process.env.BQ_PROJECT_ID || "muse-square-open-data").trim();

const SYSTEM_PROMPT = `Tu es un agent de veille concurrentielle pour Muse Square, une plateforme pour professionnels de l'événementiel, du commerce et de la culture en France.

Ta mission : à partir de la description d'un établissement (nom, adresse, métier), identifier ses CONCURRENTS DIRECTS — des organisations du même métier, qui s'adressent au même public, dans le même périmètre géographique.

RÈGLES ABSOLUES :
1. Un concurrent = même métier ET même zone de chalandise. Un musée à Nîmes n'est pas le concurrent d'un bar à Paris.
2. Ne retourne JAMAIS l'établissement décrit lui-même, ni une de ses enseignes.
3. Extrais UNIQUEMENT ce qui est explicitement écrit sur les pages trouvées. Jamais d'inférence, jamais d'invention.
4. Si un champ est absent ou ambigu → null. Jamais de valeur inventée.
5. Retourne 3 à 5 résultats, triés par proximité concurrentielle décroissante (même métier + même quartier d'abord).
6. Pour chaque résultat, source_sentence = la phrase de la page qui prouve que c'est bien un concurrent (même métier, même zone).
7. Retourne UNIQUEMENT du JSON valide. Aucun texte avant ou après.

SCHEMA DE SORTIE (tableau de 3 à 5 résultats) :
[
  {
    "competitor_name": string,
    "address": string | null,
    "city": string | null,
    "industry_code": string | null,
    "primary_audience": string | null,
    "secondary_audience": string | null,
    "description": string | null,
    "source_url": string | null,
    "source_sentence": string | null,
    "confidence": "high" | "medium" | "low"
  }
]`;

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const body = await request.json().catch(() => null);
    const location_id = String(body?.location_id || "").trim();
    if (!location_id) {
      return new Response(JSON.stringify({ ok: false, error: "Missing location_id" }), { status: 400, headers: { "content-type": "application/json" } });
    }
    requireLocationOwnership(locals, location_id);

    const anthropicKey = process.env.ANTHROPIC_API_KEY || "";
    if (!anthropicKey) {
      return new Response(JSON.stringify({ ok: false, error: "Missing ANTHROPIC_API_KEY" }), { status: 500, headers: { "content-type": "application/json" } });
    }

    const bq = makeBQClient(PROJECT);
    // Le profil du site (ce qu'on décrit à l'agent) et ses suivis actuels (ce qu'on exclut) —
    // deux requêtes indépendantes, amorcées ensemble (règle perf CLAUDE.md).
    const [profRows, watchedRows] = await Promise.all([
      bq.query({
        // Nom + adresse vivent sur le profil raw ; métier + description sur la vue sémantique
        // (colonnes vérifiées au catalogue, pas devinées — leçon du 23/08).
        query: `SELECT p.company_name, p.company_address, v.site_name, v.business_short_description, v.client_industry_code
                FROM \`${PROJECT}.raw.insight_event_user_location_profile\` p
                LEFT JOIN \`${PROJECT}.semantic.vw_insight_event_ai_location_context\` v USING (location_id)
                WHERE p.location_id = @location_id LIMIT 1`,
        params: { location_id }, location: "EU",
      }).then((r: any) => (Array.isArray(r?.[0]) ? r[0] : [])),
      bq.query({
        // competitor_tracking × annuaire : la table des fiches Piloter et des crawls.
        // watched_competitors diverge (29 communs sur 32/34) — sur f10c3e58 elle ignorait
        // GL Events et quai Branly, que l'agent aurait pu re-proposer.
        query: `SELECT DISTINCT LOWER(TRIM(cd.competitor_name)) AS n
                FROM \`${PROJECT}.raw.competitor_tracking\` ct
                JOIN \`${PROJECT}.raw.competitor_directory\` cd ON cd.competitor_id = ct.competitor_id AND cd.deleted_at IS NULL
                WHERE ct.location_id = @location_id AND ct.deleted_at IS NULL`,
        params: { location_id }, location: "EU",
      }).then((r: any) => (Array.isArray(r?.[0]) ? r[0] : [])),
    ]);
    const prof: any = profRows[0];
    if (!prof || !prof.company_address) {
      return new Response(JSON.stringify({ ok: false, error: "Profil sans adresse — la découverte a besoin d'une adresse et d'un métier." }), { status: 422, headers: { "content-type": "application/json" } });
    }
    const alreadyWatched = new Set<string>((watchedRows as any[]).map((r) => String(r.n)));
    const selfName = String(prof.company_name || "").toLowerCase().trim();

    const userPrompt = `Identifie les concurrents directs de cet établissement :
Nom : ${prof.company_name}${prof.site_name && prof.site_name !== prof.company_name ? ` (${prof.site_name})` : ""}
Adresse : ${prof.company_address}
Métier : ${prof.client_industry_code || "non renseigné"}${prof.business_short_description ? `\nActivité : ${String(prof.business_short_description).slice(0, 300)}` : ""}
${alreadyWatched.size ? `\nDéjà suivis (à NE PAS retourner) : ${[...alreadyWatched].join(", ")}` : ""}

Recherche sur le web des organisations du même métier dans la même zone (même ville, même quartier d'abord). Retourne 3 à 5 résultats.`;

    const { ok: aiOk, text: raw, errors: aiErrors } = await callClaudeWithWebSearch({
      system: SYSTEM_PROMPT,
      userText: userPrompt,
      model: modelFor("enrichment"),
      maxTokens: 4096,
    });
    if (!aiOk) throw new Error(`Claude API error: ${aiErrors.join("; ").slice(0, 200)}`);

    let candidates: any[] = [];
    try {
      const m = raw.match(/```json\s*([\s\S]*?)```/) || raw.match(/```\s*([\s\S]*?)```/) || raw.match(/(\[[\s\S]*\])/);
      const parsed = JSON.parse((m ? (m[1] || m[0]) : raw).trim());
      candidates = Array.isArray(parsed) ? parsed : [parsed];
    } catch { candidates = []; }

    // Même sanitisation que search-competitor : la chaîne aval (renderCompetitorCards,
    // add-competitor) lit exactement cette forme.
    const sanitized = candidates.slice(0, 5).map((c: any) => {
      const ic = VALID_INDUSTRY.has(c.industry_code) ? c.industry_code : null;
      const url = typeof c.source_url === "string" ? c.source_url.trim() : null;
      return {
        competitor_name:    typeof c.competitor_name === "string" ? c.competitor_name.trim() : null,
        address:            typeof c.address === "string" ? c.address.trim() : null,
        city:               typeof c.city === "string" ? c.city.trim() : null,
        industry_code:      ic,
        industry_bucket:    ic ? (BUCKET_MAP[ic] ?? null) : null,
        primary_audience:   VALID_AUDIENCE.has(c.primary_audience) ? c.primary_audience : null,
        secondary_audience: VALID_AUDIENCE.has(c.secondary_audience) ? c.secondary_audience : null,
        description:        typeof c.description === "string" ? c.description.trim().slice(0, 500) : null,
        source_url:         url,
        source_type:        classifySource(url),
        source_sentence:    typeof c.source_sentence === "string" ? c.source_sentence.trim().slice(0, 300) : null,
        confidence:         VALID_CONFIDENCE.has(c.confidence) ? c.confidence : "low",
        confidence_score:   c.confidence === "high" ? 0.9 : c.confidence === "medium" ? 0.7 : 0.5,
      };
    });
    const filtered = sanitized.filter((c) => {
      if (!c.competitor_name) return false;
      const n = c.competitor_name.toLowerCase();
      if (alreadyWatched.has(n)) return false;                          // déjà suivi
      if (selfName && (n === selfName || n.includes(selfName) || selfName.includes(n))) return false; // lui-même
      if (c.confidence_score < 0.5) return false;
      if (c.source_url && JUNK_URL_PATTERNS.some((p) => p.test(c.source_url!))) return false;
      return true;
    });

    return new Response(JSON.stringify({
      ok: true,
      candidates: filtered,
      already_watched: alreadyWatched.size,
      excluded_self: sanitized.length - filtered.length,
    }), { status: 200, headers: { "content-type": "application/json" } });
  } catch (err: any) {
    const status = err?.status === 403 ? 403 : 500;
    console.error("[discover-competitors]", err?.message);
    return new Response(JSON.stringify({ ok: false, error: err?.message }), { status, headers: { "content-type": "application/json" } });
  }
};
