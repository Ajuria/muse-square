// « Vos bonnes pratiques » — the venue's own knowledge base of what worked (validé 26/07,
// proto public/methode-proto.html).
//
// TWO doors feed it, ONE reader serves it:
//   1. DECLARED — a positive card's « M'engager » opens « Enrichir vos bonnes pratiques »
//      (public/bp-form.js) → POST /api/best-practices → a row HERE (analytics.best_practices).
//      A declared cause is a USER HYPOTHESIS ("déclarée"), never presented as fact.
//   2. PROVEN — the EXISTING commitment loop: a resolved commitment with verdict 'met'
//      (analytics.action_commitments, retro columns retro_worked/retro_repeat) IS a proven
//      practice. The reader UNIONs those in — nothing is re-stored, no second write path.
// Tier is COMPUTED AT READ TIME: a declared practice whose replay commitment (chain
// « Ajouter + m'engager à la rejouer ») resolved 'met' reads as "prouvée" via JOIN — no
// promotion cron, no tier column to drift.
//
// Matching vocabulary is 100% existing (audit 26/07 — nothing new invented):
//   kpi           = kpiRegistry.kpiKeyForOrigin(origin_action_type, origin_driver)
//   outcome_lever = bestInClassStore.leverForActionType(origin_action_type)  (DERIVED, never asked)
//   day_class_key = dayClassRegistry class keys (enjeu.class_key when the card carries one)
//   means_lever   = the ONLY user-chosen field (offre|staffing|communication|prix|accueil|autre)
// Match rule (validé) : same location (account-wide later), same kpi, and
// (same outcome_lever OR same day_class_key).
//
// NOT analytics.best_in_class_plays (EXTERNAL crawled sector references — no location, no
// author) and NOT a new grain on action_commitments (objective+window grain; a practice has
// neither). Audit documented in docs/best-practices.md.

const BQ_PROJECT = process.env.BQ_PROJECT_ID || "muse-square-open-data";
const TABLE_FQN = `${BQ_PROJECT}.analytics.best_practices`;
const COMMITMENTS_FQN = `${BQ_PROJECT}.analytics.action_commitments`;

// Canonical column set: [name, BigQuery type], in DDL order — same discipline as
// actionCommitments.COLUMN_SPEC (drives DDL, INSERT list, params, typed nulls).
const COLUMN_SPEC: ReadonlyArray<readonly [string, string]> = [
  ["practice_id", "STRING"],
  ["user_id", "STRING"],
  ["location_id", "STRING"],
  ["created_at", "TIMESTAMP"],
  ["author_person_name", "STRING"],
  ["origin_card_instance_id", "STRING"],
  ["origin_action_type", "STRING"],
  ["origin_driver", "STRING"],
  ["origin_affected_date", "DATE"],
  ["kpi", "STRING"],
  ["outcome_lever", "STRING"],
  ["means_lever", "STRING"],
  ["day_class_key", "STRING"],
  ["practice_text", "STRING"],
  ["replay_commitment_id", "STRING"],
  ["status", "STRING"],
];

export interface BestPracticeRow {
  practice_id: string;
  user_id: string | null;
  location_id: string;
  created_at?: string;
  author_person_name: string | null;
  origin_card_instance_id: string | null;
  origin_action_type: string;
  origin_driver: string | null;
  origin_affected_date: string | null;
  kpi: string;
  outcome_lever: string;
  means_lever: string | null;
  day_class_key: string | null;
  practice_text: string;
  replay_commitment_id: string | null;
  status: "active" | "archivee";
}

// A practice as SERVED to the UI (tier computed at read; proven commitments unioned in).
export interface ServedPractice {
  practice_id: string;
  practice_text: string;
  author_person_name: string | null;
  origin_affected_date: string | null;
  tier: "declaree" | "prouvee";
  source: "declared" | "commitment";
}

const flat = (v: any): any => (v && typeof v === "object" && "value" in v ? v.value : v);

// App-write table, created on first use (same family as analytics.day_class_impacts).
// CREATE TABLE IF NOT EXISTS is idempotent and race-safe at this volume.
export async function ensureBestPracticesTable(bq: any): Promise<void> {
  const cols = COLUMN_SPEC.map(([n, t]) => `${n} ${t}`).join(", ");
  await bq.query({ query: `CREATE TABLE IF NOT EXISTS \`${TABLE_FQN}\` (${cols})`, location: "EU" });
}

export async function insertBestPractice(bq: any, row: BestPracticeRow): Promise<void> {
  await ensureBestPracticesTable(bq);
  const cols = COLUMN_SPEC.map(([n]) => n);
  const values = cols.map((n) => (n === "created_at" ? "CURRENT_TIMESTAMP()" : `@${n}`));
  const params: Record<string, any> = {};
  const types: Record<string, string> = {};
  for (const [name, type] of COLUMN_SPEC) {
    if (name === "created_at") continue;
    params[name] = (row as any)[name] ?? null;
    types[name] = type;
  }
  await bq.query({
    query: `INSERT INTO \`${TABLE_FQN}\` (${cols.join(", ")}) VALUES (${values.join(", ")})`,
    params,
    types,
    location: "EU",
  });
}

// Matched practices for an origin context, best-first: prouvée avant déclarée, puis récence.
// UNION of (a) declared practices here (tier via replay-commitment JOIN) and (b) proven
// commitments (verdict 'met', an action text worth reusing) on the same kpi. LIMIT small —
// this feeds the « Mon action » suggestion slot, not a browse page.
export async function listMatchedPractices(
  bq: any,
  args: { location_id: string; kpi: string; outcome_lever: string; day_class_key?: string | null; limit?: number }
): Promise<ServedPractice[]> {
  const limit = Math.max(1, Math.min(args.limit || 3, 6));
  let rows: any[] = [];
  try {
    [rows] = await bq.query({
      query: `
        WITH declared AS (
          SELECT bp.practice_id, bp.practice_text, bp.author_person_name,
                 CAST(bp.origin_affected_date AS STRING) AS origin_affected_date,
                 IF(c.verdict = 'met', 'prouvee', 'declaree') AS tier,
                 'declared' AS source, bp.created_at AS ts
          FROM \`${TABLE_FQN}\` bp
          LEFT JOIN (
            SELECT commitment_id, verdict, ROW_NUMBER() OVER (PARTITION BY commitment_id ORDER BY updated_at DESC) AS rn
            FROM \`${COMMITMENTS_FQN}\`
          ) c ON c.commitment_id = bp.replay_commitment_id AND c.rn = 1
          WHERE bp.location_id = @location_id AND bp.status = 'active'
            AND bp.kpi = @kpi
            AND (bp.outcome_lever = @outcome_lever
                 OR (@day_class_key IS NOT NULL AND bp.day_class_key = @day_class_key))
        ),
        proven_commitments AS (
          SELECT commitment_id AS practice_id,
                 COALESCE(NULLIF(TRIM(retro_worked), ''), committed_action_text) AS practice_text,
                 owner_person_name AS author_person_name,
                 CAST(origin_affected_date AS STRING) AS origin_affected_date,
                 'prouvee' AS tier, 'commitment' AS source, updated_at AS ts
          FROM (
            SELECT *, ROW_NUMBER() OVER (PARTITION BY commitment_id ORDER BY updated_at DESC) AS rn
            FROM \`${COMMITMENTS_FQN}\`
            WHERE location_id = @location_id
          )
          WHERE rn = 1 AND verdict = 'met' AND status = 'resolved'
            AND COALESCE(NULLIF(TRIM(retro_worked), ''), NULLIF(TRIM(committed_action_text), '')) IS NOT NULL
            -- measured_metric est NULL sur les engagements antérieurs à la colonne KPI (étape 3,
            -- 26/07) : ils mesuraient TOUS le résiduel CA — coalesce, sinon l'historique prouvé
            -- serait invisible (vérifié : l'unique verdict 'met' réel est pré-colonne).
            AND COALESCE(measured_metric, 'revenue_residual') = @kpi
            AND commitment_id NOT IN (SELECT IFNULL(replay_commitment_id, '') FROM \`${TABLE_FQN}\` WHERE location_id = @location_id)
        )
        SELECT practice_id, practice_text, author_person_name, origin_affected_date, tier, source
        FROM (SELECT * FROM declared UNION ALL SELECT * FROM proven_commitments)
        ORDER BY IF(tier = 'prouvee', 0, 1), ts DESC
        LIMIT ${limit}
      `,
      params: {
        location_id: args.location_id,
        kpi: args.kpi,
        outcome_lever: args.outcome_lever,
        day_class_key: args.day_class_key ?? null,
      },
      types: { location_id: "STRING", kpi: "STRING", outcome_lever: "STRING", day_class_key: "STRING" },
      location: "EU",
    });
  } catch (e) {
    return []; // table absent (no practice ever saved) → empty slot, callers degrade quietly
  }
  return (rows || []).map((r: any) => ({
    practice_id: String(flat(r.practice_id) || ""),
    practice_text: String(flat(r.practice_text) || ""),
    author_person_name: flat(r.author_person_name) != null ? String(flat(r.author_person_name)) : null,
    origin_affected_date: flat(r.origin_affected_date) != null ? String(flat(r.origin_affected_date)) : null,
    tier: flat(r.tier) === "prouvee" ? "prouvee" : "declaree",
    source: flat(r.source) === "commitment" ? "commitment" : "declared",
  }));
}

// Chain « Ajouter + m'engager à la rejouer » : the replication commitment is created by the
// EXISTING /api/commitments POST; this just links it back so tier reads "prouvée" when it
// resolves 'met'. Update-once, no merge machinery needed at this grain.
export async function linkReplayCommitment(
  bq: any,
  practice_id: string,
  location_id: string,
  commitment_id: string
): Promise<void> {
  await bq.query({
    query: `UPDATE \`${TABLE_FQN}\` SET replay_commitment_id = @commitment_id
            WHERE practice_id = @practice_id AND location_id = @location_id AND replay_commitment_id IS NULL`,
    params: { commitment_id, practice_id, location_id },
    location: "EU",
  });
}
