// Audit de vérité rejoué avec le moteur du 22/08 (régime log, 6 métriques), sur TOUT le parc.
// Méthode : les portes ne sont PAS réimplémentées — on appelle rowsToImpactsWithImmaterial,
// le seul point d'entrée de lecture, exactement comme monitor.ts.
import "dotenv/config";
import { BigQuery } from "@google-cloud/bigquery";
import { rowsToImpactsWithImmaterial } from "../src/lib/dayClassRegistry";
const bq = new BigQuery({ projectId: "muse-square-open-data", location: "EU" });
const f = (v:any)=> v && typeof v==="object" && "value" in v ? v.value : v;

const CARD_TYPE_CLASS: Record<string,string> = {
  sales_discount_no_lift:"discount_no_lift", competition_pressure_spike:"competition_high",
  low_tourism_local_opp:"tourism_low", competition_proximity:"events_high",
  high_competition_density:"events_high", same_bucket_saturation:"events_high",
  foreign_tourism_signal:"tourism_high", tourist_high_season:"tourism_high",
  tourist_surge_vacation:"tourism_high", tourism_peak_window:"tourism_high",
  mobility_disruption:"mobility_disruption", mobility_disruption_planned:"mobility_disruption",
  ft_peak_mobility:"mobility_disruption",
};
const STRUCT_CLASSES = ["traffic_high","followed_activity_high","competition_low"];

(async () => {
  const [store] = await bq.query({ query: `
    SELECT location_id, class_key, family, basis, metric, n_days, avg_gap_eur, sd_gap_eur,
           med_gap_eur, n_log, avg_log, sd_log, span_days
    FROM \`muse-square-open-data.analytics.day_class_impacts\`
    WHERE metric = 'revenue_residual'`, location:"EU" });
  const [rev] = await bq.query({ query: `
    SELECT location_id, SAFE_DIVIDE(SUM(daily_revenue),
             NULLIF(DATE_DIFF(MAX(transaction_date), MIN(transaction_date), DAY)+1,0)) * 365.25 AS ar
    FROM \`muse-square-open-data.mart.fct_client_daily_performance\` GROUP BY 1`, location:"EU" });
  const [fires] = await bq.query({ query: `
    SELECT action_type, COUNT(*) tirs, COUNT(DISTINCT location_id) sites
    FROM \`muse-square-open-data.semantic.vw_insight_event_action_candidates\`
    WHERE date >= DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY)
    GROUP BY 1 ORDER BY tirs DESC`, location:"EU" });

  const arBy = new Map((rev as any[]).map((r:any)=>[String(f(r.location_id)), Number(f(r.ar))]));
  const bySite = new Map<string, any[]>();
  for (const r of store as any[]) {
    const k = String(f(r.location_id));
    if (!bySite.has(k)) bySite.set(k, []);
    bySite.get(k)!.push(Object.fromEntries(Object.entries(r).map(([a,b])=>[a,f(b)])));
  }
  // Politique RÉELLE, site par site.
  const holds = new Map<string, { ok: string[]; immat: string[]; none: string[] }>();
  for (const [loc, rows] of bySite) {
    const { impacts, immaterial } = rowsToImpactsWithImmaterial(rows, arBy.get(loc) ?? null);
    for (const cls of new Set(rows.map(r=>String(r.class_key)))) {
      if (!holds.has(cls)) holds.set(cls, { ok: [], immat: [], none: [] });
      const h = holds.get(cls)!;
      if (impacts.has(cls)) h.ok.push(loc); else if (immaterial.has(cls)) h.immat.push(loc); else h.none.push(loc);
    }
  }
  console.log(`Parc : ${bySite.size} sites au store · ${(fires as any[]).length} types de cartes ont tiré sur 90 j\n`);
  console.log("═══ A. CLASSES : sur combien de sites la mesure PASSE-t-elle les portes ? ═══");
  console.table([...holds.entries()].sort((a,b)=>b[1].ok.length-a[1].ok.length).map(([cls,h])=>({
    classe: cls, "passe (pilule)": h.ok.length, "écartée matérialité": h.immat.length,
    "écartée portes": h.none.length, "sites où la classe existe": h.ok.length+h.immat.length+h.none.length })));

  console.log("\n═══ B. CARTES adossées à une classe : le signal tient-il ? ═══");
  const rows: any[] = [];
  for (const fr of fires as any[]) {
    const at = String(f(fr.action_type));
    const cls = CARD_TYPE_CLASS[at] || (STRUCT_CLASSES.includes(at.replace("structural_","")) ? at.replace("structural_","") : null);
    if (!cls) continue;
    const h = holds.get(cls);
    rows.push({ carte: at, classe: cls, tirs: Number(f(fr.tirs)), sites_qui_tirent: Number(f(fr.sites)),
      "sites où la classe PASSE": h ? h.ok.length : 0,
      verdict: !h ? "classe jamais mesurée" : h.ok.length === 0 ? "AUCUN site : la carte tire sans mesure" :
               h.ok.length < Number(f(fr.sites)) / 2 ? "minorité de sites" : "majorité de sites" });
  }
  console.table(rows.sort((a,b)=>b.tirs-a.tirs));
})().catch(e=>{console.error("ÉCHEC:",e?.message);process.exit(1);});
