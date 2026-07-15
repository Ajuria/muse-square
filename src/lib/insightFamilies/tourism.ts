// src/lib/insightFamilies/tourism.ts
// TOURISM family provider — "who visits my region, who's surging, how do I capture them".
// Extracted VERBATIM from the deep-page endpoint (src/pages/api/insight/tourism.ts) so the deep page
// stays byte-identical — the endpoint is now a thin wrapper over run(). Adds `facts` + `sources`.
//
// Honest framing, and the reason the `relevance` rule lives HERE rather than being re-derived: this is
// REGIONAL tourism ("votre région"), NOT the venue's own visitors. If the venue's declared audience is
// not tourist-facing, the flow is context, not opportunity — the card says so plainly (relevance
// "low"), and the facts must say the same thing or the model will sell the boom back to an operator
// whose public it isn't. Leads with nuitées (volume) + YoY (trend); country_share_of_nonresident is
// mis-scaled and stays dropped.
import type { FamilyResult, FamilyFact } from "./types";

const PROJECT = "muse-square-open-data";
const HOT_YOY = 20;   // YoY % at/above which a nationality is a "growing segment"
const TABLE_N = 6;
const POOL_N = 12;    // wider pool to spot growers below the top-volume set

const num = (v: any): number | null => (v == null ? null : Number(v && typeof v === "object" && "value" in v ? v.value : v));
const str = (v: any): string | null => { const s = v == null ? "" : String(v).trim(); return s || null; };
// French formatting — mirrors the app's fr-FR convention (frInt/frDec live client-side only, so
// buildIdentityFacts keeps the same local copy). toLocaleString emits U+202F; the grounding
// validator's extractNumbers already accepts it.
const frInt = (n: number): string => Math.round(n).toLocaleString("fr-FR");
// "de Île-de-France" is not French. Elide before a vowel/h (accents included): d'Île-de-France,
// d'Occitanie, d'Auvergne… but "de Bretagne", "de Normandie".
const deRegion = (name: string): string =>
  /^[aeiouyàâäéèêëîïôöùûüh]/i.test(name.normalize("NFC")) ? `d'${name}` : `de ${name}`;

export async function tourismFamily(bq: any, location_id: string, date: string): Promise<FamilyResult> {
  const empty = (extra: Record<string, unknown> = {}): FamilyResult =>
    ({ found: false, data: { found: false, date, ...extra }, facts: [], sources: [] });

  // Region (NUTS2) of the location — the join key into the foreign-country profile.
  const [regRows] = await bq.query({
    query: `SELECT region_code_nuts2, region_name, primary_audience_1, primary_audience_2
            FROM \`${PROJECT}.semantic.vw_insight_event_ai_location_context\`
            WHERE location_id = @location_id LIMIT 1`,
    params: { location_id }, types: { location_id: "STRING" }, location: "EU",
  });
  const reg: any = Array.isArray(regRows) && regRows.length ? regRows[0] : null;
  const nuts2 = str(reg && reg.region_code_nuts2);
  const region_name = str(reg && reg.region_name) || "votre région";
  if (!nuts2) return empty();

  // Impact = does this tourist flow match MY audience? tourist-facing (tourists/mixed) -> high, else low.
  // NOTE: the endpoint's own register ("clientèle locale") — differs from profileLabels.AUDIENCE_FR
  // ("résidents locaux"). Kept VERBATIM so the deep page is unchanged; reconciling is an owner call.
  const AUD_FR: Record<string, string> = { local: "clientèle locale", professionals: "professionnels", tourists: "touristes", students: "étudiants", mixed: "clientèle mixte" };
  const a1 = str(reg && reg.primary_audience_1), a2 = str(reg && reg.primary_audience_2);
  const audienceFr = [a1, a2].filter(Boolean).map((a) => AUD_FR[String(a).toLowerCase()] || a).join(", ") || "votre audience";
  const touristFacing = [a1, a2].some((a) => a != null && ["tourists", "mixed"].includes(String(a).toLowerCase()));
  const relevance = touristFacing ? "high" : "low";

  const [cRows, seasonRow] = await Promise.all([
    bq.query({
      // reference_year is selected for the FACTS only (a volume with no period lets the model invent
      // one); `countries` keeps its exact pre-extraction shape {name, nights_k, yoy_pct}.
      query: `SELECT country_name_fr, nights_thousands, yoy_pct_change, reference_year
              FROM \`${PROJECT}.mart.fct_region_foreign_country_profile\`
              WHERE region_code = @nuts2
              QUALIFY ROW_NUMBER() OVER (PARTITION BY country_name_fr ORDER BY reference_year DESC) = 1
              ORDER BY nights_thousands DESC LIMIT ${POOL_N}`,
      params: { nuts2 }, types: { nuts2: "STRING" }, location: "EU",
    }).then((r: any) => r[0]).catch(() => []),
    bq.query({
      query: `SELECT has_foreign_school_holiday_signal AS sig, ARRAY_LENGTH(countries_on_school_holiday) AS n_school
              FROM \`${PROJECT}.mart.fct_foreign_tourism_context_daily\` WHERE date = PARSE_DATE('%Y-%m-%d', @date) LIMIT 1`,
      params: { date }, types: { date: "STRING" }, location: "EU",
    }).then((r: any) => r[0]?.[0]).catch(() => null),
  ]);

  const pool = (Array.isArray(cRows) ? cRows : []).map((r: any) => ({
    name: str(r.country_name_fr), nights_k: num(r.nights_thousands),
    yoy_pct: r.yoy_pct_change != null ? Math.round(num(r.yoy_pct_change)! * 10) / 10 : null,
    year: num(r.reference_year),
  })).filter((c: any) => c.name);
  if (!pool.length) return empty({ region_name });

  // `countries` must keep its pre-extraction shape — year is fact-only, so strip it here.
  const countries = pool.slice(0, TABLE_N).map((c: any) => ({ name: c.name, nights_k: c.nights_k, yoy_pct: c.yoy_pct }));
  const growing = pool
    .filter((c: any) => c.yoy_pct != null && c.yoy_pct >= HOT_YOY && (c.nights_k ?? 0) >= 200)
    .sort((a: any, b: any) => (b.yoy_pct as number) - (a.yoy_pct as number))
    .slice(0, 3)
    .map((c: any) => ({ name: c.name, yoy_pct: Math.round(c.yoy_pct) }));

  const inSeason = !!(seasonRow && (seasonRow.sig === true || seasonRow.sig === "true"));
  const nSchool = num(seasonRow && seasonRow.n_school);
  const growLine = growing.length ? growing.map((c: any) => `${c.name} +${c.yoy_pct} %`).join(", ") : null;

  let lead: string;
  let countries_intro: string | null = null;
  const decision_lines: { head: string; body: string }[] = [];

  if (relevance === "high") {
    // Tourist-facing venue: this flow IS your public.
    lead = inSeason
      ? `Pleine saison — les visiteurs étrangers affluent en ${region_name} et correspondent à votre public. Captez ce flux.`
      : `Vos visiteurs étrangers en ${region_name} — votre public entrant.`;
    const top2 = countries.slice(0, 2).map((c: any) => c.name).join(" et ");
    decision_lines.push({ head: "Communiquez en anglais", body: `${top2} dominent — supports et accueil en anglais pour vos événements.` });
    if (growLine) decision_lines.push({ head: "Ciblez les segments en croissance", body: `${growLine} : adressez ces publics avant vos concurrents.` });
    if (inSeason) decision_lines.push({ head: "Calez vos temps forts sur les pics", body: "L'Europe est en vacances scolaires — programmez vos événements grand public sur cette fenêtre entrante." });
  } else {
    // Not tourist-facing: truth-first, this boom is not your cible.
    lead = `Le tourisme afflue en ${region_name}${inSeason ? " (pleine saison)" : ""}, mais votre cœur de cible (${audienceFr}) n'est pas ce public — impact direct limité.`;
    countries_intro = "Qui visite la région, pour contexte :";
    decision_lines.push({ head: "N'y investissez pas par défaut", body: `Ces visiteurs (loisir) ne correspondent pas à votre audience (${audienceFr}).` });
    decision_lines.push({ head: "Pour capter ce flux, une offre dédiée", body: `Il faudrait un format pensé pour eux (ex. événements en anglais pour ${countries[0] ? countries[0].name : "le public dominant"}) — un choix stratégique, pas un réflexe. Sinon, restez concentré sur votre audience.` });
  }

  // ── FACTS — always REGIONAL ("en <région>"), never "vos visiteurs": this measures the region, not
  // the venue's own door. Conflating the two is how a model turns regional context into a false claim
  // about the operator's customers.
  const facts: FamilyFact[] = [];
  const top = pool[0];
  if (top?.nights_k != null) {
    facts.push({
      fact_fr: `En ${region_name}, la 1re nationalité étrangère en volume est ${top.name} : ${frInt(top.nights_k * 1000)} nuitées${top.year != null ? ` (${top.year})` : ""}.`,
      claim_type: "observed",
    });
  }
  const others = countries.slice(1, 4).map((c: any) => c.name).filter(Boolean);
  if (others.length) {
    facts.push({ fact_fr: `Viennent ensuite, en ${region_name} : ${others.join(", ")}.`, claim_type: "observed" });
  }
  // Growth is stated for BOTH relevances — it is an observation about the region. What changes is the
  // framing (`growing` stays [] in the card when it is not your public), never the truth of the number.
  const topGrow = pool.filter((c: any) => c.yoy_pct != null && c.yoy_pct >= HOT_YOY && (c.nights_k ?? 0) >= 200)
    .sort((a: any, b: any) => (b.yoy_pct as number) - (a.yoy_pct as number))[0];
  if (topGrow) {
    facts.push({
      fact_fr: `Segment en plus forte croissance en ${region_name} : ${topGrow.name}, +${Math.round(topGrow.yoy_pct as number)} % de nuitées sur un an.`,
      claim_type: "observed",
    });
  }
  if (inSeason) {
    facts.push({
      fact_fr: `Signal de vacances scolaires étrangères actif aujourd'hui${nSchool != null && nSchool > 0 ? ` : ${nSchool} pays concernés` : ""}.`,
      claim_type: "observed",
    });
  }
  // The relevance verdict IS the operator-relevant truth — declared audience, stated plainly.
  facts.push({
    fact_fr: relevance === "high"
      ? `Votre public déclaré (${audienceFr}) correspond à ce flux touristique : il vous concerne directement.`
      : `Votre public déclaré est ${audienceFr} — pas les visiteurs étrangers ${deRegion(region_name)}. Ce flux est un contexte, pas votre cible.`,
    claim_type: "observed",
  });

  const sources = [`Nuitées étrangères par nationalité — ${region_name} (données régionales, pas vos visiteurs)`];
  if (inSeason) sources.push("Calendrier des vacances scolaires étrangères");
  sources.push("Votre profil — public déclaré");

  return {
    found: true,
    data: {
      found: true, date, region_name, relevance, lead, countries_intro, countries,
      growing: relevance === "high" ? growing : [],   // growth = opportunity framing only when it's your public
      decision_lines,
    },
    facts,
    sources,
  };
}
