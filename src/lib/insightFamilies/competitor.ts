// src/lib/insightFamilies/competitor.ts
// COMPETITOR family provider — "what are my competitors DOING that impacts me, and what do I do about
// it". Extracted VERBATIM from the deep-page endpoint (src/pages/api/insight/competitor.ts) so the deep
// page stays byte-identical — the endpoint is now a thin wrapper over run(). Adds `facts` (grounded
// Q&A / report summary) + `sources`.
//
// TRUTH-FIRST, and the whole point of extracting rather than re-deriving: the REAL_BAR lives in ONE
// place. A followed entity below 40 % audience overlap is NOT a competitor, and the answer must say so
// (État A) instead of ranking near-misses — otherwise the deep page says "aucun concurrent n'a d'impact
// mesurable" while the chat says "priorisez X (33 %)", from the same data, on the same day.
//   - État A (honest default): all followed entities below the bar -> state the ceiling + one action.
//   - État B: real competitors (>= 40 %) -> positioning + their recent BUSINESS moves (price/offering),
//     each with a specific rule-based response.
// Event moves are DELIBERATELY excluded — they belong to the Events card.
import type { FamilyResult, FamilyFact } from "./types";

const PROJECT = "muse-square-open-data";
const REAL_BAR = 40;   // % audience overlap at/above which a followed entity is a real competitor
const MAX_MOVES = 8;
const MOVE_WINDOW_DAYS = 60;

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
// NOTE: these two maps are the endpoint's own wording ("clientèle locale"), which differs from
// profileLabels.AUDIENCE_FR ("résidents locaux"). Kept VERBATIM so the deep page stays byte-identical —
// reconciling the two registers is an owner copy decision, not a silent side effect of this extraction.
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

export async function competitorFamily(bq: any, location_id: string, date: string): Promise<FamilyResult> {
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

  const SRC_FOLLOWED = "Vos concurrents suivis — audience commune (profil de menace)";

  // ── État A — no real competitors: tell the truth, prompt following real ones. No fabricated moves.
  if (!real.length) {
    const note = followed.length
      ? `Vos ${followed.length} entités suivies plafonnent à ${maxOverlap ?? 0} % d'audience commune — trop faible pour vous concurrencer réellement.`
      : "Vous ne suivez aucun concurrent pour ce lieu.";

    // The fact carries the BAR, not just the number: without "seuil 40 %" the model can read 33 % as
    // "presque un concurrent" and re-invent the rivalry this state exists to refuse.
    const facts: FamilyFact[] = followed.length
      ? [{
          fact_fr: `Aucun de vos ${followed.length} concurrents suivis n'atteint le seuil de concurrence réelle : leur audience commune plafonne à ${maxOverlap ?? 0} % (seuil : ${REAL_BAR} %).`,
          claim_type: "observed",
        }]
      : [{ fact_fr: "Vous ne suivez aucun concurrent pour ce lieu.", claim_type: "observed" }];

    return {
      found: true,
      data: {
        found: true, date,
        lead: "Aucun concurrent n'a d'impact mesurable sur vous en ce moment.",
        moves: [],
        note,
        next_step: "Suivez de vrais concurrents (organisateurs, agences événementielles) pour activer cette veille.",
      },
      facts,
      sources: [SRC_FOLLOWED],
    };
  }

  // ── État B — real competitors: positioning + their recent moves.
  const realIds = real.map((c: any) => c.id);
  const nameById: Record<string, any> = {};
  real.forEach((c: any) => { nameById[c.id] = c; });
  const [mvRows, profRow, dirRow] = await Promise.all([
    bq.query({
      // SEMANTIC, not intermediate: the app reads the published contract
      // (vw_insight_event_competitor_offering_changes -> fct_competitor_offering_changes ->
      // int_competitor_offering_changes). Reading the intermediate directly was a layering shortcut —
      // it bypassed the mart's tests and the locked semantic contract, and every other surface in the
      // app reads semantic. The view also carries competitor_name / is_price_change / price_direction
      // if this card ever needs them.
      query: `SELECT competitor_id, item, category, price_pct_change, current_crawled_at
              FROM \`${PROJECT}.semantic.vw_insight_event_competitor_offering_changes\`
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

  // Facts — same state, same wording as the card. Real competitors first, then each move (a move IS the
  // citable fact: named competitor + what changed + when), then the positioning anchors.
  // `real` is already filtered on overlap != null, but TS cannot narrow through .filter — read it back
  // through num() rather than casting, so a future shape change fails honestly instead of printing NaN.
  const lead0 = real[0];
  const lead0Overlap = num(lead0?.overlap);
  const facts: FamilyFact[] = [{
    fact_fr: `${real.length === 1 ? "Un seul de vos concurrents suivis dépasse" : `${real.length} de vos concurrents suivis dépassent`} le seuil de concurrence réelle (≥ ${REAL_BAR} % d'audience commune)${lead0?.name && lead0Overlap != null ? `, dont ${lead0.name} (${Math.round(lead0Overlap)} %)` : ""}.`,
    claim_type: "observed",
  }];
  for (const m of moves) {
    facts.push({
      fact_fr: `${m.competitor} — ${m.what}${m.date ? ` (relevé le ${m.date.split("-").reverse().join("/")})` : ""}.`,
      claim_type: "observed",
    });
  }
  if (positioning?.common_ground) {
    facts.push({ fact_fr: `Terrain commun avec vos concurrents réels : ${positioning.common_ground}.`, claim_type: "observed" });
  }
  if (positioning?.their_strength) {
    facts.push({ fact_fr: `Point fort du concurrent le mieux noté : ${positioning.their_strength}.`, claim_type: "observed" });
  }

  const sources = [SRC_FOLLOWED];
  if (moves.length) sources.push("Changements d'offre / tarifs relevés sur leurs pages publiques");
  if (positioning?.their_strength) sources.push("Fiche Google du concurrent (note et avis)");

  if (!moves.length) {
    return {
      found: true,
      data: {
        found: true, date,
        lead: "Vos concurrents n'ont pas bougé récemment.",
        positioning,
        moves: [],
        note: `${real.length} concurrent(s) réel(s) suivi(s) — aucun changement d'offre détecté sur ${MOVE_WINDOW_DAYS} jours.`,
        next_step: null,
      },
      facts,
      sources,
    };
  }

  return {
    found: true,
    data: {
      found: true, date,
      lead: `${moves.length} de vos concurrents ont bougé — voici quoi faire.`,
      positioning,
      moves,
      note: null,
      next_step: null,
    },
    facts,
    sources,
  };
}
