// src/lib/ai/decision/engines/worst_days/window_worst_days.ts
// =======================================================
// Engine — WINDOW_WORST_DAYS (deterministic, truth-aligned)
// =======================================================
// Purpose:
// - Answer: "Quels sont les jours à éviter ?"
// - Input rows are assumed to be a "worstlist"
//   (deterministically ordered in BigQuery: worst → best)
// - This engine MUST NOT re-rank, re-filter, or invent signals
// =======================================================

export type WindowWorstDaysInput = {
  rows: any[]; // worstlist rows from BigQuery (already ordered worst → best)
};

export type WindowWorstDaysOutput = {
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

function getAlertLevel(r: any): number | null {
  // Canonical preference: alert_level_max (day surface) then weather_alert_level (30d/day surface)
  const a = toFiniteNumberOrNull(r?.alert_level_max);
  if (a !== null) return a;
  return toFiniteNumberOrNull(r?.weather_alert_level);
}

function toBoolOrNull(v: any): boolean | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v === 1 ? true : v === 0 ? false : null;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (s === "true" || s === "1") return true;
    if (s === "false" || s === "0") return false;
    return null;
  }
  return null;
}

type Tri = "unknown" | "none" | "some";
const triAny = (vals: Array<number | null>, pred: (x: number) => boolean): Tri => {
  const known = vals.filter((x): x is number => x !== null);
  if (known.length === 0) return "unknown";
  return known.some(pred) ? "some" : "none";
};

export function windowWorstDaysDeterministic(
  input: WindowWorstDaysInput
): WindowWorstDaysOutput {
  const rows = Array.isArray(input?.rows) ? input.rows : [];

  if (rows.length === 0) {
    return {
      ok: true,
      headline: "Aucun jour ne se détache (côté risques)",
      summary: "Aucune date n’est clairement ressortie comme “à éviter” sur cette période.",
      key_facts: [
        "Décision : vérifiez un jour précis si vous suspectez un risque non capté par les signaux disponibles.",
      ],
      caveat:
        "Worstlist vide après application des critères et/ou absence de jours dans la fenêtre.",
    };
  }

  // Truth: rows already ordered worst → best by BigQuery
  const worst = rows.slice(0, 3);
  const dates = worst.map((r) => ymdFromAnyDate(r?.date));

  const key_facts: string[] = [];
  key_facts.push(`Décision : évitez en priorité ${dates.join(", ")}.`);

  // Weather alert tri-state (observe >0 only; no inferred impact)
  const wxTri = triAny(worst.map((r) => getAlertLevel(r)), (a) => a > 0);

  if (wxTri === "unknown") {
    key_facts.push("Météo : signal indisponible sur ces dates (donnée manquante).");
  } else if (wxTri === "none") {
    key_facts.push("Météo : aucune alerte météo signalée sur ces dates.");
  } else {
    key_facts.push("Météo : signaux météo présents sur certaines dates (à surveiller selon le format).");
  }

  // Competition tri-state (direct competition = >0 within 5km or 10km; unknown-safe)
  const compTri = triAny(
    worst.map((r) => {
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
  const wk = worst.map((r) => toBoolOrNull(r?.is_weekend));
  const ph = worst.map((r) => toBoolOrNull(r?.is_public_holiday_fr_flag));
  const sc = worst.map((r) => toBoolOrNull(r?.is_school_holiday_flag));

  const calKnown = [...wk, ...ph, ...sc].some((v) => v !== null);
  const calSome = [...wk, ...ph, ...sc].some((v) => v === true);

  if (!calKnown) {
    key_facts.push("Calendrier : signal indisponible sur ces dates (donnée manquante).");
  } else if (calSome) {
    key_facts.push("Calendrier : contexte particulier sur au moins une date (horaires/communication à ajuster si besoin).");
  }

  return {
    ok: true,
    headline: "Jours à éviter sur la période",
    summary: "Ces dates ressortent comme les plus défavorables sur la fenêtre analysée.",
    key_facts,
    caveat: null,
  };
}
