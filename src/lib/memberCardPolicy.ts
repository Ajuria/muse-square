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
