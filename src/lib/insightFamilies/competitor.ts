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
import { finalizeContrast, frPp, IMPACT_MIN_SIDE, IMPACT_NOTE_FR, type ImpactContrast } from "./impactContrast";

const PROJECT = "muse-square-open-data";
const REAL_BAR = 40;   // % audience overlap at/above which a followed entity is a real competitor
const MAX_MOVES = 8;
const MOVE_WINDOW_DAYS = 60;

// ── Measured-impact engine (competitor, 16/07) ──────────────────────────────────────────────────
// « Do my competitors cost me sales? », measured from the venue's OWN history — with the two
// competitor DEFINITIONS kept apart (owner requirement):
//   1. SUIVIS — entities the user follows (raw.watched_competitors → entity_is_followed): daily
//      count of their ACTIVE events (long-running exhibitions vary 10-16/day on f10c3e58, so the
//      contrast is intensity terciles, not presence).
//   2. MÊME SECTEUR (map/ambient) — `competition_index_local` (fct_location_context_features_daily),
//      the app's canonical DAILY weighted same-industry pressure (already narrated by top-days as
//      « concurrence sous la moyenne du mois »). Reusing it keeps ONE definition of daily pressure —
//      a new ad-hoc index here would fork the vocabulary.
// Both compared on residual_pct (dow+trend controlled) with the SHARED gates/tier ladder
// (impactContrast). NOTE the confound: followed-competitor activity correlates with same-bucket
// event density (the events family's contrast) — phrasing stays associative, and each fact names
// ITS variable so the two engines can never be read as one claim.
type CompetitorContrast = ImpactContrast & { key: "followed_activity" | "ambient_index"; label_fr: string };

async function measureCompetitorImpact(
  bq: any, location_id: string,
): Promise<{ days: number; contrasts: CompetitorContrast[] } | null> {
  try {
    const [rows] = await bq.query({
      query: `
        WITH base AS (
          SELECT r.date, r.residual_pct,
            f.competition_index_local AS idx,
            (SELECT COUNT(*) FROM \`${PROJECT}.semantic.vw_insight_event_competitor_signals\` s
             WHERE s.location_id = r.location_id AND s.entity_is_followed = TRUE
               AND r.date BETWEEN s.event_date AND COALESCE(s.event_date_end, s.event_date)) AS n_followed
          FROM \`${PROJECT}.mart.fct_client_day_residual\` r
          JOIN \`${PROJECT}.mart.fct_location_context_features_daily\` f
            ON f.location_id = r.location_id AND f.date = r.date
          WHERE r.location_id = @location_id AND r.residual_pct IS NOT NULL
            AND f.date BETWEEN DATE_SUB(CURRENT_DATE(), INTERVAL 365 DAY) AND CURRENT_DATE()
        ),
        th AS (
          SELECT APPROX_QUANTILES(idx, 3)[OFFSET(1)] AS lo_i, APPROX_QUANTILES(idx, 3)[OFFSET(2)] AS hi_i,
                 APPROX_QUANTILES(n_followed, 3)[OFFSET(1)] AS lo_f, APPROX_QUANTILES(n_followed, 3)[OFFSET(2)] AS hi_f
          FROM base
        )
        SELECT (SELECT COUNT(*) FROM base) AS days,
          'followed_activity' AS metric, th.hi_f AS hi, th.lo_f AS lo,
          COUNTIF(n_followed >= th.hi_f) AS n_high, COUNTIF(n_followed <= th.lo_f) AS n_low,
          AVG(IF(n_followed >= th.hi_f, residual_pct, NULL)) AS mean_high, AVG(IF(n_followed <= th.lo_f, residual_pct, NULL)) AS mean_low,
          STDDEV(IF(n_followed >= th.hi_f, residual_pct, NULL)) AS sd_high, STDDEV(IF(n_followed <= th.lo_f, residual_pct, NULL)) AS sd_low
        FROM base, th GROUP BY th.hi_f, th.lo_f
        UNION ALL
        SELECT (SELECT COUNT(*) FROM base),
          'ambient_index', th.hi_i, th.lo_i,
          COUNTIF(idx >= th.hi_i), COUNTIF(idx <= th.lo_i),
          AVG(IF(idx >= th.hi_i, residual_pct, NULL)), AVG(IF(idx <= th.lo_i, residual_pct, NULL)),
          STDDEV(IF(idx >= th.hi_i, residual_pct, NULL)), STDDEV(IF(idx <= th.lo_i, residual_pct, NULL))
        FROM base, th GROUP BY th.hi_i, th.lo_i`,
      params: { location_id }, types: { location_id: "STRING" }, location: "EU",
    });
    const arr = Array.isArray(rows) ? rows : [];
    if (!arr.length) return { days: 0, contrasts: [] };
    const days = Number(arr[0]?.days ?? 0);
    const LABEL: Record<string, string> = {
      followed_activity: "Activité de vos concurrents suivis",
      ambient_index: "Pression locale même secteur (indice)",
    };
    const contrasts: CompetitorContrast[] = [];
    for (const r of arr) {
      const c = finalizeContrast({
        hi: Number(r.hi), lo: Number(r.lo),
        n_high: Number(r.n_high), n_low: Number(r.n_low),
        mean_high: Number(r.mean_high), mean_low: Number(r.mean_low),
        sd_high: Number(r.sd_high), sd_low: Number(r.sd_low),
      });
      if (!c) continue;
      contrasts.push({ ...c, key: r.metric, label_fr: LABEL[r.metric] ?? r.metric });
    }
    return { days, contrasts };
  } catch (e: any) {
    console.warn("[competitor-impact] measurement skipped:", e?.message);
    return null;
  }
}

// Facts + card block from the measurement — shared by both États (the measurement is about the
// venue's days, not about which entities clear the REAL_BAR).
function competitorImpactOutputs(impact: { days: number; contrasts: CompetitorContrast[] } | null) {
  const facts: FamilyFact[] = [];
  const rows: Array<{ label: string; verdict_fr: string; detail_fr: string; measurable: boolean }> = [];
  if (impact && impact.contrasts.length) {
    for (const c of impact.contrasts) {
      const isIdx = c.key === "ambient_index";
      const hiFr = isIdx ? "forte pression" : `≥ ${c.hi} événements en cours`;
      const loFr = isIdx ? "faible pression" : `≤ ${c.lo}`;
      const detail = `${c.n_high} jours (${hiFr}) vs ${c.n_low} jours (${loFr})`;
      if (c.tier) {
        const dir = c.delta_pp >= 0 ? "au-dessus de" : "en dessous de";
        facts.push({
          fact_fr: isIdx
            ? `Les jours de forte pression concurrentielle locale (même secteur, indice quotidien), votre CA se situe en moyenne ${frPp(c.delta_pp)} ${dir} sa normale, comparé aux jours de faible pression — ${detail}.`
            : `Les jours où vos concurrents suivis sont les plus actifs (${hiFr}), votre CA se situe en moyenne ${frPp(c.delta_pp)} ${dir} sa normale, comparé à leurs jours les plus calmes (${loFr}) — ${detail}.`,
          claim_type: "observed_difference",
          tier: c.tier,
        });
        rows.push({ label: c.label_fr, verdict_fr: `${frPp(c.delta_pp)} vs votre normale`, detail_fr: detail, measurable: true });
      } else {
        facts.push({
          fact_fr: `${c.label_fr} : aucun écart mesurable de votre CA entre jours de forte et de faible ${isIdx ? "pression" : "activité"} — ${frPp(c.delta_pp)} ± ${c.se.toFixed(1).replace(".", ",")}, ${detail}.`,
          claim_type: "observed_difference",
        });
        rows.push({ label: c.label_fr, verdict_fr: "aucun écart mesurable", detail_fr: `${frPp(c.delta_pp)} ± ${c.se.toFixed(1).replace(".", ",")} · ${detail}`, measurable: false });
      }
    }
  } else if (impact && impact.days > 0) {
    facts.push({
      fact_fr: `Impact de vos concurrents sur votre CA : pas encore mesurable — ${impact.days} jour(s) de ventes couverts, il en faut au moins ${IMPACT_MIN_SIDE * 2} avec un contraste suffisant.`,
      claim_type: "observed",
    });
  }
  const block =
    impact == null
      ? null
      : impact.contrasts.length
        ? { available: true, days: impact.days, rows, note: IMPACT_NOTE_FR }
        : { available: false, days: impact.days, reason_fr: impact.days > 0 ? `${impact.days} jour(s) de ventes couverts — mesure possible à partir de ${IMPACT_MIN_SIDE * 2} jours avec un contraste suffisant.` : "Aucune journée de ventes couverte par les signaux concurrents pour l'instant." };
  return { facts, block };
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
  // Followed competitors + their audience overlap — the reality check. The measured-impact
  // contrast runs in parallel (it is about the venue's DAYS, independent of the État A/B split).
  const [[folRows], impact] = await Promise.all([
    bq.query({
      query: `SELECT competitor_id, competitor_name, audience_overlap_pct, distance_km, threat_level
              FROM \`${PROJECT}.mart.fct_competitor_threat_profile\`
              WHERE location_id = @location_id AND is_followed
              ORDER BY audience_overlap_pct DESC, threat_score DESC`,
      params: { location_id }, types: { location_id: "STRING" }, location: "EU",
    }),
    measureCompetitorImpact(bq, location_id),
  ]);
  const { facts: impactFacts, block: impactBlock } = competitorImpactOutputs(impact);
  const SRC_IMPACT = "Impact mesuré — vos ventes vs l'activité concurrente quotidienne (normale jour-de-semaine contrôlée)";
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
        impact: impactBlock,
      },
      facts: [...facts, ...impactFacts],
      sources: impactBlock && impactBlock.available ? [SRC_FOLLOWED, SRC_IMPACT] : [SRC_FOLLOWED],
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
  if (impactBlock && impactBlock.available) sources.push(SRC_IMPACT);
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
        impact: impactBlock,
      },
      facts: [...facts, ...impactFacts],
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
      impact: impactBlock,
    },
    facts: [...facts, ...impactFacts],
    sources,
  };
}
