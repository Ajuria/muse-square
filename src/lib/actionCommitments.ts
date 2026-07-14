// Shared read-merge-write core for analytics.action_commitments.
// THE single source used by ALL FOUR writers — create endpoint, disposition
// endpoint, resolution cron, retro endpoint. Never copy-paste this logic:
// partial appends are what silently corrupt the log.
//
// Write model: every transition = read latest snapshot -> merge patch -> write
// a COMPLETE row via INSERT DML. prior === null is the clean create case.
//   - INSERT DML (not streaming insert()): immediately visible to the next
//     SELECT, so create -> quick-disposition doesn't hit the streaming buffer
//     and throw "not found". Typed NULL params required (streaming infers types
//     for free; DML does not) -> COLUMN_SPEC drives column list, VALUES params,
//     AND per-column types from ONE canonical array kept in lockstep with the
//     DDL. Never hand-type columns twice.
//   - CAS-retry: re-read updated_at right before the write; if it moved, re-merge
//     once onto the newer snapshot. Narrows the read->write race from days to ms.
//     NOT full atomicity (a BQ transaction/MERGE would be overkill at this volume).
//   - assertTermsPresent(): loud in-app guard chosen OVER DB NOT NULL on terms.

const BQ_PROJECT = process.env.BQ_PROJECT_ID || "muse-square-open-data";
const DATASET = "analytics";
const TABLE_NAME = "action_commitments";
const TABLE_FQN = `${BQ_PROJECT}.${DATASET}.${TABLE_NAME}`;

export type TransitionType =
  | "created" | "disposition" | "resolved" | "expired" | "retro" | "cancelled" | "edited";

// Canonical column set: [name, BigQuery type], in DDL order. Single source for
// the interface below, the INSERT column list, the VALUES params, and the typed
// nulls. Keep in lockstep with action_commitments.ddl.sql.
const COLUMN_SPEC: ReadonlyArray<readonly [string, string]> = [
  ["commitment_id", "STRING"],
  ["user_id", "STRING"],
  ["location_id", "STRING"],
  ["status", "STRING"],
  ["authorship", "STRING"],
  ["created_at", "TIMESTAMP"],
  ["updated_at", "TIMESTAMP"],
  ["transition_type", "STRING"],
  ["verdict", "STRING"],
  ["origin_kind", "STRING"],
  ["origin_action_type", "STRING"],
  ["origin_driver", "STRING"],
  ["origin_factor", "STRING"],
  ["origin_suppression_key", "STRING"],
  ["origin_card_instance_id", "STRING"],
  ["origin_affected_date", "DATE"],
  ["measured_metric", "STRING"],
  ["window_kind", "STRING"],
  ["window_start", "DATE"],
  ["window_end", "DATE"],
  ["window_days_expected", "INT64"],
  ["threshold_level", "STRING"],
  ["threshold_basis", "STRING"],
  ["threshold_value", "FLOAT64"],
  ["committed_action_text", "STRING"],
  ["owner_person_name", "STRING"],
  ["owner_person_id", "STRING"],
  ["creation_residual_pct", "FLOAT64"],
  ["creation_residual_z", "FLOAT64"],
  ["creation_confidence_tier", "STRING"],
  ["action_done_status", "STRING"],
  ["action_done_at", "TIMESTAMP"],
  ["dispositif_note", "STRING"],
  ["retro_note", "STRING"],
  ["resolved_at", "TIMESTAMP"],
  ["window_actual_revenue", "FLOAT64"],
  ["window_expected_revenue", "FLOAT64"],
  ["window_residual_pct", "FLOAT64"],
  ["window_residual_z", "FLOAT64"],
  ["window_residual_z_raw", "FLOAT64"],
  ["applied_rho", "FLOAT64"],
  ["applied_vif", "FLOAT64"],
  ["window_days_resolved", "INT64"],
  ["ctx_any_school_holiday", "BOOL"],
  ["ctx_school_holiday_days", "INT64"],
  ["material_holiday_share", "FLOAT64"],
  ["ctx_worst_weather_impact_pct", "FLOAT64"],
  ["ctx_max_event_count", "INT64"],
  ["ctx_max_tourism_index", "FLOAT64"],
  ["ctx_material_confound", "BOOL"],
  ["window_active_factors", "STRING"],
  // Structured "Documenter" retro (Spec 2) — the reusable knowledge-base entry. Added to the DDL
  // end via ALTER ADD COLUMN; keep these last to mirror physical column order.
  ["retro_worked", "STRING"],
  ["retro_change", "STRING"],
  ["retro_repeat", "BOOL"],
  // Adjustment "how" loop — the mid-flight move + what changed + the chain to the parent commitment.
  ["adjustment_move", "STRING"],
  ["adjustment_note", "STRING"],
  ["parent_commitment_id", "STRING"],
  ["execution_quality", "STRING"],
];

// Row shape mirrors COLUMN_SPEC / the DDL. Carried forward verbatim on every
// append except the columns a given transition patches.
export interface CommitmentRow {
  commitment_id: string;
  user_id: string;
  location_id: string;
  status: string;                 // open|pending|resolved|expired|cancelled
  authorship: string;             // const 'user_authored'
  created_at: string;             // ISO; original creation, carried forward
  updated_at: string;             // ISO; this write
  transition_type: TransitionType;
  verdict: string | null;         // met|missed|confounded, else null
  origin_kind: string | null;
  origin_action_type: string | null;
  origin_driver: string | null;
  origin_factor: string | null;      // environmental factor the card was about (heat, rain…) — Engine-1 A↔B bridge
  origin_suppression_key: string | null;
  origin_card_instance_id: string | null;
  origin_affected_date: string | null;   // 'YYYY-MM-DD'
  measured_metric: string | null;
  window_kind: string | null;
  window_start: string | null;            // 'YYYY-MM-DD'
  window_end: string | null;              // 'YYYY-MM-DD'
  window_days_expected: number | null;
  threshold_level: string | null;
  threshold_basis: string | null;
  threshold_value: number | null;
  committed_action_text: string | null;
  owner_person_name: string | null;
  owner_person_id: string | null;
  creation_residual_pct: number | null;
  creation_residual_z: number | null;
  creation_confidence_tier: string | null;
  action_done_status: string | null;      // fait|pas_encore
  action_done_at: string | null;
  dispositif_note: string | null;
  retro_note: string | null;
  resolved_at: string | null;
  window_actual_revenue: number | null;
  window_expected_revenue: number | null;
  window_residual_pct: number | null;
  window_residual_z: number | null;
  window_residual_z_raw: number | null;
  applied_rho: number | null;
  applied_vif: number | null;
  window_days_resolved: number | null;
  ctx_any_school_holiday: boolean | null;
  ctx_school_holiday_days: number | null;
  material_holiday_share: number | null;
  ctx_worst_weather_impact_pct: number | null;
  ctx_max_event_count: number | null;
  ctx_max_tourism_index: number | null;
  ctx_material_confound: boolean | null;
  window_active_factors: string | null; // CSV-encoded ARRAY of registry factor keys (comma-free) the
                                         // action ran under, computed at resolution; dbt SPLIT()s to ARRAY
  retro_worked: string | null;           // "Qu'est-ce qui a marché ?" — structured Documenter retro (Spec 2)
  retro_change: string | null;           // "Qu'est-ce que je changerais ?"
  retro_repeat: boolean | null;          // "À reproduire ?" oui/non — the repeat signal Spec 1 surfaces
  adjustment_move: string | null;        // poursuivre|doubler|pivoter|stop — mid-flight move ("how" loop)
  adjustment_note: string | null;        // what changed (family-hinted)
  parent_commitment_id: string | null;   // the adjustment chain (this commitment adjusts that one)
  execution_quality: string | null;      // complete|partial|none — self-reported run quality (routes advice)
}

// The columns that make a commitment a commitment. Any write (create OR later
// transition) must carry these — else the merge dropped them. threshold_level
// is included: it defines the commitment as much as threshold_value.
const TERM_COLUMNS: (keyof CommitmentRow)[] = [
  "measured_metric", "window_kind", "window_start", "window_end",
  "window_days_expected", "threshold_level", "threshold_basis",
  "threshold_value", "committed_action_text", "owner_person_name",
];

// BQ returns DATE/TIMESTAMP as { value: "..." }. Flatten to primitives so a
// re-insert of a carried-forward row round-trips cleanly.
function flatten(v: any): any {
  if (v && typeof v === "object" && "value" in v) return (v as any).value;
  return v;
}
function normaliseRow(r: any): CommitmentRow {
  const out: any = {};
  for (const k of Object.keys(r)) out[k] = flatten(r[k]);
  return out as CommitmentRow;
}

export async function readLatestSnapshot(
  bq: any,
  commitmentId: string,
): Promise<CommitmentRow | null> {
  const [rows] = await bq.query({
    query: `
      SELECT * EXCEPT(rn) FROM (
        SELECT *, ROW_NUMBER() OVER (
          PARTITION BY commitment_id ORDER BY updated_at DESC
        ) AS rn
        FROM \`${TABLE_FQN}\`
        WHERE commitment_id = @commitmentId
      ) WHERE rn = 1
    `,
    params: { commitmentId },
    location: "EU",
  });
  if (!rows || rows.length === 0) return null;
  return normaliseRow(rows[0]);
}

// Loud guard — throws before any write if the carried-forward terms went missing.
export function assertTermsPresent(row: Partial<CommitmentRow>): void {
  const missing = TERM_COLUMNS.filter((c) => {
    const v = (row as any)[c];
    return v === null || v === undefined || v === "";
  });
  if (missing.length) {
    throw new Error(
      "action_commitments merge would drop terms [" + missing.join(", ") +
      "] for commitment " + (row.commitment_id || "?") +
      " — refusing partial write.",
    );
  }
}

// Typed INSERT DML driven entirely by COLUMN_SPEC (column list + params + types).
async function insertRow(bq: any, row: CommitmentRow): Promise<void> {
  const cols = COLUMN_SPEC.map(([name]) => name);
  const params: Record<string, any> = {};
  const types: Record<string, string> = {};
  for (const [name, type] of COLUMN_SPEC) {
    let v = (row as any)[name];
    if (v === undefined) v = null;
    if (v === null) {
      // typed NULL — DML requires the type for null params
      params[name] = null;
      types[name] = type;
    } else if (type === "TIMESTAMP") {
      params[name] = bq.timestamp(v); // self-typed; string TIMESTAMP params null out
    } else if (type === "DATE") {
      params[name] = bq.date(v);      // self-typed
    } else {
      // STRING / INT64 / FLOAT64 / BOOL — explicit type disambiguates INT vs FLOAT
      params[name] = v;
      types[name] = type;
    }
  }
  const query =
    `INSERT INTO \`${TABLE_FQN}\` (${cols.join(", ")})\n` +
    `VALUES (${cols.map((n) => "@" + n).join(", ")})`;
  await bq.query({ query, params, types, location: "EU" });
}

// THE single read-merge-write. Used by every writer.
//   create=true  -> expect NO prior row; patch carries full terms.
//   create=false -> expect a prior row; patch changes only its own fields.
export async function readMergeWrite(
  bq: any,
  opts: {
    commitmentId: string;
    transitionType: TransitionType;
    patch: Partial<CommitmentRow>;
    create?: boolean;
  },
): Promise<CommitmentRow> {
  const now = new Date().toISOString();

  const prepare = (prior: CommitmentRow | null): CommitmentRow => {
    if (opts.create && prior) {
      throw new Error("commitment already exists: " + opts.commitmentId);
    }
    if (!opts.create && !prior) {
      throw new Error("commitment not found: " + opts.commitmentId);
    }
    const base: Partial<CommitmentRow> = prior ? { ...prior } : {};
    const merged = {
      ...base,
      ...opts.patch,
      commitment_id: opts.commitmentId,
      authorship: "user_authored",
      updated_at: now,
      transition_type: opts.transitionType,
      created_at: opts.create ? now : prior!.created_at,
    } as CommitmentRow;
    assertTermsPresent(merged); // runs on EVERY write, create included
    return merged;
  };

  const prior1 = await readLatestSnapshot(bq, opts.commitmentId);
  let merged = prepare(prior1);

  // CAS: re-read right before writing; if latest moved since prior1, re-merge
  // once onto the newer snapshot (DML gives read-after-write consistency, so
  // this actually sees a concurrent write). Window: days -> ms, not atomic.
  const prior2 = await readLatestSnapshot(bq, opts.commitmentId);
  const uv1 = prior1 ? prior1.updated_at : null;
  const uv2 = prior2 ? prior2.updated_at : null;
  if (uv1 !== uv2) merged = prepare(prior2);

  await insertRow(bq, merged);
  return merged;
}
