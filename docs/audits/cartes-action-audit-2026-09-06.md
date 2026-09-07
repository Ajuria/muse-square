# Audit des cartes d'action — 06/09/2026, reprise après le rendu owner (instantané, jamais mis à jour) — DÉFINITIF

Sert : intent § « dire à l'exploitant quelque chose de vrai qu'il ne pouvait pas voir seul, et pointer ce qu'il peut bouger » ; § « la mémoire opérationnelle … garder la trace de chaque dispositif avec son résultat ».

Matière : le rendu Pulse du 06/09 collé par l'owner (3 sites, « 25 actions »), `public/js/action-cards.js`,
`src/pages/app/insightevent/pulse.astro`, `src/lib/kpi/dayClassRegistry.ts`, `src/lib/recos/recoThemeMap.ts`,
`src/lib/commitments/commitmentResolve.ts`, `src/pages/api/cron/commitment-resolve.ts`, les modèles dbt
`fct_location_daily_action_candidates.sql`, `fct_location_change_feed.sql`, `int_client_weather_alerts_daily.sql`,
et les vues/tables BQ citées requête par requête. Compte owner = `location_id` commençant par `f10c3e58`.

Complète `cartes-action-audit-2026-09-04.md` : **aucun commit n'a touché les cartes entre les deux** (`git log
--since=2026-09-04` sur action-cards.js, pulse.astro, src/lib : réorganisation du dépôt et Explorer seulement).
Les neuf gestes P1-P9 et les quatre décisions owner du 04/09 sont donc TOUS encore ouverts, et le rendu du 06/09
les reproduit : 9 cartes de faits sur 17 hédgées « l'écart peut tenir au calendrier » sans geste (P1), `sales_surge`
qui se contredit (P2), concurrence datée le jour même (P3), coin à deux unités (P4), `low_competition_window` sur
30 sites sur 32 (P5), « Voir plus » entre le fait et le geste (P6), rentrée sous « Motif du jour : jours à 25–27 °C »
(P7). Ce document n'y revient pas ; il ajoute ce que le rendu du 06/09 et les axes nouveaux de l'owner révèlent.

## 1. Le rendu du 06/09 en nombres

| bloc | cartes | dont sans geste | dont chiffre au coin EMPRUNTÉ (classe ou population, pas l'objet) |
|---|---|---|---|
| faits heure / famille / produit | 9 | 9 | 9 (population `pop_*_carry`) |
| ventes (`sales_surge`, `sales_traffic_not_converting`) | 2 | 0 | 2 (`pop_revenue_surge`, `pop_traffic_not_conv`) |
| météo (`extended_bad_weather`, `weather_hazard_onset`) | 2 | 0 | 1 (classe `weather@date`) + 1 « pas encore chiffré » |
| `low_competition_window` | 2 | 0 | 2 (% du barreau funnel) |
| concurrence (`competitor_event_launch`) | 1 | 0 | 1 (classe `events_high`) |
| rentrée, tourisme, `event_measure` | 3 | 0 | 0 — `event_measure` sans coin du tout |
| chantiers structurels | 8 | — | — |

17 cartes datées. **Une seule porte un résultat MESURÉ SUR L'OBJET QU'ELLE NOMME** : « Résultat d'hier » (« Corner de
vente producteur », CA 1 537 € contre 925 € habituel, +612 €). Elle est rendue 16e, sans coin.

Candidates émises pour le site owner le 06/09 (`semantic.vw_insight_event_action_candidates`, requête § 3) : 15,
dont **8 de concurrence** (`competitor_event_launch`, `competitor_positioning_gap`, 3 `competitor_positioning_brief`,
3 `competitor_reputation_strength`, `competitor_offering_removed`). Une seule atteint la page.

## 2. Défauts nouveaux, par axe owner

### Pertinence — la météo revient, et elle est fausse trois fois

**W1. Le « mauvais temps » commence à 28 °C.** `int_client_weather_alerts_daily` (lignes 121-127) : `lvl_heat`
1 = ≥ 25 °C, 2 = ≥ 28 °C, 3 = ≥ 32 °C, 4 = ≥ 35 °C (commentaire du modèle : « canicule / dangerous heat (WHO
threshold) » = niveau 4). `fct_location_daily_action_candidates` : `is_bad_day = alert_level_max >= 2` et
`extended_bad_weather` tire sur `min_alert_in_window >= 2`. Un dimanche nuageux à 29 °C est donc un « mauvais
jour » qui déclenche DEUX cartes (« météo dégradée prolongée » et « alerte chaleur »).

**W2. Le vocabulaire gonfle de deux niveaux.** `action-cards.js` 884 : `HZ_FR.heat = 'canicule'` ; 903 : niveau 2 →
« sévère ». La carte écrit « Alerte canicule (niveau sévère) » pour le seuil que dbt appelle « uncomfortable
heat ». Le lexique n'a pas de mot pour les niveaux 1-3 : c'est un slot EN ATTENTE, pas une correction à faire seul.

**W3. La carte est un instantané, le jour a changé.** Payload de la candidate 06/09 : `new_value 'heat:2'`,
`alert_level 2`. Le même jour, `int_client_weather_alerts_daily` dit `lvl_heat 1`, `alert_level_max 1`,
`alert_source 'forecast'` ; `vw_insight_event_day_surface` dit `lvl_heat 2`, 29,2 °C, « Nuageux » ;
`vw_insight_event_location_context` dit `lvl_heat 1`. Trois tables, deux niveaux, une prévision révisée entre le
build du mart et le rendu. Rien au rendu ne relit l'alerte du jour : la carte garde le niveau de sa naissance.
C'est pour ça que le coin dit « perdus · jours à 25–27 °C » (classe `weather@date` = lvl 1 du contexte) sous un
corps qui affiche 29 °C (surface, lvl 2).

**W4. « Prolongée » sur un jour.** Payload `consecutive_bad_days: 1` ; le corps le dit lui-même (« Météo dégradée
aujourd'hui »), le titre dit « prolongée ». Le titre est fixe au registre (`reg('extended_bad_weather', …)`).

Effet cumulé : un site qui n'est pas sensible à 29 °C reçoit deux cartes d'alerte et une carte rentrée qui hérite
du même motif chaleur (P7) — trois cartes sur 17 pour une prévision déjà révisée.

### Les plus utiles d'abord — le tri récompense le chiffre emprunté

**R1. `data-t-k` ne distingue pas un chiffre propre d'un chiffre hérité.** `pulse.astro` 1821 :
`data-t-k = 1` dès que le coin porte un montant (hors « ? €/an »). Le tri (3781) fait passer k=1 devant tout.
Or les 9 cartes de faits portent le €/an de leur POPULATION (`CARD_POPULATION_BY_DIRECTION`, registre 1323 —
même montant sous chaque créneau en hausse du site, A2 du 04/09), `sales_surge` porte `pop_revenue_surge`
(+8 358 €/an, identique pour chaque `sales_surge` du site), `competitor_event_launch` porte la classe `events_high`
(+13 513 €/an — **le même nombre que le chantier structurel « dispositif événements voisins »** juste en dessous,
doublon de coin interdit par la doctrine du 01/08). Résultat mesuré au rendu : 15 cartes à chiffre emprunté
passent devant `event_measure`, la seule à chiffre propre, qui n'a pas de coin (`eventLifecycleCards.ts` 2327 :
`{ context, action }`, aucune entrée dans `CARD_POPULATION`, `CARD_TYPE_CLASS` ni `CARD_VALUE_TYPES`).

**R2. Le quota par site fait remonter des doublons.** `QUOTA = 2` par site (3796) : la même fenêtre
`low_competition_window` du 06 au 09/09 tient deux des six places du pli avec deux unités différentes
(« +13 % · vos visiteurs » chez Occitanie, « −8 % · vos ventes » chez Muse Square · MS Test), pour un motif qui
tire sur 30 sites sur 32 ce jour (requête § 3).

### Ce qui n'a pas de terme ne doit pas expirer

**E1. Un « lancement concurrent » est n'importe quelle occurrence d'événement datée aujourd'hui.**
`fct_location_change_feed.sql` 901 : `competitor_event_launch` prend `cf.event_date as date` depuis
`fct_competitor_events_conflicts`, dédoublonné par (site, concurrent, date, nom). `fct_location_daily_action_candidates`
1172 : `expires_at = feed_date`. `renderActionCandidates` 2930 : `acDate !== target` → écartée. Une carte vit donc
le jour de l'événement, et seulement lui. Ce 06/09 : « 1er dimanche du mois gratuit » de l'Orangerie — une
GRATUITÉ MENSUELLE, pas un lancement — présente sous **7 libellés différents** en 60 jours dans
`fct_competitor_events_conflicts` (requête § 3 : « Journée gratuite – 1er dimanche… », « 1er dimanche du mois
gratuit • Réservation obligatoire », …), donc jamais reconnue comme récurrente. Les deux suivantes pour le site :
« English Guided… » le 07/09, « Chefs-d'œuvre… » le 10/09 — des visites et une exposition, chacune visible un
jour.

**E2. Les changements que l'owner nomme existent, et sont démis + éphémères.** `competitor_price_increase`,
`competitor_price_drop`, `competitor_repricing_event`, `competitor_new_offering`, `competitor_hours_change`,
`competitor_offering_removed` : tous dans `DEMOTED_TO_FEED` (`recoThemeMap.ts` 155, décision 28/07 « vigilance,
pas action ») ET `expires_at = feed_date`. Sur le parc, 30 derniers jours : `competitor_new_offering` 1 site et
`competitor_price_increase` 1 site, tous deux datés 06/09 et expirant le 06/09. Un changement de prix chez un
suivi est visible zéro jour sur la page Actions, par construction à deux étages.

### Le coin : +, −, %, €/an

**C1. Un nombre sans référentiel.** « +739 € (856 €) » (`action-cards.js` 2378) : le second nombre est le
résultat habituel, rien ne le dit. Intent : « un chiffre porte son référentiel ».

**C2. `sales_surge` se contredit encore, payload à l'appui.** 04/09 : `dominant_factor 'basket'`,
`basket_delta_pct −6.1`, `transactions_delta_pct −0.3`. Corps (2378) : « La hausse vient du panier moyen (−6 %),
pas du volume » ; ligne d'action (3153) : « sans que le volume ni le panier ne montent ». Le `dominant_factor` dbt
n'a pas de porte de signe (commentaire 3156-3161) ; le corps le suit, la ligne d'action non. Même défaut le 01,
02 et 03/09 (4 payloads sur 4, tous `basket` négatif).

**C3. Le €/an de population sous une carte hédgée.** Inchangé depuis le 04/09 (B1) ; le 06/09 l'owner le lit
comme « les nombres annualisés n'ont pas toujours de sens » — c'est le symptôme de A2 + R1, pas un défaut de plus.

### La proposition de valeur — mesurer l'impact des dispositifs

**V1. Le même dispositif, deux états contradictoires sur la même page.** Bloc Engagements : « Corner de vente
producteur · Ventes reçues 0 / 1 j. · Attente de ventes ». Carte `event_measure`, 16e : « CA 1537 € contre 925 €
habituel du jour (+612 €) ». Cause mesurée : `analytics.action_commitments`, dernier instantané `pending 0/1`
écrit le **06/09 à 02:00 UTC** par `cron/commitment-resolve.ts` ; à cette heure `vw_insight_event_day_residual`
n'avait pas encore le 05/09. Il l'a maintenant (1 537 / 925). Le bloc lit l'instantané, la carte lit la vue en
direct. Le verdict arrivera au cron du 07/09 : **J+2 pour une opération d'un jour**, et entre-temps la page
affirme deux choses incompatibles.

**V2. Le verdict ne mesure que le CA.** `commitmentResolve.ts` 37 : `SELECT date, daily_revenue,
expected_revenue, residual_z` — c'est tout. La proposition de valeur promet « le volume de transactions, le panier
moyen ou le mix produits ». Le rendu du bloc (pulse.astro 2973-2992) n'a que « CA ± % vs votre résultat
habituel » et « +11 % votre objectif ». Le mot « Cible famille Branded : verdict au dossier » (2336) renvoie à un
dossier ; la page Actions, elle, ne dit ni le volume, ni le panier, ni le mix du 05/09.

**V3. « Menée par défaut » et « Attente de ventes » sont les seules chaînes qui parlent du dispositif dans le
premier écran.** Une page dont la valeur est « ce que vous avez fait, et si ça a marché » ouvre sur deux
formules d'attente et 15 chiffres empruntés. La carte qui porte la preuve est sous le pli.

### Diversité — inchangée

9 faits hédgés sur 17 (P1), 3 cartes pour une prévision chaleur révisée (W1-W4), 2 cartes pour une fenêtre
parc-entière (P5, R2), 1 carte concurrence sur 8 émises (E1-E2, D2 du 04/09). Reste : 2 ventes, 1 rentrée
(101, B4), 1 tourisme (32/32, B6), `event_measure`. Ce que l'owner appelle « la plupart étaient météo » a
changé de nature, pas d'ampleur : la place est prise par des faits sans témoin et des chiffres de population.

## 3. Requêtes et fenêtres

- Candidates owner 06-13/09 : `SELECT date, action_type, action_priority, expires_at FROM
  semantic.vw_insight_event_action_candidates WHERE STARTS_WITH(location_id,"f10c3e58") AND date BETWEEN
  "2026-09-06" AND "2026-09-13"` → 23 lignes, 15 le 06/09.
- Couverture parc 06/09 : `COUNT(DISTINCT location_id)` par `action_type`, même vue, `date = "2026-09-06"` :
  `foreign_tourism_signal` 32/32, `commercial_event_match` 31, `review_solicitation` 31,
  `low_competition_window` 30, `weather_hazard_onset` 12, `extended_bad_weather` 8, `competitor_event_launch` 1,
  `competitor_price_increase` 1, `competitor_new_offering` 1.
- Payloads 06/09 (même vue, `data_payload`) : `weather_hazard_onset` `{new_value:"heat:2", hazard_days:2}` ;
  `extended_bad_weather` `{alert_level:2, consecutive_bad_days:1, site_sensitivity:3}` ;
  `competitor_event_launch` `{new_value:"Musée de l'Orangerie — 1er dimanche du mois gratuit – …",
  distance_m:4212, direction:"new"}` ; `low_competition_window` `{pressure_ratio:0.8, events_5km:257,
  baseline_avg:3461}` ; `sales_surge` 01-04/09 : 4 lignes, `dominant_factor "basket"` avec `basket_delta_pct`
  −5,2 / −9,8 / −8,4 / −6,1.
- Météo 06/09 : `intermediate.int_client_weather_alerts_daily` (`lvl_heat 1`, `alert_level_max 1`, forecast) ;
  `semantic.vw_insight_event_day_surface` (`lvl_heat 2`, `temperature_2m_max 29.2`, « Nuageux ») ;
  `semantic.vw_insight_event_location_context` (`lvl_heat 1`, `alert_level_max 1`).
- Orangerie : `mart.fct_competitor_events_conflicts`, site owner, `event_date` 01/08-31/10, `event_name LIKE
  '%dimanche%'` → 7 libellés pour la gratuité du 1er dimanche (02/08 et 06/09).
- Engagement : `analytics.action_commitments`, site owner, `committed_action_text LIKE '%corner de vente
  producteur%'` → `pending 0/1`, `updated_at 2026-09-06 02:00:58 UTC` ; `semantic.vw_insight_event_day_residual`
  05/09 → 1 537 / 925.

## 4. Ce qu'on peut faire — par ordre de rendement, en plus de P1-P9

| # | geste | où | effet mesurable |
|---|---|---|---|
| N1 | **Coin propre ou rien dans le tri** : `data-t-k = 1` seulement si le montant est celui de l'OBJET (€ du jour de la carte, `enjeu.inherited !== true`, pas une population ni une classe) ; `event_measure` reçoit son € du jour (`gap_eur`, +612 €) au coin | pulse.astro 1821 + 1686-1806, registre `CARD_VALUE_TYPES` | la carte du dispositif passe 1re ; les 15 chiffres empruntés cessent de ranger |
| N2 | **Relire l'alerte au rendu** : une carte météo ne rend que si `alert_level_max` du jour (surface) ≥ son niveau d'émission ; `extended_bad_weather` exige `consecutive_bad_days ≥ 2` (le titre le promet) ; seuil d'émission chaleur à discuter (lvl ≥ 3 = 32 °C ?) — décision owner | action-cards.js 814/889, dbt `bad_wx_flags` | 3 cartes sur 17 le 06/09 tombent ou se corrigent |
| N3 | **Fenêtre de validité pour ce qui n'a pas de terme** : `competitor_price_*`, `competitor_new_offering`, `competitor_hours_change`, `competitor_offering_removed` sortent de `DEMOTED_TO_FEED` avec `expires_at = date + N jours` (N à arbitrer, 14 ou 30) et rendu si `date ≤ aujourd'hui ≤ expires_at`, dédup par `suppression_key` ; fusionne P3 (liste blanche prospective) | recoThemeMap.ts 155, dbt 1172, action-cards.js 2930 | un changement de prix reste visible N jours au lieu de 0 |
| N4 | **Un lancement = une première occurrence** : `competitor_event_launch` exclut tout événement dont le même concurrent a une occurrence de nom proche dans les 35 jours précédents (normaliser le nom : ponctuation, « – Musée de… », « • Réservation… ») ; les visites guidées quotidiennes ne sont pas des lancements (critère à arbitrer) | dbt `fct_location_change_feed.sql` 901 | 0 gratuité mensuelle présentée comme lancement |
| N5 | **Résoudre à la lecture** : quand le dernier instantané est `pending` et `window_end < aujourd'hui`, `GET /api/commitments` recalcule la couverture sur la vue résiduelle avant de rendre (ou second passage du cron après l'ingestion des ventes) | commitmentResolve.ts, api/commitments/index.ts | « Ventes reçues 0 / 1 j. » et « CA 1537 € » ne coexistent plus ; verdict J+1 |
| N6 | **Verdict à trois KPI** : le résolveur lit transactions et panier de la même vue si elle les porte (à vérifier via bq-verify : colonnes de `vw_insight_event_day_residual`), et le mix par famille cible depuis le dossier ; rendu dans le bloc Engagements et dans `event_measure` | commitmentResolve.ts 37, eventLifecycleCards.ts | la page dit enfin volume / panier / mix |
| N7 | **Porte de signe dans le corps** (= P2) : le corps de `sales_surge` réutilise `pick` de la ligne d'action ; « +739 € (856 €) » nomme son référentiel | action-cards.js 2378 | 4 cartes sur 4 cessent de se contredire |
| N8 | Vocabulaire chaleur niveaux 1-3 : mot à demander à l'owner, pas à inventer (W2) | lexique | — |

Décisions owner (pas de code sans elles) : les quatre du 04/09 (démettre `day_opportunity` ; porte
`foreign_tourism_signal` ; bandeau Veille ou rien ; unité du coin des faits) ; plus : (a) seuil chaleur qui
justifie une carte ; (b) N jours de validité d'un changement concurrent et quels types reviennent sur Actions ;
(c) ce qui compte comme « lancement » (première occurrence ? exposition seulement ?) ; (d) le mot des niveaux
chaleur 1-3.
