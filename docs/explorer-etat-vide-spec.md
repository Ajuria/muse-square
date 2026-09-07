# Explorer — l'état vide devient le guichet de la mémoire : ce que l'app demande, ce qu'elle propose — SPEC DE TRAVAIL

> Sert : intent § Le métier — « Muse Square dit ce que vous avez fait, et si ça a marché » : la
> seconde moitié se mesure seule, la première n'est connue que de l'exploitant, et Explorer est la
> seule surface qui prend sa parole en langage naturel. Et § Le test de valeur, règle 11 du lexique :
> une phrase écrivable sans ouvrir le compte ne s'affiche pas.
>
> Question owner 07/09 : « the prompt page default questions are useless (what is the impact of
> weather on my sales etc.) — use that real estate to ask user questions or suggest actions (you
> didn't do x, y and z for a long time, do you want me to a, b, c) ». Rien n'est appliqué.

## 1. Ce qui est (état vide de `prompt.astro`, `ie-prompt.js` `buildDynamicSuggestions`, R7 08/08)

Trois cartes, sous le titre « Bonjour <prénom>. Que souhaitez-vous explorer ? » :

| Slot | Aujourd'hui | Test 11 (écrivable sans ouvrir le compte ?) |
|---|---|---|
| 1 | « Trouver une date » (carte finder, fixe) | ÉCHOUE — la même pour tous les comptes, tous les jours |
| 2 | État A : « Pourquoi le CA de <jour> a-t-il bondi / décroché ? » quand le dernier jour mesuré porte \|z\| ≥ 2 · État B : « Quel est l'effet de la chaleur / pluie sur mes ventes ? » sur alerte météo · État C : « Quel est l'effet de la météo sur mes ventes ? » (repli) | A PASSE (daté, chiffré depuis le compte) · B et C ÉCHOUENT |
| 3 | « Générer un rapport » (mois dernier) | ÉCHOUE |

Un clic pré-remplit une question éprouvée par la batterie. Les marques « consulté » existent
(`analytics.action_log`, événement `explorer_consulted`, GET de `insight/action-log.ts`) — mécanisme en
place, **0 ligne** sur f10c3e58 au 07/09 (les 2 224 `page_view`, 53 `draft_generated`, 2
`action_consulted` sont d'autres surfaces).

Ce que l'app ne sait PAS demander aujourd'hui, mesuré sur f10c3e58 le 07/09 (requêtes § 3) :

| Trou de la mémoire ou décision en attente | n |
|---|---|
| Engagements résolus sans bilan (`retro_worked` nul) — **dernier instantané par engagement** (la fenêtre ROW_NUMBER de `commitments/index.ts`) | 5 (re-mesuré 07/09 au soir ; le « 8 » du matin comptait les instantanés, pas les engagements) |
| Engagements ouverts dont la fenêtre est finie | 0 au dernier instantané (le « 13 » du matin comptait 14 instantanés de 11 engagements ; le cron `commitment-resolve` les résout à l'échéance) |
| Engagements sans « fait / pas fait » (`action_done_status` nul) | **N'est PAS un trou de mémoire.** Doctrine owner 05/08, en prod dans l'infobulle de Pulse : « Si vous ne déclarez rien, l'action est considérée comme menée à l'échéance de la fenêtre — le verdict mesure alors son effet. » Seule l'exclusion explicite (« Pas menée ») compte, et elle ne se réclame pas. La carte 1 du proto (« l'opération a-t-elle eu lieu ? ») contredisait cette doctrine : RETIRÉE le 07/09 à l'implémentation, avant tout rendu. |
| Opérations sans cible (`saved_items`, `kpi_target_pct` et `kpi_target_eur` nuls) | 3 sur 5 |
| Jours à \|z\| ≥ 2 sur 30 jours, sans note (`vw_insight_event_day_residual`) | 5 — et **aucun rail** pour écrire la note (§ 4) |
| Dernière valeur déclarée : nombre de clients | il y a 53 jours (`consulter_correction_events`) |
| Alertes concurrents sur 30 jours (`raw.competitor_alerts`) | 52 — sans aucune notion de « vue / traitée » |
| Occurrence à venir sous 7 jours (`saved_item_dates`) | 1 |
| Pôles sans photo | 0 pôle sur ce compte (`pole_families` nul partout) — le slot vaut pour Épices et Tout |

Treize engagements attendent depuis plus d'une fenêtre qu'on leur dise « fait » ou « pas fait » :
c'est exactement le « you didn't do x for a long time » de l'owner, et la page le tait.

## 2. Le principe

L'état vide n'est pas une liste de questions : c'est **le guichet de la mémoire**. Trois natures de
carte, et rien d'autre :

1. **Ce qui manque à la mémoire** — un trou daté, propre au compte, avec sa conséquence dite.
2. **Ce qui attend une décision** — un objet réel dont l'app a fait sa part et attend la vôtre.
3. **Une question, au plus une, seulement mesurée** — l'état A du slot 2 actuel ; jamais un repli.

Chaque carte : (a) vient d'une ligne du compte, datée ; (b) porte un chiffre ou un nom (l'engagement,
l'opération, le jour) ; (c) dit ce que la réponse débloque ; (d) ouvre sur une ÉCRITURE, pas sur un
chat — le clic conduit au rail existant (§ 4), ou pré-remplit Explorer avec l'objet nommé quand le
rail est le chat lui-même (valeur déclarée, idée, contestation). Une carte qui rate (a) ou (d) ne
s'affiche pas — la page se contente alors du titre et du composer, comme aujourd'hui l'état C
devrait le faire.

Ce que l'état vide n'est PAS : un second Agir. Agir dit quoi faire (cartes du jour) ; Explorer demande
ce que vous avez fait et ce que vous décidez. Une carte d'action déjà sur Agir ne se répète pas ici.

## 3. Les candidats, leur source, leur rang

Score de chaque candidat = **enjeu × ancienneté**, tous deux lus dans le compte — jamais un ordre
éditorial. Enjeu en € lu dans l'objet lui-même (`creation_enjeu_eur_year` d'un engagement, résidu €
d'un jour, `kpi_target_eur` d'une opération ou, à défaut, le CA moyen de ses occurrences passées,
`entity_threat_score` d'une alerte converti en rang) ; un candidat sans aucun chiffre passe dernier,
le plus ancien d'abord (§ 6.2). Ancienneté = jours depuis la date de l'objet (fin de fenêtre, jour
mesuré, dernière déclaration). Les trois premiers s'affichent, toutes natures confondues, avec une
seule garde : jamais trois cartes de la même nature (§ 6.1). Une carte quand il y a un candidat,
aucune quand il n'y en a pas (§ 6.5).

### 3.1 Ce qui manque à la mémoire (nature 1)

| Candidat | Source (vérifiée 07/09) | Écriture ouverte par le clic |
|---|---|---|
| Engagement résolu sans bilan | `analytics.action_commitments` : status `resolved`, `retro_worked` nul (dernier instantané par engagement) | La page de l'engagement (`engagement?id=`), dont le rail Documenter (`POST /api/commitments/retro`) ne se câble que sur une opération terminée — le « Bilan → » du lexique. **Livré E1.** |
| ~~Engagement fini sans « fait / pas fait »~~ | Retiré 07/09 : le silence vaut « action menée » (doctrine owner 05/08, § 2). La page de l'engagement n'a plus de bloc « Action menée ? » (owner 28/08) ; le geste vit dans Pulse, Insight et Slack sur les engagements OUVERTS seulement. | — |
| Opération sans cible | `raw.saved_items` : `kpi_target_pct` et `kpi_target_eur` nuls, `event_end_date` ≥ aujourd'hui − 30 j | `POST /api/saved-items/update` (existe) |
| Jour inexpliqué sans note | `semantic.vw_insight_event_day_residual` : \|`residual_z`\| ≥ 2, ≤ 30 j, ET aucune ligne dans `analytics.day_notes` (même site, même jour) | La carte porte SA saisie : `POST /api/insight/day-notes` (E3, **livré 07/09**) — forme owner « Un souvenir ? Notez-le · sinon, laissez », bouton « Enregistrer ». Un jour = une carte : quand la question mesurée (nature 3) porte la même date, elle cède. |
| Valeur déclarée ancienne | `analytics.consulter_correction_events` : dernière `correction_type` > 90 j (nombre de clients : 53 j au 07/09, sous le seuil) | Explorer, pré-rempli « <valeur> : » — le chat déclare déjà (`declared_capture`) |
| Pôle sans photo, photo sans articles confirmés | `action_commitments.pole_families` non nul sans ligne `dispositif_photos` ; `items_matched` non nul et `items_confirmed` nul | « Documenter → » (existe, page du pôle) |

### 3.2 Ce qui attend une décision (nature 2)

| Candidat | Source | Écriture |
|---|---|---|
| Verdict rendu, pas d'ajustement — **livré E2 07/09** | `action_commitments` status `resolved`, verdict `met`/`missed`, `adjustment_move` nul, AUCUNE version suivante (`parent_commitment_id` = cet id), résolu ≤ 14 j. Manqué → « à ajuster » ; atteint → « à reconduire » (ligne suivante). Un objet = une carte : son bilan (nature 1) passe avant. | « Ajuster » (lexique) vers la page de l'engagement ; ligne « Choisissez votre prochaine action : Poursuivre · Doubler la mise · Pivoter » (commitmentCopy) |
| Dispositif prouvé jamais reconduit — **livré E2 07/09** | verdict `met`, aucune version suivante, ≤ 14 j (même lecture) | « Répliquer » (bouton de la bande engagements, pulse.astro) vers la page de l'engagement ; ligne « Garder ce qui a marché — et le reconduire » (pulse.astro) |
| Occurrence sous 7 jours sans préparation — **livré E2 07/09** | `raw.saved_item_dates` × `raw.saved_items` sous 7 j ; « préparé » = `consigne_enabled` OU un engagement ouvert/en attente lié dont la fenêtre couvre la date ; € = `kpi_target_eur`, à défaut le CA moyen des occurrences passées ; ancienneté = 8 − jours restants | « Préparer → » (lexique) vers `evenement?saved_item_id=` ; titre « Préparer — <titre> » (en-tête de l'étape avant, evenement.astro), ligne « <jour> — sans action » (lexique, jour non couvert) |
| Alerte concurrent non traitée — **livré E4 07/09** | `semantic.vw_insight_event_competitor_alerts` ≤ 7 j (nom par `vw_insight_event_competitors_followed`), niveau maximal, sans marque « consulté » — la marque `explorer_consulted` sur la clé `explorer_slot_alerte:<id>` VAUT « traitée » (même rail que les autres cartes, aucun événement nouveau) ; sans € : `entity_threat_score` classe | « Consulter → » (lexique) vers `competitor?id=` ; titre = la ligne du fil Agir « <Concurrent> — <événement>, à <distance>. » (action-cards.js), ligne « Menace : <sous-type> » (pulse.astro feedLine4) |

Aucun rang de nature : le € de chaque objet classe (§ 6.2).

### 3.3 La question mesurée (nature 3)

L'état A actuel, inchangé : le dernier jour mesuré à \|z\| ≥ 2, « Pourquoi le JJ/MM ? ». Les états
B et C disparaissent. Quand il n'y a pas d'anomalie, il n'y a pas de question.

## 4. Ce qui existe, ce qui manque

Existe et se réutilise tel quel : les cinq écritures `commitments/*`, `saved-items/update`, la
déclaration par le chat, « Documenter → », « Préparer → », « Reproduire le dispositif », les
marques `explorer_consulted` (répétition gérée : une carte consultée sans réponse redescend, une
carte répondue disparaît — sa source ne la produit plus).

Manque :

1. **Le rail de la note-cause d'un jour — EXISTE depuis le 07/09 (E3, décision § 6.3).** Table
   `analytics.day_notes` (six colonnes REQUIRED, créée en base le 07/09), `POST /api/insight/day-notes`
   (append-only, 500 caractères au plus, accès site), lecture par `explorer-slots` (un jour noté ne
   redemande plus) et par `buildDayPerformanceFacts` (« Note du JJ/MM/AAAA : « … » », fait `observed`,
   jamais causal). Côté dbt : PR [ms_database#126](https://github.com/Ajuria/ms_database/pull/126) (source, `stg_day_notes`,
   `semantic.vw_insight_event_day_notes`, SQL prouvé sur BQ) — à merger puis builder. Avant le 07/09 la forme
   « Un souvenir ? Notez-le · sinon, laissez » n'existait que comme commentaire dans `pulse.astro`
   (chantier « Notez ce qui a changé », mémoire `notez-ce-qui-a-change-chantier`).
2. **« Alerte traitée ».** Un événement `action_log` `alert_consulted` (même table, même GET que
   `explorer_consulted`).
3. **Le lecteur qui classe.** Un endpoint GET `insight/explorer-slots.ts` (à créer — `grep
   module-index` : aucune capacité « slots » n'existe) qui lit les sources de § 3, calcule le score et
   rend au plus trois cartes typées `{ nature, objet, date, enjeu, phrase, cta: { rail, prefill } }`.
   Latence : cinq lectures indépendantes en `Promise.all`, budget 3 s de la page.

## 5. Les mots — aucun proposé ici (règles 2 et 4 de la copie)

Chaque carte est une chaîne visible. Les chaînes APPROUVÉES réutilisables sur cette surface : le
titre « Bonjour <prénom>. Que souhaitez-vous explorer ? », l'état A « Pourquoi le CA de <jour>
a-t-il bondi / décroché ? », les CTA du lexique « Bilan → », « Préparer → », « Documenter → »,
« Ajuster », « M'engager », « Reproduire le dispositif », et sur les jours inexpliqués la forme
owner « Un souvenir ? Notez-le · sinon, laissez ». Tout le reste — la phrase de chaque nature, le
mot de la conséquence — est un mot owner. Les propositions viendront une par une, avec le rendu
cité et le tableau des tests 8-13, après le § 6.

## 6. Décisions owner (07/09) — toutes ACTÉES

1. **Trois natures, sans « une carte par nature »** : classement par score, les trois premiers,
   jamais trois cartes de la même nature.
2. **Aucun rang de nature : le € de l'objet classe.** Mesuré sur f10c3e58 le 07/09 :
   `creation_enjeu_eur_year` vaut 0 sur TOUS les engagements du compte — ce champ ne classe rien.
   Le € d'un engagement est donc **la fenêtre elle-même** : `|window_actual_revenue −
   window_expected_revenue|` quand elle est résolue (le « Dispositif vacances scolaires » : +904 €
   sur 7 jours ; le Corner du 08/08 : −394 € — `window_actual_revenue` 1 869,15 sur 2 263 attendus, requête § 3).
   Une fenêtre finie sans résolution ne fait pas de carte (le cron la résout, § 2). Opération : `kpi_target_eur`, à défaut le CA moyen de ses
   occurrences passées. Alerte : `entity_threat_score` converti en rang. Score = € × ancienneté en
   jours ; sans aucun chiffre, dernier, le plus ancien d'abord.
3. **Rail de la note-cause = table `analytics.day_notes` + vue `semantic.vw_insight_event_day_notes`**,
   append-only, une ligne par note (`note_id`, `location_id`, `clerk_user_id`, `date`, `note_text`,
   `created_at`) ; passation dbt en trois fichiers, générée et prouvée avant collage.
4. **Ancienneté d'une valeur déclarée : 90 jours.**
5. **« Trouver une date » et « Générer un rapport » quittent l'état vide ; trois cartes au plus ;
   jamais de remplissage.** Souci owner : « will users know they can do it ? » — voir § 6bis.
6. **Chaque carte dit sa conséquence.**
7. **Le mot : un dispositif prouvé se RECONDUIT** (owner 07/09 : « stop saying rejouer →
   Reconduire ») — au lexique, au garde `MOTS_BANNIS` (rejouer / rejoué / à rejouer), et les six
   chaînes en prod qui le disaient sont corrigées le même jour (`tableau.astro` « Reconduire → »,
   `pulse.astro` ×2, `action-cards.js` ×3 ; `?v=121`).

## 6bis. Retrouver le rapport et la recherche de date sans les cartes (conseil, en attente du oui)

Ce qui existe déjà : Piloter porte « Générer un rapport → » (`tableau.astro`, ligne du bloc CA,
vers Explorer pré-rempli) ; la Nav mène au rapport ; le chat comprend « Génère le rapport
d'août » (`rapport`) et « mes 3 meilleurs jours en octobre » (`fenetre`) sans carte. Ce qui manque
est l'INDICE : la personne qui arrive sur un état vide sans carte doit voir qu'on peut lui demander
ça. Deux voies, par ordre de coût :

- **Le placeholder du composer tourne sur des questions ÉPROUVÉES** (celles de la batterie :
  « Génère le rapport d'août », « Quels sont mes 3 meilleurs jours en octobre ? », « Pourquoi le
  JJ/MM ? ») — zéro place prise, le motif standard des barres de saisie ; le placeholder actuel
  (« Posez votre question… ») n'annonce pas le périmètre (relevé 03/09). Chaînes à valider owner :
  ce sont les questions de la batterie, déjà approuvées comme QUESTIONS, à relire comme placeholder.
- **Une rangée de puces sous le composer** (le motif `ie-conc-pill` existe en mode concurrence),
  deux puces, jamais des cartes. Plus visible, une ligne de place.

Conseil : le placeholder d'abord ; les puces seulement si l'owner les juge nécessaires après usage.
Déplacer ces deux entrées vers Piloter n'apporte rien : le rapport y est déjà, et la recherche de
date est une question d'Explorer.

## 7. Incréments et portes (après § 6)

| # | Incrément | Porte |
|---|---|---|
| E0 — **APPLIQUÉ 07/09** | États B et C, « Trouver une date » (carte, formulaire, pickers, endpoint `find-dates` et sa lib — seul consommateur) et « Générer un rapport » retirés ; l'état vide vaut titre + composer quand rien n'est mesuré ; placeholder tournant (§ 6bis, questions de la batterie). Proto supprimé (règle de placement : le proto meurt dans le commit qui livre). | Harnais client instruit : `explorer-ui` (aucune carte, label masqué, placeholder), `explorer-slots-anomaly` (la question seule), `explorer-slots-server` (fusion, cap, rail), `explorer-consulted` (marque sur une carte serveur). |
| E1 — **APPLIQUÉ 07/09** | `insight/explorer-slots.ts` + `lib/explorer/explorerSlots.ts` (pur) + `explorerSlotsCopy.fr.ts` (mots, garde) : nature 1 = l'engagement résolu sans bilan, score = \|écart de la fenêtre\| × jours, jamais trois de même nature, jamais de remplissage. La carte « fait / pas fait » n'est PAS livrée (doctrine 05/08, § 2). | Test pur 8 cas (mutations vues rouges) ; rejeu de la requête + lib sur f10c3e58 (§ 8) : 5 candidats, 2 cartes rendues (garde de nature) — Corner du 08/08 (−394 €, 10 j), Dispositif vacances scolaires (+904 €, 3 j) ; batterie conversation verte. |
| E2 — **APPLIQUÉ 07/09** | Nature 2 : verdict à ajuster, prouvé à reconduire, occurrence à préparer — tous les mots viennent du lexique, de la page de l'engagement et du fil Agir (owner 07/09 : « don't you have all you need in lexique + in agir page? »). Sur f10c3e58 : le Corner du 08/08 est « à ajuster » mais son bilan passe avant (un objet = une carte) ; le Corner du 05/09 a déjà sa version suivante ; l'occurrence du 12/09 a son engagement lié → aucune de ces trois cartes aujourd'hui ; la troisième carte serveur est l'alerte (E4), et la question mesurée la remplace au client quand il y en a une. Les cinq lectures en parallèle : 2,6 s à froid sur f10c3e58 (budget 3 s). | Tests purs (chaque garde vue rouge par mutation) ; rejeu des cinq requêtes sur f10c3e58 (§ 8). |
| E3 — **APPLIQUÉ 07/09** (dbt : PR [ms_database#126](https://github.com/Ajuria/ms_database/pull/126) à merger) | Rail note-cause (§ 6.3) : table + endpoint + carte « jour inexpliqué » avec sa saisie + le fait « Note du JJ/MM/AAAA : « … » » dans `buildDayPerformanceFacts` (`dayNoteFacts`, pur). Sur f10c3e58 au 07/09 : 5 jours à \|z\| ≥ 2 sans note → la carte du mardi 01/09 (+683 €, 6 j) passe première, devant le bilan du Corner. | Test pur (candidat, seuil, signe, fait `observed` — mutations vues rouges) ; harnais client `explorer-slots-note` (saisie, écriture site × jour × texte, carte retirée, question du même jour cédée) ; rejeu de la requête sur f10c3e58. |
| E4 — **APPLIQUÉ 07/09** | Nature 2 « alerte concurrent » ; « traitée » = la marque « consulté » existante sur la clé de l'alerte (pas d'événement `alert_consulted` : un seul rail de marques). Sur f10c3e58 : 15 alertes de niveau 2 en 7 jours (Musée de l'Orangerie, proximité) ; sans €, elles passent derrière les cartes chiffrées — la première : « Musée de l'Orangerie — Chefs-d'œuvre, de Monet à Picasso, à 4,2 km. » | Test pur (niveau maximal, marque = traitée) ; rejeu. |
| E5 — **APPLIQUÉ 07/09** | Marques : `explorer-slots` lit les marques `explorer_consulted` de l'utilisateur (même lecture que `action-log` GET, clés `explorer_slot_*`) et `rankSlots` fait redescendre une carte consultée sans réponse derrière celles qui ne l'ont pas été — elle sort du top 3 s'il y a mieux ; répondue, sa source ne la produit plus. Le client ne réordonne rien, il affiche « Consulté le JJ/MM ». Une carte note ne se marque pas (sa saisie EST la réponse ; « laissez » = rien). | Harnais client (marques stubbées). |

— SPEC DE TRAVAIL
