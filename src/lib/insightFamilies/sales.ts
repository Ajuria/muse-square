// src/lib/insightFamilies/sales.ts
// SALES family provider — la famille qui manquait au pattern (journée dédiée 18/08, décision owner).
// Le verrou historique : renderSales exige `isDown`, et une question sans carte n'a pas de
// signal_type — le dériver du résiduel aurait inventé une 2e définition de « en baisse ».
// LA levée : le provider résout d'abord LE SIGNAL TIRÉ du jour depuis la source de vérité
// (mart.fct_location_daily_action_candidates) — is_down garde ainsi l'UNIQUE définition
// (sales_revenue_down_wow tiré = en baisse, sales_surge tiré = en hausse, sinon NEUTRE et
// le rendu le dit). Le même signal résolu donne sa clé au track record (trackRecordCore).
// Données mix produit : requête VERBATIM de api/insight/sales-breakdown.ts (l'endpoint devient
// un wrapper mince — réponse superset, rien de retiré).
import type { FamilyResult, FamilyFact } from "./types";
import { trackRecordFor } from "../commitments/trackRecordCore";

const PROJECT = "muse-square-open-data";
const MIN_COMPARABLE_DAYS = 3;
const MAX_MOVERS = 20;
// Types de signaux CA réels du mart (vérifiés 18/08). L'ordre est la PRIORITÉ de résolution.
const SALES_SIGNAL_TYPES = [
  "sales_revenue_down_wow", "sales_surge", "sales_underperformance",
  "sales_traffic_not_converting", "sales_discount_no_lift", "sales_competition_cannibalization",
];
const DOW_FR = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];

const num = (v: any): number | null => (v == null ? null : Number(v && typeof v === "object" && "value" in v ? v.value : v));
const frInt = (n: number): string => Math.round(n).toLocaleString("fr-FR");

export async function salesFamily(bq: any, location_id: string, date: string): Promise<FamilyResult> {
  const empty = (): FamilyResult => ({ found: false, data: { found: false, date }, facts: [], sources: [] });

  const [bdRows, sigRows] = await Promise.all([
    bq.query({
      query: `
        WITH day AS (
          SELECT item_category AS category, revenue AS sig_rev, revenue_share, revenue_rank
          FROM \`${PROJECT}.mart.fct_client_offering_daily\`
          WHERE location_id = @location_id AND transaction_date = PARSE_DATE('%Y-%m-%d', @date)
        ),
        base AS (
          SELECT item_category AS category,
                 APPROX_QUANTILES(revenue, 2)[OFFSET(1)] AS med_rev,
                 COUNT(*) AS n_days
          FROM \`${PROJECT}.mart.fct_client_offering_daily\`
          WHERE location_id = @location_id
            AND EXTRACT(DAYOFWEEK FROM transaction_date) = EXTRACT(DAYOFWEEK FROM PARSE_DATE('%Y-%m-%d', @date))
            AND transaction_date < PARSE_DATE('%Y-%m-%d', @date)
          GROUP BY category
        )
        SELECT d.category, d.sig_rev, d.revenue_share, d.revenue_rank, b.med_rev, b.n_days
        FROM day d
        LEFT JOIN base b ON d.category = b.category
        ORDER BY ABS(d.sig_rev - COALESCE(b.med_rev, 0)) DESC
      `,
      params: { location_id, date }, types: { location_id: "STRING", date: "STRING" }, location: "EU",
    }).then((r: any) => r[0]).catch(() => []),
    bq.query({
      query: `SELECT action_type FROM \`${PROJECT}.mart.fct_location_daily_action_candidates\`
              WHERE location_id = @location_id AND date = PARSE_DATE('%Y-%m-%d', @date)
                AND action_type IN UNNEST(@types)`,
      params: { location_id, date, types: SALES_SIGNAL_TYPES },
      types: { location_id: "STRING", date: "STRING", types: ["STRING"] }, location: "EU",
    }).then((r: any) => r[0]).catch(() => []),
  ]);

  // ── Le signal tiré du jour = LA définition de la direction (jamais re-dérivée). ──
  const fired: string[] = (Array.isArray(sigRows) ? sigRows : [])
    .map((r: any) => String(r.action_type && typeof r.action_type === "object" ? r.action_type.value : r.action_type))
    .filter(Boolean);
  const primary = SALES_SIGNAL_TYPES.find((t) => fired.includes(t)) || null;
  const is_down = fired.includes("sales_revenue_down_wow") ? true : fired.includes("sales_surge") ? false : null;

  const jour = DOW_FR[new Date(date + "T12:00:00Z").getUTCDay()];
  const facts: FamilyFact[] = [];
  const sources: string[] = ["Vos ventes (mix par catégorie, mart quotidien)"];

  if (primary) {
    facts.push({
      fact_fr: is_down === true
        ? `Signal CA du ${date.split("-").reverse().slice(0, 2).join("/")} : CA inférieur à vos ${jour}s habituels (carte tirée par le moteur).`
        : is_down === false
          ? `Signal CA du ${date.split("-").reverse().slice(0, 2).join("/")} : CA supérieur à vos ${jour}s habituels (carte tirée par le moteur).`
          : `Signal CA du ${date.split("-").reverse().slice(0, 2).join("/")} : ${primary.replace(/_/g, " ")} (carte tirée par le moteur).`,
      claim_type: "observed",
    });
    sources.push("Signaux du moteur (cartes tirées du jour)");
  } else {
    facts.push({ fact_fr: `Aucun signal CA tiré ce jour-là — lecture descriptive du mix, sans direction affirmée.`, claim_type: "observed" });
  }

  // ── Track record du signal résolu (noyau partagé — même définition que la page carte). ──
  if (primary) {
    const tr = await trackRecordFor(bq, location_id, primary).catch(() => null);
    if (tr && tr.found) {
      facts.push({
        fact_fr: `Vos actions passées sur ce signal : ${tr.done} menée${(tr.done || 0) > 1 ? "s" : ""} et mesurée${(tr.done || 0) > 1 ? "s" : ""}, ${tr.beat} cible${(tr.beat || 0) > 1 ? "s" : ""} tenue${(tr.beat || 0) > 1 ? "s" : ""}${tr.avg_effect_pct != null ? ` (effet moyen ${tr.avg_effect_pct >= 0 ? "+" : ""}${String(tr.avg_effect_pct).replace(".", ",")} % vs votre résultat habituel — résiduel, pas une preuve)` : ""}.`,
        claim_type: "observed",
      });
      sources.push("Track record de vos engagements (mart des verdicts)");
    }
  }

  // ── Mix produit (verbatim sales-breakdown). ──
  const raw: any[] = Array.isArray(bdRows) ? bdRows : [];
  if (!raw.length) {
    // Pas de mix : la famille répond quand même sur le SIGNAL (found si un signal existe).
    return primary
      ? { found: true, data: { found: false, date, is_down, signal_types: fired }, facts, sources }
      : empty();
  }
  const nComparable = raw.reduce((mx, r) => Math.max(mx, num(r.n_days) ?? 0), 0);
  const movers = raw.map((r) => {
    const day_eur = num(r.sig_rev);
    const median_eur = num(r.med_rev);
    const n_days = num(r.n_days) ?? 0;
    if (day_eur == null || median_eur == null || n_days < MIN_COMPARABLE_DAYS) return null;
    const delta_eur = day_eur - median_eur;
    const share = num(r.revenue_share);
    return {
      category: String(r.category && typeof r.category === "object" ? (r.category as any).value : r.category),
      day_eur: Math.round(day_eur), median_eur: Math.round(median_eur), delta_eur: Math.round(delta_eur),
      delta_pct: median_eur > 0 ? Math.round((delta_eur / median_eur) * 100) : null,
      share_pct: share != null ? Math.round(share * 100) : null,
      rank: num(r.revenue_rank),
    };
  }).filter(Boolean) as any[];

  if (!movers.length) {
    return primary
      ? { found: true, data: { found: false, date, is_down, signal_types: fired }, facts, sources }
      : empty();
  }
  const day_total_eur = Math.round(raw.reduce((s, r) => s + (num(r.sig_rev) ?? 0), 0));

  const top = movers.slice().sort((a, b) => Math.abs(b.delta_eur) - Math.abs(a.delta_eur))[0];
  facts.push({
    fact_fr: `CA du jour ${frInt(day_total_eur)} € · plus gros écart au mix : ${top.category} (${top.delta_eur >= 0 ? "+" : "−"}${frInt(Math.abs(top.delta_eur))} € vs la médiane de vos ${jour}s, n=${nComparable}).`,
    claim_type: "observed",
  });

  return {
    found: true,
    data: {
      found: true, date,
      n_comparable_days: nComparable, day_total_eur,
      movers: movers.slice(0, MAX_MOVERS),
      is_down, signal_types: fired,
    },
    facts, sources,
  };
}
