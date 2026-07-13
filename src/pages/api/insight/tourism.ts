// src/pages/api/insight/tourism.ts
// Card-SPECIFIC drill-down for the TOURISM family — "who visits my region, who's surging, how do I
// capture them". Uses the analyst's new tourism models:
//   - semantic.vw_insight_event_ai_location_context: the location's region_code_nuts2 (join key, e.g. FR10)
//   - mart.fct_region_foreign_country_profile: foreign nationalities in the region by nights + YoY trend
//   - mart.fct_foreign_tourism_context_daily: who's in-season NOW (foreign school/public-holiday signal)
// Honest framing: this is REGIONAL tourism ("votre région"), NOT the venue's own visitors. Leads with
// nuitées (volume) + YoY (trend); the country_share_of_nonresident field is mis-scaled and dropped.
import type { APIRoute } from "astro";
import { makeBQClient } from "../../../lib/bq";
import { requireLocationOwnership } from "../../../lib/requireLocationOwnership";

const PROJECT = "muse-square-open-data";
const HOT_YOY = 20;   // YoY % at/above which a nationality is a "growing segment"
const TABLE_N = 6;
const POOL_N = 12;    // wider pool to spot growers below the top-volume set

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

export const GET: APIRoute = async ({ url, locals }) => {
  try {
    const bq = makeBQClient(process.env.BQ_PROJECT_ID || PROJECT);
    const location_id = requireString(url.searchParams.get("location_id"), "location_id");
    requireLocationOwnership(locals, location_id);
    const date = normalizeYmd(requireString(url.searchParams.get("date"), "date"));

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
    if (!nuts2) return json(200, { ok: true, found: false, date });

    // Impact = does this tourist flow match MY audience? tourist-facing (tourists/mixed) -> high, else low.
    const AUD_FR: Record<string, string> = { local: "clientèle locale", professionals: "professionnels", tourists: "touristes", students: "étudiants", mixed: "clientèle mixte" };
    const a1 = str(reg && reg.primary_audience_1), a2 = str(reg && reg.primary_audience_2);
    const audienceFr = [a1, a2].filter(Boolean).map((a) => AUD_FR[String(a).toLowerCase()] || a).join(", ") || "votre audience";
    const touristFacing = [a1, a2].some((a) => a != null && ["tourists", "mixed"].includes(String(a).toLowerCase()));
    const relevance = touristFacing ? "high" : "low";

    const [cRows, seasonRow] = await Promise.all([
      bq.query({
        query: `SELECT country_name_fr, nights_thousands, yoy_pct_change
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
    })).filter((c: any) => c.name);
    if (!pool.length) return json(200, { ok: true, found: false, date, region_name });

    const countries = pool.slice(0, TABLE_N);
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

    return json(200, {
      ok: true, found: true, date, region_name, relevance, lead, countries_intro, countries,
      growing: relevance === "high" ? growing : [],   // growth = opportunity framing only when it's your public
      decision_lines,
    });
  } catch (err: any) {
    console.error("[api/insight/tourism] Error", err);
    return json(500, { ok: false, error: err?.message ?? "Erreur interne" });
  }
};
