// src/lib/insightFamilies/salesDecomp.ts
// SALES-DECOMP family provider — "d'où vient le mouvement : le trafic ou le panier ?".
// Extracted VERBATIM from the deep-page endpoint (src/pages/api/insight/sales-decomp.ts) so the deep
// page stays byte-identical — the endpoint is now a thin wrapper over run(). Adds `facts` + `sources`.
//
// NOT the blocked `sales` card: this needs no `isDown` from a firing signal (it reads the direction off
// revenue_vs_30d_avg_pct itself), so it is question-scoped and safe in chat.
// See [[sales-family-isdown-contract]] for the one that isn't.
//
// HONESTY: a small basket delta is FLAT, not "en recul" — the ±3 % band is the card's own noise guard
// and the facts respect it. The €/an figure is a SENSITIVITY ("chaque +0,10 € de panier vaut X €/an"),
// never a counterfactual gain the operator is promised.
import type { FamilyResult, FamilyFact } from "./types";

const PROJECT = "muse-square-open-data";
const TREND_DAYS = 45;   // window read to establish the persistent driver + basket trajectory

const num = (v: any): number | null => (v == null ? null : Number(v && typeof v === "object" && "value" in v ? v.value : v));
const str = (v: any): string | null => { const s = v == null ? "" : String(v).trim(); return s || null; };
const r1 = (n: number | null): number | null => (n == null ? null : Math.round(n * 10) / 10);
const frInt = (n: number): string => Math.round(n).toLocaleString("fr-FR");
// A rounded zero is FLAT, not a signed delta: "+0 %" reads as a move that did not happen.
const sgn = (n: number): string => (n > 0 ? "+" : n < 0 ? "\u2212" : "");
const pctSigned = (n: number): string => `${sgn(Math.round(n))}${Math.abs(Math.round(n))} %`;

export async function salesDecompFamily(bq: any, location_id: string, date: string): Promise<FamilyResult> {
  const [rows] = await bq.query({
    query: `SELECT CAST(transaction_date AS STRING) AS d, daily_revenue, revenue_30d_avg, revenue_vs_30d_avg_pct,
                   daily_transactions, transactions_delta_pct, avg_basket, basket_delta_pct, primary_revenue_driver
            FROM \`${PROJECT}.mart.fct_client_sales_signals_daily\`
            WHERE location_id = @location_id
              AND transaction_date BETWEEN DATE_SUB(DATE(@date), INTERVAL ${TREND_DAYS} DAY) AND DATE(@date)
            ORDER BY transaction_date DESC`,
    params: { location_id, date }, types: { location_id: "STRING", date: "STRING" }, location: "EU",
  });

  const all = (Array.isArray(rows) ? rows : []).map((r: any) => ({
    d: str(r.d), rev: num(r.daily_revenue), avg30: num(r.revenue_30d_avg), rev_vs: num(r.revenue_vs_30d_avg_pct),
    txns: num(r.daily_transactions), txn_d: num(r.transactions_delta_pct), basket: num(r.avg_basket),
    basket_d: num(r.basket_delta_pct), driver: str(r.primary_revenue_driver),
  }));
  if (!all.length) return { found: false, data: { found: false, date }, facts: [], sources: [] };

  // The card day (exact date, else the most recent row ≤ date).
  const p = all.find((r) => r.d === date) || all[0];
  if (p.rev == null) return { found: false, data: { found: false, date }, facts: [], sources: [] };

  // Persistent driver + basket trajectory over the window.
  const driven = { transactions: 0, basket: 0, both: 0 };
  let basketSum = 0, basketN = 0, txnSum = 0, txnN = 0;
  all.forEach((r) => {
    if (r.driver && (r.driver in driven)) (driven as any)[r.driver] += 1;
    if (r.basket_d != null) { basketSum += r.basket_d; basketN += 1; }
    if (r.txn_d != null) { txnSum += r.txn_d; txnN += 1; }
  });
  const basketAvg = basketN ? basketSum / basketN : null;
  const txnAvg = txnN ? txnSum / txnN : null;
  const nWin = all.length;

  const DRIVER_FR: Record<string, string> = { transactions: "le trafic (nombre de ventes)", basket: "le panier moyen", both: "le trafic et le panier" };
  const driverFr = DRIVER_FR[p.driver || ""] || "le nombre de ventes";
  const dir = (p.rev_vs != null && p.rev_vs < 0) ? "en retrait de" : "en hausse de";
  const absPct = p.rev_vs != null ? Math.abs(Math.round(p.rev_vs)) : null;

  const lead = `Votre CA du jour est ${dir} ${absPct != null ? absPct + " %" : "quelques %"} vs vos 30 derniers jours — porté par ${driverFr}.`;

  const split = [
    { label: "Ventes (trafic)", delta_pct: r1(p.txn_d), value: p.txns != null ? `${p.txns} ventes` : null, dominant: p.driver === "transactions" || p.driver === "both" },
    { label: "Panier moyen", delta_pct: r1(p.basket_d), value: p.basket != null ? `${p.basket.toFixed(2).replace(".", ",")} €` : null, dominant: p.driver === "basket" || p.driver === "both" },
  ];

  // The persistent story: which lever moves the business, and is the other one stalling?
  // Honest basket framing — small deltas are FLAT, not "en recul" (card quality bar: no overclaim).
  const topDriver = driven.transactions >= driven.basket ? "transactions" : "basket";
  const basketDir = basketAvg == null ? null : (basketAvg < -3 ? "recul" : basketAvg > 3 ? "hausse" : "stable");
  const basketDirFr = basketDir === "recul" ? "en recul" : basketDir === "hausse" ? "en hausse" : "stable";
  const trend_note = `Sur vos ${nWin} derniers jours, le mouvement vient surtout ${topDriver === "transactions" ? "du trafic" : "du panier"} (${driven.transactions} j trafic · ${driven.basket} j panier · ${driven.both} j les deux).`
    + (basketDir != null ? ` Panier moyen ${basketDirFr} sur la période${basketDir !== "stable" ? ` (${basketAvg! >= 0 ? "+" : ""}${Math.round(basketAvg!)} % en moyenne)` : ""}.` : "");

  const decision_lines: { head: string; body: string }[] = [];
  if (topDriver === "transactions" && basketDir !== "hausse") {
    // Growth is volume-driven and the basket hasn't grown (flat or declining) → the untapped lever.
    decision_lines.push({ head: "Votre croissance vient du volume", body: `Vous attirez plus de clients, mais la dépense par client ${basketDir === "recul" ? "recule" : "stagne"} — le panier moyen n'a pas suivi le trafic.` });
    decision_lines.push({ head: "Le panier est votre marge inexploitée", body: "Un menu, un produit d'appoint en caisse ou une offre combinée agit là où le trafic ne joue pas — sans dépendre d'attirer encore plus de monde." });
  } else if (topDriver === "transactions") {
    decision_lines.push({ head: "Trafic et panier progressent", body: "Vos hausses viennent surtout du volume, et le panier suit — dynamique saine ; protégez ce qui amène du monde (visibilité, horaires, accès)." });
  } else {
    decision_lines.push({ head: "Le panier fait votre chiffre", body: "Vos hausses viennent de ce que chaque client dépense — sécurisez le mix qui monte le panier plutôt que de courir après le volume." });
  }

  // Ampleur — the basket LEVER's value: what +0,10 € of average basket is worth per year (annual
  // transactions × 0,10). A sensitivity, not a counterfactual gain — "chaque +0,10 €", honest.
  const avgTxns = all.reduce((s: number, r: any) => s + (r.txns || 0), 0) / all.length;
  const annualTxns = Math.round(avgTxns * 365);
  const basketLever = Math.round(annualTxns * 0.10);
  const scale = (topDriver === "transactions" && basketDir !== "hausse" && annualTxns > 0) ? {
    annual_eur: basketLever,
    annual_label: "par +0,10 € de panier moyen",
    recurrence: `Le trafic porte votre CA ${driven.transactions} jours sur ${nWin} récents, le panier reste ${basketDir === "recul" ? "en recul" : "plat"} — structurel.`,
    enjeu: `Sur ~${annualTxns.toLocaleString("fr-FR")} transactions/an, le panier est votre levier inexploité — le trafic porte déjà tout.`,
  } : null;

  // ── FACTS. Day split = observed_difference (vs the venue's own 30d average); the persistent driver
  // is a COUNT over the window, stated as a count — not as a cause.
  const facts: FamilyFact[] = [];
  if (p.rev_vs != null) {
    facts.push({
      fact_fr: `Votre CA du jour s'écarte de ${pctSigned(p.rev_vs)} par rapport à vos 30 derniers jours.`,
      claim_type: "observed_difference",
    });
  }
  if (p.txn_d != null && p.basket_d != null) {
    facts.push({
      fact_fr: `Décomposition du jour : trafic ${pctSigned(p.txn_d)}, panier moyen ${pctSigned(p.basket_d)}.`,
      claim_type: "observed_difference",
    });
  }
  facts.push({
    fact_fr: `Sur vos ${nWin} derniers jours, le mouvement vient ${driven.transactions} fois du trafic et ${driven.basket} fois du panier (${driven.both} fois des deux).`,
    claim_type: "observed",
  });
  if (basketDir != null) {
    facts.push({
      // "stable" is a verdict about the ±3 % band — say the band, don't imply a trend that isn't there.
      fact_fr: basketDir === "stable"
        ? `Votre panier moyen est stable sur la période (variation moyenne inférieure à 3 %).`
        : `Votre panier moyen est ${basketDirFr} sur la période (${basketAvg! >= 0 ? "+" : "−"}${Math.abs(Math.round(basketAvg!))} % en moyenne).`,
      claim_type: "observed_difference",
    });
  }
  if (scale && annualTxns > 0) {
    facts.push({
      fact_fr: `Sur environ ${frInt(annualTxns)} transactions par an, chaque +0,10 € de panier moyen représente ${frInt(basketLever)} € par an.`,
      claim_type: "observed",
    });
  }

  const sources = ["Votre caisse — CA, transactions et panier par jour (45 jours)"];

  return {
    found: true,
    data: {
      found: true, date, lead, driver: p.driver,
      point: { rev: p.rev != null ? Math.round(p.rev) : null, avg30: p.avg30 != null ? Math.round(p.avg30) : null, rev_vs_pct: r1(p.rev_vs) },
      split, trend: { n: nWin, txn_days: driven.transactions, basket_days: driven.basket, both_days: driven.both, basket_avg_delta: r1(basketAvg), txn_avg_delta: r1(txnAvg), note: trend_note },
      scale, decision_lines,
    },
    facts,
    sources,
  };
}
