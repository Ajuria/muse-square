# Pôles & dispositifs permanents — SPEC DE TRAVAIL

Cadrage arbitré par l'owner le 27/08/2026, dans la foulée de l'étape 3 du versionning
(contexte de la version) et de la vue `semantic.vw_insight_event_commitment_memory`.
RIEN de cette spec n'est construit. Le build vient APRÈS l'étape 4 (lecture du jour,
Créer une opération, renommage de la section des moves).

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
2. **Une nature explicite.** Il reste à poser un marqueur de nature
   (permanent / opération datée / série) — colonne à ajouter au build, jamais déduite
   de l'absence de dates.
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
- `semantic.vw_insight_event_commitment_memory` expose la mémoire (48 colonnes,
  contrat enforced) — les pôles y apparaîtront par la même table.
- Le roster (`/api/channels/team`) alimente Responsable(s).

## Ce qui reste à faire (le build, après l'étape 4)

- Colonnes : nature du dispositif ; familles du pôle ; clé de rattachement
  opération→pôle. Toujours par `ALTER ADD COLUMN` + sonde écrite-relue-effacée.
- « Créer une opération » (C2 de l'étape 4) : construit daté-seulement mais avec la
  nature comme dimension explicite, pour que « pôle permanent » soit un ajout.
- La surface de lecture continue d'un pôle (familles vs habituel, opérations en cours).
- La déclaration des pôles d'Épices et Tout comme premier cas réel.

## Décisions owner encore ouvertes

- L'emplacement du bouton « Créer une opération » (reco : Piloter, à côté du tableau).
- Le nom de la section des moves (C3 — « Régler le dispositif » proposé).
