# Handoff dbt — funnel horaire pour hour_share_move (lot 1 copie, 25/08)

## Pourquoi
Gabarit owner 25/08 : la carte « Le créneau 8 h–9 h surperforme » doit pouvoir dire À QUOI
tient l'écart — tickets ou panier (« dû au trafic, au taux de conversion, en progression »).
Aujourd'hui `mart.fct_client_hourly_signals_daily` porte `hour_transactions` mais AUCUN
attendu par facteur à l'heure : la décomposition n'est pas calculable, la phrase serait
inventée. La carte reste donc sans explication de facteur tant que le modèle ne porte pas :

- `expected_hour_transactions` : même construction que `expected_hour_revenue` —
  part typique des transactions de l'heure sur les 8 mêmes jours de semaine précédents
  (≥ 5 occurrences) × transactions attendues du jour. ATTENTION : il n'existe pas
  aujourd'hui d'« expected_transactions » du jour dans fct_client_day_residual — vérifier
  via bq-verify si le chantier « attendus par facteur » (day_residual étendu, handoff
  HANDOFF-funnel-attendus.md) a livré `expected_transactions` ; sinon ce handoff DÉPEND
  de lui.
- dérivés au rendu (app, pas dbt) : panier attendu = expected_hour_revenue /
  expected_hour_transactions ; l'écart se décompose alors tickets × panier, même
  référentiel — jamais les baselines 28 j.

## Garde-fous
- Même fenêtre et mêmes portes que le modèle actuel (8 semaines même dow, ≥ 5 occ.) —
  JAMAIS un second référentiel dans la même carte.
- Un facteur absent (visiteurs horaires POS-only) ne se remplace pas par l'estimation
  BestTime : conversion horaire = seulement si visitor_count horaire mesuré existe.

## Note régime (question owner 25/08, cyclicité)
La base = 8 mêmes jours de semaine précédents : à une frontière de régime (fin de
vacances, bascule touristes→locaux) la « surperformance » peut être du cycle. Horizon 1
(app) : retenir/mentionner quand le jour jugé et sa base ne partagent pas le même régime
(registre des classes de jours). Horizon 2 (dbt) : base stratifiée par régime — même dow
parmi les jours de même classe, porte n ≥ 5.

## Message de commit proposé (dbt Cloud IDE)
feat(hourly_signals): expected_hour_transactions — attendu tickets par heure (part typique
8 sem. même dow × transactions attendues du jour) pour la décomposition tickets × panier
de la carte hour_share_move ; même fenêtre, mêmes portes que expected_hour_revenue
