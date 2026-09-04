# Motifs par client — la carte « Client régulier sans commande » — DÉFINITIF

> **GO owner 06/08/2026** (« go spec C1 »), incrément RÔLE DES COMPTES 07/08.

Premier étage du chantier C : là où la porte de régime (`channel-grain-spec.md`) a supprimé les faux
verdicts quotidiens, C1 sert le **grain CLIENT** — ce qu'aucun tableau de bord de caisse ne fait :
*un client régulier qui a cessé de commander*. Une seule carte, `client_dormant`.

État vérifié dans le code et en base le 26/08/2026. Le chemin d'application vit dans `git log`
(app `f5d0c6b`, dbt `bf127ce`+).

---

## Ce que la carte mesure

Modèle : `models/ms_open_data/mart/fct_location_client_patterns.sql`.
Grain : **`location_id × party_code`** — le site ROUTÉ ; un même client peut exister sur deux sites
et y avoir deux comportements (CHAHAN : 19 commandes au site principal, 1 à Paris).

Périmètre : lignes facturées, `party_code` non nul, `channel != 'comptoir'` — la vente au comptoir
n'a pas de client identifiable, elle relève de C2.

**Quatre états**, seuils calés sur les données réelles :

| État | Définition |
|---|---|
| `new` | première commande dans les 30 derniers jours de données du site |
| `dormant` | cadence établie **et** silence ≥ `max(2 × intervalle médian, 30 j)` |
| `active` | cadence établie, pas dormant |
| `occasional` | le reste (1-3 commandes, ou relation < 90 j) |

**Cadence établie** = `orders_count >= 4 AND span_days >= 90`. Ce critère élimine les projets
ponctuels : 3 factures en 15 jours produisent des ratios absurdes (24× mesurés). Le **plancher de
30 jours** empêche un client à cadence courte (7 j) de tirer au bout de 15 jours.

**Le silence est ancré sur `data_end`** = `max(order_date)` DU SITE, jamais `current_date`. Un
compte dont l'import est figé ne voit pas ses silences gonfler avec les jours sans donnée — c'est
la carte de fraîcheur qui traite l'absence d'import, pas celle-ci.

---

## Le filtre de rôle — pourquoi tous les clients réguliers ne sont pas éligibles

**Arbitrage owner du 07/08.** CHAHAN est un architecte, apporteur de chantiers (1 à 3 par an). Ses
« 19 commandes à cadence 7 j » sont des rafales de facturation *intra-chantier*, pas un rythme de
commande : la carte reposait sur une prémisse fausse. Généralisation : **le rôle du compte change
le détecteur.**

Vocabulaire **fermé** — une valeur = un couple détecteur × famille d'actions :

| Rôle | Ce que c'est | Tire une carte cadence ? |
|---|---|---|
| `pro_recurring` | organisation qui réapprovisionne | **oui** |
| `consumer_recurring` | particulier à achat répété (cadre légal prospection B2C) | **oui** |
| `unknown` | défaut absolu | **oui** — tirer ET qualifier (décision owner 07/08) |
| `pro_project` | organisation par épisodes : architecte, chantier, scénographie | non — épargné |
| `channel` | vend POUR le compte : corner, commissionnaire | non — relève de l'analyse canal |
| `consumer` | particulier ponctuel | non |

Les institutions (mairie, école, musée, association) sont des **organisations** : `pro_recurring` ou
`pro_project` selon leur comportement. Pas de valeur dédiée tant qu'aucun détecteur propre n'existe.

Le filtre vit dans `fct_location_daily_action_candidates.sql`, CTE `client_dormant` :
`and cp.party_role in ('pro_recurring', 'consumer_recurring', 'unknown')`.

Le rôle vient de `analytics.party_directory` (`coalesce(pd.party_role, 'unknown')`), testé
`not_null` + `accepted_values` sur les 6 valeurs dans le `schema.yml` du mart.

---

## Le tir

CTE `client_dormant` dans `fct_location_daily_action_candidates.sql`, unie après
`sales_revenue_down_wow`. Préfixe `client_` **volontairement hors** du périmètre `sales_` de la
porte de régime : la carte n'est pas quotidienne.

- **Priorité** : 4 si `total_revenue >= 10000 €`, sinon 3.
- **`suppression_key` sans date** : `client_dormant:<location>:<party_code>` — une seule carte par
  client, rejouée à chaque run tant que l'état dure. Si l'owner s'engage dessus, la suppression par
  `origin_suppression_key` du monitor la retire, même mécanique que les autres cartes.
- **Expiration** : 7 jours.

---

## Le rendu dans l'app

`public/action-cards.js`, entrée SPECS `client_dormant` :

- **libellé : « Client régulier sans commande »** ;
- **catégorie : `INTELLIGENCE`** (`'PERFORMANCE'` n'existe pas comme badge app — le mot
  `performance` du modèle dbt est l'`action_category` côté données, pas le badge : **deux
  vocabulaires distincts, à ne pas confondre**) ;
- sowhat construit depuis le payload (nom du compte, rythme, silence, CA, date des données), voix
  opérateur ; deux graines de brouillon (`note_interne`, `email`).

Thème `ventes` de la taxonomie, gate `pos` — déclaré **deux fois**, côté client
(`action-cards.js`) et côté serveur (`src/lib/recos/recoThemeMap.ts`), parité verrouillée par
`recoThemeMap.parity.test.ts`. Toute nouvelle carte doit être ajoutée aux deux.

Trois surfaces chargent `action-cards.js` : `pulse.astro`, `insight.astro`, `rapport.astro` —
bumper le cache-buster sur **les trois**. Pas de page profonde dédiée : la carte ouvre Consulter.

**La carte ne dit jamais POURQUOI.** Cadence et silence sont mesurés sur les factures ; la rupture
de rythme est constatée, la cause n'est pas inventée. Le geste poussé est la reprise de contact.

---

## Le geste de qualification

Sur la carte, dans Pulse : **« Préciser ce compte — c'est : »**, en **deux temps**.
D'abord la nature (*Une organisation · Un particulier · Un canal de vente*), puis le comportement,
ce qui donne 7 réponses terminales pour 5 rôles écrivables.

`POST /api/analytics/party-role.ts` : `VALID_ROLES` = les 5 valeurs proposables — **`unknown` n'est
pas proposable, c'est le défaut, jamais une réponse**. Pour `channel`, le type de canal est
**obligatoire** (un canal anonyme n'est pas exploitable). Écriture par MERGE DML sur
`analytics.party_directory`, provenance `user_card:<userId>`, plus une ligne `action_log` pour
l'audit. Effet à la passe candidates suivante (2×/j).

**Ce geste n'a jamais été exercé par un utilisateur réel** : `match_status` en base vaut
`rapproché` (451), `à vérifier` (31), `manuel` (2), `owner` (1) — **aucun `user_card`**. Le chemin
est câblé et prouvé au harnais ; sa valeur reste théorique.

---

## Calibrage — mesures du 06-07/08, re-vérifiées le 26/08

Les chiffres ci-dessous **n'ont pas bougé** : les données sont figées au **27/07** (aucune
ingestion depuis un mois — c'est un signal en soi, pas une propriété du modèle).

Population du site principal Olivades, canal direct facturé : **212 comptes**, dont 144 à commande
unique. **Cadence établie : 22 clients** (18 `active` + 4 `dormant`).

Les 4 dormants :

| client | commandes | intervalle méd. | silence | ratio | CA total |
|---|---|---|---|---|---|
| CHAHAN | 19 | 7 j | 46 j | 6,6 | 31 357 € |
| PARISIENNESOILAIN | 6 | 9 j | 68 j | 7,6 | 5 487 € |
| HILLARYWTAYLOR | 4 | 20 j | 119 j | 6,0 | 1 452 € |
| DELAURIERE | 4 | 15 j | 125 j | 8,3 | 874 € |

**Trois cartes tirent**, toutes en priorité 3 : CHAHAN est écarté par le filtre de rôle
(`pro_project`). Studio Paris : 0 dormant (clients projet). Sites seed/démo : absents du mart
(pas de `party_code`).

Justesse du seuil, vérifiée : MAYENNETOILES (18 862 €, ratio 0,8) et EDMONDPETIT (22 039 €,
ratio 0,3) restent `active` ; FREYPIERRE (ratio 1,5) ne tire pas encore.

`analytics.party_directory` porte **485 lignes** : 345 `consumer` (moisson W0, particuliers tarif
public, confirmé JF), 137 `unknown` (vagues W3/W4), 2 `channel` (caisses COMPTOIR\*), 1
`pro_project` (CHAHAN, provenance owner chat 07/08).

---

## Ce qui reste ouvert

1. **La signification des comptes `unknown` n'est pas confirmée** (vagues W3/W4). C'est le socle du
   choix « `unknown` tire » : **les 3 cartes vivantes reposent sur des comptes dont on ne sait
   rien.** Point le plus important de cette liste.
2. **Le détecteur `pro_project`** (épisodes/an) n'est pas construit. CHAHAN est aujourd'hui
   *épargné*, pas *servi* — aucune carte ne lui correspond.
3. **La boucle de qualification n'a jamais été fermée** en réel (0 `user_card`).
4. **137 comptes restent `unknown`** — le typage des vagues W1/W2/W5-W8 (JF) n'est pas arrivé, ni le
   re-export avec compte tiers ligne à ligne. W5 Corner → `channel` attend ces fichiers.
5. **La carte « nouveau client » (agrégat) reste écartée** : 18 nouveaux clients/30 j chez Olivades
   — une carte par client inonde, et l'agrégat est déjà visible dans Sage. À réévaluer quand le
   typage arrivera (un nouveau client *pro* typé vaut plus qu'un compte anonyme).
6. **Les données sont figées au 27/07.** Le contrat de validation passe sur un instantané, pas sur
   un flux vivant.

C2 (verdicts hebdo par canal) et C3 (mensuel) sont **livrés** — `weekly-sales-spec.md`,
`monthly-sales-spec.md`.
