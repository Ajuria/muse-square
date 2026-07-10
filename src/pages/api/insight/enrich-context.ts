// src/pages/api/insight/enrich-context.ts
// Environment crawl for the movement-card dossier ("Consulter la source"): given a
// venue + date + the day's aggregate conditions, use Claude + web_search to surface
// the concrete real-world context (local events, commercial period, weather, news)
// that could explain the signal. Mirrors enrich-event's Claude+web_search+cache
// pattern; cached in analytics.context_enrichment keyed by (location_id, date), 30-day TTL.
import type { APIRoute } from "astro";
import { modelFor } from "../../../lib/ai/models";
import { makeBQClient } from "../../../lib/bq";
import { requireLocationOwnership } from "../../../lib/requireLocationOwnership";
import { randomUUID } from "crypto";

export const prerender = false;
const BQ_PROJECT = "muse-square-open-data";
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const POST: APIRoute = async ({ request, locals }) => {
  const body = await request.json().catch(() => null);
  const {
    location_id, date, city_name, driver, is_vacation, is_holiday,
    commercial_event, events_5km, business_short_description,
  } = body ?? {};

  if (!location_id || !ISO_DATE_RE.test(String(date || ""))) {
    return new Response(JSON.stringify({ ok: false, error: "location_id + date (YYYY-MM-DD) requis" }), { status: 400, headers: { "content-type": "application/json" } });
  }
  try { requireLocationOwnership(locals, String(location_id)); }
  catch { return new Response(JSON.stringify({ ok: false, error: "FORBIDDEN" }), { status: 403, headers: { "content-type": "application/json" } }); }

  const bq = makeBQClient(process.env.BQ_PROJECT_ID || BQ_PROJECT);

  // 1. Cache read
  try {
    const [rows] = await bq.query({
      query: `
        SELECT takeaway, key_factors, sources
        FROM \`${BQ_PROJECT}.analytics.context_enrichment\`
        WHERE location_id = @location_id AND date = DATE(@date)
          AND enriched_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)
        ORDER BY enriched_at DESC LIMIT 1
      `,
      params: { location_id: String(location_id), date: String(date) },
      types: { location_id: "STRING", date: "STRING" },
      location: "EU",
    });
    if (rows?.length) {
      const c: any = rows[0];
      return json200({
        takeaway: c.takeaway ?? null,
        key_factors: safeArr(c.key_factors),
        sources: safeArr(c.sources),
        cached: true,
      });
    }
  } catch (e) { console.warn("[enrich-context] cache read failed:", e); }

  // 2. Claude + web search
  const system = `Tu es un analyste local qui explique le contexte réel d'une journée pour un commerce/lieu en France. Tu utilises le web pour trouver ce qui se passait autour du lieu à la date donnée (événements, festivals, marchés, matchs, périodes commerciales/soldes, météo marquante, actualités locales) susceptible d'expliquer une affluence ou des ventes inhabituelles. Tu réponds UNIQUEMENT avec du JSON valide, sans texte ni backticks. Si tu ne trouves rien, mets des valeurs nulles/vides. Ne fabrique jamais d'événement.`;

  const userPayload = {
    lieu: { ville: city_name ?? null, activite: business_short_description ?? null },
    jour: {
      date,
      facteur_dominant: driver ?? null,
      vacances_scolaires: is_vacation ?? null,
      jour_ferie: is_holiday ?? null,
      periode_commerciale: commercial_event ?? null,
      evenements_a_5km: events_5km ?? null,
    },
    expected_output: {
      takeaway: "1 à 2 phrases, point de vue de l'opérateur : ce qui, ce jour-là autour du lieu, peut expliquer le signal. Concret et sourcé. null si rien de fiable.",
      key_factors: "liste de 1 à 3 facteurs courts et concrets (événement nommé, période, météo), ou []",
      sources: "liste d'URLs sources ou []",
    },
  };

  let parsed: any = {};
  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "web-search-2025-03-05",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: modelFor("enrichment"),
        max_tokens: 2000,
        tools: [{ type: "web_search_20250305", name: "web_search" }],
        system,
        messages: [{ role: "user", content: JSON.stringify(userPayload) }],
      }),
    });
    const aiData = await resp.json();
    const textBlock = aiData.content?.filter((b: any) => b.type === "text").pop();
    const raw = textBlock?.text ?? "";
    const m = raw.match(/(\{[\s\S]*\})/);
    parsed = JSON.parse(m ? m[1] : raw.replace(/```json|```/g, "").trim());
  } catch (e) {
    console.warn("[enrich-context] crawl failed:", e);
    parsed = {};
  }

  const takeaway = typeof parsed.takeaway === "string" ? parsed.takeaway.replace(/<cite[^>]*>|<\/cite>/g, "").trim() || null : null;
  const key_factors = Array.isArray(parsed.key_factors) ? parsed.key_factors.map((x: any) => String(x)).slice(0, 3) : [];
  const sources = Array.isArray(parsed.sources) ? parsed.sources.map((x: any) => String(x)).slice(0, 4) : [];

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
    }]).catch((err: any) => console.warn("[enrich-context] cache write failed:", err));
  }

  return json200({ takeaway, key_factors, sources, cached: false });
};

function json200(data: any) {
  return new Response(JSON.stringify({ ok: true, data }), { status: 200, headers: { "content-type": "application/json" } });
}
function safeArr(s: any): string[] {
  try { const v = JSON.parse(String(s || "[]")); return Array.isArray(v) ? v : []; } catch { return []; }
}
