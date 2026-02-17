// src/lib/ai/decision/engines/top_days/window_top_days.ts
// =====================================================
// Engine — WINDOW_TOP_DAYS (deterministic, truth-aligned)
// =====================================================
// Purpose:
// - Answer: "Quels sont les meilleurs jours ?"
// - Input rows are assumed to be the month shortlist
//   (already hard-filtered + deterministically ordered in BigQuery)
// - This engine MUST NOT re-rank, re-filter, or invent signals
// =====================================================

export type WindowTopDaysInput = {
  rows: any[]; // shortlist rows from bqShortlist()
};

export type WindowTopDaysOutput = {
  ok: true;
  headline: string;
  summary: string;
  key_facts: string[];
  caveat: string | null;
};

function ymdFromAnyDate(v: any): string {
  if (typeof v === "string" && v.trim()) return v.trim().slice(0, 10);
  if (v && typeof v === "object" && typeof v.value === "string") return v.value.trim().slice(0, 10);
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  return "(date inconnue)";
}

function toFiniteNumberOrNull(v: any): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function toBoolOrNull(v: any): boolean | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v === 1 ? true : v === 0 ? false : null;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (s === "true" || s === "1") return true;
    if (s === "false" || s === "0") return false;
  }
  return null;
}

function bucketCompetition(r: any): "faible" | "modérée" | "élevée" | null {
  const c10 = toFiniteNumberOrNull(r?.events_within_10km_count);
  const c50 = toFiniteNumberOrNull(r?.events_within_50km_count);
  if (c10 === null && c50 === null) return null;

  const v10 = c10 ?? 0;
  const v50 = c50 ?? 0;

  if (v10 === 0 && v50 <= 20) return "faible";
  if (v10 <= 2 && v50 <= 60) return "modérée";
  return "élevée";
}

function describeCalendarImplication(r: any): string | null {
  const wk = toBoolOrNull(r?.is_weekend);
  const ph = toBoolOrNull(r?.is_public_holiday_fr_flag);
  const sc = toBoolOrNull(r?.is_school_holiday_flag);
  const ce = toBoolOrNull(r?.is_commercial_event_flag);

  const anyKnown = [wk, ph, sc, ce].some((x) => x !== null);
  if (!anyKnown) return null;

  const anySpecial = (wk === true) || (ph === true) || (sc === true) || (ce === true);

  if (!anySpecial) {
    return "calendrier standard → logistique plus simple.";
  }

  const tags: string[] = [];
  if (wk === true) tags.push("week-end");
  if (ph === true) tags.push("jour férié");
  if (sc === true) tags.push("vacances");
  if (ce === true) tags.push("temps fort commercial");

  return `${tags.join(" + ")} → affluence plus volatile (ajuster com/horaires si besoin).`;
}

function describeWeatherImplication(r: any): string | null {
  const alert = toFiniteNumberOrNull(r?.weather_alert_level);
  const pr = toFiniteNumberOrNull(r?.precipitation_probability_max_pct);
  const wi = toFiniteNumberOrNull(r?.wind_speed_10m_max);

  const hasAny = alert !== null || pr !== null || wi !== null;
  if (!hasAny) return null;

  if (alert !== null && alert >= 3) return "météo à risque (alerte élevée).";
  if (pr !== null && pr === 0 && wi !== null && wi <= 15) return "météo stable (peu de pluie/vent).";
  if (pr !== null && pr > 0) return "prévoir un plan B météo (pluie possible).";
  if (wi !== null && wi > 25) return "vent potentiellement gênant (selon installation).";
  return "météo globalement exploitable.";
}

export function windowTopDaysDeterministic(
  input: WindowTopDaysInput
): WindowTopDaysOutput {
  const rows = Array.isArray(input?.rows) ? input.rows : [];

  // Truth: shortlist may legitimately be empty
  if (rows.length === 0) {
    return {
      ok: true,
      headline: "Aucun jour ne se détache",
      summary:
        "Aucune date ne ressort clairement comme choix prioritaire sur cette période.",
      key_facts: [
        "Décision : élargissez la période ou ajustez vos contraintes.",
        "Décision : analysez un jour précis pour arbitrer manuellement.",
      ],
      caveat:
        "Shortlist vide après application des exclusions hard et/ou absence de jours éligibles dans la fenêtre.",
    };
  }

  // Truth: rows are already ordered best → worst by BigQuery
  const top = rows.slice(0, 3);

  const dates = top.map((r) => ymdFromAnyDate(r?.date));

  const key_facts: string[] = [];

  // ---- Window-level consequences (no per-day explanation) ----
  key_facts.push(`Décision : concentrez-vous en priorité sur ${dates.join(", ")}.`);

  // ---- tri-state helpers: unknown vs none vs some (truth-safe) ----
  type Tri = "unknown" | "none" | "some";
  const triAny = (vals: Array<number | null>, pred: (x: number) => boolean): Tri => {
    const known = vals.filter((x): x is number => x !== null);
    if (known.length === 0) return "unknown";
    return known.some(pred) ? "some" : "none";
  };

  // Weather alert tri-state (observe >0 only; no inferred impact)
  const wxTri = triAny(
    top.map((r) => toFiniteNumberOrNull(r?.weather_alert_level)),
    (a) => a > 0
  );
  key_facts.push(
    wxTri === "unknown"
      ? "Météo : signal indisponible sur ces dates (donnée manquante)."
      : wxTri === "none"
        ? "Météo : aucune alerte météo signalée sur ces dates."
        : "Météo : signaux météo présents sur certaines dates (à surveiller selon le format)."
  );

  // Competition tri-state (direct competition = >0 within 5km or 10km; unknown-safe)
  const compTri = triAny(
    top.map((r) => {
      const c5 = toFiniteNumberOrNull(r?.events_within_5km_count);
      const c10 = toFiniteNumberOrNull(r?.events_within_10km_count);
      return c5 !== null ? c5 : c10; // prefer 5km if known, else 10km (truth)
    }),
    (c) => c > 0
  );
  key_facts.push(
    compTri === "unknown"
      ? "Concurrence : signal indisponible sur ces dates (donnée manquante)."
      : compTri === "none"
        ? "Concurrence : aucune concurrence directe détectée à proximité sur ces dates."
        : "Concurrence : concurrence présente sur certaines dates (stratégie à adapter)."
  );

  // Calendar: unknown vs some; omit "neutral" line to stay concise
  const calKnown = top.some(
    (r) =>
      (r?.is_weekend !== null && r?.is_weekend !== undefined) ||
      (r?.is_public_holiday_fr_flag !== null && r?.is_public_holiday_fr_flag !== undefined) ||
      (r?.is_school_holiday_flag !== null && r?.is_school_holiday_flag !== undefined)
  );
  const calSome = top.some(
    (r) => Boolean(r?.is_weekend) || Boolean(r?.is_public_holiday_fr_flag) || Boolean(r?.is_school_holiday_flag)
  );

  if (!calKnown) {
    key_facts.push("Calendrier : signal indisponible sur ces dates (donnée manquante).");
  } else if (calSome) {
    key_facts.push("Calendrier : contexte particulier sur au moins une date (horaires/communication à ajuster si besoin).");
  }

  // Hard cap: keep it tight (Décision + 3 dims max)
  if (key_facts.length > 4) key_facts.length = 4;

  return {
    ok: true,
    headline: "Jours à privilégier sur la période",
    summary:
      "Ces dates ressortent comme les options les plus favorables sur la fenêtre analysée.",
    key_facts,
    caveat: null,
  };
}
