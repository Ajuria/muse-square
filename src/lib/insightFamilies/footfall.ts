// src/lib/insightFamilies/footfall.ts
// FOOTFALL family provider (SALES-ANCHORED). Extracted verbatim from the deep-page endpoint
// (src/pages/api/insight/footfall.ts) so the deep page stays byte-identical — the endpoint is
// now a thin wrapper over run(). Adds `facts` (grounded Q&A / report summary) + `sources`.
// Leads on the venue's OWN hourly revenue (semantic.vw_insight_event_client_hourly_profile,
// built from real transaction_hour); BestTime peak (mart.fct_location_foot_traffic_daily) is a
// flagged cross-check when it diverges from where the money is.
import type { FamilyResult, FamilyFact } from "./types";

const PROJECT = "muse-square-open-data";
const DOW_FR = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];   // day_int 0=Monday … 6=Sunday
const DIVERGE_HOURS = 4;   // |real peak − BestTime peak| ≥ this ⇒ flag BestTime as unreliable
const num = (v: any): number | null => (v == null ? null : Number(v && typeof v === "object" && "value" in v ? v.value : v));
const period = (h: number): string => (h < 12 ? "le matin" : h < 17 ? "l'après-midi" : "le soir");

export async function footfallFamily(bq: any, location_id: string, date: string): Promise<FamilyResult> {
  const empty = (): FamilyResult => ({ found: false, data: { found: false, date }, facts: [], sources: [] });

  // The reference weekday (Monday=0 … Sunday=6), aligned to the models' day_int.
  const [y, m, d] = date.split("-").map(Number);
  const dow = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;

  const [profRows, btRows] = await Promise.all([
    bq.query({
      query: `SELECT day_int, transaction_hour, avg_revenue
              FROM \`${PROJECT}.semantic.vw_insight_event_client_hourly_profile\`
              WHERE location_id = @location_id AND transaction_hour BETWEEN 6 AND 23`,
      params: { location_id }, types: { location_id: "STRING" }, location: "EU",
    }).then((r: any) => r[0]).catch(() => []),
    bq.query({
      query: `SELECT peak_hour FROM \`${PROJECT}.mart.fct_location_foot_traffic_daily\`
              WHERE location_id = @location_id AND day_int = @dow LIMIT 1`,
      params: { location_id, dow }, types: { location_id: "STRING", dow: "INT64" }, location: "EU",
    }).then((r: any) => r[0]?.[0]).catch(() => null),
  ]);

  const rows = (Array.isArray(profRows) ? profRows : []).map((r: any) => ({
    day_int: num(r.day_int), hour: num(r.transaction_hour), revenue: num(r.avg_revenue),
  })).filter((r: any) => r.hour != null && r.revenue != null);
  if (!rows.length) return empty();

  // Hourly revenue curve for the reference weekday.
  const hourly = rows.filter((r: any) => r.day_int === dow).sort((a: any, b: any) => a.hour - b.hour)
    .map((r: any) => ({ hour: r.hour, revenue: Math.round(r.revenue) }));
  if (!hourly.length) return empty();

  const peak = hourly.reduce((mx: any, h: any) => (h.revenue > (mx?.revenue ?? -1) ? h : mx), null);
  const peakHour = peak.hour, peakRev = peak.revenue;

  // Weekly revenue (typical) by day — sum of hourly average revenue per day_int.
  const wk: Record<number, number> = {};
  rows.forEach((r: any) => { wk[r.day_int as number] = (wk[r.day_int as number] || 0) + (r.revenue as number); });
  const wkVals = Object.entries(wk).map(([di, rev]) => ({ day_int: Number(di), revenue: Math.round(rev) }));
  const maxRev = Math.max(...wkVals.map((w) => w.revenue));
  const minRev = Math.min(...wkVals.map((w) => w.revenue));
  const weekly = wkVals.sort((a, b) => a.day_int - b.day_int).map((w) => ({
    day: DOW_FR[w.day_int] || String(w.day_int), revenue: w.revenue,
    state: w.revenue === maxRev ? "busy" : (w.revenue === minRev ? "quiet" : null),
  }));
  const bestDay = weekly.find((w) => w.state === "busy");

  // BestTime cross-check — flag when it diverges from where the money is.
  const btPeak = num(btRows && btRows.peak_hour);
  const diverge = btPeak != null && Math.abs(peakHour - btPeak) >= DIVERGE_HOURS;
  const besttime_note = btPeak == null ? null : (diverge
    ? `L'affluence BestTime situe le pic à ${btPeak}h — à l'opposé de vos ventes. Fiez-vous à votre CA, pas à l'affluence externe.`
    : `Cohérent avec l'affluence BestTime (pic ~${btPeak}h).`);

  const lead = `Votre CA culmine ${period(peakHour)} — pic à ${peakHour}h (${peakRev} €).`;
  const decision_lines: { head: string; body: string }[] = [
    { head: `Jouez le pic de ${peakHour}h`, body: "C'est là que se fait votre chiffre — staff, réassort et offres calés sur ce créneau." },
  ];
  if (diverge) decision_lines.push({ head: "Ne pilotez pas sur l'affluence externe", body: `Elle pointe ${period(btPeak!)} (${btPeak}h), mais vos ventes sont ${period(peakHour)} — suivez votre CA.` });
  if (bestDay) decision_lines.push({ head: `Votre meilleur jour : ${bestDay.day}`, body: `${bestDay.revenue} € en moyenne — concentrez-y vos temps forts.` });

  // Grounded facts — claim-typed, verbatim-surfaceable. Peak/trough/split/best-worst-day are aggregate
  // OBSERVATIONS (not engine-measured effects → "observed"); the BestTime gap is a comparison.
  const trough = hourly.reduce((mn: any, h: any) => (h.revenue < (mn?.revenue ?? Infinity) ? h : mn), null);
  const dayTotal = hourly.reduce((s: number, h: any) => s + h.revenue, 0);
  const morningTotal = hourly.filter((h: any) => h.hour < 12).reduce((s: number, h: any) => s + h.revenue, 0);
  const morningPct = dayTotal ? Math.round((morningTotal / dayTotal) * 100) : null;
  const quietDay = weekly.find((w: any) => w.state === "quiet");

  const facts: FamilyFact[] = [
    { fact_fr: `Votre CA culmine ${period(peakHour)}, avec un pic à ${peakHour}h (${peakRev} € en moyenne).`, claim_type: "observed" },
  ];
  if (morningPct != null) facts.push({ fact_fr: `Le matin (avant 12h) concentre ${morningPct} % de votre chiffre d'affaires de la journée.`, claim_type: "observed" });
  if (trough && trough.hour !== peakHour) facts.push({ fact_fr: `Votre CA est au plus bas vers ${trough.hour}h (${trough.revenue} € en moyenne).`, claim_type: "observed" });
  if (bestDay) facts.push({ fact_fr: `Votre meilleur jour de la semaine est ${bestDay.day} (${bestDay.revenue} € en moyenne).`, claim_type: "observed" });
  if (quietDay) facts.push({ fact_fr: `Votre jour le plus calme est ${quietDay.day} (${quietDay.revenue} € en moyenne).`, claim_type: "observed" });
  if (diverge) facts.push({ fact_fr: `L'affluence externe (BestTime) situe le pic à ${btPeak}h, à l'opposé de vos ventes réelles (${peakHour}h).`, claim_type: "observed_difference" });

  const sources = ["Votre caisse — CA par heure (transaction_hour)"];
  if (btPeak != null) sources.push("BestTime — affluence prévue");

  // Ampleur — the morning's share of CA and what it represents per year (DESCRIPTIVE: this is what the
  // window IS, not an uplift claim). Annual CA ≈ one week of average daily CA × 52.
  const weeklyTotal = weekly.reduce((s: number, w: any) => s + w.revenue, 0);
  const annualCA = Math.round(weeklyTotal * 52);
  const allRev = rows.reduce((s: number, r: any) => s + (r.revenue as number), 0);
  const morningAll = rows.filter((r: any) => r.hour < 12).reduce((s: number, r: any) => s + (r.revenue as number), 0);
  const morningShareAll = allRev ? Math.round((morningAll / allRev) * 100) : morningPct;
  // Footfall reads the hourly PROFILE (avg-per-weekday-hour), which is fine for SHARES but inflates any
  // absolute annual total — so the Ampleur leads with the robust SHARE, not a shaky €. (annualCA kept for
  // reference only.) void the estimate to keep the intent explicit.
  void annualCA;
  const scale = (morningShareAll != null) ? {
    headline: `${morningShareAll} % du CA · le matin`,
    recurrence: "Pic matinal présent toute la semaine — structurel, pas ponctuel.",
    enjeu: `Le matin (avant 12h) concentre ${morningShareAll} % de votre CA — c'est là que se joue votre chiffre, avant midi.`,
  } : null;

  return {
    found: true,
    data: { found: true, date, lead, hourly, peak_hour: peakHour, besttime_note, weekly, decision_lines, scale },
    facts,
    sources,
  };
}
