// « Vos bonnes pratiques » — the venue's own knowledge base of what worked (validé 26/07,
// proto tools/proto/methode-proto.html).
//
// TWO doors feed it, ONE reader serves it:
//   1. DECLARED — a positive card's « M'engager » opens « Enrichir vos bonnes pratiques »
//      (public/bp-form.js) → POST /api/best-practices → a row HERE (analytics.best_practices).
//      A declared cause is a USER HYPOTHESIS ("déclarée"), never presented as fact.
//   2. PROVEN — the EXISTING commitment loop: a resolved commitment with verdict 'met'
//      (analytics.action_commitments, retro columns retro_worked/retro_repeat) IS a proven
//      practice. The reader UNIONs those in — nothing is re-stored, no second write path.
// Tier is COMPUTED AT READ TIME — et depuis le 27/08 (arbitrages owner) il juge l'EFFET,
// pas la cible : « prouvée » = le rejeu a un effet positif SIGNIFICATIF (|z| >= 1, la garde
// de commitmentResolve ; met à z NULL = base residual_z, positif par construction), que
// l'objectif soit atteint ou non. Un effet NÉGATIF significatif exclut le dispositif des
// suggestions (contre-indication, dite par le chat avec son n de tests). L'axe CIBLE
// (met/manqué vs threshold) reste lisible à part — calibration d'objectif, jamais le tier.
// int_location_dispositifs (dbt) reflète la même règle ; ce fichier reste la loi.
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
  // Objet « dispositif » (atelier des mécanismes, 01/08 — docs/atelier-mecanismes-spec.md) :
  // extension de la pratique, JAMAIS un système parallèle. Une pratique avec confirmation_test
  // est un dispositif : tier déclaré à la capture, « prouvée » par le rejeu (mécanique existante).
  ["mechanism_factors", "STRING"],   // facteur(s) supposé(s) — vocabulaire existant quand connu (clés de classes), texte libre sinon
  ["evidence_refs", "STRING"],       // les preuves citées (jours, chiffres affichés) — jamais du vide
  ["confirmation_test", "STRING"],   // ce qui le confirmerait — la graine de la graduation en engagement
  // Armement sur signal (automatisation cas 1, 05/08 — docs/automatisation-spec.md) : quand le
  // signal d'origine du dispositif se déclenche, la consigne part seule + un engagement s'arme.
  ["arm_enabled", "BOOL"],
  ["arm_recipient_name", "STRING"],
  ["arm_recipient_contact", "STRING"],
  ["arm_channel", "STRING"],          // 'email' v1
  ["arm_cooldown_days", "INT64"],     // garde-fou : 1 déclenchement max par N jours (défaut 7)
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
  // Objet dispositif (01/08) — nullables : une pratique simple reste valide sans eux.
  mechanism_factors?: string | null;
  evidence_refs?: string | null;
  confirmation_test?: string | null;
  // Armement sur signal (05/08) — nullables : une pratique non armée reste valide sans eux.
  arm_enabled?: boolean | null;
  arm_recipient_name?: string | null;
  arm_recipient_contact?: string | null;
  arm_channel?: string | null;
  arm_cooldown_days?: number | null;
}

// A practice as SERVED to the UI (tier computed at read; proven commitments unioned in).
export interface ServedPractice {
  practice_id: string;
  practice_text: string;
  author_person_name: string | null;
  origin_affected_date: string | null;
  tier: "declaree" | "prouvee";
  source: "declared" | "commitment";
  // Objet dispositif (01/08) — null sur les pratiques simples et les engagements prouvés.
  mechanism_factors?: string | null;
  confirmation_test?: string | null;
}

const flat = (v: any): any => (v && typeof v === "object" && "value" in v ? v.value : v);

// App-write table, created on first use (same family as analytics.day_class_impacts).
// CREATE TABLE IF NOT EXISTS is idempotent and race-safe at this volume.
export async function ensureBestPracticesTable(bq: any): Promise<void> {
  const cols = COLUMN_SPEC.map(([n, t]) => `${n} ${t}`).join(", ");
  await bq.query({ query: `CREATE TABLE IF NOT EXISTS \`${TABLE_FQN}\` (${cols})`, location: "EU" });
  // Extension dispositif (01/08) : la table préexiste en prod et CREATE IF NOT EXISTS ne
  // modifie JAMAIS un schéma existant — ALTER idempotent (même leçon que l'historique
  // day-class). Les lecteurs antérieurs sélectionnent leurs colonnes explicitement : sûrs.
  await bq.query({
    query: `ALTER TABLE \`${TABLE_FQN}\`
      ADD COLUMN IF NOT EXISTS mechanism_factors STRING,
      ADD COLUMN IF NOT EXISTS evidence_refs STRING,
      ADD COLUMN IF NOT EXISTS confirmation_test STRING,
      ADD COLUMN IF NOT EXISTS arm_enabled BOOL,
      ADD COLUMN IF NOT EXISTS arm_recipient_name STRING,
      ADD COLUMN IF NOT EXISTS arm_recipient_contact STRING,
      ADD COLUMN IF NOT EXISTS arm_channel STRING,
      ADD COLUMN IF NOT EXISTS arm_cooldown_days INT64`,
    location: "EU",
  });
}

// ── Armement sur signal (cas 1) : état porté par la pratique elle-même (définition sur
// l'objet). Table en DML (INSERT query, jamais streaming) → l'UPDATE est sûr. ──
export interface ArmingPatch {
  enabled: boolean;
  recipient_name?: string | null;
  recipient_contact?: string | null;
  channel?: string | null;
  cooldown_days?: number | null;
}
export async function updateArming(
  bq: any,
  practice_id: string,
  location_id: string,
  arm: ArmingPatch,
): Promise<void> {
  await bq.query({
    query: `UPDATE \`${TABLE_FQN}\`
            SET arm_enabled = @enabled,
                arm_recipient_name = COALESCE(@recipient_name, arm_recipient_name),
                arm_recipient_contact = COALESCE(@recipient_contact, arm_recipient_contact),
                arm_channel = COALESCE(@channel, arm_channel, 'email'),
                arm_cooldown_days = COALESCE(@cooldown_days, arm_cooldown_days, 7)
            WHERE practice_id = @practice_id AND location_id = @location_id`,
    params: {
      enabled: arm.enabled,
      recipient_name: arm.recipient_name ?? null,
      recipient_contact: arm.recipient_contact ?? null,
      channel: arm.channel ?? null,
      cooldown_days: arm.cooldown_days ?? null,
      practice_id, location_id,
    },
    types: { enabled: "BOOL", recipient_name: "STRING", recipient_contact: "STRING", channel: "STRING", cooldown_days: "INT64", practice_id: "STRING", location_id: "STRING" },
    location: "EU",
  });
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
                 -- tier par l'EFFET (27/08, owner) : prouvée = effet positif significatif, que
                 -- la cible soit atteinte ou non. met à z NULL = base residual_z, positif par
                 -- construction. Miroir de int_location_dispositifs.
                 IF(
                   c.verdict = 'met'
                   OR (c.c_status = 'resolved' AND COALESCE(c.action_done_status, '') != 'pas_encore'
                       AND c.verdict != 'confounded' AND c.w_z >= 1 AND c.w_pct > 0),
                   'prouvee', 'declaree') AS tier,
                 'declared' AS source, bp.created_at AS ts,
                 bp.mechanism_factors, bp.confirmation_test
          FROM \`${TABLE_FQN}\` bp
          LEFT JOIN (
            SELECT commitment_id, verdict, status AS c_status, action_done_status,
                   CAST(window_residual_pct AS FLOAT64) AS w_pct, CAST(window_residual_z AS FLOAT64) AS w_z,
                   ROW_NUMBER() OVER (PARTITION BY commitment_id ORDER BY updated_at DESC, CASE WHEN status IN ('resolved', 'cancelled') THEN 1 ELSE 0 END DESC, (verdict IS NOT NULL) DESC, created_at DESC) AS rn
            FROM \`${COMMITMENTS_FQN}\`
          ) c ON c.commitment_id = bp.replay_commitment_id AND c.rn = 1
          WHERE bp.location_id = @location_id AND bp.status = 'active'
            AND bp.kpi = @kpi
            AND (bp.outcome_lever = @outcome_lever
                 OR (@day_class_key IS NOT NULL AND bp.day_class_key = @day_class_key))
            -- Axe d'effet (27/08) : un dispositif dont le rejeu a un effet NÉGATIF significatif
            -- (|z| >= 1, sous la loi d'attribution outcomes) ne se SUGGÈRE plus — il vit en
            -- contre-indication (chat). Même règle que int_location_dispositifs, la loi ici.
            AND NOT (
              c.c_status = 'resolved' AND COALESCE(c.action_done_status, '') != 'pas_encore'
              AND c.verdict != 'confounded'
              AND c.w_z <= -1 AND c.w_pct < 0
            )
        ),
        proven_commitments AS (
          SELECT commitment_id AS practice_id,
                 COALESCE(NULLIF(TRIM(retro_worked), ''), committed_action_text) AS practice_text,
                 owner_person_name AS author_person_name,
                 CAST(origin_affected_date AS STRING) AS origin_affected_date,
                 'prouvee' AS tier, 'commitment' AS source, updated_at AS ts,
                 CAST(NULL AS STRING) AS mechanism_factors, CAST(NULL AS STRING) AS confirmation_test
          FROM (
            SELECT *, ROW_NUMBER() OVER (PARTITION BY commitment_id ORDER BY updated_at DESC, CASE WHEN status IN ('resolved', 'cancelled') THEN 1 ELSE 0 END DESC, (verdict IS NOT NULL) DESC, created_at DESC) AS rn
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
        SELECT practice_id, practice_text, author_person_name, origin_affected_date, tier, source,
               mechanism_factors, confirmation_test
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
    mechanism_factors: flat(r.mechanism_factors) != null ? String(flat(r.mechanism_factors)) : null,
    confirmation_test: flat(r.confirmation_test) != null ? String(flat(r.confirmation_test)) : null,
  }));
}

// Chain « Ajouter + m'engager à la rejouer » : the replication commitment is created by the
// EXISTING /api/commitments POST; this just links it back so tier reads "prouvée" when it
// resolves 'met'. Update-once, no merge machinery needed at this grain.
// Lecture scopée « dispositifs » (pièce 2b, continuité — 03/08) : les fiches ACTIVES du lieu,
// filtrées par motif (day_class_key) ou toutes (day_class_key = null), avec le tier calculé À LA
// LECTURE (même règle que listMatchedPractices) et l'état de l'engagement de test lié. Sert le
// provider dispositif (l'enquête repart de l'existant au lieu de re-documenter) et
// buildPracticeFacts (le Consulter sait citer ce que l'exploitant a documenté).
// Résiliente : table absente → [].
export interface ClassDispositif {
  practice_id: string;
  practice_text: string;
  confirmation_test: string | null;
  day_class_key: string | null;
  tier: "prouvee" | "declaree" | "ecarte";   // ecarte = effet négatif prouvé (27/08)
  commitment_status: string | null;   // 'open' = test en cours
  commitment_verdict: string | null;
  // Axe d'EFFET (27/08, arbitrages owner) — séparé de l'axe cible. Calculé par
  // int_location_dispositifs (|z| >= 1, loi d'attribution outcomes) ; jamais re-dérivé ici.
  effect_direction: "positive" | "negative" | "inconclusive" | null;
  effect_residual_pct: number | null;
  effect_residual_z: number | null;
  replay_threshold_value: number | null;
  replay_threshold_basis: string | null;
  replay_adjustment_move: string | null;   // poursuivre | doubler | pivoter | stop — la décision prise face au verdict
  created_date: string;               // ISO Y-m-d (interne — l'affichage se fait en JJ/MM côté surface)
}

// L'ÉTAT d'un dispositif en toutes lettres — LA source unique (axe d'effet séparé de
// l'axe cible, arbitrages owner 27/08). Paramétrée par le nom de classe (noun_fr) pour ne
// dépendre d'aucun module amont : buildPracticeFacts passe classNounFr(day_class_key),
// le provider dispositif passe son cfg.noun_fr local. Trois consommateurs, UNE grammaire :
// chat grounded, chemin déterministe, faits d'enquête.
const MOVE_CLAUSE_FR: Record<string, string> = {
  // les gestes du flux Ajuster (card-kit _mc + « Arrêter » -> stop), libellés commitmentCopy
  stop: "vous aviez choisi d'arrêter ce test",
  pivoter: "vous aviez choisi de pivoter",
  doubler: "vous aviez choisi de doubler la mise",
  poursuivre: "vous aviez choisi de poursuivre",
};

export function dispositifStateFr(
  p: Pick<ClassDispositif, "tier" | "effect_direction" | "effect_residual_pct" | "commitment_verdict" | "replay_threshold_value" | "replay_threshold_basis"> & { replay_adjustment_move?: string | null },
  class_noun_fr: string | null,
): string {
  // la décision prise FACE au verdict — l'étage au-dessus de l'axe effet/cible ; une valeur
  // hors carte est tue (jamais une clé technique en phrase).
  const move = p.replay_adjustment_move != null ? MOVE_CLAUSE_FR[String(p.replay_adjustment_move)] ?? null : null;
  const withMove = (state: string) => (move ? `${state} — ${move}` : state);
  const pct = p.effect_residual_pct != null
    ? `${p.effect_residual_pct >= 0 ? "+" : "-"}${String(Math.round(Math.abs(p.effect_residual_pct) * 10) / 10).replace(".", ",")} %`
    : "";
  if (p.effect_direction === "negative") {
    return withMove(`${class_noun_fr ? `face à vos ${class_noun_fr}, ` : ""}il a prouvé ne pas être adapté (${pct} vs votre résultat habituel, 1 test manqué)`);
  }
  if (p.effect_direction === "positive" && p.commitment_verdict === "missed") {
    const cible = p.replay_threshold_basis === "pct" && p.replay_threshold_value != null
      ? ` : votre cible (+${String(p.replay_threshold_value).replace(".", ",")} %) était peut-être surestimée`
      : "";
    return withMove(`effet positif mesuré (${pct} vs votre résultat habituel), objectif manqué${cible}`);
  }
  if (p.tier === "prouvee") {
    return withMove(`prouvé au rejeu${pct ? ` (${pct} vs votre résultat habituel)` : ""}`);
  }
  if (p.effect_direction === "inconclusive") {
    return withMove("testé, non concluant (effet dans le bruit du lieu)");
  }
  return withMove("déclaré, pas encore prouvé");
}

export async function listClassDispositifs(
  bq: any,
  location_id: string,
  day_class_key: string | null,
  limit = 3,
): Promise<ClassDispositif[]> {
  try {
    // 27/08 — lit la surface semantic (vw_insight_event_dispositifs, chaine stg -> int ->
    // fct en VUES : fraicheur identique a l'ancienne lecture analytics directe). La jointure
    // replay et le tier sont calcules par int_location_dispositifs — la MEME semantique que
    // l'ancienne requete inline, prouvee champ par champ avant bascule (EXCEPT DISTINCT
    // bidirectionnel = 0 sur les 4 fiches actives). source='declared' : cette fonction n'a
    // jamais liste les engagements prouves autonomes (c'est listMatchedPractices).
    const [rows] = await bq.query({
      query: `
        SELECT dispositif_id AS practice_id, practice_text, confirmation_test, day_class_key,
               tier,
               replay_status AS commitment_status, replay_verdict AS commitment_verdict,
               effect_direction, effect_residual_pct, effect_residual_z,
               replay_threshold_value, replay_threshold_basis, replay_adjustment_move,
               FORMAT_TIMESTAMP('%Y-%m-%d', created_at) AS created_date
        FROM \`${BQ_PROJECT}.semantic.vw_insight_event_dispositifs\`
        WHERE location_id = @location_id AND source = 'declared' AND status = 'active'
          AND (@day_class_key IS NULL OR day_class_key = @day_class_key)
        ORDER BY IF(replay_status = 'open', 0, 1), created_at DESC
        LIMIT ${Math.max(1, Math.min(limit, 6))}
      `,
      params: { location_id, day_class_key },
      types: { day_class_key: "STRING" },
      location: "EU",
    });
    return (rows as any[]).map((r) => ({
      practice_id: String(r.practice_id),
      practice_text: String(r.practice_text ?? ""),
      confirmation_test: r.confirmation_test != null ? String(r.confirmation_test) : null,
      day_class_key: r.day_class_key != null ? String(r.day_class_key) : null,
      tier: r.tier === "prouvee" ? "prouvee" : r.tier === "ecarte" ? "ecarte" : "declaree",
      commitment_status: r.commitment_status != null ? String(r.commitment_status) : null,
      commitment_verdict: r.commitment_verdict != null ? String(r.commitment_verdict) : null,
      effect_direction: r.effect_direction === "positive" || r.effect_direction === "negative" || r.effect_direction === "inconclusive" ? r.effect_direction : null,
      effect_residual_pct: r.effect_residual_pct != null ? Number(r.effect_residual_pct) : null,
      effect_residual_z: r.effect_residual_z != null ? Number(r.effect_residual_z) : null,
      replay_threshold_value: r.replay_threshold_value != null ? Number(r.replay_threshold_value) : null,
      replay_threshold_basis: r.replay_threshold_basis != null ? String(r.replay_threshold_basis) : null,
      replay_adjustment_move: r.replay_adjustment_move != null ? String(r.replay_adjustment_move) : null,
      created_date: String(r.created_date ?? ""),
    }));
  } catch (e) {
    console.warn("[bestPractices] listClassDispositifs skipped:", e);
    return [];
  }
}

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
