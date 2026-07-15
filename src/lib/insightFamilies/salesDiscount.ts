// src/lib/insightFamilies/salesDiscount.ts
// SALES-DISCOUNT family provider — "vos jours de remise rapportent-ils vraiment plus ?".
// Extracted VERBATIM from the deep-page endpoint (src/pages/api/insight/sales-discount.ts) so the deep
// page stays byte-identical — the endpoint is now a thin wrapper over run(). Adds `facts` + `sources`.
//
// NOT the blocked `sales` card: this needs no `isDown` from a firing signal, so it is question-scoped
// and safe to answer in chat. See [[sales-family-isdown-contract]] for the one that isn't.
//
// THE HONESTY RULE THAT DEFINES THIS CARD — do not soften it:
// the comparison is ASSOCIATIVE. A day may be discounted BECAUSE it is slow; the causality can run
// backwards. So the claim is only ever "vos remises n'achètent pas de CA incrémental" — NEVER "la
// remise fait baisser le CA". Every fact carries observed_difference, and the reverse-causality caveat
// is itself a citable fact so the model cannot quietly drop it while quoting the number it qualifies.
import type { FamilyResult, FamilyFact } from "./types";

const PROJECT = "muse-square-open-data";
const WINDOW_DAYS = 90;
const MIN_DAYS = 12;   // need enough days to split into discount quartiles honestly

const num = (v: any): number | null => (v == null ? null : Number(v && typeof v === "object" && "value" in v ? v.value : v));
const str = (v: any): string | null => { const s = v == null ? "" : String(v).trim(); return s || null; };
const r1 = (n: number | null): number | null => (n == null ? null : Math.round(n * 10) / 10);
const pctFr = (n: number): string => (n >= 0 ? "+" : "−") + String(Math.abs(Math.round(n * 10) / 10)).replace(".", ",") + " %";
const frInt = (n: number): string => Math.round(n).toLocaleString("fr-FR");

export async function salesDiscountFamily(bq: any, location_id: string, date: string): Promise<FamilyResult> {
  const [rows] = await bq.query({
    query: `SELECT CAST(transaction_date AS STRING) AS d, discount_rate, discount_rate_baseline,
                   discount_rate_delta_pct, revenue_vs_30d_avg_pct, daily_revenue, daily_discount_total
            FROM \`${PROJECT}.mart.fct_client_sales_signals_daily\`
            WHERE location_id = @location_id
              AND transaction_date BETWEEN DATE_SUB(DATE(@date), INTERVAL ${WINDOW_DAYS} DAY) AND DATE(@date)
              AND discount_rate IS NOT NULL AND revenue_vs_30d_avg_pct IS NOT NULL`,
    params: { location_id, date }, types: { location_id: "STRING", date: "STRING" }, location: "EU",
  });

  const all = (Array.isArray(rows) ? rows : []).map((r: any) => ({
    d: str(r.d), disc: num(r.discount_rate), base: num(r.discount_rate_baseline),
    disc_delta: num(r.discount_rate_delta_pct), rev_vs: num(r.revenue_vs_30d_avg_pct),
    rev: num(r.daily_revenue), disc_total: num(r.daily_discount_total),
  })).filter((r: any) => r.disc != null && r.rev_vs != null);
  // Honest-absence: too few days to split into thirds -> no verdict, and no facts to quote.
  if (all.length < MIN_DAYS) return { found: false, data: { found: false, date }, facts: [], sources: [] };

  const p = all.find((r) => r.d === date) || all[all.length - 1];

  // Split the window into high- vs low-discount days (top/bottom third) and compare CA-vs-30d-avg.
  const byDisc = [...all].sort((a, b) => (a.disc as number) - (b.disc as number));
  const k = Math.max(3, Math.floor(byDisc.length / 3));
  const low = byDisc.slice(0, k);          // least-discounted days
  const high = byDisc.slice(byDisc.length - k);   // most-discounted days
  const mean = (xs: any[]) => (xs.length ? xs.reduce((s, r) => s + (r.rev_vs as number), 0) / xs.length : null);
  const highCA = mean(high), lowCA = mean(low);
  const discAvg = all.reduce((s, r) => s + (r.disc as number), 0) / all.length;

  // Verdict — do discount days earn MORE? Lift only if high-discount days clearly beat low-discount days.
  const lift = (highCA != null && lowCA != null) ? (highCA - lowCA) : null;   // pp of CA-vs-avg
  const noLift = lift != null && lift <= 1;   // ≤1pp advantage ⇒ discounts don't buy incremental CA

  const discPct = p.disc != null ? Math.round(p.disc * 1000) / 10 : null;      // % with 1 decimal
  const basePct = p.base != null ? Math.round(p.base * 1000) / 10 : null;
  const lead = noLift
    ? `Vous remisez en moyenne ${String(Math.round(discAvg * 1000) / 10).replace(".", ",")} % — mais vos jours de remise ne rapportent pas plus. Les promos ne vous achètent pas de CA en plus.`
    : `Vos jours de remise surperforment (${lift != null ? "+" + Math.round(lift) + " pts de CA" : "au-dessus"}) — la remise semble tirer le chiffre.`;

  const compare = [
    { label: "Jours à forte remise", value: highCA != null ? "CA " + pctFr(highCA) + " vs habituel" : null, dominant: false, bad: (highCA != null && lowCA != null && highCA <= lowCA) },
    { label: "Jours à faible remise", value: lowCA != null ? "CA " + pctFr(lowCA) + " vs habituel" : null, dominant: noLift, bad: false },
  ];

  const decision_lines: { head: string; body: string }[] = [];
  if (noLift) {
    decision_lines.push({ head: "Vos promos de masse ne paient pas", body: `Sur ${WINDOW_DAYS} jours, vos jours les plus remisés ne font pas mieux que vos jours les moins remisés — la remise part en marge sans CA en retour.` });
    decision_lines.push({ head: "Réservez la remise à la valeur", body: "Ciblez vos clients fidèles / gros paniers plutôt qu'une promo générale ; testez un jour sans remise et comparez le CA." });
  } else {
    decision_lines.push({ head: "La remise semble tirer le CA", body: "Vos jours remisés surperforment — mais mesurez le CA net de marge avant de généraliser (association, pas preuve)." });
  }

  // Ampleur — pattern (recurring vs one-off) + € at stake per year (descriptive, not a causal claim).
  const discountedDays = all.filter((r) => (r.disc ?? 0) > 0).length;
  const discountedPct = Math.round((discountedDays / all.length) * 100);
  const annualDiscount = Math.round((all.reduce((s, r) => s + (r.disc_total ?? 0), 0) / all.length) * 365);
  const scale = {
    annual_eur: annualDiscount,
    annual_label: "de remises par an",
    recurrence: `Vous remisez ${discountedPct >= 90 ? "presque tous les jours" : discountedPct + " % de vos jours"} (${String(Math.round(discAvg * 100 * 10) / 10).replace(".", ",")} % en moyenne) — ${discountedPct >= 70 ? "structurel, pas ponctuel" : "récurrent"}.`,
    enjeu: "Vos jours très remisés ne rapportent pas plus — une partie part en marge sans retour mesurable.",
  };

  const caveat = "Association observée sur la période, pas une preuve : un jour peut être remisé PARCE QU'il est calme. À confirmer par un jour-test sans remise.";

  // ── FACTS. The comparison IS the finding; the caveat travels with it as its own fact.
  const facts: FamilyFact[] = [];
  if (highCA != null && lowCA != null) {
    facts.push({
      fact_fr: `Sur ${WINDOW_DAYS} jours, vos jours les plus remisés font ${pctFr(highCA)} de CA vs votre habituel, contre ${pctFr(lowCA)} pour vos jours les moins remisés.`,
      claim_type: "observed_difference",
    });
    facts.push({
      fact_fr: noLift
        ? "L'écart entre vos jours très remisés et vos jours peu remisés est nul ou négatif : la remise ne vous achète pas de CA supplémentaire."
        : `Vos jours remisés dépassent vos jours peu remisés de ${Math.round(lift as number)} points de CA.`,
      claim_type: "observed_difference",
    });
  }
  facts.push({ fact_fr: `Vous remisez ${String(Math.round(discAvg * 1000) / 10).replace(".", ",")} % en moyenne, sur ${discountedPct} % de vos jours.`, claim_type: "observed" });
  if (annualDiscount > 0) {
    facts.push({ fact_fr: `Vos remises représentent environ ${frInt(annualDiscount)} € par an au rythme actuel.`, claim_type: "observed" });
  }
  // Non-negotiable: the caveat is a FACT, so it cannot be dropped while the number it qualifies is quoted.
  facts.push({ fact_fr: caveat, claim_type: "observed_difference" });

  const sources = ["Votre caisse — remises et CA par jour (90 jours)"];

  return {
    found: true,
    data: {
      found: true, date, lead, no_lift: noLift,
      point: { disc_pct: discPct, base_pct: basePct, disc_delta: r1(p.disc_delta), rev_vs_pct: r1(p.rev_vs) },
      window: { n: all.length, high_ca: r1(highCA), low_ca: r1(lowCA), avg_disc_pct: r1(discAvg * 100) },
      compare, scale, decision_lines, caveat,
    },
    facts,
    sources,
  };
}
