# Mapping KPI / Enjeu — les sous-types de cartes d'action

> **Statut : VALIDÉ par l'owner le 24/07/2026, avec amendements** : (a) C2 scindé — trio réputation
> (`review_surge/drop`, `reputation_strength`, `review_solicitation`) garde le KPI K7 ; les signaux
> prix/horaires/contenu/offre concurrents sont DÉMEUS au Fil d'actualité (groupe I élargi) ;
> (b) ordre amendé : STORE OFFLINE d'abord (avec classes concurrence+tourisme dans le batch) → classes
> restantes + chevauchement + pill verte → boucle multi-KPI → pills K6/K3 + affichage K7 ;
> (c) kpi_key = f(type de carte, origin_driver si présent) — jamais de la stratégie choisie (le levier
> reste métadonnée d'apprentissage). Incrément 1 (store) LIVRÉ le 24/07 soir. ÉTAPE 2 LIVRÉE 24/07 nuit (classes complètes sauf boucle multi-KPI ; contrastes propres actifs — voir enjeu-day-class-registry.md ; démotions et affichage K7 : à implémenter avec la boucle).
> Principe fondateur (owner, 24/07) : **pas de carte d'action sans grandeur mesurable** — la même unité sert
> l'enjeu affiché AVANT (pill) et le suivi d'impact APRÈS (boucle M'engager → mesure). Une carte qui ne peut
> pas fermer sa boucle n'est pas une carte d'action.
>
> Distinction structurante :
> - **Enjeu (pill)** = poids annualisé d'un MOTIF récurrent → exige une classe de jours + les gates
>   (docs/enjeu-day-class-registry.md). Ambre = à défendre, vert = à capter.
> - **KPI de suivi (boucle)** = l'unité dans laquelle on mesure l'effet de l'action de l'utilisateur →
>   n'exige qu'une grandeur observable avant/après. TOUTE carte doit en avoir un ; toutes n'ont pas d'enjeu.
>
> Inventaire réel : 82 sous-types au registre client (`public/action-cards.js`), 25 vivants dans
> `mart.fct_location_daily_action_candidates` sur 60 j (24/07). Colonne « Live » = présent sur 60 j.

## 1. Dictionnaire des KPIs (chaque source VÉRIFIÉE via INFORMATION_SCHEMA le 24/07)

| # | KPI | Unité pill / suivi | Colonnes sources (mart) | Vérifié |
|---|---|---|---|---|
| K1 | CA résiduel | €/an (pill) · €/jour vs normale (suivi) | `fct_client_day_residual.daily_revenue/expected_revenue` | ✅ |
| K2 | Fréquentation | visiteurs/jour | `fct_client_daily_performance.daily_visitors` ; externe : `fct_location_context_features_daily.ft_*` | ✅ |
| K3 | Conversion | pts de conversion (% visiteurs→acheteurs) | `fct_client_daily_performance.daily_conversion_rate` | ✅ |
| K4 | Panier moyen | € | `fct_client_daily_performance.daily_avg_basket` | ✅ |
| K5 | Volume | tickets/jour | `fct_client_daily_performance.daily_transactions` | ✅ |
| K6 | Coût des remises | € remisés/an · % CA remisé | `fct_client_daily_performance.daily_discount_total` ; `fct_client_sales_signals_daily.discount_rate(_baseline)`, `is_discount_without_lift` | ✅ |
| K7 | Réputation Google | note /5 · nb d'avis | `vw_insight_event_competitor_lookup.google_rating(_count)`, `raw.watched_competitors` | ✅ |
| K8 | Pression concurrentielle | indice (contexte, jamais en pill seule) | `fct_location_context_features_daily.competition_index_local` | ✅ |
| — | **N'EXISTENT PAS** : marge (sauf déclarée `declaredMetrics`), CA/client, temps-équipe. Aucune carte ne doit les promettre. | | | ✅ (absence vérifiée) |

Règles transverses (héritées du registre Enjeu, non négociables) :
annualisation = fréquence réelle × écart moyen mesuré, jamais « jour × N » ; gates n≥5/span≥60j (estimé),
n≥10 + |t|≥2 + span≥300j (mesuré) ; pas de mesure sur CE site → pas de pill ; **cartes combinées : la pill
porte la classe du facteur DOMINANT, jamais la somme** (policy de chevauchement, prérequis palier 2) ;
un même jour n'est facturé qu'une fois.

## 2. Mapping par famille

Colonnes : **Enjeu (pill)** = classe de jours + couleur, ou NON + raison · **Suivi (boucle)** = KPI mesuré
après M'engager · **Décision proposée** = à valider/amender par l'owner.

### A. Météo — classes `lvl_* ≥ 2` (registre DÉJÀ implémenté)

| Sous-type (Live*) | Enjeu (pill) | Suivi | Décision proposée |
|---|---|---|---|
| `weather_hazard_onset`* · `weather_worsened`* · `extended_bad_weather` · `extended_bad_weather_3d`* | ✅ ambre — classe condition du jour (SHIPPED) | K1 sur les jours de la condition | Rien à faire |
| `weather_improved`* · `weather_window` · `weather_window_after_bad` | ✅ VERTE — même classe, écart positif (« à capter ») | K1 | Palier 2 (pill verte) |
| `saturated_bad_weather` · `weather_mobility_double` · `ft_peak_bad_weather`* · `weather_comp_opportunity` | ✅ classe météo = facteur dominant (combiné — jamais la somme) | K1 | Palier 2 (chevauchement) |

### B. Concurrence terrain (densité / pression ambiante)

| Sous-type (Live*) | Enjeu (pill) | Suivi | Décision proposée |
|---|---|---|---|
| `competition_proximity` · `competition_pressure_spike`* · `high_competition_density` · `same_bucket_saturation` | ✅ ambre — classe « jours à pression haute » (tercile `competition_index_local`) ; NB : mesure NULLE sur le site parisien test → pill absente = honnête | K1 sur jours haute pression | Palier 2 |
| `low_competition_window`* · `weekend_vacation_low_comp` | ✅ VERTE — jours basse pression (écart positif attendu) | K1 | Palier 2 |
| `mobility_comp_squeeze` · `holiday_high_comp` · `tourism_comp_squeeze`* | ✅ classe dominante du combiné | K1 | Palier 2 (chevauchement) |

### C. Concurrents suivis (signaux crawl/GBP)

| Sous-type (Live*) | Enjeu (pill) | Suivi | Décision proposée |
|---|---|---|---|
| `competitor_event_launch` · `competitor_event_ending`* · `competitor_audience_conflict` · `competitor_sold_out` · `competitor_content_spike` · `competitor_content_silent` · `competitor_threat_direct` | ✅ classe « jours d'activité des concurrents suivis » (UNE classe famille, pas une par signal — mesurée POSITIVE +21,6 pp sur le site test → VERTE probable) | K1 sur jours d'activité suivie | Palier 2 |
| `competitor_review_surge` · `competitor_review_drop` · `competitor_hours_change` · `competitor_new_offering` · `competitor_offering_removed` · `competitor_price_drop` · `competitor_price_increase` · `competitor_repricing_event` · `competitor_reputation_strength`* | ❌ enjeu € non annualisable (événements ponctuels concurrents, pas une classe de VOS jours) | K7 (votre note/avis vs la leur) — mesurable avant/après | Pas de pill € ; afficher le KPI K7 en clair |
| `review_solicitation`* | ❌ (action proactive, pas un motif) | K7 : nb d'avis + note | Pas de pill ; suivi K7 |

### D. Tourisme

| Sous-type (Live*) | Enjeu (pill) | Suivi | Décision proposée |
|---|---|---|---|
| `foreign_tourism_signal`* · `tourist_high_season` · `tourist_surge_vacation` · `tourism_peak_window`* | ✅ VERTE — classe « jours à fort flux touristique » (`tourism_index_region` tercile haut) | K1 (+K2 si visiteurs mesurés) | Palier 2 |
| `low_tourism_local_opp` | ✅ classe inverse (jours basse saison) — signe à mesurer | K1 | Palier 2 |
| `tourism_weather_vacation` · `tourism_mobility_hit` | ✅ classe dominante du combiné | K1 | Palier 2 (chevauchement) |

### E. Mobilité

| Sous-type (Live*) | Enjeu (pill) | Suivi | Décision proposée |
|---|---|---|---|
| `mobility_disruption` · `mobility_disruption_planned` · `ft_peak_mobility` | ✅ ambre — classe « jours à perturbation » (`mobility_disruption_flag_event_window`) | K1 | Palier 2 |
| `mobility_disruption_resolved` | ❌ (fin d'état, informatif) | K1 du jour | Pas de pill |

### F. Calendrier / audience

| Sous-type (Live*) | Enjeu (pill) | Suivi | Décision proposée |
|---|---|---|---|
| `calendar_audience_shift` · `audience_shift_opportunity`* · `_audience_mismatch` (client-only) | ✅ classes calendrier (vacances/fériés) — OBLIGATOIREMENT avec le contrôle mois+type-de-jour (le naïf mesure la saison : prouvé, −23 % → −8 % ± 7 une fois contrôlé) | K1 sur la classe calendrier | Palier 2, recette calendarFamily |
| `commercial_event_match` · `mega_event_activation` · `mega_event_end`* | ✅ si l'événement est récurrent mesurable, sinon ❌ (occurrence unique = pas de fréquence) | K1 du/des jours | Cas par cas ; défaut : pas de pill |

### G. Score / régime / briefing — composites

| Sous-type (Live*) | Enjeu (pill) | Suivi | Décision proposée |
|---|---|---|---|
| `score_up` · `score_down` · `score_driver_shift` · `regime_change` · `regime_c_warning` · `day_opportunity` · `best_day_of_week` · `top_day_approaching` · `weekend_opportunity`* · `medal_change` · `perfect_storm`* · `ft_peak_low_comp` · `ft_peak_saturated` · `ft_peak_tourism_vacation` · `ft_quiet_good_weather` | ❌ JAMAIS — le score est un composite des familles : une pill = double compte garanti | K1 du jour visé (résiduel réalisé vs normale) | Pas de pill, par principe. KPI de suivi affiché |
| `weekly_briefing` | ❌ aucune grandeur | — | **Démouvoir** (pas une carte d'action) |

### H. Ventes (cartes performance, rendues côté client)

| Sous-type (Live*) | Enjeu (pill) | Suivi | Décision proposée |
|---|---|---|---|
| `sales_revenue_down_wow`* · `sales_underperformance` · `sales_surge`* · `sales_missed_opportunity` · `footfall_vs_basket_decomposition` (retirée) | ❌ CIRCULAIRE — la classe « jours en écart » est définie par l'écart lui-même ; annualiser = tautologie | K1 : résiduel des prochains jours comparables (jeudis, etc.) | Pas de pill ; le € du jour est déjà dans le texte |
| `sales_discount_no_lift`* | ✅ ambre — **formule COÛT, pas résiduel** : € remisés/an sur jours `is_discount_without_lift` (colonnes vérifiées ✅) | K6 : % CA remisé × lift | Palier « remises » (ex-palier 4) |
| `sales_traffic_not_converting`* | ✅ ambre — classe « jours à fort trafic » (tercile K2, exogène) × manque à convertir vs norme × panier → €/an | K3 : pts de conversion sur jours à fort trafic | Palier 2+ (classe nouvelle) |
| `sales_competition_cannibalization`* | ✅ = classe famille concurrence (B/C selon le signal source) | K1 | Palier 2 |
| `offering_mix_shift` · `proven_action_replication` | ❌ (mix = descriptif ; réplication = déjà quantifiée par l'action source) | K1 ou KPI de l'action source | Pas de pill |

### I. Informationnelles — le principe owner les DÉMEUT

| Sous-type (Live*) | Verdict |
|---|---|
| `competitor_positioning_brief`* · `competitor_positioning_gap`* · `institution_campaign_detected` · `media_mention_detected` | Aucune grandeur mesurable attachée à « consulter une analyse » → **pas des cartes d'action**. Proposition : migrer vers Fil d'actualité / Consulter (elles gardent leur valeur informative, elles perdent le rang de carte pilotable). |

## 3. Récapitulatif des décisions à trancher (owner)

1. **Valider les ❌ définitifs** : composites (G), anomalies ventes (H1), signaux concurrents ponctuels (C2 — pill € remplacée par KPI réputation affiché).
2. **Valider les démotions** (I + `weekly_briefing`) hors « À piloter ».
3. **Valider l'ordre d'implémentation** : palier 2 = classes B/C1/D/E/F + pill verte + policy de chevauchement → puis remises (H2) et trafic-conversion (H3) → puis store offline (ex-palier 1) → boucle multi-KPI (K3/K6/K7 mesurés à la résolution d'engagement, aujourd'hui la boucle ne mesure que K1).
4. **Boucle multi-KPI** : sans elle, une pill en conversion serait suivie… en CA. Chaque KPI du dictionnaire doit avoir sa baseline + son delta dans la chaîne d'engagement avant qu'une carte ne l'affiche comme enjeu.

*Couverture attendue après palier 2 sur un feed type : ~6-7 cartes sur 10 avec pill (ambre ou verte), le
reste portant son KPI de suivi en clair — et zéro carte sans grandeur mesurable.*
