// Cartes d'action DÉCLARÉES à la main — `raw.action_candidates_manual` (démo, tests, owner).
//
// Une ligne source = UNE carte, affichée chaque jour de sa fenêtre [valid_from, valid_to] :
// date = aujourd'hui (Europe/Paris), expires_at = valid_to, suppression_key STABLE sur
// valid_from (« Action menée » la supprime pour toute la fenêtre), card_instance_id = même
// convention que le mart (to_hex(md5(suppression_key))).
//
// Pourquoi côté app : `mart.fct_location_daily_action_candidates` est reconstruite deux fois
// par jour ; une ligne insérée à la main y disparaît au run suivant. La lecture jumelle ici
// tient sans dbt. Le jour où le mart porte la même branche (source raw.action_candidates_manual,
// même suppression_key), la garde NOT EXISTS évite le doublon — l'app n'a rien à changer.
//
// Consommateurs : insight/monitor.ts (fil Agir + page profonde) et insight/days.ts.

const PROJECT = "muse-square-open-data";
const VIEW = `\`${PROJECT}.semantic.vw_insight_event_action_candidates\``;
const MANUAL = `\`${PROJECT}.raw.action_candidates_manual\``;

// Colonnes communes servies aux deux consommateurs (sous-ensemble de la vue).
const COLS = [
  "date", "location_id", "action_type", "card_instance_id", "action_priority", "action_category",
  "channel_hint", "confidence_tier", "headline_fr", "detail_fr", "data_payload", "suppression_key", "expires_at",
];

const MANUAL_KEY = "CONCAT(m.action_type, ':', m.location_id, ':manual:', CAST(m.valid_from AS STRING))";

/** Table dérivée « vue ∪ cartes déclarées », à mettre à la place de la vue dans un FROM. */
export const CANDIDATES_WITH_MANUAL_SQL = `(
  SELECT ${COLS.join(", ")} FROM ${VIEW}
  UNION ALL
  SELECT
    CURRENT_DATE('Europe/Paris') AS date,
    m.location_id,
    m.action_type,
    TO_HEX(MD5(${MANUAL_KEY})) AS card_instance_id,
    m.action_priority,
    m.action_category,
    m.channel_hint,
    JSON_VALUE(m.data_payload, '$.confidence_tier') AS confidence_tier,
    m.headline_fr,
    m.detail_fr,
    m.data_payload,
    ${MANUAL_KEY} AS suppression_key,
    m.valid_to AS expires_at
  FROM ${MANUAL} m
  WHERE m.deleted_at IS NULL
    AND CURRENT_DATE('Europe/Paris') BETWEEN m.valid_from AND m.valid_to
    AND NOT EXISTS (
      SELECT 1 FROM ${VIEW} v WHERE v.suppression_key = ${MANUAL_KEY}
    )
)`;
