// Politique des cartes pour le rôle MEMBRE (vue équipe inc 4, docs/vue-equipe-slack-spec.md).
//
// Deux règles arbitrées owner (27-28/08) appliquées CÔTÉ SERVEUR, jamais au client :
//  1. PORTÉE par type — défaut 'site' (les signaux extérieurs vont à tout le monde) ;
//     'famille' = la carte se filtre par les familles des pôles du membre (clé payload
//     `item_category`, vérifiée sur les payloads réels 28/08) ; 'owner' = jamais membre.
//  2. CHIFFRES — « occasion d'agir oui, état du business jamais » : les NIVEAUX absolus
//     (CA d'un jour/d'une heure/d'un client, moyennes 30 j, panier absolu) sont RETIRÉS du
//     payload ; les écarts (€ signés), les %, z, parts et rangs passent. Vérifié sur les
//     payloads réels : les phrases de action-cards.js portent des null-guards et dégradent
//     sur leurs replis approuvés (ex. « CA en net retrait vs votre moyenne 30j. ») ; la
//     décomposition panier+ventes s'éteint sans ses niveaux (return null) — le retrait
//     fait donc AUSSI respecter « jamais panier moyen ET volume sur la même carte ».

// 'famille' : le contenu de la carte est une famille produit (item_category au payload).
const FAMILY_SCOPED = new Set(["item_share_move", "offering_mix_shift"]);

// 'owner' : jamais montrées à un membre. client_dormant porte l'identité et le CA cumulé
// d'un client B2B ; les synthèses de période (briefing, semaine, mois) sont par nature des
// totaux d'état du business — conservateur v1, réouvrable type par type sur arbitrage.
const OWNER_ONLY = new Set([
  "client_dormant",
  "weekly_briefing",
  "weekly_sales_spike", "weekly_sales_hole",
  "monthly_sales_spike", "monthly_sales_hole",
]);

export type CardScope = "site" | "famille" | "owner";

export function cardScope(action_type: string): CardScope {
  if (OWNER_ONLY.has(action_type)) return "owner";
  if (FAMILY_SCOPED.has(action_type)) return "famille";
  return "site";
}

// Une carte passe pour le membre ? poleFamilies = union des pole_families de SES pôles.
export function memberCanSeeCard(candidate: { action_type?: string | null; data_payload?: any }, poleFamilies: Set<string>): boolean {
  const scope = cardScope(String(candidate?.action_type || ""));
  if (scope === "owner") return false;
  if (scope === "site") return true;
  const fam = String(candidate?.data_payload?.item_category || "").trim();
  return fam !== "" && poleFamilies.has(fam);
}

// Retrait des NIVEAUX du payload — règle fail-closed, calibrée sur les payloads réels
// (28/08) : on retire toute clé contenant revenue/basket SAUF les formes relatives
// (_pct, _share, _z, _rank), plus les moyennes nommées. Gardés explicitement : delta_eur,
// day_gap_eur, gap_eur (écarts €), tous les *_pct/_z/_ratio/_share/_flag/_count.
const LEVEL_NAME = /revenue|basket/i;
const RELATIVE_SUFFIX = /(_pct|_share|_z|_rank)$/i;
const EXTRA_LEVEL_KEYS = new Set(["avg_30d"]);

// ── Gestes membres (inc 5) ────────────────────────────────────────────────────────────

// Un engagement est dans le périmètre du membre si c'est un de SES pôles (dispositif_id)
// ou une opération rattachée à un de ses pôles (attached_pole_id). Owner/admin : toujours.
export function memberCommitmentInPerimeter(
  locals: any,
  location_id: string,
  row: { dispositif_id?: any; attached_pole_id?: any } | null,
): boolean {
  if (String(locals?.role || "") !== "member") return true;
  if (!row) return false;
  const poles = new Set((((locals?.member_poles || {})[String(location_id)]) || []).map(String));
  return (row.dispositif_id != null && poles.has(String(row.dispositif_id)))
      || (row.attached_pole_id != null && poles.has(String(row.attached_pole_id)));
}

// Liste blanche des champs d'un engagement rendus au rôle membre — la CIBLE (threshold)
// passe (occasion d'agir), le kpi_baseline (CA habituel = niveau) et le reste du journal
// ne passent pas. Ajouter un champ ici = décision de la règle des chiffres.
const MEMBER_COMMITMENT_FIELDS = [
  "commitment_id", "location_id", "saved_item_id", "dispositif_id", "attached_pole_id",
  "dispositif_nature", "pole_families", "status", "verdict", "committed_action_text",
  "owner_person_name", "measured_metric", "threshold_basis", "threshold_value",
  "window_start", "window_end", "window_kind", "action_done_status", "execution_quality",
  "dispositif_note", "kpi_family", "origin_action_type", "created_at", "updated_at",
] as const;

export function memberCommitmentProjection(row: any): any {
  const out: any = {};
  for (const k of MEMBER_COMMITMENT_FIELDS) if (k in (row || {})) out[k] = row[k];
  return out;
}

// Trace d'auteur d'un geste membre — le journal des engagements garde le user_id du
// COMPTE (clé de toutes les lectures) ; l'auteur réel du geste s'écrit dans action_log.
// INSERT DML (visible immédiatement, nettoyable) ; non bloquant : un échec de trace ne
// fait jamais échouer le geste.
export async function logMemberGesture(
  bq: any,
  args: { clerk_user_id: string; location_id: string; gesture: string; commitment_id: string; note?: string | null },
): Promise<void> {
  try {
    await bq.query({
      query: `
        INSERT INTO \`muse-square-open-data.analytics.action_log\`
          (log_id, user_id, location_id, action_key, action_text, event, created_at)
        VALUES (GENERATE_UUID(), @u, @l, @k, @t, 'member_gesture', CURRENT_TIMESTAMP())
      `,
      params: { u: args.clerk_user_id, l: args.location_id, k: args.gesture + ":" + args.commitment_id, t: args.note || "" },
      location: "EU",
    });
  } catch (e: any) {
    console.log("[memberCardPolicy] logMemberGesture failed:", e?.message || e);
  }
}

export function redactPayloadForMember(payload: any): any {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload;
  const out: any = {};
  for (const k of Object.keys(payload)) {
    if (EXTRA_LEVEL_KEYS.has(k)) continue;
    if (LEVEL_NAME.test(k) && !RELATIVE_SUFFIX.test(k)) continue;
    out[k] = payload[k];
  }
  return out;
}
