// src/pages/api/insight/footfall.ts
// Card-SPECIFIC drill-down for the FOOTFALL family — the "when" of the venue's business, SALES-ANCHORED.
// Leads on the venue's OWN hourly revenue (semantic.vw_insight_event_client_hourly_profile, built from the
// real transaction_hour) — NOT the BestTime guess. BestTime (fct_location_foot_traffic_daily) is a
// secondary cross-check that gets FLAGGED when it diverges from where the money actually is.
import type { APIRoute } from "astro";
import { makeBQClient } from "../../../lib/bq";
import { requireLocationOwnership } from "../../../lib/requireLocationOwnership";

const PROJECT = "muse-square-open-data";
const DOW_FR = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];   // day_int 0=Monday … 6=Sunday
const DIVERGE_HOURS = 4;   // |real peak − BestTime peak| ≥ this ⇒ flag BestTime as unreliable

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
const period = (h: number): string => (h < 12 ? "le matin" : h < 17 ? "l'après-midi" : "le soir");

export const GET: APIRoute = async ({ url, locals }) => {
  try {
    const bq = makeBQClient(process.env.BQ_PROJECT_ID || PROJECT);
    const location_id = requireString(url.searchParams.get("location_id"), "location_id");
    requireLocationOwnership(locals, location_id);
    const date = normalizeYmd(requireString(url.searchParams.get("date"), "date"));
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
    if (!rows.length) return json(200, { ok: true, found: false, date });

    // Hourly revenue curve for the reference weekday.
    const hourly = rows.filter((r: any) => r.day_int === dow).sort((a: any, b: any) => a.hour - b.hour)
      .map((r: any) => ({ hour: r.hour, revenue: Math.round(r.revenue) }));
    if (!hourly.length) return json(200, { ok: true, found: false, date });

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

    return json(200, { ok: true, found: true, date, lead, hourly, peak_hour: peakHour, besttime_note, weekly, decision_lines });
  } catch (err: any) {
    console.error("[api/insight/footfall] Error", err);
    return json(500, { ok: false, error: err?.message ?? "Erreur interne" });
  }
};
