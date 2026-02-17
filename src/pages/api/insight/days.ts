import type { APIRoute } from "astro";
import { BigQuery } from "@google-cloud/bigquery";
import { renderPointsClesV1 } from "../../../lib/ai/points_cles/points_cles_v1";

const bq = new BigQuery({
  projectId: process.env.BQ_PROJECT_ID,
  keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
});

function requireString(v: string | undefined, name: string) {
  if (!v || !v.trim()) throw new Error(`Missing env var: ${name}`);
  return v.trim();
}

type RendererMode = "selected_day";

type DeterministicRenderInput = {
  mode: RendererMode;

  current_day: any | null;          // one row from vw_insight_event_selected_days_surface
  selection_days: any[];            // deduped selection (for rank + presence cues only)
  current_special_labels: string[]; // labels for current day only
  location_context: any | null;     // ✅ add
};

export function renderDeterministicText(input: DeterministicRenderInput): string | null {
  const { current_day, selection_days, current_special_labels } = input;

  const date = current_day?.date;
  const ISO = /^\d{4}-\d{2}-\d{2}$/;
  if (!current_day || typeof date !== "string" || !ISO.test(date)) return null;

  // ----------------
  // deterministic helpers
  // ----------------
  const isFiniteNum = (v: any): v is number =>
    typeof v === "number" && Number.isFinite(v);

  const numOrNull = (v: any): number | null =>
    isFiniteNum(v) ? v : null;

  const numOr = (v: any, fallback: number): number =>
    isFiniteNum(v) ? v : fallback;

  const fmt0 = (v: any): string | null =>
    isFiniteNum(v) ? String(Math.round(v)) : null;

  const fmt1 = (v: any): string | null =>
    isFiniteNum(v) ? v.toFixed(1) : null;

  function truncate(s: any, max = 140): string {
    const v = typeof s === "string" ? s.trim().replace(/\s+/g, " ") : "";
    if (!v) return "";
    if (v.length <= max) return v;
    return v.slice(0, max - 1).trimEnd() + "…";
  }

  function kmFromMeters(m: any): string | null {
    const x = numOrNull(m);
    if (x == null) return null;
    return (x / 1000).toFixed(1);
  }

  function isSameIndustry(eventIndustry: any, clientIndustry: any): boolean {
    const e = typeof eventIndustry === "string" ? eventIndustry.toLowerCase() : "";
    const c = typeof clientIndustry === "string" ? clientIndustry.toLowerCase() : "";
    if (!e || !c) return false;
    if (c === "cultural") return e.includes("culture") || e.includes("patrimoine");
    return false;
  }

  type TopEvent = {
    event_label?: string;
    city_name?: string;
    distance_m?: number;
    industry_code?: string;
    description?: string;
    event_uid?: string;
  };

  function getTopCompetitionEvents(day: any, location_context: any): TopEvent[] {
    const clientIndustry = location_context?.client_industry_code;

    const buckets = ["top_events_500m", "top_events_5km", "top_events_10km", "top_events_50km"];

    let pool: any[] = [];
    for (const k of buckets) {
      const arr = Array.isArray(day?.[k]) ? day[k] : [];
      if (arr.length) {
        pool = arr;
        break;
      }
    }
    if (!pool.length) return [];

    const same = pool.filter((e) => isSameIndustry(e?.industry_code, clientIndustry));
    const chosen = same.length ? same : pool;

    const sorted = chosen
      .slice()
      .sort(
        (a, b) =>
          Number(a?.distance_m ?? 1e18) - Number(b?.distance_m ?? 1e18) ||
          String(a?.event_uid ?? "").localeCompare(String(b?.event_uid ?? ""))
      );

    const isFarOnly =
      (!Array.isArray(day?.top_events_500m) || day.top_events_500m.length === 0) &&
      (!Array.isArray(day?.top_events_5km) || day.top_events_5km.length === 0) &&
      (!Array.isArray(day?.top_events_10km) || day.top_events_10km.length === 0) &&
      Array.isArray(day?.top_events_50km) &&
      day.top_events_50km.length > 0;

    if (isFarOnly && same.length) return sorted.slice(0, 1);

    return sorted.slice(0, 3);
  }

  const weekdayLabelFr = (isoDate: string): { label: string; isWeekend: boolean } => {
    const [y, m, d] = isoDate.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    const dow = dt.getUTCDay(); // 0 Sun .. 6 Sat
    const map = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
    return { label: map[dow] ?? "Jour", isWeekend: dow === 0 || dow === 6 };
  };

  const uniqStrings = (xs: any[]): string[] =>
    Array.from(
      new Set(
        (Array.isArray(xs) ? xs : [])
          .map((x) => (typeof x === "string" ? x.trim() : ""))
          .filter(Boolean)
      )
    );

  // ----------------
  // selection ranking (score) – deterministic
  // ----------------
  const ranked = (Array.isArray(selection_days) ? selection_days : [])
    .filter((d) => typeof d?.date === "string" && ISO.test(d.date) && isFiniteNum(d?.opportunity_score_final_local))
    .sort((a, b) => Number(b.opportunity_score_final_local) - Number(a.opportunity_score_final_local));

  const selectionCount = Array.isArray(selection_days) ? selection_days.length : 0;
  const score = numOr(current_day?.opportunity_score_final_local, NaN);
  const medal = String(current_day?.opportunity_medal ?? "").trim();

  // rank in selection (null-safe)
  let rank = 0;

  if (ranked.length > 0 && Number.isFinite(score)) {
    const idx = ranked.findIndex((d) => d?.date === date);
    rank = idx >= 0 ? idx + 1 : 0;
  }

  const isTop = rank === 1 && ranked.length >= 2;
  const isBottom = rank === ranked.length && ranked.length >= 2;

  // ----------------
  // weather “signal” + interpretation (NOT a dump)
  // ----------------
  const tMin = fmt0(current_day?.temperature_2m_min);
  const tMax = fmt0(current_day?.temperature_2m_max);

  const pp = numOr(current_day?.precipitation_probability_max_pct, 0);
  const pSum = numOr(current_day?.precipitation_sum_mm, 0);
  const wind = numOr(current_day?.wind_speed_10m_max, 0);

  const alertMax = numOr(current_day?.alert_level_max, 0);
  const lvlWind = numOr(current_day?.lvl_wind, 0);
  const lvlRain = numOr(current_day?.lvl_rain, 0);
  const lvlSnow = numOr(current_day?.lvl_snow, 0);
  const lvlHeat = numOr(current_day?.lvl_heat, 0);
  const lvlCold = numOr(current_day?.lvl_cold, 0);

  const anyAlert =
    alertMax > 0 ||
    lvlWind > 0 ||
    lvlRain > 0 ||
    lvlSnow > 0 ||
    lvlHeat > 0 ||
    lvlCold > 0;

  // coarse decision bands (tuned to your existing thresholds)
  const hasWeatherRisk =
    anyAlert ||
    (pp !== null && pp >= 60) ||
    (wind !== null && wind >= 40);

  const hasLightPrecip =
    !hasWeatherRisk &&
    ((pp !== null && pp > 0) || (pSum !== null && pSum > 0));

  // ----------------
  // competition interpretation: near vs far (this is the “AI” part)
  // ----------------
  const c500 = numOr(current_day?.events_within_500m_count, 0);
  const c5 = numOr(current_day?.events_within_5km_count, 0);
  const c10 = numOr(current_day?.events_within_10km_count, 0);
  const c50 = numOr(current_day?.events_within_50km_count, 0);
  const total = c500 + c5 + c10 + c50;

  const near = c500 + c5 + c10; // ≤10km buckets
  const farOnly = total > 0 && near === 0;

  // top competitors list (already in your row)
  const top = Array.isArray(current_day?.top_competitors) ? current_day.top_competitors : [];
  const top10 = top
    .filter((e: any) => {
      const rp = Number(e?.radius_precedence);
      // if your upstream uses precedence: 1=500m,2=5km,3=10km,4=50km (inferred from your usage)
      return Number.isFinite(rp) ? rp <= 3 : true;
    })
    .slice(0, 3);

  const pickString = (obj: any, keys: string[]): string | null => {
    for (const k of keys) {
      const v = obj?.[k];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
    return null;
  };
  
  // ---- Détails utiles (only if they add decision value) ----
  const details: string[] = [];

  // ----------------
  // Build output: TAKEAWAYS (no category dumps)
  // ----------------
  const { label: dowFr, isWeekend } = weekdayLabelFr(date);

  const out: string[] = [];
  out.push(`Points clés — ${dowFr} ${date}${isWeekend ? " (week-end)" : ""}`);

  // ---- Synthèse (3–5 bullets max) ----
  const synth: string[] = [];

  // Opportunity takeaway
  if (Number.isFinite(score)) {
    const rankTxt =
      ranked.length >= 2 && rank > 0 ? ` — ${isTop ? "meilleur" : isBottom ? "moins bon" : `${rank}e`} sur ${ranked.length} dans la sélection` : "";
    synth.push(`- Potentiel très élevé : ${Math.round(score)}${medal ? ` (${medal})` : ""}${rankTxt}`);
  } else if (medal) {
    synth.push(`- Potentiel : ${medal}`);
  }

  // Special day takeaway (only if any)
  const specials = uniqStrings([...(current_special_labels ?? []), ...(Array.isArray(current_day?.commercial_events) ? current_day.commercial_events : [])]);
  if (specials.length > 0) {
    synth.push(`- Contexte calendrier : ${specials.join(", ")}`);
  }

  // Weather takeaway (one-liner, not a dump)
  if (hasWeatherRisk) {
    const reasons: string[] = [];
    if (anyAlert) reasons.push("alertes météo actives");
    else {
      if (pp >= 60) reasons.push(`pluie probable (≥60%)`);
      if (wind >= 40) reasons.push(`vent fort (≥40 km/h)`);
    }
    synth.push(`- Météo : risque à surveiller (${reasons.join(", ") || "signal météo"})`);
  } else if (hasLightPrecip) {
    // your example: pp=0 but precipitation_sum=0.9 => “possible bruine / résidu”
    const bit = pSum > 0 && pp === 0 ? `précipitations faibles possibles (~${fmt1(pSum)} mm)` : `pluie faible possible`;
    synth.push(`- Météo : globalement favorable, ${bit}`);
  } else {
    synth.push(`- Météo : favorable (pas de signal à risque)`);
  }

  // Competition takeaway: near vs far
  if (total > 0) {
    if (near > 0) {
      synth.push(`- Concurrence : présente à proximité (≤10km) — pression potentielle`);
    } else if (farOnly) {
      synth.push(`- Concurrence : élevée mais diffuse (principalement au-delà de 10km)`);
    } else {
      synth.push(`- Concurrence : présente (à confirmer selon distance)`);
    }
  } else {
    synth.push(`- Concurrence : faible / inexistante (selon comptages)`);
  }

  if (synth.length > 0) out.push(["Synthèse", ...synth].join("\n"));

  // Temperature detail only if “cold morning” or missing
  const tMinNum = numOrNull(current_day?.temperature_2m_min);
  const tMaxNum = numOrNull(current_day?.temperature_2m_max);

  if (tMinNum !== null && tMinNum <= 2) {
    details.push(`- Froid le matin : ~${tMin ?? "?"}°`);
  }
  if (tMaxNum !== null && tMaxNum >= 30) {
    details.push(`- Chaleur possible : ~${tMax ?? "?"}°`);
  }

  // Weather detail: only the single strongest supporting metric
  if (anyAlert) {
    const bits: string[] = [];
    if (alertMax > 0) bits.push(`max ${alertMax}`);
    if (lvlWind > 0) bits.push(`vent ${lvlWind}`);
    if (lvlRain > 0) bits.push(`pluie ${lvlRain}`);
    if (lvlSnow > 0) bits.push(`neige ${lvlSnow}`);
    if (lvlHeat > 0) bits.push(`chaleur ${lvlHeat}`);
    if (lvlCold > 0) bits.push(`froid ${lvlCold}`);
    if (bits.length > 0) details.push(`- Alertes : ${bits.join(", ")}`);
  } else if (pp !== null && pp >= 60) {
    details.push(`- Pluie : probabilité max ~${Math.round(pp)}%`);
  } else if (wind !== null && wind >= 40) {
    details.push(`- Vent : max ~${Math.round(wind)} km/h`);
  } else if (pSum !== null && pSum > 0) {
    details.push(`- Précipitations : ~${fmt1(pSum)} mm (faible)`);
  }

  // Competition detail: only what changes the decision
    const topEvents = getTopCompetitionEvents(current_day, input.location_context);

    if (topEvents.length > 0) {
      details.push(`- Concurrents les plus proches :`);
      for (const e of topEvents) {
        const title =
          typeof e?.event_label === "string" && e.event_label.trim()
            ? e.event_label.trim()
            : "Événement";

        const city =
          typeof e?.city_name === "string" && e.city_name.trim()
            ? e.city_name.trim()
            : "";

        const km = kmFromMeters(e?.distance_m);
        const where = [city, km ? `${km} km` : ""].filter(Boolean).join(" — ");
        const desc = truncate(e?.description, 150);

        details.push(
          desc
            ? `  - ${title}${where ? ` — ${where}` : ""}\n    ${desc}`
            : `  - ${title}${where ? ` — ${where}` : ""}`
        );
      }
    }

  if (total > 0) {
    if (near > 0) {
      details.push(`- Concurrence proche (≤10km) : ${near} (500m:${c500}, 5km:${c5}, 10km:${c10})`);
    } else if (farOnly) {
      details.push(`- Concurrence surtout éloignée : 50km=${c50} (≤10km=0)`);
    }
  }

  if (details.length > 0) out.push(["À noter", ...details].join("\n"));

  return out.join("\n\n");
}

export const GET: APIRoute = async ({ url, locals }) => {
  const location_id =
    url.searchParams.get("location_id") ??
    ((locals as any)?.location_id ? String((locals as any).location_id).trim() : null);

  const selected_dates_raw = url.searchParams.get("selected_dates");
  const current_date_raw = url.searchParams.get("current_date"); // optional now

  if (!location_id || !selected_dates_raw) {
    return new Response(
      JSON.stringify({
        error: "Missing location_id or selected_dates",
        debug: {
          has_locals_location_id: Boolean((locals as any)?.location_id),
          location_id_from_query: url.searchParams.get("location_id"),
          selected_dates_from_query: url.searchParams.get("selected_dates"),
          current_date_from_query: url.searchParams.get("current_date"),
        },
      }),
      {
        status: 400,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      }
    );
  }

  const selected_dates = selected_dates_raw
    .split(",")
    .map((d) => d.trim())
    .filter(Boolean);

  const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  if (!selected_dates.every((d) => ISO_DATE_RE.test(d))) {
    return new Response(JSON.stringify({ error: "selected_dates must be YYYY-MM-DD" }), {
      status: 400,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  }

  // ✅ deterministic fallback: current_date = query param OR first selected date
  const current_date =
    (typeof current_date_raw === "string" && current_date_raw.trim() ? current_date_raw.trim() : selected_dates[0] ?? "");

  if (!ISO_DATE_RE.test(current_date)) {
    return new Response(JSON.stringify({ error: "current_date must be YYYY-MM-DD" }), {
      status: 400,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  }

  if (selected_dates.length === 0) {
    return new Response(
      JSON.stringify({ error: "selected_dates empty after normalization" }),
      {
        status: 400,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      }
    );
  }

  if (selected_dates.length > 7) {
    return new Response(
      JSON.stringify({ error: "selected_dates must contain at most 7 dates" }),
      {
        status: 400,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      }
    );
  }

  const daysQuery = `
    SELECT
      sd.*
    FROM \`muse-square-open-data.semantic.vw_insight_event_selected_days_surface\` sd
    WHERE sd.location_id = @location_id
      AND sd.date IN UNNEST(ARRAY(
        SELECT PARSE_DATE('%Y-%m-%d', d)
        FROM UNNEST(@selected_dates) AS d
      ))
    ORDER BY sd.date ASC
  `;

  const locationContextQuery = `
    SELECT
      *
    FROM \`muse-square-open-data.semantic.vw_insight_event_ai_location_context\`
    WHERE location_id = @location_id
    LIMIT 1
  `;

  try {
    const [daysRows] = await bq.query({
      query: daysQuery,
      params: {
        location_id,
        selected_dates,
      },
    });

    const [locationContextRows] = await bq.query({
      query: locationContextQuery,
      params: { location_id },
    });

        const location_context = locationContextRows?.[0] ?? null;

    // -----------------------------
    // Normalize days (required)
    // -----------------------------
    const rawDays = Array.isArray(daysRows) ? daysRows : [];

    const days = rawDays
      .map((r: any) => ({
        ...r,
        // BigQuery DATE often arrives as { value: "YYYY-MM-DD" } or "YYYY-MM-DD"
        date: (r?.date?.value ?? r?.date ?? null) as string | null,
      }))
      .filter((r: any) => typeof r.date === "string" && r.date.length === 10);

    // -----------------------------
    // Helpers (minimal, deterministic)
    // -----------------------------
    function nonEmptyString(v: any): string | null {
      const s = typeof v === "string" ? v.trim() : "";
      return s ? s : null;
    }

    function normalizeStringArray(v: any): string[] {
      if (!Array.isArray(v)) return [];
      const out = v
        .map((x) => (typeof x === "string" ? x.trim() : ""))
        .filter(Boolean);
      return Array.from(new Set(out));
    }

    // Translate known commercial event labels to FR (same as Month)
    function translateEventLabelFr(s: any): any {
      const v = typeof s === "string" ? s.trim() : "";
      if (!v) return s;

      const dict: Record<string, string> = {
        "French Winter Sales": "Soldes d’hiver",
        "French Summer Sales": "Soldes d’été",
        "Valentine's Day": "Saint-Valentin",
      };

      return dict[v] ?? v;
    }

    function normalizeCommercialEvents(v: any): string[] {
      // array<string>
      if (Array.isArray(v) && v.every((x) => typeof x === "string")) {
        return Array.from(new Set(v.map((x) => x.trim()).filter(Boolean)));
      }

      // array<{event_name: string}>  (common dbt shape)
      if (Array.isArray(v) && v.length && typeof v[0] === "object") {
        const names = v
          .map((x) => (x && typeof x.event_name === "string" ? x.event_name.trim() : ""))
          .filter(Boolean);
        return Array.from(new Set(names));
      }

      // string or other scalar
      if (typeof v === "string") {
        const s = v.trim();
        return s ? [s] : [];
      }

      return [];
    }

    // -----------------------------
    // Deterministic text (mode = selection)
    // -----------------------------

    // 1) Dedup by date (selection must never duplicate dates)
    const days_deduped = (() => {
      const byDate = new Map<string, any>();

      for (const r of Array.isArray(days) ? days : []) {
        const d = typeof r?.date === "string" ? r.date.trim() : "";
        if (!d) continue;

        // Keep first occurrence; if you want stronger determinism:
        // prefer row with non-null score, else keep first.
        if (!byDate.has(d)) {
          byDate.set(d, r);
          continue;
        }

        const cur = byDate.get(d);
        const curScore = Number(cur?.opportunity_score_final_local);
        const nextScore = Number(r?.opportunity_score_final_local);

        if (!Number.isFinite(curScore) && Number.isFinite(nextScore)) {
          byDate.set(d, r);
        }
      }

      return Array.from(byDate.values()).sort((a, b) => String(a.date).localeCompare(String(b.date)));
    })();

    // 2) Recompute everything from deduped days (single source of truth)
    const computed_metrics = (() => {
      const out = {
        days_count: days_deduped.length,
        days_a: 0,
        days_b: 0,
        days_c: 0,
        days_risk: 0,
        score_min: null as number | null,
        score_max: null as number | null,
      };

      const medalBucket = (m: any): "A" | "B" | "C" | null => {
        const s = String(m ?? "").trim().toUpperCase();
        if (!s) return null;
        if (s.startsWith("A")) return "A"; // handles A, A+, A-, A++
        if (s.startsWith("B")) return "B";
        if (s.startsWith("C")) return "C";
        return null;
      };

      for (const d of days_deduped) {
        const s = Number(d?.opportunity_score_final_local);
        if (Number.isFinite(s)) {
          out.score_min = out.score_min === null ? s : Math.min(out.score_min, s);
          out.score_max = out.score_max === null ? s : Math.max(out.score_max, s);
        }

        const b = medalBucket(d?.opportunity_medal);
        if (b === "A") out.days_a += 1;
        else if (b === "B") out.days_b += 1;
        else if (b === "C") out.days_c += 1;

        if (d?.is_major_realization_risk_flag === true || d?.is_forced_regime_c_flag === true) {
          out.days_risk += 1;
        }
      }

      return out;
    })();

    function topNByScore(xs: any[], n: number, dir: "asc" | "desc") {
      const arr = (Array.isArray(xs) ? xs : [])
        .filter((d) => typeof d?.date === "string" && Number.isFinite(Number(d?.opportunity_score_final_local)));

      arr.sort((a, b) => {
        const sa = Number(a.opportunity_score_final_local);
        const sb = Number(b.opportunity_score_final_local);
        return dir === "asc" ? sa - sb : sb - sa;
      });

      return arr.slice(0, n);
    }

    function worstNByWeather(xs: any[], n: number) {
      const arr = (Array.isArray(xs) ? xs : []).filter((d) => typeof d?.date === "string");

      arr.sort((a, b) => {
        const pa = Number(a?.precipitation_probability_max_pct ?? -1);
        const pb = Number(b?.precipitation_probability_max_pct ?? -1);
        if (Number.isFinite(pb) && Number.isFinite(pa) && pb !== pa) return pb - pa;

        const wa = Number(a?.wind_speed_10m_max ?? -1);
        const wb = Number(b?.wind_speed_10m_max ?? -1);
        if (Number.isFinite(wb) && Number.isFinite(wa) && wb !== wa) return wb - wa;

        const aa = Number(a?.alert_level_max ?? 0);
        const ab = Number(b?.alert_level_max ?? 0);
        if (Number.isFinite(ab) && Number.isFinite(aa) && ab !== aa) return ab - aa;

        return 0;
      });

      return arr.slice(0, n);
    }

    // 3) Rankings on deduped days
    const best_score_days = topNByScore(days_deduped, 3, "desc");

    // 4) Weather ranking + gating (use correct field names)
    const worst_weather_days = worstNByWeather(days_deduped, 3);

    const worst_weather_days_gated = worst_weather_days.filter((d: any) => {
      const alert = Number(d?.alert_level_max ?? 0);
      const pp = Number(d?.precipitation_probability_max_pct ?? -1);
      const wind = Number(d?.wind_speed_10m_max ?? -1);

      if (Number.isFinite(alert) && alert > 0) return true;
      if (Number.isFinite(pp) && pp >= 60) return true;
      if (Number.isFinite(wind) && wind >= 40) return true;
      return false;
    });

    // 5) Special days extraction MUST also run on deduped days
    const special_days = (() => {
      const out: Array<{ date: string; labels: string[] }> = [];

      for (const d of days_deduped) {
        const date = typeof d?.date === "string" ? d.date.trim() : "";
        if (!date) continue;

        const labels: string[] = [];

        const holiday = nonEmptyString(d?.holiday_name);
        if (holiday) labels.push(holiday);

        const vacation = nonEmptyString(d?.vacation_name);
        if (vacation) labels.push(vacation);

        // commercial_events could be:
        // - array<string>
        // - array<{event_name:string}>
        // - string
        const ce = normalizeCommercialEvents(d?.commercial_events);
        if (ce.length) labels.push(...ce);

        const uniq = Array.from(new Set(labels.map((x) => String(x).trim()).filter(Boolean)));
        if (uniq.length) out.push({ date, labels: uniq });
      }

      out.sort((a, b) => a.date.localeCompare(b.date));
      return out;
    })();

    // 6) (Optional but recommended) Competition summary inputs
    const competition_summary = (() => {
      // Simple deterministic: max events in 50km within the selection + how many days have any competition
      let max50 = 0;
      let daysWithCompetition = 0;

      for (const d of days_deduped) {
        const c =
          Number(d?.events_within_500m_count ?? 0) +
          Number(d?.events_within_5km_count ?? 0) +
          Number(d?.events_within_10km_count ?? 0) +
          Number(d?.events_within_50km_count ?? 0);

        if (Number.isFinite(c) && c > 0) daysWithCompetition += 1;

        const v50 = Number(d?.events_within_50km_count ?? 0);
        if (Number.isFinite(v50)) max50 = Math.max(max50, v50);
      }

      return { daysWithCompetition, max50 };
    })();

    const current_day =
      days_deduped.find((d) => d?.date === current_date) ?? null;

    const current_special_labels =
      special_days.find((x) => x.date === current_date)?.labels ?? [];

    const comparison = {
      selection_count: days_deduped.length,
      rank_by_score: null as number | null,
      has_any_weather_signal_in_selection: false,
      is_current_weather_signal: false,
      has_any_competition_in_selection: false,
      is_current_competition: false,
    };

    const points_cles_text = renderPointsClesV1({
      mode: "selected_day",
      current_day,
      selection_days: days_deduped,
      current_special_labels,
      location_context,
    });

    return new Response(
      JSON.stringify({
        location_id,
        selected_dates,
        days: days_deduped,
        points_cles: {
          location_context,
          text: points_cles_text,
        },
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      }
    );
  } catch (err) {
    console.error("[api/insight/days] Error", err);
    return new Response(
      JSON.stringify({ error: "Internal error querying semantic surfaces" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      }
    );
  }
};

