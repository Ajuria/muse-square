// src/pages/api/insight/events.ts
// Card-SPECIFIC drill-down for the EVENTS family — "what competes for my audience's attention".
// The venue is an EVENT ORGANIZER (event_type_*, objective maximize_attendance); this classifies the
// nearby event landscape by DRIVE vs CANNIBALIZE, off audience overlap × category, from the marts:
//   - semantic.vw_insight_event_ai_location_context: my event_type_1/2/3 + crawled event_examples
//     (auto_enriched_description JSON) — what I organize (block 2, qualitative — NO attendance/CRM yet).
//   - mart.fct_competitor_events_conflicts: upcoming nearby events with threat_audience_overlap_pct,
//     industry_overlap, event_date — the compete-for-audience signal (block 1) + calendar density (block 3).
// Classification (honest, observed): high audience overlap + same category (industry_overlap) = CANNIBALISE;
// high overlap + different category = À CAPITALISER (their crowd is your crowd — capture it); low = NEUTRE.
// No attendance data anywhere -> no performance benchmark (surfaced as an honest gap, never faked).
import type { APIRoute } from "astro";
import { makeBQClient } from "../../../lib/bq";
import { requireLocationOwnership } from "../../../lib/requireLocationOwnership";

const PROJECT = "muse-square-open-data";
const HIGH_OVERLAP = 40;   // % audience overlap at/above which an event genuinely contests my crowd
const MAX_EVENTS = 6;
const CAL_WEEKS = 6;

// My crawled event types -> French labels (fallback when event_examples is absent).
const MY_TYPE_FR: Record<string, string> = {
  corporate: "Convention d'entreprise", product_launch: "Lancement de produit",
  store_opening: "Ouverture de point de vente", exhibition: "Exposition", conference: "Colloque",
};

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
const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

export const GET: APIRoute = async ({ url, locals }) => {
  try {
    const bq = makeBQClient(process.env.BQ_PROJECT_ID || PROJECT);
    const location_id = requireString(url.searchParams.get("location_id"), "location_id");
    requireLocationOwnership(locals, location_id);
    const date = normalizeYmd(requireString(url.searchParams.get("date"), "date"));

    const [profRows, evRows, calRows, ceRows] = await Promise.all([
      bq.query({
        query: `SELECT event_type_1, event_type_2, event_type_3, main_event_objective, auto_enriched_description
                FROM \`${PROJECT}.semantic.vw_insight_event_ai_location_context\`
                WHERE location_id = @location_id LIMIT 1`,
        params: { location_id }, types: { location_id: "STRING" }, location: "EU",
      }).then((r: any) => r[0]?.[0]).catch(() => null),
      bq.query({
        query: `SELECT event_name, venue_name, event_date, distance_from_location_m,
                       threat_audience_overlap_pct, audience_overlap_score, industry_overlap, event_type
                FROM \`${PROJECT}.mart.fct_competitor_events_conflicts\`
                WHERE location_id = @location_id
                  AND event_date BETWEEN DATE_SUB(PARSE_DATE('%Y-%m-%d', @date), INTERVAL 30 DAY)
                                     AND DATE_ADD(PARSE_DATE('%Y-%m-%d', @date), INTERVAL 120 DAY)
                ORDER BY threat_audience_overlap_pct DESC, conflict_score DESC
                LIMIT ${MAX_EVENTS}`,
        params: { location_id, date }, types: { location_id: "STRING", date: "STRING" }, location: "EU",
      }).then((r: any) => r[0]).catch(() => []),
      bq.query({
        query: `SELECT DATE_TRUNC(event_date, WEEK(MONDAY)) AS wk, COUNT(*) AS n
                FROM \`${PROJECT}.mart.fct_competitor_events_conflicts\`
                WHERE location_id = @location_id
                  AND event_date >= PARSE_DATE('%Y-%m-%d', @date)
                  AND event_date < DATE_ADD(PARSE_DATE('%Y-%m-%d', @date), INTERVAL ${CAL_WEEKS} WEEK)
                GROUP BY wk ORDER BY wk`,
        params: { location_id, date }, types: { location_id: "STRING", date: "STRING" }, location: "EU",
      }).then((r: any) => r[0]).catch(() => []),
      // The commercial temps fort active on the day (soldes, fêtes) — a footfall DRIVER, leads the card.
      bq.query({
        query: `SELECT commercial_events FROM \`${PROJECT}.semantic.vw_insight_event_day_surface\`
                WHERE location_id = @location_id AND date = PARSE_DATE('%Y-%m-%d', @date) LIMIT 1`,
        params: { location_id, date }, types: { location_id: "STRING", date: "STRING" }, location: "EU",
      }).then((r: any) => r[0]?.[0]).catch(() => null),
    ]);

    // Triggering commercial temps fort (soldes/fêtes) — the DRIVER signal; leads the Paysage.
    let commercial_event: any = null;
    const ceArr = ceRows && (ceRows as any).commercial_events;
    if (Array.isArray(ceArr) && ceArr.length) {
      const nm = str(ceArr[0]?.event_name);
      if (nm) commercial_event = { name: nm, note: "Le flux d'acheteurs est dans votre zone — captez-le avec une offre signature plutôt qu'une remise." };
    }

    // Profile: my event types (crawled event_examples preferred, else the typed fields).
    const prof: any = profRows || {};
    let my_types: string[] = [];
    try {
      const enriched = prof.auto_enriched_description ? JSON.parse(String(prof.auto_enriched_description)) : null;
      if (enriched && enriched.event_examples) {
        my_types = String(enriched.event_examples).split(",").map((s: string) => cap(s.trim())).filter(Boolean).slice(0, 5);
      }
    } catch { /* ignore malformed crawl JSON */ }
    if (!my_types.length) {
      my_types = [prof.event_type_1, prof.event_type_2, prof.event_type_3]
        .map((t: any) => (t ? (MY_TYPE_FR[String(t)] || cap(String(t))) : null)).filter(Boolean) as string[];
    }

    // Classify each nearby event: drive vs cannibalize vs neutral (observed, from overlap × category).
    const competitors = (Array.isArray(evRows) ? evRows : []).map((r: any) => {
      const ovlp = num(r.threat_audience_overlap_pct);
      const overlap_pct = ovlp != null ? Math.round(ovlp) : (num(r.audience_overlap_score) != null ? Math.round(num(r.audience_overlap_score)! * 10) : null);
      const high = overlap_pct != null && overlap_pct >= HIGH_OVERLAP;
      const sameCat = r.industry_overlap === true || r.industry_overlap === "true";
      const tag = !high ? "neutre" : (sameCat ? "cannibalise" : "capitaliser");
      return {
        name: str(r.event_name), venue: str(r.venue_name), date: ymd(r.event_date),
        distance_m: num(r.distance_from_location_m), overlap_pct, tag,
      };
    }).filter((e: any) => e.name);

    const nCap = competitors.filter((c: any) => c.tag === "capitaliser").length;
    const nCan = competitors.filter((c: any) => c.tag === "cannibalise").length;

    // Calendar density: quiet (<=1) = open window, busy (>=4) = crowded.
    const calendar = (Array.isArray(calRows) ? calRows : []).map((r: any) => {
      const n = num(r.n) ?? 0;
      const w = ymd(r.wk) || "";
      const p = w.split("-");
      return { label: p.length === 3 ? `${p[2]}/${p[1]}` : w, count: n, state: n <= 1 ? "quiet" : (n >= 4 ? "busy" : null) };
    });

    // like_mine: any nearby event in MY category? (industry_overlap) -> else whitespace (honest).
    const sameCatEvents = competitors.filter((c: any) => c.tag === "cannibalise");
    const like_mine = {
      found: false,
      note: "Aucun événement de votre catégorie détecté à proximité — catégorie non disputée localement.",
      my_types,
      benchmark_note: "Ampleur non comparable : ces événements n'exposent pas leur fréquentation. Un flux billetterie/CRM débloquerait le benchmark de performance.",
    };
    if (sameCatEvents.length) {
      (like_mine as any).found = true;
      (like_mine as any).events = sameCatEvents.map((c: any) => ({ name: c.name, venue: c.venue, date: c.date, scale: "—" }));
    }

    // contest_lead + Prochaines étapes (strategic action ideas tied to the signals; seed M'engager).
    let contest_lead: string;
    if (nCan || nCap) contest_lead = `${nCan + nCap} événement(s) ciblent votre public — voici où agir.`;
    else if (competitors.length) contest_lead = "Votre public est peu disputé — les événements du secteur ne visent pas votre audience.";
    else contest_lead = "Aucun événement concurrent à venir dans votre rayon — territoire dégagé.";

    const decision_lines: { head: string; body: string }[] = [];
    const cap1 = competitors.find((c: any) => c.tag === "capitaliser");
    const can1 = competitors.find((c: any) => c.tag === "cannibalise");
    if (cap1) decision_lines.push({ head: `Capitalisez sur ${cap1.name}`, body: `Public proche du vôtre (${cap1.overlap_pct} %) — programmez en marge et ciblez son audience.` });
    if (can1) decision_lines.push({ head: `Défendez-vous face à ${can1.name}`, body: `Même catégorie et public (${can1.overlap_pct} %) — différenciez fortement ou décalez votre date.` });
    const quiet = calendar.find((c: any) => c.state === "quiet");
    if (quiet) decision_lines.push({ head: `Fenêtre calme : semaine du ${quiet.label}`, body: "Faible concurrence — testez un événement pour capter l'attention sans dispersion." });
    if (!decision_lines.length) {
      if (competitors.length) decision_lines.push({ head: "Public non ciblé localement", body: "Les événements du secteur visent une autre audience — peu de risque de dispersion; concentrez-vous sur vos propres canaux." });
      else decision_lines.push({ head: "Territoire dégagé", body: "Aucun concurrent direct à venir — fenêtre ouverte pour maximiser l'attention sur vos dates." });
    }
    // The commercial temps fort is the primary action when present — prepend it.
    if (commercial_event) decision_lines.unshift({ head: `Activez pendant ${commercial_event.name}`, body: "Le flux d'acheteurs est là — misez sur une offre signature ou une expérience, pas une remise (elle érode la marge sans gagner de visiteurs)." });

    return json(200, {
      ok: true,
      found: true,
      date,
      commercial_event,   // triggering temps fort (soldes/fêtes) — the DRIVER, leads the card
      contest_lead,
      competitors,
      like_mine,
      calendar,
      decision_lines,
    });
  } catch (err: any) {
    console.error("[api/insight/events] Error", err);
    return json(500, { ok: false, error: err?.message ?? "Erreur interne" });
  }
};
