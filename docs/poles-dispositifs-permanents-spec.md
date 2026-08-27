# Pôles & dispositifs permanents — SPEC DE TRAVAIL

Cadrage arbitré par l'owner le 27/08/2026, dans la foulée de l'étape 3 du versionning
(contexte de la version) et de la vue `semantic.vw_insight_event_commitment_memory`.
Le socle est CONSTRUIT le 27/08 (P1 colonnes/API, P2 création, P3 lecture continue —
voir « Ce qui est construit ») ; les restes sont nommés en fin de document.

## Les mots (owner 27/08)

| Concept | Mot | Notes |
|---|---|---|
| Un sous-ensemble permanent du dispositif de vente d'un site (familles produits + responsable + ressources) | **pôle** | Ex. Épices et Tout : périssables, traiteur libanais, art de vivre |
| La nature sans terme d'un dispositif | **dispositif permanent** | Pas de dates, pas de verdict — lecture continue |
| Une opération qui revient à intervalle régulier | **série** | Mot déjà au lexique (« Événement récurrent ») — producteurs invités ≥ 1×/mois |

Le méta-dispositif de vente (le magasin considéré dans son ensemble) n'est PAS une
entité : c'est le site lui-même, vu comme l'ensemble de ses pôles.

## Le modèle (arbitré)

1. **Même table, même chaîne.** Les pôles vivent dans `analytics.action_commitments`
   avec l'identité de chaîne existante (`dispositif_id`, `version_no`) : changer
   l'organisation d'un pôle EST une version suivante. Aucun registre séparé — la
   mémoire opérationnelle reste une.
2. **Une nature explicite.** `dispositif_nature` est en base ('operation' | 'permanent'
   | 'serie', NULL legacy = operation) — jamais déduite de l'absence de dates.
3. **Un pôle n'a ni fenêtre ni verdict.** Sa mesure est la lecture continue : le CA de
   SES familles vs son résultat habituel. On ne force jamais un « atteint / manqué »
   sur ce qui n'a pas de terme.
4. **La normalisation = les familles réelles.** Un pôle déclare son périmètre en
   choisissant parmi les familles réelles du flux de caisse (le KPI `family_revenue:X`
   et les marges par famille existent déjà) — jamais du texte libre à réconcilier.
5. **Plusieurs opérations en cours sur un même pôle** (owner 27/08) : le dispositif
   permanent + une promotion, par exemple. Le rattachement opération→pôle est une clé
   PROPRE (à poser au build) — ce n'est PAS `parent_commitment_id`, qui reste la
   filiation de versions. Deux liens, deux colonnes, jamais confondus.
6. **L'événementialisation hérite le périmètre.** Une opération datée rattachée à un
   pôle se mesure par défaut sur les familles DU pôle (KPI `family_revenue`) — l'effet
   du producteur invité se lit sur le CA du pôle, pas noyé dans le CA global. La
   mémoire (versions, effets, champs contexte) s'accumule par pôle.
7. **Le pôle n'est pas la personne** (owner 27/08) : le responsable est un ATTRIBUT qui
   peut changer ; le pôle demeure jusqu'à ce qu'il soit **fermé**. La fermeture est un
   état de fin de vie explicite ; un pôle fermé garde toute sa mémoire.

## Cas de référence — Épices et Tout (owner 27/08)

Des vendeurs sont disposés dans le magasin et gèrent des pôles produits ou services :
périssables (laitue, …), traiteur libanais, art de vivre. Des producteurs invités
événementialisent le magasin (ponctuel mais ≥ 1×/mois → une série). L'owner documentera
ces dispositifs ; ils courent en parallèle des données de vente.

## Ce qui existe déjà et porte le concept (au présent)

- Le KPI famille `family_revenue:X` est mesurable et jugé (moteur K, `kpi_noise_se`).
- Les champs mémoire au grain version sont en base et dans les formulaires :
  `dispositif_plus`, `dispositif_why`, `dispositif_resources`, Levier, Responsable(s).
- La chaîne de versions (`dispositif_id`, `version_no`, héritage au POST) est livrée.
- `semantic.vw_insight_event_commitment_memory` expose la mémoire (contrat enforced,
  55 colonnes — pôles inclus, vérifié en base le 27/08 : un pôle se lit PAR la vue) ;
  le staging est le passthrough COMPLET des 78 colonnes de la table.
- Le roster (`/api/channels/team`) alimente Responsable(s).

## Ce qui est construit (27/08 — au présent)

- Les colonnes SONT en base : `dispositif_nature` ('operation'|'permanent'|'serie',
  NULL legacy = operation), `pole_families` (JSON array), `attached_pole_id` — sondes
  écrites-relues-effacées. `assertTermsPresent` est nature-aware (un permanent s'écrit
  sans fenêtre ni objectif) et la SÉLECTION EXACTE du cron de résolution ne voit pas
  un permanent (window_end NULL, prouvé par sonde).
- POST `/api/commitments` porte la branche pôle (familles obligatoires, chaîne
  lineageFor, héritage) et le flux daté valide/hérite `attached_pole_id`.
- « Nouvelle opération » (`evenement.astro?new=1`) porte la bascule de nature :
  le panneau pôle choisit les familles RÉELLES en chips (avec leur €/j), POST direct.
- L'héritage KPI pôle→opération EST branché (27/08 soir) : « Nouvelle opération » porte
  « Rattacher à un pôle » — KPI CA famille + familles restreintes au périmètre du pôle,
  `attached_pole_id` posé ; la mesure passe par le rail existant `saved_items.kpi_family`.
- La page engagement REND un pôle : lecture continue (`lib/poleReading` — 30 derniers
  jours vendus vs les 90 précédents, planchers n≥5, jours futurs exclus), mémoire,
  opérations rattachées, chaîne de versions — sans un mot de verdict.

## Ce qui reste à faire

- La déclaration des pôles d'Épices et Tout comme premier cas réel (owner).
- La fermeture d'un pôle : aujourd'hui soft-cancel (rendu « fermé » sur la page) ;
  un état propre se décidera si le besoin le prouve.
- L'ajustement d'un pôle (V2 = réorganisation) depuis sa page — le panneau
  « Ajuster le dispositif » est volontairement absent du rendu pôle pour l'instant.

## Décisions tranchées en route (27/08)

- La création vit sur la page EXISTANTE « Nouvelle opération » (`evenement.astro?new=1`)
  — aucun bouton nouveau (relevé owner : ne jamais dupliquer un point d'entrée).
- La section des moves s'appelle « Ajuster le dispositif » (mot owner, aligné sur le
  CTA amont « Ajuster » du journal).
