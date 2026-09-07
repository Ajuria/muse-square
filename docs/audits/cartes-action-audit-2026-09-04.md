# Audit des cartes d'action — 04/09/2026 (instantané, jamais mis à jour) — DÉFINITIF

Sert : intent § « dire à l'exploitant quelque chose de vrai qu'il ne pouvait pas voir seul, et pointer ce qu'il peut bouger ».

Matière : le rendu Pulse du 04/09 sur le compte owner (3 sites, 23 cartes), `public/action-cards.js`,
`src/pages/app/insightevent/pulse.astro`, `src/lib/dayClassRegistry.ts`, `src/lib/recoThemeMap.ts`,
`semantic.vw_insight_event_action_candidates`, `analytics.day_class_impacts`, le modèle dbt
`fct_location_daily_action_candidates.sql` et `fct_client_hourly_signals_daily.sql`.
Chaque chiffre porte sa requête et sa fenêtre. Verdict de `docs/card-truth-audit.md` cité quand il existe.

## 1. Ce que le tableau montre (compte owner, 04/09)

| famille | cartes datées | dont sans ligne « Action conseillée » |
|---|---|---|
| faits heure / famille / produit (`hour_share_move`, `offering_mix_shift`, `item_share_move`) | 9 | **9** |
| `low_competition_window` | 2 | 0 |
| `sales_surge`, `sales_traffic_not_converting` | 2 | 0 |
| `event_prepare`, `commercial_event_match` (rentrée), `day_opportunity`, `foreign_tourism_signal` | 4 | 0 |
| `competitor_reputation_strength` | 1 | 1 |
| chantiers structurels | 9 rangées | — |

14 cartes datées, 10 portent une ligne d'action. 9 cartes sur 14 sont des faits ventes hédgés par
« Comparé surtout à des jeudis en vacances scolaires (8 sur 8) — l'écart peut tenir au calendrier ».

## 2. Défauts, par axe

### A — % vs €

**A1. Deux référentiels sur la même carte, l'un au coin, l'autre dans le geste.**
`low_competition_window` (Occitanie) : coin « +19 % · vos visiteurs · ces jours-là », geste
« ils vous rapportent 225 € de plus par jour ». Muse Square : coin « −8 % · vos ventes », geste
« ces jours vous coûtent 65 € par jour ». Le % vient de `funnel_corner` (contraste KPI de la
classe, `funnelCornerForCandidate`), le € de `context_motif.avg_gap_eur` (résidu CA). Deux mesures,
deux KPI, une carte — le lexique (§ gabarit) l'interdit : « jamais deux référentiels mélangés ».
Cause : `pulse.astro` ~1686-1806 choisit le barreau du coin par DISPONIBILITÉ (enjeu → € du jour →
? €/an → %), jamais par la nature de la carte, et le geste lit une autre source.

**A2. Le €/an des cartes de faits est celui de la POPULATION, pas de l'objet.**
« Le créneau 11 h–12 h en hausse … +5 880 €/an à gagner » : `CARD_POPULATION_BY_DIRECTION`
(dayClassRegistry 1324) donne à chaque carte heure-hausse l'enjeu de la classe
`pop_hour_carry` (« créneaux qui ont surperformé »). Sur f10c3e58 : n = 8, médiane 136 €/j, span
153 j → 136 × 8 / (153/365,25) = 2 597 €/an (`rowToImpact`, ligne 726). Le même nombre sort sous
CHAQUE créneau en hausse du site. Le lecteur lit « ce créneau vaut X €/an » : c'est faux.
Le barreau « € du jour » (`corner_day_mode`, amendement 6 du 01/08) conçu pour ces cartes ne
s'allume plus dès que la population passe les portes : `enjeuWithReasonForCandidate` retourne
l'enjeu AVANT d'atteindre `corner_day_mode` (ligne 1224 vs 1263). La mini « passera en €/an dès
récurrence » ment donc par omission : c'est la récurrence de la population, pas de l'objet.

**A3. `sales_surge` se contredit dans la même carte.**
Corps (action-cards.js 2380) : « La hausse vient du panier moyen (-8 %), pas du volume » — règle
par MAGNITUDE sans porte de signe : panier −8 % ne peut pas porter une hausse. Ligne d'action
(3153, corrigée le 02/09) : « la hausse vient du volume (ventes +3 %, panier −8 % sur leur moyenne
des 28 derniers jours) ». Le corps n'a pas reçu la porte de signe ni le référentiel (28 j ≠ jeudi
habituel). Une carte, deux verdicts opposés.

**A4. Copie hors lexique dans les chiffres.** « attendu 4,66 € », « 13 attendues »
(`hourFunnelFacts`, 207-208) — « l'attendu » est banni (lexique ligne 26). « vs habitude », « ~49 % »
(traffic), « Chevauchement d'audience 50%, menace moderate » (mot banni « menace », anglais,
espace insécable absente).

### B — Diversité et pertinence

**B1. Les cartes de faits tirent sur un artefact de calendrier et le disent.**
Mesuré (`vw_insight_event_action_candidates`, date ≥ 28/08, parc) :

| type | lignes | `regime_mismatch_flag = true` | dont `baseline_same_regime_n = 0` |
|---|---|---|---|
| hour_share_move | 12 | 10 | **10** |
| item_share_move | 11 | 11 | 1 |
| offering_mix_shift | 8 | 8 | 0 |

29 cartes sur 31 sont hédgées ; pour les créneaux, la base ne contient AUCUN jour comparable
(8 sur 8 en vacances). Règle dbt (`fct_client_hourly_signals_daily` 138) :
`safe_divide(baseline_same_regime_n, typ_n) < 0.5` → un DRAPEAU, pas une PORTE. La fenêtre
typique de 8 semaines est tout entière en été ; la première semaine de septembre n'a pas de témoin.
La carte tire, retire son geste (`return ''` si flag, action-cards.js 3654/3666/3677) et garde son
€/an au coin. Résultat : 9 cartes muettes sur 14, chacune avec un montant.

**B2. Quatre cartes tirent sur tout le parc — elles ne discriminent rien.**
Mesuré le 04/09 sur `vw_insight_event_action_candidates` (32 sites) :
`foreign_tourism_signal` 32/32 · `commercial_event_match` (rentrée) 31/31 · `review_solicitation`
30/30 (démise) · `low_competition_window` 30/30. CLAUDE.md : « une carte qui tire sur 32 sites sur 32
ne discrimine rien ».

**B3. `low_competition_window` est aujourd'hui un artefact de saison.** Les 30 tirs du 04/09 :
ratio min 0,09 · médiane 0,58 · max 0,96 ; 27/30 sous 0,85. Tout le parc est « sous sa
moyenne » parce que `baseline_comp_avg` est gonflée par la saison des festivals d'été. Le verdict
du 28/07 (« règle SAINE, alignée sur le tercile bas ») valait sur 90 jours d'été d'un site ; il ne
dit rien de la fenêtre de septembre. Sur f10c3e58 la classe `competition_low` est incohérente de
signe (marginal n=23 −128 €/j, pure n=14 +81 €/j) — c'est pour ça que le coin retombe en %.

**B4. `commercial_event_match` (rentrée) porte le motif chaleur.** « Motif du jour : jours à
25–27 °C » sous « Préparez une offre pour la rentrée scolaire » : `motifContextForCandidate`
(dayClassRegistry 1372) prend la classe au |€/an| le plus grand entre `weather@date` et
`calendar@date`. Une carte calendrier hérite d'un motif météo — non-sens à la lecture. Et le geste
« Briefez l'équipe dessus en début de service » est du 101 (test 11). Le site DISPOSE d'une mesure
propre : `school_holiday` −230 €/j médiane, n=36, r=−0,43 — la rentrée est la FIN d'un motif qui
coûte ; la carte ne le dit pas.

**B5. `day_opportunity`** : « Régime A, score 7/10. Conditions optimales. Action conseillée :
journée favorable (régime A). Conditions globalement positives — à confirmer avec votre
planning. » Échoue aux tests 9, 10, 11 ; « régime » et « score » sont des mots système
(lexique ligne 5 et 23).

**B6. `foreign_tourism_signal`** : câblée depuis le 01/08 (classe B du réexamen 31/07), mais
le fait reste RÉGIONAL (« Allemagne 10 % des nuitées étrangères de votre région, INSEE 2025 »)
et vaut pour les 32 sites. Rien du compte ne dit qu'il reçoit des visiteurs allemands.

### C — Structure et composants

**C1. « Voir plus » s'intercale entre le fait et le geste.** Ordre DOM (pulse.astro ~1856-1878) :
`.ab-what` → `.ab-sowhat` (clampé 3 lignes) → `Voir plus` (inséré `afterend`, 2649) →
`.aline` (Action conseillée). Le geste tombe SOUS le lien, à la place d'un pied. Pire : le clamp
plie la phrase de réserve (« Comparé surtout à … ») et laisse le €/an visible — l'aveu est caché,
le chiffre gras ne l'est pas.

**C2. Les 3 actions suggérées ne sont plus sur la carte.** `__suggested_actions` n'est consommé
que par le formulaire M'engager (pulse.astro 2081). Et `reco-library.js` n'écrit que 12 types
(famille ventes, `low_competition_window`, `weekend_vacation_low_comp`, `client_dormant`,
hebdo/mensuel) : les 9 cartes de faits, tourisme, rentrée, régime A, note concurrent ouvrent un
formulaire à liste vide.

**C3. Pieds hétérogènes.** « Pas pour moi » seulement sur `card_type === 'action'` ; la carte
Pompidou (`notification`) n'a ni geste ni « Pas pour moi », juste « Suivi : note Google ».

**C4. Le même motif deux fois, deux unités.** Occitanie : carte du jour « +19 % · vos visiteurs »
ET chantier « Identifiez pourquoi les jours à faible activité … +225 €/j · +21 969 €/an ». La
dédup « règle 5 » (`data-t-class`) ne joue que si l'enjeu est DIRECT ; `low_competition_window`
n'en a pas → pas de dédup.

**C5. Le compteur ment.** « 23 actions » puis « 23 cartes ce jour » : 9 sans geste, 9 structurelles.

### D — Rien sur la concurrence

**D1. Les cartes concurrent existent, elles sont datées DEMAIN.** Mesuré pour f10c3e58 :
`competitor_audience_conflict` (priorité 4), `competitor_threat_direct`, `competitor_event_launch`
datées 05/09 ; `competitor_event_launch` 06, 07, 10/09. `renderActionCandidates` (action-cards.js
2930) ne rend que `acDate === target` = aujourd'hui : un lancement concurrent n'apparaît que le jour
où il a lieu. Le chip « Cette semaine » vient de `action_priority`, pas de la date. La page Actions
n'a donc AUCUNE fenêtre prospective sur la concurrence.

**D2. Huit types concurrent sont au Fil** (`DEMOTED_TO_FEED`, décision 28/07 « vigilance, pas
action ») ; ce 04/09, `competitor_positioning_brief` ×3, `competitor_positioning_gap`,
`competitor_offering_removed` ont tiré pour f10c3e58 et sont tombés. Décision cohérente, résultat
: zéro mouvement concurrent sur la page.

**D3. `competitor_reputation_strength`** : entrée `ACTION_SENTENCES` présente (action-cards.js
~3128) mais aucune ligne rendue sur la carte Pompidou — cause non vérifiée dans cet audit.

**D4. `competition_proximity` / `same_bucket_saturation`** : 5/5 sites, pas f10c3e58. Le
périmètre déclaré (`client_catchment`) n'a pas été re-vérifié ici.

### E — Autres

**E1.** `AWARENESS_ONLY` (action-cards.js 2789) est défini et jamais lu. `ft_peak_mobility`
(priorité 4, 04/09, f10c3e58) n'apparaît pas au rendu — filtre non identifié (probablement
`classNeverMeasured`, non vérifié).
**E2.** Cartes multi-sites « Muse Square · Muse Square Occitanie · MS Test » sur rentrée et
tourisme : regroupement inter-sites (`data-t-dup`, pulse.astro ~3760) non lu dans cet audit.

## 3. Ce qu'on peut faire — par ordre de rendement

| # | geste | où | effet mesurable |
|---|---|---|---|
| P1 | **Porte de régime** : ne pas émettre une carte de fait quand `baseline_same_regime_n < 3` ; en attendant dbt, `renderActionCandidates` écarte `baseline_same_regime_n === 0` et le coin n'affiche JAMAIS un €/an sur une carte `regime_mismatch_flag` | dbt (3 modèles signaux) + action-cards.js | 9 cartes muettes sur 14 disparaissent le 04/09 ; les faits reviendront avec des témoins |
| P2 | **Porte de signe dans le corps de `sales_surge`** : le corps réutilise le `pick` de la ligne d'action (une fonction, deux appelants) | action-cards.js 2380 | plus de carte qui se contredit |
| P3 | **Fenêtre prospective** : rendre sur aujourd'hui les cartes datées J+1…J+7 d'une liste blanche (`competitor_event_launch`, `competitor_audience_conflict`, `competitor_threat_direct`, `weekend_opportunity`…), la date dans la méta, dédup par `suppression_key` | action-cards.js 2930 | la concurrence revient sur la page |
| P4 | **Une unité par carte** : si `context_motif.avg_gap_eur` existe → € au coin (€/j ou €/an), % en infobulle ; % seulement sans aucun € ; cartes de faits → € du jour de l'OBJET au coin, population €/an en infobulle | pulse.astro 1686-1806, dayClassRegistry 1224/1263 | A1, A2, C4 |
| P5 | **Base saisonnière de `low_competition_window`** : `baseline_comp_avg` sur les mêmes semaines N−1 ou médiane glissante hors juillet-août ; ou porte sur la cohérence de signe de `competition_low` | dbt | 30/30 → tirs réellement rares |
| P6 | **Geste avant lien** : `.aline` rendue AVANT le clamp/« Voir plus » ; la phrase de réserve hors clamp | pulse.astro 1856-1878, 2649 | C1 |
| P7 | **Motif hérité par nature** : cartes calendrier n'héritent que de `calendar@date` ; rentrée écrite depuis la classe `school_holiday` mesurée du site | dayClassRegistry 1372 | B4 |
| P8 | Recos owner pour heure / famille / produit (3 par type, voix `reco-library.js`) ; sinon CTA « Noter » à la place de « M'engager » | reco-library.js, pulse.astro | C2 |
| P9 | Copie : `attendu` → « votre résultat habituel », « vs habitude », « ~ », « menace moderate », « régime A / score 7/10 » | action-cards.js | A4, B5 |

Décisions owner (pas de code sans elles) : démettre `day_opportunity` ; porte de
`foreign_tourism_signal` (part ≥ N % + zone touristique, ou Fil) ; bandeau « Veille » compact sur
Actions pour les 8 types démis, ou rien ; unité du coin des cartes de faits (P4).
