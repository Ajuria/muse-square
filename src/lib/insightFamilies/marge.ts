// src/lib/insightFamilies/marge.ts
// MARGE family provider — « quelle est ma marge brute ? » (11/09, audit profit-grains § 6 A8,
// docs/catalogue-de-couts-et-marge.md M7-M9). LA marge MESURÉE : CA net HT moins le prix d'achat HT des
// articles vendus, sur 30 jours glissants, lue par LE foyer lib/kpi/margin.ts (readMeasuredMargin30d —
// semantic.vw_insight_event_daily_margin + vw_insight_event_family_margin_daily). Jamais une estimation
// par marge déclarée ici : l'estimation vit dans le chemin déclaré du chat et dans Piloter (mode mixte).
//
// HONNÊTETÉ : une marge ne se montre qu'avec sa couverture (« calculée sur X % de votre CA · prix
// d'achat manquants sur Y % ») ; sous 50 % de couverture (mode estime) ou sans prix d'achat (aucune),
// le provider rend found=false — absence dite, aucun chiffre. Les faits citables portent la couverture
// comme un fait à part : le modèle ne peut pas citer la marge sans elle.
import type { FamilyResult, FamilyFact } from "./types";
import { readMeasuredMargin30d, type MeasuredMargin30d } from "../kpi/margin";

const frInt = (n: number): string => Math.round(n).toLocaleString("fr-FR");
const pct1 = (n: number): string => String(Math.round(n * 10) / 10).replace(".", ",");

/** Composition PURE : lecture → data (rendu) + faits — testée sans BigQuery. */
export function composeMargeFamily(m: MeasuredMargin30d, date: string, window_fr = "vos 30 derniers jours"): FamilyResult {
  if (m.mode === "aucune" || m.mode === "estime" || m.gross_margin_ht == null || m.coverage_pct == null) {
    return { found: false, data: { found: false, date, mode: m.mode, coverage_pct: m.coverage_pct }, facts: [], sources: [] };
  }
  const cov = Math.round(m.coverage_pct);
  const missing = Math.max(0, 100 - cov);
  const families = m.families
    .filter((f) => f.gross_margin_ht != null)
    .map((f) => ({
      family: f.family, revenue: Math.round(f.revenue), gross_margin_ht: Math.round(f.gross_margin_ht as number),
      margin_rate_pct: f.margin_rate_pct, coverage_pct: f.coverage_pct, below_cost_lines: f.below_cost_lines,
      // Part de marge contre part de CA : la lecture « lourde en CA, légère en marge » (audit § 6 A7).
      revenue_share_pct: m.revenue > 0 ? Math.round((f.revenue / m.revenue) * 1000) / 10 : null,
      margin_share_pct: m.gross_margin_ht ? Math.round(((f.gross_margin_ht as number) / (m.gross_margin_ht as number)) * 1000) / 10 : null,
    }));
  const lead = `Marge brute : ${frInt(m.gross_margin_ht)} € sur ${window_fr}` +
    (m.margin_rate_pct != null ? ` · taux de marge brute ${m.margin_rate_pct} %` : "") +
    ` · calculée sur ${cov} % de votre CA`;
  const facts: FamilyFact[] = [
    { fact_fr: `Sur ${window_fr} (du ${frDate(m.window.start)} au ${frDate(m.window.end)}), votre marge brute est de ${frInt(m.gross_margin_ht)} €` +
        (m.margin_rate_pct != null ? `, soit un taux de marge brute de ${m.margin_rate_pct} %` : "") + ".", claim_type: "observed" },
    { fact_fr: `Cette marge brute est calculée sur ${cov} % de votre CA · prix d'achat manquants sur ${missing} %.`, claim_type: "observed" },
  ];
  for (const f of families.slice(0, 5)) {
    facts.push({
      fact_fr: `${f.family} : ${frInt(f.gross_margin_ht)} € de marge brute sur ${window_fr}` +
        (f.margin_rate_pct != null ? ` (taux ${f.margin_rate_pct} %)` : "") +
        (f.coverage_pct != null && f.coverage_pct < 99.5 ? `, calculée sur ${pct1(f.coverage_pct)} % de son CA` : "") + ".",
      claim_type: "observed",
    });
  }
  const heavyLight = families.find((f) => f.revenue_share_pct != null && f.margin_share_pct != null && f.revenue_share_pct >= 15 && f.margin_share_pct <= f.revenue_share_pct - 5);
  if (heavyLight) {
    facts.push({
      fact_fr: `${heavyLight.family} pèse ${pct1(heavyLight.revenue_share_pct as number)} % de votre CA mais ${pct1(heavyLight.margin_share_pct as number)} % de votre marge brute.`,
      claim_type: "observed_difference",
    });
  }
  if (m.below_cost_lines > 0) {
    facts.push({ fact_fr: `${m.below_cost_lines} ligne${m.below_cost_lines > 1 ? "s" : ""} de vente vendue${m.below_cost_lines > 1 ? "s" : ""} sous son prix d'achat sur ${window_fr}.`, claim_type: "observed" });
  }
  return {
    found: true,
    data: {
      found: true, date, mode: m.mode, lead,
      window: m.window, revenue: Math.round(m.revenue), gross_margin_ht: Math.round(m.gross_margin_ht),
      margin_rate_pct: m.margin_rate_pct, coverage_pct: m.coverage_pct, missing_pct: missing,
      below_cost_lines: m.below_cost_lines, heavy_light: heavyLight ? heavyLight.family : null,
      families,
    },
    facts,
    sources: ["Votre caisse et vos prix d'achat — marge brute par jour et par famille (30 jours)"],
  };
}

function frDate(iso: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : iso;
}

export async function margeFamily(bq: any, location_id: string, date: string): Promise<FamilyResult> {
  const m = await readMeasuredMargin30d(bq, location_id, date);
  return composeMargeFamily(m, date);
}
