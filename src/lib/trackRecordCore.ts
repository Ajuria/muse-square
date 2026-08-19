// Noyau PARTAGÉ du track record « Ce qui a marché » — extrait VERBATIM de
// api/insight/track-record.ts (journée dédiée 18/08, décision owner) pour être consommé par :
// (1) l'endpoint (wrapper mince, réponse inchangée), (2) le provider de famille SALES — qui
// résout d'abord le signal tiré du jour, puis lit le track record de SON action_type.
// Grain : le mart PRÉ-EXPLOSION fct_client_commitment_outcomes (jamais la table learning
// explosée par facteur — elle double-compte). Absence honnête : found:false, jamais fabriqué.
const PROJECT = "muse-square-open-data";

const num = (v: any): number | null => (v == null ? null : Number(v && typeof v === "object" && "value" in v ? v.value : v));
const ymd = (v: any): string | null => (v == null ? null : (typeof v === "object" && "value" in v ? String(v.value) : String(v)));

export interface TrackRecord {
  found: boolean;
  action_type: string;
  done?: number;
  beat?: number;
  missed?: number;
  avg_effect_pct?: number | null;
  last_resolved?: string | null;
  best?: {
    action_text: string; dispositif: string | null; worked: string | null;
    repeat: boolean | null; effect_pct: number | null; resolved_date: string | null;
  } | null;
}

export async function trackRecordFor(bq: any, location_id: string, action_type: string): Promise<TrackRecord> {
  const [rows] = await bq.query({
    query: `SELECT
              COUNTIF(NOT is_confounded) AS done,
              COUNTIF(NOT is_confounded AND verdict = 'met') AS beat,
              COUNTIF(NOT is_confounded AND verdict = 'missed') AS missed,
              AVG(IF(NOT is_confounded, effect_residual_pct, NULL)) AS avg_effect_pct,
              MAX(resolved_date) AS last_resolved
            FROM \`${PROJECT}.mart.fct_client_commitment_outcomes\`
            WHERE location_id = @location_id
              AND action_type = @action_type`,
    params: { location_id, action_type }, types: { location_id: "STRING", action_type: "STRING" }, location: "EU",
  });
  const r: any = Array.isArray(rows) && rows.length ? rows[0] : null;
  const done = r ? (num(r.done) ?? 0) : 0;
  if (!r || done <= 0) return { found: false, action_type };

  const [bestRows] = await bq.query({
    query: `SELECT committed_action_text, dispositif_note, retro_worked, retro_repeat,
                   window_residual_pct AS effect_pct, DATE(resolved_at) AS resolved_date
            FROM (
              SELECT *, ROW_NUMBER() OVER (PARTITION BY commitment_id ORDER BY updated_at DESC, CASE WHEN status IN ('resolved', 'cancelled') THEN 1 ELSE 0 END DESC, (verdict IS NOT NULL) DESC, created_at DESC) AS rn
              FROM \`${PROJECT}.analytics.action_commitments\`
              WHERE location_id = @location_id AND origin_action_type = @action_type
            )
            WHERE rn = 1 AND status = 'resolved' AND action_done_status = 'fait' AND verdict = 'met'
            ORDER BY window_residual_pct DESC
            LIMIT 1`,
    params: { location_id, action_type }, types: { location_id: "STRING", action_type: "STRING" }, location: "EU",
  });
  const bp: any = Array.isArray(bestRows) && bestRows.length ? bestRows[0] : null;
  const best = bp && bp.committed_action_text ? {
    action_text: String(bp.committed_action_text),
    dispositif: bp.dispositif_note != null ? String(bp.dispositif_note) : null,
    worked: bp.retro_worked != null ? String(bp.retro_worked) : null,
    repeat: bp.retro_repeat == null ? null : (bp.retro_repeat === true || bp.retro_repeat === "true"),
    effect_pct: bp.effect_pct != null ? Math.round(num(bp.effect_pct)! * 10) / 10 : null,
    resolved_date: ymd(bp.resolved_date),
  } : null;

  return {
    found: true, action_type, done,
    beat: num(r.beat) ?? 0, missed: num(r.missed) ?? 0,
    avg_effect_pct: r.avg_effect_pct != null ? Math.round(num(r.avg_effect_pct)! * 10) / 10 : null,
    last_resolved: ymd(r.last_resolved),
    best,
  };
}
