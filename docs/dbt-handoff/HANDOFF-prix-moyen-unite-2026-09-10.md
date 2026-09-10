# Prix moyen d'une famille au poids : « par article » seulement quand c'est prouvé — DÉFINITIF

**APPLIQUÉ le 10/09/2026.** PR `Ajuria/ms_database` #132 fusionnée dans `main` (commit de fusion 547677a),
puis construction ciblée `dbt build --select fct_client_family_price_daily vw_insight_event_family_price_daily
fct_location_daily_action_candidates` (job refresh_industry, environnement de production, run 70471896850393,
succès en 1 min 9 s : 3 modèles construits, 19 tests passés). Ce document n'est plus une consigne à coller : il
dit ce qui EST. Les blocs collés vivent dans l'historique de `main` (commit fef4741).

Sert : `intent.md` § Le test de valeur (« un chiffre porte son référentiel ») et `strategie-entreprise.md`
§ 12.12 (Épices et Tout : FRUITS ET LEGUMES pèse 32,7 % du CA net HT et se vend au poids).

## La règle

`fct_client_family_price_daily.has_fractional_units` (BOOL) = une quantité non entière vue sur la famille, ce
jour ou dans les 28 jours précédents. Sur une telle famille, `units` est une somme de poids et
`realized_price` un prix au poids : la carte `family_price_move` ne dit alors ni « par article » ni
« articles vendus ».

- `fct_location_daily_action_candidates`, CTE `family_price_move` : au poids, `headline_fr` = « Prix moyen en
  baisse sur <famille> le 30/08 : −6 % par rapport à votre prix habituel » et `detail_fr` = « Sur 954 € de
  ventes. » (+ la phrase remise quand elle a bougé) ; le payload porte `has_fractional_units`. Sinon, le texte
  d'avant, octet pour octet.
- `vw_insight_event_family_price_daily` (`select *` sous `contract: enforced`) : la colonne est déclarée à son
  contrat (`schema_app_surfaces.yml`), en 14ᵉ position.
- `schema_grain.yml` : description et `not_null` sur la colonne du mart.
- Côté app (dépôt app, commit 5e1a2e7d) : `public/js/action-cards.js` rend « <famille> : prix moyen −6 % le
  30/08 par rapport à votre prix habituel, sur 954 € de ventes. » sur un payload au poids ; drapeau absent ou
  `false` = texte d'avant. Copie PROVISOIRE, `docs/lexique.md` § À arbitrer.

## Pourquoi

`headline_fr` part dans les faits citables de l'IA (`dayContext` → `groundedPayload`). Sur le ticket Crisalid
du 09/09 (poids `kg` à trois décimales, `€/kg`), « 3,87 € par article » aurait été un prix au kilo présenté comme
un prix à l'unité, et « N articles vendus » une somme de kilos.

## Mesuré en base après construction (10/09)

| Contrôle | Résultat |
|---|---|
| `has_fractional_units` | BOOL dans `mart.fct_client_family_price_daily` et `semantic.vw_insight_event_family_price_daily` |
| Vue famille-prix | 5 048 lignes, 4 sites ; 0 `true`, 0 `null` — aucune caisse au poids importée |
| Candidats `family_price_move` | 21 ; `has_fractional_units` = `false` dans les 21 |
| Témoin `f10c3e58` au 09/09 | inchangé : « Prix moyen en hausse sur Bakery le 09/09 : 4,21 € par article contre 3,51 € d'habitude » |
| Chemin réel de Pulse (`monitor` + vue semantic), payloads d'après le build | 8 rendus identiques sur 8 |
| Test en avertissement | `accepted_values` sur `action_type` des candidats — la liste du yml, désynchronisée depuis le 06/06 ; ce changement n'ajoute aucun type |

Avant fusion, sur le SQL généré depuis `main` 2dc198a : mart ancien contre nouveau, 0 ligne différente sur les 17
colonnes existantes ; CTE contre production, 20/20 identiques ; modèle des candidats complet validé à blanc.

## Ce que cela ne corrige pas

- **L'unité n'est pas nommée.** Le kilo n'est pas dans la caisse importée (`CanonicalField` n'a aucun champ
  unité). Quand l'export de détail Crisalid arrivera : champ `quantity_unit` (en-tête réel, override crisalid
  seulement), colonne raw additive, staging, puis un `unit_label` au mart prix ; la carte dira alors « le kilo »,
  mot à arbitrer. Sans colonne unité dans l'export : déclaration par famille à l'onboarding, proposée par
  `has_fractional_units`, confirmée par l'exploitant.
- **« articles vendus » dans la branche non-poids de `detail_fr`** : corrigé en « ventes » par la PR
  `Ajuria/ms_database` #133, **ouverte, en attente de fusion** (20/20 égaux au seul mot près contre la
  production). Après fusion : `dbt build --select fct_location_daily_action_candidates`.
- **Quatre modèles comptent les ventes sur l'entier arrondi par l'import** (`Math.round`,
  `src/pages/api/import/sales-csv.ts:26`) : `int_client_offering_profile` (`units_30d`),
  `fct_client_hourly_sales` (`units`), `fct_client_item_signals_daily` (`units`, `unit_price`),
  `fct_client_offering_daily` (`units` → décomposition par famille, objectif en ventes, « N ventes » des
  synthèses). Six pesées du ticket du 09/09 y font « 4 ventes » quand Crisalid imprime « TOTAL ( 6) ».
  **Décision owner 10/09 : une pesée compte pour une vente** (lexique). Correctif à construire AVANT le premier
  import Crisalid (`fct_client_offering_daily` est incrémental) : une colonne de staging qui vaut 1 par pesée et
  `quantity` sinon, lue par les quatre modèles à la place de `quantity`.
