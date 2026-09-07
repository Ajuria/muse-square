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
| Engagements ouverts dont la fenêtre est finie et jamais résolus (`action_commitments`, status open, window_end < aujourd'hui) | 13 |
| Engagements ouverts sans « fait / pas fait » (`action_done_status` nul) | 13 |
| Engagements résolus sans bilan (`retro_worked` nul) | 8 |
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
| Engagement fini sans « fait / pas fait » | `analytics.action_commitments` : status `open`, `window_end` < aujourd'hui, `action_done_status` nul | `POST /api/commitments/disposition` (existe) |
| Engagement résolu sans bilan | status `resolved`, `retro_worked` nul | `POST /api/commitments/retro` (existe) — le « Bilan → » du lexique |
| Opération sans cible | `raw.saved_items` : `kpi_target_pct` et `kpi_target_eur` nuls, `event_end_date` ≥ aujourd'hui − 30 j | `POST /api/saved-items/update` (existe) |
| Jour inexpliqué sans note | `semantic.vw_insight_event_day_residual` : \|`residual_z`\| ≥ 2, ≤ 30 j, ET aucune note | **rail à créer** (§ 4) |
| Valeur déclarée ancienne | `analytics.consulter_correction_events` : dernière `correction_type` > 90 j (nombre de clients : 53 j au 07/09, sous le seuil) | Explorer, pré-rempli « <valeur> : » — le chat déclare déjà (`declared_capture`) |
| Pôle sans photo, photo sans articles confirmés | `action_commitments.pole_families` non nul sans ligne `dispositif_photos` ; `items_matched` non nul et `items_confirmed` nul | « Documenter → » (existe, page du pôle) |

### 3.2 Ce qui attend une décision (nature 2)

| Candidat | Source | Écriture |
|---|---|---|
| Verdict rendu, pas d'ajustement | `action_commitments` status `resolved`, verdict `met`/`missed`, `adjustment_move` nul, résolu ≤ 14 j | « Ajuster » (existe, `commitments/evolution`) |
| Dispositif prouvé jamais reconduit | verdict `met`, aucun `parent_commitment_id` postérieur | « Reproduire le dispositif » (existe, mode enquête d'Explorer) |
| Occurrence sous 7 jours sans préparation | `saved_item_dates` sous 7 j ; « préparé » = une consigne (`consigne_*`) ou un engagement lié (`saved_item_id`) | « Préparer → » (existe, `evenement.astro`) |
| Alerte concurrent non traitée | `raw.competitor_alerts` ≤ 7 j, `alert_level` max — **« traitée » n'existe pas** : un événement `action_log` à créer (§ 4) | Explorer, pré-rempli sur l'entité (chemin `entite_exterieure`, existe) |

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

1. **Le rail de la note-cause d'un jour.** « Un souvenir ? Notez-le · sinon, laissez » n'existe que
   comme commentaire dans `pulse.astro` ; aucun endpoint n'écrit une note de jour, aucune table ne
   la porte (vérifié : `INSERT` de l'app = drafts, snapshots, alerts, members, goal_state, triggers).
   C'est le chantier ouvert « Notez ce qui a changé » (mémoire `notez-ce-qui-a-change-chantier`) et la
   porte manquante « mise en test depuis une cause ». Proposition : une note = un événement
   `consulter_correction_events` de `correction_type = "day_note"` avec `raw_turn` = la date
   (rail append-only existant, zéro DDL) — à arbitrer (§ 6).
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
   sur 7 jours ; le Corner du 08/08 : −433 €), `window_expected_revenue` quand elle est finie sans
   résolution (ce qui était en jeu). Opération : `kpi_target_eur`, à défaut le CA moyen de ses
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
| E0 | Retrait des états B et C du slot 2 et des deux cartes fixes (si § 6.5) ; l'état vide vaut titre + composer quand rien n'est mesuré. | Harnais client (`explorer-ui.test.ts`, états A/B/C) instruit : B et C rendent zéro carte. |
| E1 | `insight/explorer-slots.ts` : nature 1 sur les engagements (« fait / pas fait », bilan) — les 13 et 8 lignes réelles de f10c3e58. | Test pur du score + rejeu sur f10c3e58 : les deux cartes attendues, dans l'ordre, cliquables vers `commitments/disposition` et `retro` ; batterie conversation verte. |
| E2 | Nature 2 : verdict à ajuster, prouvé à reconduire, occurrence à préparer. | Idem, sur les lignes réelles. |
| E3 | Rail note-cause (§ 6.3) + nature 1 « jour inexpliqué » ; la note nourrit `buildDayPerformanceFacts` (le fait « Note du JJ/MM : … » cité par le packager). | Lie-bait : une note est un fait `observed`, jamais causal ; batterie qualité ≥ baseline. |
| E4 | `alert_consulted` + nature 2 « alerte concurrent ». | Harnais client + rejeu. |
| E5 | Marques : une carte consultée sans réponse redescend au score suivant ; disparaît une fois la source vide. | Harnais client (marques stubbées). |

— SPEC DE TRAVAIL
