// src/lib/poleReading.ts
// Lecture CONTINUE d'un pôle (spec poles-dispositifs-permanents, owner 27/08) — un dispositif
// permanent n'a ni fenêtre ni verdict : sa mesure est le CA journalier de SES familles vs son
// résultat habituel, en continu. Source = raw.client_transactions (item_category), le MÊME
// référentiel que le KPI family_revenue (kpiRegistry.measureFamilyRevenueMean) — jamais forké.
// Référentiels rendus AVEC leurs fenêtres réelles : 30 derniers jours vs les 90 jours qui les
// précèdent ; < 5 jours vendus d'un côté → pas de comparaison (plancher maison n>=5), jamais
// un % fabriqué. Les opérations rattachées se lisent par attached_pole_id (clé de rattachement,
// jamais parent_commitment_id).

const PROJECT = process.env.BQ_PROJECT_ID || "muse-square-open-data";

export interface PoleFamilyReading {
  family: string;
  avg30_eur_day: number | null;   // €/j sur les 30 derniers jours (jours VENDUS)
  n30: number;                    // jours vendus dans les 30 derniers jours
  base_eur_day: number | null;    // €/j sur les 90 jours précédant les 30
  n_base: number;
  delta_pct: number | null;       // (avg30 − base) / base, null sous les planchers
}

export interface PoleOperationRow {
  commitment_id: string;
  status: string;
  verdict: string | null;
  committed_action_text: string | null;
  window_start: string | null;
  window_end: string | null;
  version_no: number | null;
}

export async function buildPoleReading(
  bq: any,
  location_id: string,
  dispositif_id: string,
  families: string[],
  asOfIso: string,
): Promise<{ families: PoleFamilyReading[]; operations: PoleOperationRow[] }> {
  const famsP = families.length
    ? bq.query({
        query: `
          SELECT item_category AS family,
                 SUM(IF(transaction_date >  DATE_SUB(@asOf, INTERVAL 30 DAY), revenue, 0)) AS rev30,
                 COUNT(DISTINCT IF(transaction_date > DATE_SUB(@asOf, INTERVAL 30 DAY), transaction_date, NULL)) AS n30,
                 SUM(IF(transaction_date <= DATE_SUB(@asOf, INTERVAL 30 DAY), revenue, 0)) AS revBase,
                 COUNT(DISTINCT IF(transaction_date <= DATE_SUB(@asOf, INTERVAL 30 DAY), transaction_date, NULL)) AS nBase
          FROM \`${PROJECT}.raw.client_transactions\`
          WHERE location_id = @loc AND item_category IN UNNEST(@fams)
            AND transaction_date > DATE_SUB(@asOf, INTERVAL 120 DAY)
            AND transaction_date <= @asOf
          GROUP BY family`,
        params: { loc: location_id, fams: families, asOf: bq.date(asOfIso) },
        location: "EU",
      }).then((r: any) => (Array.isArray(r?.[0]) ? r[0] : [])).catch(() => [])
    : Promise.resolve([]);
  const opsP = bq.query({
    query: `
      SELECT commitment_id, status, verdict, committed_action_text,
             CAST(window_start AS STRING) AS window_start, CAST(window_end AS STRING) AS window_end,
             version_no
      FROM (
        SELECT *, ROW_NUMBER() OVER (PARTITION BY commitment_id ORDER BY updated_at DESC,
          CASE WHEN status IN ('resolved', 'cancelled') THEN 1 ELSE 0 END DESC,
          (verdict IS NOT NULL) DESC, created_at DESC) AS rn
        FROM \`${PROJECT}.analytics.action_commitments\`
        WHERE attached_pole_id = @d AND location_id = @loc
      )
      WHERE rn = 1 AND status != 'cancelled'
      ORDER BY created_at DESC
      LIMIT 12`,
    params: { d: dispositif_id, loc: location_id },
    types: { d: "STRING", loc: "STRING" }, location: "EU",
  }).then((r: any) => (Array.isArray(r?.[0]) ? r[0] : [])).catch(() => []);

  const [frows, orows] = await Promise.all([famsP, opsP]);
  const flat = (v: any): any => (v && typeof v === "object" && "value" in v ? v.value : v);
  const byFam = new Map<string, any>();
  for (const r of frows as any[]) byFam.set(String(flat(r.family)), r);

  const famReadings: PoleFamilyReading[] = families.map((f) => {
    const r = byFam.get(f);
    const n30 = r ? Number(flat(r.n30)) || 0 : 0;
    const nBase = r ? Number(flat(r.nBase)) || 0 : 0;
    const avg30 = n30 >= 1 ? Math.round((Number(flat(r.rev30)) / n30) * 100) / 100 : null;
    const base = nBase >= 1 ? Math.round((Number(flat(r.revBase)) / nBase) * 100) / 100 : null;
    const delta = n30 >= 5 && nBase >= 5 && base && base > 0 && avg30 != null
      ? Math.round(((avg30 - base) / base) * 1000) / 10
      : null;
    return { family: f, avg30_eur_day: avg30, n30, base_eur_day: base, n_base: nBase, delta_pct: delta };
  });

  const operations: PoleOperationRow[] = (orows as any[]).map((r) => ({
    commitment_id: String(flat(r.commitment_id)),
    status: String(flat(r.status)),
    verdict: r.verdict != null ? String(flat(r.verdict)) : null,
    committed_action_text: r.committed_action_text != null ? String(flat(r.committed_action_text)) : null,
    window_start: r.window_start != null ? String(flat(r.window_start)) : null,
    window_end: r.window_end != null ? String(flat(r.window_end)) : null,
    version_no: r.version_no != null ? Number(flat(r.version_no)) : null,
  }));

  return { families: famReadings, operations };
}
