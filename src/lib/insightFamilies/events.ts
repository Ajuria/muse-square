// src/lib/insightFamilies/events.ts
// EVENTS family provider — "what competes for my audience's attention" (Paysage événementiel).
// Extracted VERBATIM from the deep-page endpoint (src/pages/api/insight/events.ts) so the deep page
// stays byte-identical — the endpoint is now a thin wrapper over run(). Adds `facts` + `sources`.
//
// The venue is an EVENT ORGANIZER; nearby events are classified by audience overlap × category:
// high overlap + same category = CANNIBALISE, high overlap + different category = À CAPITALISER,
// low = NEUTRE. No attendance data anywhere -> no performance benchmark (an honest gap, never faked).
//
// FACTS vs CARD COPY — deliberate divergence, read before "fixing" it:
// the card's `contest_lead` may say "Votre public est peu disputé" / "territoire dégagé". That is an
// INFERENCE FROM ABSENCE, and absence of crawled events is not absence of events (the surveillance
// cron was dead 30/05 -> 15/07). Card copy keeps it; `facts` must NOT, because a fact is quoted by the
// model as settled truth. So facts state only what is OBSERVED — the events actually relevés, their
// overlap, and the bar they fail to clear — and never assert an empty landscape.
import type { FamilyResult, FamilyFact } from "./types";

const PROJECT = "muse-square-open-data";
const HIGH_OVERLAP = 40;   // % audience overlap at/above which an event genuinely contests my crowd
const MAX_EVENTS = 6;
const CAL_WEEKS = 6;

// My crawled event types -> French labels (fallback when event_examples is absent).
// NOTE: this is the endpoint's own register ("Convention d'entreprise") and differs from
// profileLabels.EVENT_TYPE_FR ("Événement corporate"). Kept VERBATIM so the deep page is unchanged —
// reconciling the two is an owner copy decision, not a side effect of this extraction.
const MY_TYPE_FR: Record<string, string> = {
  corporate: "Convention d'entreprise", product_launch: "Lancement de produit",
  store_opening: "Ouverture de point de vente", exhibition: "Exposition", conference: "Colloque",
};

// ── Measured-impact engine v1 (events, 16/07) ───────────────────────────────────────────────────
// The « will events cannibalize my CA? » answer, measured from the venue's OWN history: days of HIGH
// nearby-event density vs LOW-density days, compared on `residual_pct` (fct_client_day_residual —
// actual vs dow+trend normale, so weekday and trend are already controlled). Two contrasts: ALL
// events ≤500 m, and SAME-BUCKET events ≤500 m (the audience that could actually cannibalize — or
// feed — this venue). Binary event/no-event is useless in a dense city (f10c3e58: 1 zero-day in 80),
// so the split is terciles of density. Gates/tier ladder/phrasing discipline = the SHARED
// impactContrast module (also used by the competitor family).
import { finalizeContrast, frPp, IMPACT_MIN_SIDE, IMPACT_NOTE_FR, type ImpactContrast } from "./impactContrast";

type DensityContrast = ImpactContrast & {
  key: "all_500m" | "same_bucket_500m";
  label_fr: string;
};

async function measureEventDensityImpact(
  bq: any, location_id: string,
): Promise<{ days: number; contrasts: DensityContrast[] } | null> {
  try {
    const [rows] = await bq.query({
      query: `
        WITH joined AS (
          SELECT r.residual_pct,
                 e.events_within_500m_count AS ev,
                 e.events_within_500m_same_bucket_count AS evsb
          FROM \`${PROJECT}.mart.fct_client_day_residual\` r
          JOIN \`${PROJECT}.mart.fct_location_events_radius_daily\` e
            ON e.location_id = r.location_id AND e.date = r.date
          WHERE r.location_id = @location_id AND r.residual_pct IS NOT NULL
            AND e.date BETWEEN DATE_SUB(CURRENT_DATE(), INTERVAL 365 DAY) AND CURRENT_DATE()
        ),
        th AS (
          SELECT APPROX_QUANTILES(ev, 3)[OFFSET(1)] AS lo, APPROX_QUANTILES(ev, 3)[OFFSET(2)] AS hi,
                 APPROX_QUANTILES(evsb, 3)[OFFSET(1)] AS losb, GREATEST(APPROX_QUANTILES(evsb, 3)[OFFSET(2)], 1) AS hisb
          FROM joined
        )
        SELECT (SELECT COUNT(*) FROM joined) AS days,
          'all_500m' AS metric, th.hi AS hi, th.lo AS lo,
          COUNTIF(ev >= th.hi) AS n_high, COUNTIF(ev <= th.lo) AS n_low,
          AVG(IF(ev >= th.hi, residual_pct, NULL)) AS mean_high, AVG(IF(ev <= th.lo, residual_pct, NULL)) AS mean_low,
          STDDEV(IF(ev >= th.hi, residual_pct, NULL)) AS sd_high, STDDEV(IF(ev <= th.lo, residual_pct, NULL)) AS sd_low
        FROM joined, th GROUP BY th.hi, th.lo
        UNION ALL
        SELECT (SELECT COUNT(*) FROM joined),
          'same_bucket_500m', th.hisb, th.losb,
          COUNTIF(evsb >= th.hisb), COUNTIF(evsb <= th.losb),
          AVG(IF(evsb >= th.hisb, residual_pct, NULL)), AVG(IF(evsb <= th.losb, residual_pct, NULL)),
          STDDEV(IF(evsb >= th.hisb, residual_pct, NULL)), STDDEV(IF(evsb <= th.losb, residual_pct, NULL))
        FROM joined, th GROUP BY th.hisb, th.losb`,
      params: { location_id }, types: { location_id: "STRING" }, location: "EU",
    });
    const arr = Array.isArray(rows) ? rows : [];
    if (!arr.length) return { days: 0, contrasts: [] };
    const days = Number(arr[0]?.days ?? 0);
    const LABEL: Record<string, string> = {
      all_500m: "Tous événements (≤ 500 m)",
      same_bucket_500m: "Événements de votre secteur (≤ 500 m)",
    };
    const contrasts: DensityContrast[] = [];
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
    console.warn("[events-impact] measurement skipped:", e?.message);
    return null;
  }
}

const num = (v: any): number | null => (v == null ? null : Number(v && typeof v === "object" && "value" in v ? v.value : v));
const str = (v: any): string | null => { const s = v == null ? "" : String(v).trim(); return s || null; };
const ymd = (v: any): string | null => (v == null ? null : (typeof v === "object" && "value" in v ? String(v.value) : String(v)));
const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const frDate = (iso: string | null): string | null => {
  if (!iso) return null;
  const p = String(iso).slice(0, 10).split("-");
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : null;   // JJ/MM/AAAA — never ISO to the reader
};

export async function eventsFamily(bq: any, location_id: string, date: string): Promise<FamilyResult> {
  const [profRows, evRows, calRows, ceRows, impact] = await Promise.all([
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
    // Measured-impact engine v1: high-vs-low event-density contrast on the dow+trend residual.
    measureEventDensityImpact(bq, location_id),
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

  // ── FACTS — observed only. Never the absence claims the card copy allows itself (see header).
  const facts: FamilyFact[] = [];

  if (commercial_event) {
    facts.push({ fact_fr: `Période commerciale en cours dans votre zone : ${commercial_event.name}.`, claim_type: "observed" });
  }

  // Named contested events lead: those ARE the actionable observation.
  for (const c of competitors.filter((x: any) => x.tag === "cannibalise" || x.tag === "capitaliser")) {
    const d = frDate(c.date);
    facts.push({
      fact_fr: c.tag === "cannibalise"
        ? `${c.name}${d ? ` (${d})` : ""} vise votre public (${c.overlap_pct} % d'audience commune) dans votre catégorie.`
        : `${c.name}${d ? ` (${d})` : ""} attire un public proche du vôtre (${c.overlap_pct} % d'audience commune), dans une autre catégorie.`,
      claim_type: "observed",
    });
  }

  // Nothing clears the bar: state the CEILING against the bar — never "votre public est peu disputé"
  // (that is the inference the card copy makes; a fact must not, the landscape data can be stale).
  if (!nCan && !nCap && competitors.length) {
    const tops = competitors.map((c: any) => c.overlap_pct).filter((o: any) => o != null) as number[];
    const ceiling = tops.length ? Math.max(...tops) : null;
    facts.push({
      fact_fr: `Sur les ${competitors.length} événements relevés autour de vous, aucun n'atteint le seuil de dispute d'audience (≥ ${HIGH_OVERLAP} %)${ceiling != null ? ` : le plus élevé plafonne à ${ceiling} %` : ""}.`,
      claim_type: "observed",
    });
  }

  if (quiet) {
    facts.push({ fact_fr: `La semaine du ${quiet.label} est la plus calme des ${CAL_WEEKS} prochaines : ${quiet.count} événement(s) concurrent(s) relevé(s).`, claim_type: "observed" });
  }
  if (my_types.length) {
    facts.push({ fact_fr: `Vous organisez : ${my_types.join(", ")}.`, claim_type: "observed" });
  }
  // ── Measured-impact facts (engine v1) — the « cannibalize? » answer from the venue's own history.
  // Quantified deltas carry claim_type observed_difference + tier (the model may causally upgrade ONLY
  // under rule 3bis, tier named in-sentence). A below-gate result is stated WITH its numbers — a
  // measured null is the verdict the operator needs, not an absence of answer. Cold start (a fresh
  // account) states WHY nothing is measurable yet. Phrasing stays associative in the fact text itself.
  const impactRows: Array<{ label: string; verdict_fr: string; detail_fr: string; measurable: boolean }> = [];
  if (impact && impact.contrasts.length) {
    for (const c of impact.contrasts) {
      const lowSide = c.lo === 0 ? "sans" : `à ≤ ${c.lo}`;
      const detail = `${c.n_high} jours à ≥ ${c.hi} vs ${c.n_low} jours ${lowSide}`;
      if (c.tier) {
        const dir = c.delta_pp >= 0 ? "au-dessus de" : "en dessous de";
        facts.push({
          fact_fr: `Les jours à forte densité ${c.key === "same_bucket_500m" ? "d'événements de votre secteur" : "d'événements"} à 500 m (≥ ${c.hi}), votre CA se situe en moyenne ${frPp(c.delta_pp)} ${dir} sa normale, comparé aux jours ${c.lo === 0 ? "sans événement de ce type" : `à faible densité (≤ ${c.lo})`} — ${detail}.`,
          claim_type: "observed_difference",
          tier: c.tier,
        });
        impactRows.push({ label: c.label_fr, verdict_fr: `${frPp(c.delta_pp)} vs votre normale`, detail_fr: detail, measurable: true });
      } else {
        facts.push({
          fact_fr: `${c.label_fr} : aucun écart mesurable de votre CA entre jours chargés (≥ ${c.hi}) et jours calmes (≤ ${c.lo}) — ${frPp(c.delta_pp)} ± ${c.se.toFixed(1).replace(".", ",")}, ${detail}.`,
          claim_type: "observed_difference",
        });
        impactRows.push({ label: c.label_fr, verdict_fr: "aucun écart mesurable", detail_fr: `${frPp(c.delta_pp)} ± ${c.se.toFixed(1).replace(".", ",")} · ${detail}`, measurable: false });
      }
    }
  } else if (impact && impact.days > 0) {
    facts.push({
      fact_fr: `Impact de la densité d'événements sur votre CA : pas encore mesurable — ${impact.days} jour(s) de ventes couverts, il en faut au moins ${IMPACT_MIN_SIDE * 2} avec un contraste de densité suffisant.`,
      claim_type: "observed",
    });
  }
  const impactBlock =
    impact == null
      ? null
      : impact.contrasts.length
        ? { available: true, days: impact.days, rows: impactRows, note: IMPACT_NOTE_FR }
        : { available: false, days: impact.days, reason_fr: impact.days > 0 ? `${impact.days} jour(s) de ventes couverts — mesure possible à partir de ${IMPACT_MIN_SIDE * 2} jours avec un contraste suffisant.` : "Aucune journée de ventes couverte par le paysage événementiel pour l'instant." };

  // The benchmark gap is a TRUE statement about our data, and it stops the model inventing attendance.
  facts.push({
    fact_fr: "La fréquentation des événements concurrents n'est pas publiée : aucun comparatif d'ampleur n'est possible.",
    claim_type: "observed",
  });

  const sources = ["Paysage événementiel — événements relevés autour de vous (date, distance, audience commune)"];
  if (my_types.length) sources.push("Votre profil — types d'événements que vous organisez");
  if (commercial_event) sources.push("Calendrier des périodes commerciales (soldes, fêtes)");

  if (impact && impact.contrasts.length) sources.push("Impact mesuré — vos ventes vs la densité d'événements proche (normale jour-de-semaine contrôlée)");

  return {
    found: true,
    data: { found: true, date, commercial_event, contest_lead, competitors, like_mine, calendar, impact: impactBlock, decision_lines },
    facts,
    sources,
  };
}
