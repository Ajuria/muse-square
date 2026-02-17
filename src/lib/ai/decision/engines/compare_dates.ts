// src/lib/ai/decision/engines/compare_dates.ts
// =====================================================
// Engine — COMPARE_DATES (deterministic)
// =====================================================

export type CompareDatesInput = {
  rows: any[];              // selected_days_rows (semantic truth)
};

export type CompareDatesOutput = {
  ok: true;
  headline: string;
  summary: string;
  key_facts: string[];
  caveat: string | null;
};

function toNum(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : NaN;
}

function ymdFromAnyDate(v: any): string {
  if (typeof v === "string" && v.trim()) return v.trim().slice(0, 10);
  if (v && typeof v === "object" && typeof v.value === "string") return v.value.trim().slice(0, 10);
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  return "(date inconnue)";
}

function regimeRank(v: unknown): number {
  const s = typeof v === "string" ? v.trim().toUpperCase() : "";
  if (s === "A") return 0;
  if (s === "B") return 1;
  if (s === "C") return 2;
  return 9;
}

function fmtScore(x: number): string {
  return Number.isFinite(x) ? String(Math.round(x)) : "ND";
}

function fmtNum(x: number): string {
  return Number.isFinite(x) ? String(x) : "ND";
}

function getScore(r: any): number {
  return toNum(r?.opportunity_score_final_local);
}

function getRegime(r: any): string {
  return typeof r?.opportunity_regime === "string" ? r.opportunity_regime : "";
}

// weather risk: prefer alert_level_max if present, else weather_alert_level
function getWeatherRisk(r: any): number {
  const a = toNum(r?.alert_level_max);
  if (Number.isFinite(a)) return a;

  const b = toNum(r?.weather_alert_level);
  if (Number.isFinite(b)) return b;

  return NaN;
}

function getCompetition(r: any): number {
  const c5 = toNum(r?.events_within_5km_count);
  if (Number.isFinite(c5)) return c5;

  const c10 = toNum(r?.events_within_10km_count);
  if (Number.isFinite(c10)) return c10;

  return NaN;
}

export function compareDatesDeterministic(input: CompareDatesInput): CompareDatesOutput {
  const rows = Array.isArray(input.rows) ? input.rows : [];

  if (rows.length < 2) {
    return {
      ok: true,
      headline: "Comparaison impossible",
      summary: "Vous devez sélectionner au moins 2 dates pour comparer.",
      key_facts: [`Dates reçues: ${rows.length}`],
      caveat: null,
    };
  }

  const cmp = (a: any, b: any): number => {
    // 1) regime asc
    const ra = regimeRank(a?.opportunity_regime);
    const rb = regimeRank(b?.opportunity_regime);
    if (ra !== rb) return ra - rb;

    // 2) score desc (NaN -> worst)
    const sa = getScore(a);
    const sb = getScore(b);
    const saOk = Number.isFinite(sa);
    const sbOk = Number.isFinite(sb);
    if (saOk !== sbOk) return saOk ? -1 : 1;
    if (saOk && sbOk && sa !== sb) return sb - sa;

    // 3) weather risk asc (known beats unknown; lower is better)
    const wa = getWeatherRisk(a);
    const wb = getWeatherRisk(b);
    const waOk = Number.isFinite(wa);
    const wbOk = Number.isFinite(wb);
    if (waOk !== wbOk) return waOk ? -1 : 1;
    if (waOk && wbOk && wa !== wb) return wa - wb;

    // 4) competition asc (known beats unknown; lower is better)
    const ca = getCompetition(a);
    const cb = getCompetition(b);
    const caOk = Number.isFinite(ca);
    const cbOk = Number.isFinite(cb);
    if (caOk !== cbOk) return caOk ? -1 : 1;
    if (caOk && cbOk && ca !== cb) return ca - cb;

    // 5) earlier date first
    return ymdFromAnyDate(a?.date).localeCompare(ymdFromAnyDate(b?.date));
  };

  const sorted = [...rows].sort(cmp);
  const best = sorted[0];
  const runnerUps = sorted.slice(1, 3);

  const bestDate = ymdFromAnyDate(best?.date);
  const bestReg = getRegime(best) || "ND";
  const bestScore = getScore(best);
  const bestWx = getWeatherRisk(best);
  const bestComp = getCompetition(best);

  const key_facts: string[] = [];
  key_facts.push(`Meilleur choix: ${bestDate} (Régime ${bestReg}, Score ${fmtScore(bestScore)})`);
  key_facts.push(`Risque météo: alerte max ${fmtNum(bestWx)}`);
  key_facts.push(`Concurrence: ${fmtNum(bestComp)} événements ≤10km`);

  for (const r of runnerUps) {
    const d = ymdFromAnyDate(r?.date);
    const reg = getRegime(r) || "ND";
    const sc = getScore(r);
    const wr = getWeatherRisk(r);
    const cc = getCompetition(r);
    key_facts.push(`Alternative: ${d} (Régime ${reg}, Score ${fmtScore(sc)}, météo ${fmtNum(wr)}, concurrence ${fmtNum(cc)})`);
  }

  return {
    ok: true,
    headline: `Meilleure date: ${bestDate}`,
    summary: "Comparaison déterministe sur vos dates sélectionnées: régime → score → risque météo → concurrence.",
    key_facts,
    caveat:
      "Si certains champs sont ND, cela signifie que la vue semantic ne les a pas fournis pour au moins une date; le classement privilégie les valeurs connues et faibles.",
  };
}
