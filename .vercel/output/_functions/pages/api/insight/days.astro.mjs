import { BigQuery } from "@google-cloud/bigquery";
import { renderers } from "../../../renderers.mjs";
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const toFiniteNumberOrNull = (v) => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
const numOrNull = (v) => toFiniteNumberOrNull(v);
const numOr = (v, fallback) => {
  const n = toFiniteNumberOrNull(v);
  return n === null ? fallback : n;
};
const weekdayLabelFr = (isoDate) => {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = dt.getUTCDay();
  const map = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
  return { label: map[dow] ?? "Jour", isWeekend: dow === 0 || dow === 6 };
};
const uniqStrings = (xs) => Array.from(
  new Set(
    (Array.isArray(xs) ? xs : []).map((x) => typeof x === "string" ? x.trim() : "").filter(Boolean)
  )
);
const isSameIndustry = (eventIndustry, clientIndustry) => {
  const e = typeof eventIndustry === "string" ? eventIndustry.toLowerCase() : "";
  const c = typeof clientIndustry === "string" ? clientIndustry.toLowerCase() : "";
  if (!e || !c) return false;
  if (c === "cultural") {
    return e.includes("culture") || e.includes("patrimoine");
  }
  return false;
};
const getTopCompetitionEvents = (day, location_context) => {
  const clientIndustry = location_context?.client_industry_code ?? null;
  const buckets = [
    "top_events_500m",
    "top_events_5km",
    "top_events_10km",
    "top_events_50km"
  ];
  let pool = [];
  for (const k of buckets) {
    const arr = Array.isArray(day?.[k]) ? day[k] : [];
    if (arr.length) {
      pool = arr;
      break;
    }
  }
  if (!pool.length) return [];
  const sameIndustry = pool.filter(
    (e) => isSameIndustry(e?.industry_code, clientIndustry)
  );
  const chosen = sameIndustry.length ? sameIndustry : pool;
  const sorted = chosen.slice().sort(
    (a, b) => Number(a?.distance_m ?? 1e18) - Number(b?.distance_m ?? 1e18) || String(a?.event_uid ?? "").localeCompare(String(b?.event_uid ?? ""))
  );
  const farOnly = (!Array.isArray(day?.top_events_500m) || day.top_events_500m.length === 0) && (!Array.isArray(day?.top_events_5km) || day.top_events_5km.length === 0) && (!Array.isArray(day?.top_events_10km) || day.top_events_10km.length === 0) && Array.isArray(day?.top_events_50km) && day.top_events_50km.length > 0;
  if (farOnly && sameIndustry.length) return sorted.slice(0, 1);
  return sorted.slice(0, 3);
};
function renderPointsClesV1(input) {
  const { current_day, selection_days, current_special_labels, location_context } = input;
  const date = current_day?.date;
  if (!current_day || typeof date !== "string" || !ISO_DATE_RE.test(date)) {
    return null;
  }
  const ranked = (Array.isArray(selection_days) ? selection_days : []).filter(
    (d) => typeof d?.date === "string" && ISO_DATE_RE.test(d.date) && numOrNull(d?.opportunity_score_final_local) !== null
  ).sort(
    (a, b) => Number(b.opportunity_score_final_local) - Number(a.opportunity_score_final_local)
  );
  const score = numOrNull(current_day?.opportunity_score_final_local);
  let rank = null;
  if (score !== null && ranked.length >= 2) {
    const idx = ranked.findIndex((d) => d.date === date);
    rank = idx >= 0 ? idx + 1 : null;
  }
  const pp = numOrNull(current_day?.precipitation_probability_max_pct);
  const pSum = numOrNull(current_day?.precipitation_sum_mm);
  const wind = numOrNull(current_day?.wind_speed_10m_max);
  const alertMax = numOr(current_day?.alert_level_max, 0);
  const lvlWind = numOr(current_day?.lvl_wind, 0);
  const lvlRain = numOr(current_day?.lvl_rain, 0);
  const lvlSnow = numOr(current_day?.lvl_snow, 0);
  const lvlHeat = numOr(current_day?.lvl_heat, 0);
  const lvlCold = numOr(current_day?.lvl_cold, 0);
  const anyAlert = alertMax > 0 || lvlWind > 0 || lvlRain > 0 || lvlSnow > 0 || lvlHeat > 0 || lvlCold > 0;
  const hasWeatherRisk = anyAlert || pp !== null && pp >= 60 || wind !== null && wind >= 40;
  const isOutdoor = location_context?.is_outdoor_event;
  let weatherSynth = null;
  if (hasWeatherRisk) {
    if (isOutdoor === true) {
      weatherSynth = "Risque météo à intégrer (impact possible sur la fréquentation)";
    } else if (isOutdoor === false) {
      weatherSynth = "Risque météo surtout logistique, impact limité pour un événement indoor";
    } else {
      weatherSynth = "Signal météo à surveiller (impact dépend du format)";
    }
  } else {
    if (isOutdoor === true) {
      weatherSynth = "Conditions favorables pour un événement en extérieur";
    } else if (isOutdoor === false) {
      weatherSynth = "Aucun enjeu météo pour ce type d’événement";
    } else {
      weatherSynth = "Pas de signal météo critique";
    }
  }
  const specials = uniqStrings(current_special_labels ?? []);
  let calendarSynth = null;
  if (specials.length > 0) {
    const hasVacations = specials.some(
      (s) => s.toLowerCase().includes("vacance")
    );
    if (hasVacations) {
      calendarSynth = "Période de vacances : audience locale possiblement réduite, visiteurs extérieurs à capter";
    } else {
      calendarSynth = "Contexte calendrier spécifique : adaptation de la cible ou du format recommandée";
    }
  }
  const c500 = numOr(current_day?.events_within_500m_count, 0);
  const c5 = numOr(current_day?.events_within_5km_count, 0);
  const c10 = numOr(current_day?.events_within_10km_count, 0);
  const c50 = numOr(current_day?.events_within_50km_count, 0);
  const near = c500 + c5 + c10;
  const total = near + c50;
  let competitionSynth = null;
  if (near > 0) {
    competitionSynth = "Risque de cannibalisation directe ce jour-là";
  } else if (total > 0) {
    competitionSynth = "Concurrence présente, mais peu susceptible d’impacter directement votre événement";
  } else {
    competitionSynth = "Aucune pression concurrentielle significative ce jour-là";
  }
  const { label: dowFr, isWeekend } = weekdayLabelFr(date);
  const out = [];
  out.push(`Points clés — ${dowFr} ${date}${isWeekend ? " (week-end)" : ""}`);
  const synth = [];
  if (rank !== null && ranked.length >= 2) {
    const n = ranked.length;
    if (rank === 1) {
      synth.push(`- Meilleure option de la sélection`);
    } else if (rank === n) {
      synth.push(`- Option la moins favorable de la sélection`);
    } else if (n % 2 === 1 && rank === (n + 1) / 2) {
      synth.push(`- Option médiane de la sélection`);
    } else {
      synth.push(`- Option intermédiaire de la sélection`);
    }
  }
  if (calendarSynth) synth.push(`- ${calendarSynth}`);
  if (weatherSynth) synth.push(`- ${weatherSynth}`);
  if (competitionSynth) synth.push(`- ${competitionSynth}`);
  if (synth.length > 0) {
    out.push(["Synthèse", ...synth.slice(0, 5)].join("\n"));
  }
  const details = [];
  if (anyAlert) {
    const bits = [];
    if (alertMax > 0) bits.push(`alerte ${alertMax}`);
    if (lvlWind > 0) bits.push(`vent ${lvlWind}`);
    if (lvlRain > 0) bits.push(`pluie ${lvlRain}`);
    if (lvlSnow > 0) bits.push(`neige ${lvlSnow}`);
    if (lvlHeat > 0) bits.push(`chaleur ${lvlHeat}`);
    if (lvlCold > 0) bits.push(`froid ${lvlCold}`);
    if (bits.length) details.push(`- Alertes météo : ${bits.join(", ")}`);
  } else if (pp !== null && pp >= 60) {
    details.push(`- Pluie probable (≥60%)`);
  } else if (wind !== null && wind >= 40) {
    details.push(`- Vent fort (≥40 km/h)`);
  } else if (pSum !== null && pSum > 0 && isOutdoor === true) {
    details.push(`- Précipitations faibles possibles`);
  }
  const topEvents = getTopCompetitionEvents(current_day, location_context);
  if (topEvents.length === 1) {
    const e = topEvents[0];
    const type = typeof e?.event_label === "string" && e.event_label.toLowerCase().includes("exposition") ? "une exposition" : "un événement";
    const city = typeof e?.city_name === "string" && e.city_name.trim() ? e.city_name.trim() : "à proximité";
    details.push(
      `- L’événement concurrent le plus proche est ${type} à ${city}`
    );
  } else if (topEvents.length > 1) {
    const city = typeof topEvents[0]?.city_name === "string" && topEvents[0].city_name.trim() ? topEvents[0].city_name.trim() : "à proximité";
    details.push(
      `- Les événements concurrents les plus proches sont principalement des expositions situées à ${city}`
    );
  }
  if (details.length > 0) {
    out.push(["À noter", ...details].join("\n"));
  }
  return out.join("\n\n");
}
const bq = new BigQuery({
  projectId: process.env.BQ_PROJECT_ID,
  keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS
});
function renderDeterministicText(input) {
  const { current_day, selection_days, current_special_labels } = input;
  const date = current_day?.date;
  const ISO = /^\d{4}-\d{2}-\d{2}$/;
  if (!current_day || typeof date !== "string" || !ISO.test(date)) return null;
  const isFiniteNum = (v) => typeof v === "number" && Number.isFinite(v);
  const numOrNull2 = (v) => isFiniteNum(v) ? v : null;
  const numOr2 = (v, fallback) => isFiniteNum(v) ? v : fallback;
  const fmt0 = (v) => isFiniteNum(v) ? String(Math.round(v)) : null;
  const fmt1 = (v) => isFiniteNum(v) ? v.toFixed(1) : null;
  function truncate(s, max = 140) {
    const v = typeof s === "string" ? s.trim().replace(/\s+/g, " ") : "";
    if (!v) return "";
    if (v.length <= max) return v;
    return v.slice(0, max - 1).trimEnd() + "…";
  }
  function kmFromMeters(m) {
    const x = numOrNull2(m);
    if (x == null) return null;
    return (x / 1e3).toFixed(1);
  }
  function isSameIndustry2(eventIndustry, clientIndustry) {
    const e = typeof eventIndustry === "string" ? eventIndustry.toLowerCase() : "";
    const c = typeof clientIndustry === "string" ? clientIndustry.toLowerCase() : "";
    if (!e || !c) return false;
    if (c === "cultural") return e.includes("culture") || e.includes("patrimoine");
    return false;
  }
  function getTopCompetitionEvents2(day, location_context) {
    const clientIndustry = location_context?.client_industry_code;
    const buckets = ["top_events_500m", "top_events_5km", "top_events_10km", "top_events_50km"];
    let pool = [];
    for (const k of buckets) {
      const arr = Array.isArray(day?.[k]) ? day[k] : [];
      if (arr.length) {
        pool = arr;
        break;
      }
    }
    if (!pool.length) return [];
    const same = pool.filter((e) => isSameIndustry2(e?.industry_code, clientIndustry));
    const chosen = same.length ? same : pool;
    const sorted = chosen.slice().sort(
      (a, b) => Number(a?.distance_m ?? 1e18) - Number(b?.distance_m ?? 1e18) || String(a?.event_uid ?? "").localeCompare(String(b?.event_uid ?? ""))
    );
    const isFarOnly = (!Array.isArray(day?.top_events_500m) || day.top_events_500m.length === 0) && (!Array.isArray(day?.top_events_5km) || day.top_events_5km.length === 0) && (!Array.isArray(day?.top_events_10km) || day.top_events_10km.length === 0) && Array.isArray(day?.top_events_50km) && day.top_events_50km.length > 0;
    if (isFarOnly && same.length) return sorted.slice(0, 1);
    return sorted.slice(0, 3);
  }
  const weekdayLabelFr2 = (isoDate) => {
    const [y, m, d] = isoDate.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    const dow = dt.getUTCDay();
    const map = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
    return { label: map[dow] ?? "Jour", isWeekend: dow === 0 || dow === 6 };
  };
  const uniqStrings2 = (xs) => Array.from(
    new Set(
      (Array.isArray(xs) ? xs : []).map((x) => typeof x === "string" ? x.trim() : "").filter(Boolean)
    )
  );
  const ranked = (Array.isArray(selection_days) ? selection_days : []).filter((d) => typeof d?.date === "string" && ISO.test(d.date) && isFiniteNum(d?.opportunity_score_final_local)).sort((a, b) => Number(b.opportunity_score_final_local) - Number(a.opportunity_score_final_local));
  Array.isArray(selection_days) ? selection_days.length : 0;
  const score = numOr2(current_day?.opportunity_score_final_local, NaN);
  const medal = String(current_day?.opportunity_medal ?? "").trim();
  let rank = 0;
  if (ranked.length > 0 && Number.isFinite(score)) {
    const idx = ranked.findIndex((d) => d?.date === date);
    rank = idx >= 0 ? idx + 1 : 0;
  }
  const isTop = rank === 1 && ranked.length >= 2;
  const isBottom = rank === ranked.length && ranked.length >= 2;
  const tMin = fmt0(current_day?.temperature_2m_min);
  const tMax = fmt0(current_day?.temperature_2m_max);
  const pp = numOr2(current_day?.precipitation_probability_max_pct, 0);
  const pSum = numOr2(current_day?.precipitation_sum_mm, 0);
  const wind = numOr2(current_day?.wind_speed_10m_max, 0);
  const alertMax = numOr2(current_day?.alert_level_max, 0);
  const lvlWind = numOr2(current_day?.lvl_wind, 0);
  const lvlRain = numOr2(current_day?.lvl_rain, 0);
  const lvlSnow = numOr2(current_day?.lvl_snow, 0);
  const lvlHeat = numOr2(current_day?.lvl_heat, 0);
  const lvlCold = numOr2(current_day?.lvl_cold, 0);
  const anyAlert = alertMax > 0 || lvlWind > 0 || lvlRain > 0 || lvlSnow > 0 || lvlHeat > 0 || lvlCold > 0;
  const hasWeatherRisk = anyAlert || pp !== null && pp >= 60 || wind !== null && wind >= 40;
  const hasLightPrecip = !hasWeatherRisk && (pp !== null && pp > 0 || pSum !== null && pSum > 0);
  const c500 = numOr2(current_day?.events_within_500m_count, 0);
  const c5 = numOr2(current_day?.events_within_5km_count, 0);
  const c10 = numOr2(current_day?.events_within_10km_count, 0);
  const c50 = numOr2(current_day?.events_within_50km_count, 0);
  const total = c500 + c5 + c10 + c50;
  const near = c500 + c5 + c10;
  const farOnly = total > 0 && near === 0;
  const top = Array.isArray(current_day?.top_competitors) ? current_day.top_competitors : [];
  top.filter((e) => {
    const rp = Number(e?.radius_precedence);
    return Number.isFinite(rp) ? rp <= 3 : true;
  }).slice(0, 3);
  const details = [];
  const { label: dowFr, isWeekend } = weekdayLabelFr2(date);
  const out = [];
  out.push(`Points clés — ${dowFr} ${date}${isWeekend ? " (week-end)" : ""}`);
  const synth = [];
  if (Number.isFinite(score)) {
    const rankTxt = ranked.length >= 2 && rank > 0 ? ` — ${isTop ? "meilleur" : isBottom ? "moins bon" : `${rank}e`} sur ${ranked.length} dans la sélection` : "";
    synth.push(`- Potentiel très élevé : ${Math.round(score)}${medal ? ` (${medal})` : ""}${rankTxt}`);
  } else if (medal) {
    synth.push(`- Potentiel : ${medal}`);
  }
  const specials = uniqStrings2([...current_special_labels ?? [], ...Array.isArray(current_day?.commercial_events) ? current_day.commercial_events : []]);
  if (specials.length > 0) {
    synth.push(`- Contexte calendrier : ${specials.join(", ")}`);
  }
  if (hasWeatherRisk) {
    const reasons = [];
    if (anyAlert) reasons.push("alertes météo actives");
    else {
      if (pp >= 60) reasons.push(`pluie probable (≥60%)`);
      if (wind >= 40) reasons.push(`vent fort (≥40 km/h)`);
    }
    synth.push(`- Météo : risque à surveiller (${reasons.join(", ") || "signal météo"})`);
  } else if (hasLightPrecip) {
    const bit = pSum > 0 && pp === 0 ? `précipitations faibles possibles (~${fmt1(pSum)} mm)` : `pluie faible possible`;
    synth.push(`- Météo : globalement favorable, ${bit}`);
  } else {
    synth.push(`- Météo : favorable (pas de signal à risque)`);
  }
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
  const tMinNum = numOrNull2(current_day?.temperature_2m_min);
  const tMaxNum = numOrNull2(current_day?.temperature_2m_max);
  if (tMinNum !== null && tMinNum <= 2) {
    details.push(`- Froid le matin : ~${tMin ?? "?"}°`);
  }
  if (tMaxNum !== null && tMaxNum >= 30) {
    details.push(`- Chaleur possible : ~${tMax ?? "?"}°`);
  }
  if (anyAlert) {
    const bits = [];
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
  const topEvents = getTopCompetitionEvents2(current_day, input.location_context);
  if (topEvents.length > 0) {
    details.push(`- Concurrents les plus proches :`);
    for (const e of topEvents) {
      const title = typeof e?.event_label === "string" && e.event_label.trim() ? e.event_label.trim() : "Événement";
      const city = typeof e?.city_name === "string" && e.city_name.trim() ? e.city_name.trim() : "";
      const km = kmFromMeters(e?.distance_m);
      const where = [city, km ? `${km} km` : ""].filter(Boolean).join(" — ");
      const desc = truncate(e?.description, 150);
      details.push(
        desc ? `  - ${title}${where ? ` — ${where}` : ""}
    ${desc}` : `  - ${title}${where ? ` — ${where}` : ""}`
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
const GET = async ({ url, locals }) => {
  const location_id = url.searchParams.get("location_id") ?? (locals?.location_id ? String(locals.location_id).trim() : null);
  const selected_dates_raw = url.searchParams.get("selected_dates");
  const current_date_raw = url.searchParams.get("current_date");
  if (!location_id || !selected_dates_raw) {
    return new Response(
      JSON.stringify({
        error: "Missing location_id or selected_dates",
        debug: {
          has_locals_location_id: Boolean(locals?.location_id),
          location_id_from_query: url.searchParams.get("location_id"),
          selected_dates_from_query: url.searchParams.get("selected_dates"),
          current_date_from_query: url.searchParams.get("current_date")
        }
      }),
      {
        status: 400,
        headers: { "Content-Type": "application/json; charset=utf-8" }
      }
    );
  }
  const selected_dates = selected_dates_raw.split(",").map((d) => d.trim()).filter(Boolean);
  const ISO_DATE_RE2 = /^\d{4}-\d{2}-\d{2}$/;
  if (!selected_dates.every((d) => ISO_DATE_RE2.test(d))) {
    return new Response(JSON.stringify({ error: "selected_dates must be YYYY-MM-DD" }), {
      status: 400,
      headers: { "Content-Type": "application/json; charset=utf-8" }
    });
  }
  const current_date = typeof current_date_raw === "string" && current_date_raw.trim() ? current_date_raw.trim() : selected_dates[0] ?? "";
  if (!ISO_DATE_RE2.test(current_date)) {
    return new Response(JSON.stringify({ error: "current_date must be YYYY-MM-DD" }), {
      status: 400,
      headers: { "Content-Type": "application/json; charset=utf-8" }
    });
  }
  if (selected_dates.length === 0) {
    return new Response(
      JSON.stringify({ error: "selected_dates empty after normalization" }),
      {
        status: 400,
        headers: { "Content-Type": "application/json; charset=utf-8" }
      }
    );
  }
  if (selected_dates.length > 7) {
    return new Response(
      JSON.stringify({ error: "selected_dates must contain at most 7 dates" }),
      {
        status: 400,
        headers: { "Content-Type": "application/json; charset=utf-8" }
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
    let nonEmptyString = function(v) {
      const s = typeof v === "string" ? v.trim() : "";
      return s ? s : null;
    }, normalizeStringArray = function(v) {
      if (!Array.isArray(v)) return [];
      const out = v.map((x) => typeof x === "string" ? x.trim() : "").filter(Boolean);
      return Array.from(new Set(out));
    }, translateEventLabelFr = function(s) {
      const v = typeof s === "string" ? s.trim() : "";
      if (!v) return s;
      const dict = {
        "French Winter Sales": "Soldes d’hiver",
        "French Summer Sales": "Soldes d’été",
        "Valentine's Day": "Saint-Valentin"
      };
      return dict[v] ?? v;
    }, normalizeCommercialEvents = function(v) {
      if (Array.isArray(v) && v.every((x) => typeof x === "string")) {
        return Array.from(new Set(v.map((x) => x.trim()).filter(Boolean)));
      }
      if (Array.isArray(v) && v.length && typeof v[0] === "object") {
        const names = v.map((x) => x && typeof x.event_name === "string" ? x.event_name.trim() : "").filter(Boolean);
        return Array.from(new Set(names));
      }
      if (typeof v === "string") {
        const s = v.trim();
        return s ? [s] : [];
      }
      return [];
    }, topNByScore = function(xs, n, dir) {
      const arr = (Array.isArray(xs) ? xs : []).filter((d) => typeof d?.date === "string" && Number.isFinite(Number(d?.opportunity_score_final_local)));
      arr.sort((a, b) => {
        const sa = Number(a.opportunity_score_final_local);
        const sb = Number(b.opportunity_score_final_local);
        return dir === "asc" ? sa - sb : sb - sa;
      });
      return arr.slice(0, n);
    }, worstNByWeather = function(xs, n) {
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
    };
    const [daysRows] = await bq.query({
      query: daysQuery,
      params: {
        location_id,
        selected_dates
      }
    });
    const [locationContextRows] = await bq.query({
      query: locationContextQuery,
      params: { location_id }
    });
    const location_context = locationContextRows?.[0] ?? null;
    const rawDays = Array.isArray(daysRows) ? daysRows : [];
    const days = rawDays.map((r) => ({
      ...r,
      // BigQuery DATE often arrives as { value: "YYYY-MM-DD" } or "YYYY-MM-DD"
      date: r?.date?.value ?? r?.date ?? null
    })).filter((r) => typeof r.date === "string" && r.date.length === 10);
    const days_deduped = (() => {
      const byDate = /* @__PURE__ */ new Map();
      for (const r of Array.isArray(days) ? days : []) {
        const d = typeof r?.date === "string" ? r.date.trim() : "";
        if (!d) continue;
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
    const computed_metrics = (() => {
      const out = {
        days_count: days_deduped.length,
        days_a: 0,
        days_b: 0,
        days_c: 0,
        days_risk: 0,
        score_min: null,
        score_max: null
      };
      const medalBucket = (m) => {
        const s = String(m ?? "").trim().toUpperCase();
        if (!s) return null;
        if (s.startsWith("A")) return "A";
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
    const best_score_days = topNByScore(days_deduped, 3, "desc");
    const worst_weather_days = worstNByWeather(days_deduped, 3);
    const worst_weather_days_gated = worst_weather_days.filter((d) => {
      const alert = Number(d?.alert_level_max ?? 0);
      const pp = Number(d?.precipitation_probability_max_pct ?? -1);
      const wind = Number(d?.wind_speed_10m_max ?? -1);
      if (Number.isFinite(alert) && alert > 0) return true;
      if (Number.isFinite(pp) && pp >= 60) return true;
      if (Number.isFinite(wind) && wind >= 40) return true;
      return false;
    });
    const special_days = (() => {
      const out = [];
      for (const d of days_deduped) {
        const date = typeof d?.date === "string" ? d.date.trim() : "";
        if (!date) continue;
        const labels = [];
        const holiday = nonEmptyString(d?.holiday_name);
        if (holiday) labels.push(holiday);
        const vacation = nonEmptyString(d?.vacation_name);
        if (vacation) labels.push(vacation);
        const ce = normalizeCommercialEvents(d?.commercial_events);
        if (ce.length) labels.push(...ce);
        const uniq = Array.from(new Set(labels.map((x) => String(x).trim()).filter(Boolean)));
        if (uniq.length) out.push({ date, labels: uniq });
      }
      out.sort((a, b) => a.date.localeCompare(b.date));
      return out;
    })();
    const competition_summary = (() => {
      let max50 = 0;
      let daysWithCompetition = 0;
      for (const d of days_deduped) {
        const c = Number(d?.events_within_500m_count ?? 0) + Number(d?.events_within_5km_count ?? 0) + Number(d?.events_within_10km_count ?? 0) + Number(d?.events_within_50km_count ?? 0);
        if (Number.isFinite(c) && c > 0) daysWithCompetition += 1;
        const v50 = Number(d?.events_within_50km_count ?? 0);
        if (Number.isFinite(v50)) max50 = Math.max(max50, v50);
      }
      return { daysWithCompetition, max50 };
    })();
    const current_day = days_deduped.find((d) => d?.date === current_date) ?? null;
    const current_special_labels = special_days.find((x) => x.date === current_date)?.labels ?? [];
    const comparison = {
      selection_count: days_deduped.length,
      rank_by_score: null,
      has_any_weather_signal_in_selection: false,
      is_current_weather_signal: false,
      has_any_competition_in_selection: false,
      is_current_competition: false
    };
    const points_cles_text = renderPointsClesV1({
      mode: "selected_day",
      current_day,
      selection_days: days_deduped,
      current_special_labels,
      location_context
    });
    return new Response(
      JSON.stringify({
        location_id,
        selected_dates,
        days: days_deduped,
        points_cles: {
          location_context,
          text: points_cles_text
        }
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json; charset=utf-8" }
      }
    );
  } catch (err) {
    console.error("[api/insight/days] Error", err);
    return new Response(
      JSON.stringify({ error: "Internal error querying semantic surfaces" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json; charset=utf-8" }
      }
    );
  }
};
const _page = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  GET,
  renderDeterministicText
}, Symbol.toStringTag, { value: "Module" }));
const page = () => _page;
export {
  page,
  renderers
};
