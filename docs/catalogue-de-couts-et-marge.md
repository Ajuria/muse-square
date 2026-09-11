# Catalogue des prix d'achat et marge brute — ce qui est en base, du prix d'achat au résultat net — DÉFINITIF

Sert : `strategie-entreprise.md` § 12.12 (le critère d'achat du premier client réel est le profit ; KPI 1, 3, 4,
6, 8, 11, 13) ; `intent.md` § Les objets (prix d'achat, marge brute) et § Le test de valeur (une absence se dit et
se chiffre) ; `audits/profit-grains-sensibilite-audit-2026-09-11.md` § 5 D1, D6, D8.

_Réécrit en définitif le 11/09/2026 après la fusion de la PR [ms_database#147](https://github.com/Ajuria/ms_database/pull/147)
(`9faf044`) et le run dbt Cloud `70471897065342` ; chaque affirmation re-vérifiée en base à 15 h 49 UTC. Les modèles
font foi (`~/Documents/ms_database/ms_dbt/models/ms_open_data/…`) ; le chemin parcouru vit dans
`docs/dbt-handoff/HANDOFF-marge-2026-09-11.md` et `git log`. Décisions owner du 11/09 : mots (lexique + intent),
seuil de couverture 90 %, base HT/TTC déduite de la caisse sinon déclarée, résultat net et point mort au héros de
Piloter, fichier de prix d'achat aux standards français._

**La garde (§ 12.12) tient par construction** : sans prix d'achat en base, `cost_known` est faux sur chaque ligne,
la couverture vaut 0 et toute marge est NULL — aucun chiffre de marge ne peut se montrer. Une marge déclarée (K9)
reste une estimation et se libelle comme telle.

---

## 1. Ce qui est en base

| Objet | Couche | Grain | Contenu (vérifié 11/09) |
|---|---|---|---|
| `analytics.item_cost_catalog` | app-write (12 colonnes) | cost_id ; remplacement par (site, article, date d'effet) | prix d'achat HT par unité (`cost_unit` pièce ou kg), `effective_from`, fournisseur, source. **Vide.** |
| `analytics.declared_parameters` | app-write (10 colonnes) | parameter_id | `param_key` ∈ revenue_basis, fixed_costs_month_eur, payroll_month_eur ; `effective_from`. **Vide.** |
| `raw.client_transactions.revenue_ht`, `.vat_rate` | raw | — | FLOAT64, NULL (l'importeur ne les écrit pas encore) |
| `stg_item_cost_catalog`, `stg_declared_parameters` | staging | une ligne | types, références nettoyées, prix > 0, unité `piece` par défaut, clés en liste fermée |
| `stg_client_transactions` | staging | ligne | passe `revenue_ht`, `vat_rate` tels quels ; 202 895 lignes = raw, 202 444 facturées, inchangé |
| `stg_insight_event_user_location_profile` | staging | profil | passe `pos_system` |
| `int_client_item_cost_daily` | intermediate | site × article × jour de vente | le prix d'achat en vigueur (plus grand `effective_from` ≤ jour, départage `created_at`) — une ligne par clé, donc aucune ligne de vente multipliée |
| `int_location_declared_parameters_daily` | intermediate | site × jour de vente (975) | `revenue_basis` = HT si `pos_system = 'crisalid'` (règle d'ingestion), sinon la déclaration ; `revenue_basis_source` (caisse / declare) ; charges fixes et masse salariale du mois en vigueur |
| `fct_client_sales_lines_margin` | mart | ligne facturée (202 444) | `revenue_ht` et `revenue_net_ht` (HT de l'export, sinon `revenue` si base HT, sinon `revenue ÷ (1 + vat_rate)` si base TTC et taux connu, sinon NULL) ; `quantity_costed` = quantity_decimal, sinon quantity, sinon 1 ; `cost_ht` = prix × quantité ; `cost_known` ; `gross_margin_ht` ; `is_below_cost` |
| `fct_client_family_margin_daily` | mart | site × jour × famille (5 299) | CA, remises, CA net HT, `revenue_costed`, coût, marge, `margin_rate`, `coverage_pct` (part du CA brut au prix d'achat connu), lignes sous le prix d'achat ; 'non classe' pour les lignes sans famille |
| `fct_client_item_margin_daily` | mart | site × jour × article | idem au grain article + prix d'achat en vigueur, prix de vente moyen HT, `is_below_cost` |
| `fct_client_hourly_margin` | mart | site × jour × heure | marge par heure et `cum_gross_margin_ht` |
| `fct_client_daily_margin` | mart | site × jour (975) | marge du jour, `coverage_pct`, `margin_coverage_ok` (≥ 0,9), `margin_rate_30d`, `charges_day_eur` = (charges fixes + masse salariale) ÷ jours de vente du dernier mois complet, `break_even_revenue_ht`, `is_break_even_reached`, `break_even_hour` |
| `fct_client_monthly_result` | mart | site × mois (47, dont 43 complets) | `net_result_eur` = marge − charges − masse salariale (NULL sous le seuil ou sans paramètre), `payroll_to_revenue_pct`, `is_complete_month` |
| branches `family_margin` (famille × classe) et `margin` (site × classe) | mart (classes de jour) | — | jours où la couverture atteint le seuil ; 0 ligne au 11/09 (1 950 / 224 inchangés) |
| `vw_insight_event_{family_margin_daily, item_margin_daily, hourly_margin, daily_margin, monthly_result, declared_parameters}` | semantic, contrat enforced, tag `mart_dependent` | id. | les surfaces que l'app lira. **Aucun lecteur app au 11/09.** |

Var dbt `margin_coverage_min: 0.9`. Les nœuds portent `mart_dependent` ; la chaîne se reconstruit aussi par
`client_sales_full_refresh` (descendants de la staging) après un dépôt de ventes ou de prix d'achat.

## 2. Les règles

- **M1** Le prix d'achat est un catalogue à date d'effet ; un prix qui change ne réécrit jamais l'historique. Sans
  date d'effet dans le fichier, la date d'import fait foi. Un article sans code ne se rapproche pas.
- **M2** Coût = prix d'achat × quantité (`quantity_decimal`), jamais × `units_sold` : une pesée vaut une vente mais
  coûte son poids.
- **M3** La marge se calcule sur du HT ou ne se calcule pas ; la base vient de la caisse quand la règle d'ingestion
  la fixe (`crisalid` ⇒ HT), sinon de la déclaration ; base inconnue = ligne hors couverture. Quand l'export donne
  `revenue_ht`, la remise est convertie au prorata — hypothèse à vérifier sur l'export de détail Crisalid.
- **M4** Deux référentiels de CA, jamais dans la même phrase : `revenue` (brut, ce que la caisse imprime) reste le CA
  de toutes les surfaces existantes ; `revenue_net_ht` n'apparaît que sous le mot **CA net HT**.
- **M5** Charges fixes et masse salariale sont des montants mensuels à date d'effet ; le journal des corrections
  garde les marges % déclarées et le nombre de clients.
- **M6** Jours d'ouverture = jours avec ventes ; point mort sur le dernier mois complet ; résultat net sur mois
  complets seulement.
- **M7** Chaque marge voyage avec sa couverture ; à l'écran : « calculée sur X % de votre CA · prix d'achat manquants
  sur Y % » (lexique).
- **M8** La mesure remplace l'estimation déclarée à 90 % de couverture ; entre 50 et 90 %, les deux se montrent,
  nommées ; sous 50 %, l'estimation mène.
- **M9** L'app lit `semantic` ; K9 et le tableau de bord quitteront `raw` pour `vw_insight_event_daily_margin` et
  `vw_insight_event_family_margin_daily`.

## 3. Preuves

- Lot matérialisé dans `_audit_scratch.lotB_*` dans l'ordre du DAG avant la PR, puis vérifié en base après build :
  staging 202 895 = raw, 202 444 facturées = avant ; lignes de marge 202 444 = `fct_client_sales_lines` ; couverture 0
  partout ; classes de jour inchangées ; 975 jours de vente ; 47 mois.
- Mécanique de la jointure à date d'effet prouvée sur un catalogue synthétique (60 % du prix médian, un article sur
  cinq sans prix) : 0 fan-out (11 063 lignes avant et après sur f10c3e58), couverture 70 % en CA, taux 39,9 % ;
  3 lignes sous le prix d'achat détectées sur la démo, toutes remisées.

## 4. Ce qui existe côté app, et ce qui reste (état au 11/09)

- **En base** : aucun prix d'achat, aucun paramètre déclaré, aucun site à base HT/TTC connue (le seul site Crisalid
  n'a pas de ventes) : toutes les marges sont NULL, ce qui est le comportement voulu.
- **Entrées (dev)** : l'importeur de prix d'achat (`api/import/costs-csv`, `lib/import/costCsv.ts`), les paramètres
  déclarés à date d'effet (`api/insight/declared-parameters`, `lib/kpi/declaredParameters.ts` ; gestes inline de
  Piloter), l'importeur de ventes qui écrit `document_type`, `revenue_ht`, `vat_rate` quand l'export les porte
  (`lib/import/salesCsv.ts`, taux de TVA en fraction), la surface de vente déclarée en chat (« ma surface de vente
  est de 120 m² » → `analytics.declared_parameters`, `lib/ai/declaredMetrics.ts`).
- **Lecteurs (dev)** : Piloter (marge brute, résultat net, point mort dans la carte CA ; K9 mesuré d'abord) ; LE foyer
  `lib/kpi/margin.ts` (`readMeasuredMargin30d`, 30 jours, site + familles, mode décidé une fois) partagé par le chat
  (la mesure répond avant l'estimation déclarée dès le mode mixte, `measuredMarginAnswerFr`), par le provider
  Explorer `FAMILIES.marge` (faits avec la couverture comme fait à part, famille lourde en CA légère en marge,
  lignes vendues sous leur prix d'achat, `renderMarge`) et par la section « Marge brute · 30 derniers jours » du
  rapport de ventes. Sur le compte owner (aucun prix d'achat) : mode « aucune », absence dite partout.
- **Reste** : les cartes Agir (audit § 6 A7 : vendu sous son prix d'achat, remise qui efface la marge, marge du jour,
  point mort atteint, famille lourde en CA légère en marge) ; le premier export de détail Crisalid (en-têtes réels de
  l'override `crisalid`, décision RETOUR) ; le grain pôle de la marge lit déjà `vw_insight_event_space_30d` dès
  qu'un site avec pôles vend.
