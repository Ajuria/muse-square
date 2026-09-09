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

## Familles de produits & services — recomposition (owner 28/08, différé au dégel dbt)

Le libellé est « **Familles de produits & services** » (les pôles couvrent produits ET
services — un service encaissé comme ligne de caisse se mesure comme un produit ; un
service jamais encaissé donne un pôle à lecture continue VIDE, dit honnêtement).

La hiérarchie : produits (lignes de caisse, après ingestion) → familles (ensembles de
produits) → pôles (ensembles de familles — `pole_families` est déjà une liste). v1 : la
famille EST la catégorie de la caisse (doctrine 27/08 — jamais du texte libre ; le point
de contrôle est l'ingestion/le mapping d'import). v2 (owner 28/08) : un ÉDITEUR de
recomposition produit→famille (cocher des produits, les associer, renommer, fusionner
deux catégories caisse), patron `party_directory` (annuaire app-write). **Différé au
dégel dbt** : les mesures par famille vivent dans la chaîne dbt — une recomposition
appliquée seulement côté app créerait deux vérités. À l'ouverture : appliquer dans le
staging pour que mesure, marges, périmètres membres et routage Slack suivent d'un coup.

## Arbitrage owner 09/09 — la définition du pôle est close

Ouvert par la carte d'activité d'Épices et Tout (16 zones nommées) : fallait-il garder « un pôle =
1..n familles, discontinu dans l'espace » ou passer à « un pôle = une famille, continue dans
l'espace » ?

1. **Un pôle = 1..n familles** (owner 09/09) — la forme déjà codée est confirmée. La discontinuité
   spatiale est POSSIBLE, pas obligatoire. La proposition concurrente supposait qu'une famille
   occupe un seul tenant : **faux, mesuré sur la carte du magasin** — « Fruits et légumes » y tient
   deux zones et « Conserves » deux autres, tandis que cinq zones (Épices, Moutardes fines,
   Conserves ×2, Pâtes) tiennent dans deux familles. Elle aurait aussi produit treize pôles, donc
   treize responsables et treize canaux, pour un magasin de quelques personnes.
2. **Une famille vit dans un seul pôle** (owner 27/08, RATIFIÉ 09/09). La règle ne vivait que dans
   `pole-form.js` — contournable par l'API. Elle est PORTÉE AU SERVEUR le 09/09 : tri pur
   `familyTakenByAnotherPole` (`poleReading.ts`, 6 tests, les trois mutations vues rougir), appelé
   par `POST /api/commitments` branche pôle, message identique à celui du formulaire, chaîne de
   versions du dispositif exclue.
3. **Aucune famille ne reste hors pôle** (owner 09/09 : « pour qu'il n'y ait pas de trou dans le
   mapping des dispositifs »). C'est un RENVERSEMENT de la proposition initiale, qui tolérait des
   familles orphelines. Le mapping famille → pôle doit être total.

### Le pôle de reste — mécanique à trancher

Le mot n'est pas arbitré (owner : « Divers ou quelque chose ») ; il est en file au lexique. Mais la
mécanique se décide avant le mot, et les deux options ne se valent pas :

- **(a) un pôle DÉCLARÉ** — l'exploitant crée un pôle « Divers » et y range les familles qui n'ont
  pas de place. Il a un responsable, un canal, une lecture continue, une chaîne de versions.
  **Défaut rédhibitoire : il se périme.** Les familles viennent de la caisse ; le jour où une
  nouvelle `item_category` apparaît, elle n'est dans aucun pôle et le trou que la règle ferme se
  rouvre en silence.
- **(b) un reste CALCULÉ** — la liste des familles réelles moins celles déjà prises. Rien à
  déclarer, rien à maintenir : une famille nouvelle y tombe d'elle-même le jour où elle est
  vendue. Elle porte son CA et son poids comme les autres lignes, sans responsable ni verdict —
  ce qui est juste, personne ne répond d'un reste.

**Recommandation : (b).** Le seul argument pour (a) est de pouvoir documenter ce reste comme un
pôle ; il tombe dès qu'on remarque qu'un reste qu'on documente est un pôle, et qu'il suffit alors
de le créer. Reste à trancher par l'owner, avec son mot et l'endroit où le reste s'affiche (onglet
Pôles du compte, section « Vos pôles » du tableau, ou les deux).

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
