// src/pages/api/insight/competitor.ts
// Card-SPECIFIC drill-down for the COMPETITOR family — "what are my competitors DOING that impacts me,
// and what do I do about it". TRUTH-FIRST: if the followed entities have low audience overlap, say so
// plainly (État A) — never fabricate a rivalry or generic "differentiate" advice.
//   - État A (honest default): followed competitors all below the real-competitor bar (overlap < 40%)
//     -> state the reality + one action (follow real competitors). No fake moves.
//   - État B: real competitors (overlap >= 40%) with recent BUSINESS moves (price/offering changes from
//     mart-adjacent int_competitor_offering_changes) -> each move + a specific, rule-based response.
// Event moves (alerts change_category='competition') are DELIBERATELY excluded — they belong to the
// Events card, not here.
import type { APIRoute } from "astro";
import { makeBQClient } from "../../../lib/bq";
import { requireLocationOwnership } from "../../../lib/requireLocationOwnership";

const PROJECT = "muse-square-open-data";
const REAL_BAR = 40;   // % audience overlap at/above which a followed entity is a real competitor
const MAX_MOVES = 8;
const MOVE_WINDOW_DAYS = 60;

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}
function requireString(v: string | null, name: string): string {
  const s = String(v || "").trim();
  if (!s) throw new Error(`Missing required query param: ${name}`);
  return s;
}
function normalizeYmd(v: string): string {
  const m = String(v || "").trim().match(/^(\d{4}-\d{2}-\d{2})$/);
  if (!m) throw new Error(`Invalid date format: ${v}`);
  return m[1];
}
const num = (v: any): number | null => (v == null ? null : Number(v && typeof v === "object" && "value" in v ? v.value : v));
const str = (v: any): string | null => { const s = v == null ? "" : String(v).trim(); return s || null; };
const ymd = (v: any): string | null => (v == null ? null : (typeof v === "object" && "value" in v ? String(v.value) : String(v)));

// Rule-based response per move — SPECIFIC to what the competitor did (never "differentiate").
function moveResponse(pct: number | null): string {
  if (pct != null && pct < 0) return "Ne suivez pas la remise : défendez votre valeur, ou proposez un format différenciant.";
  if (pct != null && pct > 0) return "Hausse chez lui — mettez en avant votre rapport qualité-prix auprès de la même cible.";
  return "Analysez son changement d'offre et positionnez la vôtre en complément ou en rupture.";
}
function moveWhat(item: string | null, category: string | null, pct: number | null): string {
  const it = item || category || "une prestation";
  if (pct != null) return `${it} : tarif ${pct < 0 ? "baissé" : "relevé"} de ${Math.abs(Math.round(pct))} %`;
  return `Changement d'offre : ${it}`;
}
// Actionable overlap+differentiation (not a % dump): where you compete, your edge, their strength.
const AUD_FR: Record<string, string> = { local: "clientèle locale", professionals: "professionnels", tourists: "touristes", students: "étudiants", mixed: "clientèle mixte" };
const TYPE_FR: Record<string, string> = { corporate: "événements corporate", product_launch: "lancements produit", store_opening: "ouvertures", exhibition: "expositions", conference: "colloques" };
function buildPositioning(prof: any, dir: any): any {
  if (!prof) return null;
  const aud = str(prof.primary_audience_1) ? (AUD_FR[String(prof.primary_audience_1).toLowerCase()] || String(prof.primary_audience_1)) : null;
  const ty = str(prof.event_type_1) ? (TYPE_FR[String(prof.event_type_1).toLowerCase()] || String(prof.event_type_1)) : null;
  let common_ground: string | null = null;
  if (aud && ty) common_ground = `même public (${aud}) et même créneau (${ty})`;
  else if (aud) common_ground = `même public (${aud})`;
  let my_edge: string | null = null;
  try {
    const e = prof.auto_enriched_description ? JSON.parse(String(prof.auto_enriched_description)) : null;
    if (e && e.key_differentiators) my_edge = String(e.key_differentiators).split(/[,.]/)[0].trim() || null;
  } catch { /* ignore */ }
  let their_strength: string | null = null;
  const rating = num(dir && dir.google_rating);
  if (rating != null) {
    const cnt = num(dir && dir.google_rating_count);
    their_strength = `notoriété · note ${String(rating).replace(".", ",")}${cnt != null ? ` (${Number(cnt).toLocaleString("fr-FR")} avis)` : ""}`;
  }
  if (!common_ground && !my_edge && !their_strength) return null;
  return { common_ground, my_edge, their_strength };
}

export const GET: APIRoute = async ({ url, locals }) => {
  try {
    const bq = makeBQClient(process.env.BQ_PROJECT_ID || PROJECT);
    const location_id = requireString(url.searchParams.get("location_id"), "location_id");
    requireLocationOwnership(locals, location_id);
    const date = normalizeYmd(requireString(url.searchParams.get("date"), "date"));

    // Followed competitors + their audience overlap — the reality check.
    const [folRows] = await bq.query({
      query: `SELECT competitor_id, competitor_name, audience_overlap_pct, distance_km, threat_level
              FROM \`${PROJECT}.mart.fct_competitor_threat_profile\`
              WHERE location_id = @location_id AND is_followed
              ORDER BY audience_overlap_pct DESC, threat_score DESC`,
      params: { location_id }, types: { location_id: "STRING" }, location: "EU",
    });
    const followed = (Array.isArray(folRows) ? folRows : []).map((r: any) => ({
      id: str(r.competitor_id), name: str(r.competitor_name), overlap: num(r.audience_overlap_pct),
      distance_km: num(r.distance_km), threat_level: str(r.threat_level),
    })).filter((c: any) => c.id);

    const overlaps = followed.map((c: any) => c.overlap).filter((o: any) => o != null) as number[];
    const maxOverlap = overlaps.length ? Math.round(Math.max(...overlaps)) : null;
    const real = followed.filter((c: any) => c.overlap != null && c.overlap >= REAL_BAR);

    // État A — no real competitors: tell the truth, prompt following real ones. No fabricated moves.
    if (!real.length) {
      const note = followed.length
        ? `Vos ${followed.length} entités suivies plafonnent à ${maxOverlap ?? 0} % d'audience commune — trop faible pour vous concurrencer réellement.`
        : "Vous ne suivez aucun concurrent pour ce lieu.";
      return json(200, {
        ok: true, found: true, date,
        lead: "Aucun concurrent n'a d'impact mesurable sur vous en ce moment.",
        moves: [],
        note,
        next_step: "Suivez de vrais concurrents (organisateurs, agences événementielles) pour activer cette veille.",
      });
    }

    // État B — real competitors: positioning (terrain commun / atout / le leur) + their recent moves.
    const realIds = real.map((c: any) => c.id);
    const nameById: Record<string, any> = {};
    real.forEach((c: any) => { nameById[c.id] = c; });
    const [mvRows, profRow, dirRow] = await Promise.all([
      bq.query({
        query: `SELECT competitor_id, item, category, price_pct_change, current_crawled_at
                FROM \`${PROJECT}.intermediate.int_competitor_offering_changes\`
                WHERE competitor_id IN UNNEST(@ids)
                  AND DATE(current_crawled_at) >= DATE_SUB(PARSE_DATE('%Y-%m-%d', @date), INTERVAL ${MOVE_WINDOW_DAYS} DAY)
                ORDER BY current_crawled_at DESC LIMIT ${MAX_MOVES}`,
        params: { ids: realIds, date }, types: { ids: ["STRING"], date: "STRING" }, location: "EU",
      }).then((r: any) => r[0]).catch(() => []),
      bq.query({
        query: `SELECT primary_audience_1, event_type_1, auto_enriched_description
                FROM \`${PROJECT}.semantic.vw_insight_event_ai_location_context\` WHERE location_id = @location_id LIMIT 1`,
        params: { location_id }, types: { location_id: "STRING" }, location: "EU",
      }).then((r: any) => r[0]?.[0]).catch(() => null),
      bq.query({
        query: `SELECT competitor_name, google_rating, google_rating_count
                FROM \`${PROJECT}.mart.fct_competitor_directory\`
                WHERE competitor_id IN UNNEST(@ids) AND google_rating IS NOT NULL
                ORDER BY google_rating DESC LIMIT 1`,
        params: { ids: realIds }, types: { ids: ["STRING"] }, location: "EU",
      }).then((r: any) => r[0]?.[0]).catch(() => null),
    ]);
    const positioning = buildPositioning(profRow, dirRow);

    const moves = (Array.isArray(mvRows) ? mvRows : []).map((r: any) => {
      const c = nameById[str(r.competitor_id) || ""] || {};
      const pct = num(r.price_pct_change);
      return {
        competitor: c.name || "Concurrent",
        overlap_pct: c.overlap != null ? Math.round(c.overlap) : null,
        date: ymd(r.current_crawled_at)?.slice(0, 10) || null,
        what: moveWhat(str(r.item), str(r.category), pct),
        response: moveResponse(pct),
      };
    });

    if (!moves.length) {
      return json(200, {
        ok: true, found: true, date,
        lead: "Vos concurrents n'ont pas bougé récemment.",
        positioning,
        moves: [],
        note: `${real.length} concurrent(s) réel(s) suivi(s) — aucun changement d'offre détecté sur ${MOVE_WINDOW_DAYS} jours.`,
        next_step: null,
      });
    }

    return json(200, {
      ok: true, found: true, date,
      lead: `${moves.length} de vos concurrents ont bougé — voici quoi faire.`,
      positioning,
      moves,
      note: null,
      next_step: null,
    });
  } catch (err: any) {
    console.error("[api/insight/competitor] Error", err);
    return json(500, { ok: false, error: err?.message ?? "Erreur interne" });
  }
};
