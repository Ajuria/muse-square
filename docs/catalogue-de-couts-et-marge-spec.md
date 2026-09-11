# Catalogue de coûts et marge brute — du prix d'achat à la marge par famille, par article, par heure, et au résultat net — SPEC DE TRAVAIL

Sert : `strategie-entreprise.md` § 12.12 (« le critère d'achat du premier client réel est le profit » ;
KPI 1, 3, 4, 6, 8, 11, 13 des dix-sept) ; `intent.md` § Le test de valeur (un chiffre porte son
référentiel et sa requête ; une absence se dit et se chiffre) ; `audits/profit-grains-sensibilite-audit-2026-09-11.md`
§ 5 D1, D6, D8. Décisions owner du 11/09 : n° 1 (les mots), n° 3 (format du fichier de prix d'achat),
n° 4 (charges et masse salariale mensuelles à date d'effet ; jours d'ouverture = jours avec ventes).

**Garde, non négociable (§ 12.12)** : tant que les prix d'achat ne sont pas en base, aucun chiffre de
marge ne se montre ; quand ils y sont, chaque chiffre de marge voyage avec sa **couverture** (part du
CA dont le coût est connu). Une marge déclarée (K9 aujourd'hui) reste une estimation et se libelle
comme telle ; elle ne se mélange jamais à une marge mesurée dans une même phrase.

Ce document dit ce qui est, puis ce qui reste à faire dans l'ordre d'exécution. Il ne contient aucun
bloc SQL : les modèles s'écrivent dans `ms_database` sur une branche depuis `origin/main` et partent en
PR (`CLAUDE.md` § Où committer) ; la passation `docs/dbt-handoff/` les documente.

---

## 0. Ce que le lot débloque (état cible)

| KPI § 12.12 | Ce qu'il devient | Surface |
|---|---|---|
| 3 taux de marge brute par famille et par article | mesuré : (CA HT − coût HT) ÷ CA HT, sur le CA dont le coût est connu | Piloter (carte CA), Explorer, rapport |
| 4 marge brute par famille, € et part | mesuré ; par pôle dès le mapping famille → pôle (lot espace/pôle) | id. |
| 8 ventes à perte ou près du coût | lignes et articles dont le prix de vente HT < coût HT (illégal sous le coût, DGCCRF) | carte Agir (lot app), Explorer |
| 13 marge brute par heure d'ouverture | mesuré au grain heure × famille | Explorer, rapport |
| 1 résultat net mensuel · 11 masse salariale ÷ CA net | marge brute du mois − charges fixes − masse salariale déclarées (mois complets seulement) | Piloter (mot « résultat net »), rapport |
| 6 point mort du jour et heure atteinte | (charges fixes + masse salariale) ÷ jours d'ouverture ÷ taux de marge ; heure où la marge cumulée du jour couvre la part du jour | carte Agir (lot app), Explorer |
| marge × classes de jour | une branche de plus dans `fct_client_family_day_class_response` et `fct_location_day_class_impacts` | Explorer, rapport, coins de cartes |
| K9 `profit_estimated` | devient une mesure quand la couverture existe ; repli déclaré étiqueté « estimation » | Piloter, KPI d'engagement |

---

## 1. Ce qui est [vérifié 11/09]

- **Aucune colonne de coût, de TVA, de HT ni de marge dans l'entrepôt** (`INFORMATION_SCHEMA` région EU,
  sept datasets : le seul champ en euros côté coût est `operation_cost_eur` d'un engagement).
- **Le grain ligne existe et porte tout ce que la marge joint** : `mart.fct_client_sales_lines`
  (`location_id, transaction_date, transaction_hour, invoice_number, item_code, item_description,
  item_category, units, quantity_decimal, unit_price, revenue, discount_amount, …`), factures seules
  (`is_invoiced`). `item_code` est renseigné sur **100 % des lignes** des six sites (0 ligne sans code,
  80 articles par site de graine, 1 279 sur le site Sage 100).
- **Le CA n'a pas de base fiscale connue** : `revenue` reçoit « ca ttc », « ca ht », « montant net »,
  « total » indifféremment (`sourceMappings.ts:23-26`) ; aucune colonne TVA. Le relevé Crisalid du 10/09
  montre des lignes à 5,5 % et à 20 % dans la même famille : le HT se calcule à la ligne. Pour Crisalid,
  la règle d'ingestion actée (§ 12.12) est que `revenue` = montant net HT.
- **Les quantités** : `quantity_decimal` porte le poids (kg, 3 décimales) ; `units_sold` compte une pesée
  pour une vente. **Un coût se multiplie par la quantité, jamais par le compte de ventes.**
- **La marge déclarée (K9)** : `profitEstimatedDaily` (`src/lib/kpi/kpiRegistry.ts:333-372`) et le bloc
  `marges` du tableau de bord (`dashboard.ts:1000-1046`) multiplient le CA par famille par une marge %
  déclarée dans `analytics.consulter_correction_events` (`declared_margin_pct__<slug>`), avec la
  couverture ; les deux lisent `raw.client_transactions` (dette, cliquet `CLIQUET_BRUT`). Côté dbt,
  `int_location_declared_metrics_current` (site × `metric_key`, `value_numeric`) expose ces déclarations
  et n'a aucun lecteur.
- **Les entrées déclarées n'ont pas de date d'effet** (journal des corrections : un scalaire par site
  et par type) — un loyer qui change en mars ne peut pas y vivre.
- **Aucun importeur de coûts** : `src/pages/api/import/` = `locations.ts`, `sales.ts`, `sales-csv.ts`.

---

## 2. Décisions de conception

| # | Décision | Pourquoi | Ce qu'on sacrifie |
|---|---|---|---|
| M1 | **Le prix d'achat est un CATALOGUE à date d'effet**, app-write `analytics.item_cost_catalog` : `cost_id, location_id, item_code, item_description, unit_cost_ht, cost_unit ('piece' \| 'kg'), effective_from, supplier, source ('csv_import' \| 'saisie'), source_file, declarant_user_id, created_at`. Append-only ; le coût en vigueur à une date = la ligne de plus grand `effective_from` ≤ date, départagée par `created_at`. Clé de remplacement à l'import : `(location_id, item_code, effective_from)` (delete puis load, comme les ventes). Sans date d'effet dans le fichier, la date d'import fait foi (décision 3) | « article × date d'effet × prix » (§ 12.12) ; un prix qui change ne réécrit jamais l'historique | pas de coût moyen pondéré entre fournisseurs ; un article sans code ne se rapproche pas |
| M2 | **Le coût d'une ligne = `unit_cost_ht × coalesce(quantity_decimal, quantity, 1)`**, jamais × `units_sold` | une pesée de 0,247 kg vaut une vente mais coûte 0,247 × le prix au kg | — |
| M3 | **La marge se calcule sur du HT, ou ne se calcule pas.** Trois colonnes additives sur `raw.client_transactions` : `revenue_ht` (quand l'export le donne), `vat_rate` (taux à la ligne, 0,055 / 0,20, quand l'export le donne) ; et un paramètre déclaré par site `revenue_basis` ∈ {`HT`, `TTC`} (M5). Staging : `revenue_ht = coalesce(revenue_ht, safe_divide(revenue, 1 + vat_rate), if(basis = 'HT', revenue, null))`. `NULL` ⇒ la ligne est hors couverture | mêler un CA TTC à un coût HT fabrique 5,5 à 20 points de marge ; la couverture dit l'absence au lieu de la maquiller | la marge des sites sans base déclarée reste vide tant que le paramètre n'est pas posé ; c'est voulu |
| M4 | **Deux référentiels de CA, jamais dans la même phrase** : `revenue` (ce que la caisse imprime, brut) reste le CA de toutes les surfaces existantes ; `revenue_ht` n'apparaît que dans les surfaces de marge, sous le mot **CA net HT** | ADD, don't REPLACE : aucune carte, aucun verdict existant ne change | deux chiffres de CA possibles sur une même page, chacun avec son mot |
| M5 | **Les paramètres déclarés à date d'effet** vivent dans `analytics.declared_parameters` : `parameter_id, location_id, param_key, value_num, value_text, unit, effective_from, declarant_user_id, source, created_at`. Clés du lot : `revenue_basis` (texte), `fixed_costs_month_eur`, `payroll_month_eur` (€ par mois). Le journal des corrections garde les marges % et le nombre de clients (inchangés) | un montant mensuel change ; le journal des corrections n'a ni unité, ni date d'effet, ni portée (audit § 3.1) | deux mécanismes de déclaration coexistent jusqu'à ce que les marges % migrent (hors lot) |
| M6 | **Jours d'ouverture = jours avec ventes** (décision 4). Le point mort du jour utilise les jours de vente du dernier mois complet ; le résultat net ne se calcule que sur un mois complet | l'app ne voit que ce qui s'est vendu ; un planning déclaré serait un outil de planning | un jour ouvert à zéro vente compte fermé |
| M7 | **Chaque mart de marge porte sa couverture** (`revenue_ht_costed`, `coverage_pct`) et ses lecteurs la disent (« coût connu sur X % de votre CA » — forme à arbitrer, calquée sur « calculé sur X % de votre CA », acté 24/08) | intent : une absence se dit et se chiffre | — |
| M8 | **Le KPI mesuré remplace l'estimation quand la couverture ≥ 80 % du CA des 30 derniers jours** ; en dessous, la surface montre la mesure avec sa couverture ET l'estimation déclarée, chacune nommée ; sans catalogue, rien ne change à ce qui existe | un chiffre mesuré sur 30 % du CA ne peut pas s'appeler « votre profit » | le seuil de 80 % est un calibrage à confirmer par l'owner |
| M9 | **Frontière** : l'app lit `semantic` ; K9 et le tableau de bord quittent `raw` pour `vw_insight_event_daily_margin` / `vw_insight_event_family_margin_daily` ; les vues manquantes se créent dans dbt AVANT toute lecture | règle owner 10/09 | — |

---

## 3. dbt — ce qui reste à faire, dans l'ordre du DAG

Chaque `ref()` pointe sur un nœud présent sur `origin/main` ou livré plus haut (vérification par programme
avant PR, comme le lot A).

1. **Sources** (`staging/sources.yml`, bloc `analytics`) : `item_cost_catalog`, `declared_parameters`.
   Côté app, les deux tables se créent par DDL avant la première écriture (colonnes de M1 et M5).
2. **Raw** : `ALTER TABLE raw.client_transactions ADD COLUMN IF NOT EXISTS revenue_ht FLOAT64, ADD COLUMN IF NOT EXISTS vat_rate FLOAT64` (côté app, additif).
3. **`stg_item_cost_catalog`** (vue) : types, `item_code` trimé, `unit_cost_ht > 0`, `cost_unit` défaut `piece`.
4. **`stg_declared_parameters`** (vue) : types ; `param_key` dans la liste fermée du lot (test `accepted_values`).
5. **`stg_client_transactions`** (3 blocs) : `revenue_ht`, `vat_rate` lus ; `revenue_ht` dérivé selon M3 avec la base déclarée en vigueur à la date (jointure à 4) ; 0 écart sur toutes les colonnes existantes (preuve : count raw = count stg, `is_invoiced` inchangé, comme le lot A).
6. **`int_location_declared_parameters_daily`** (site × date × clé → valeur en vigueur) : pour chaque jour de vente, la dernière déclaration à `effective_from` ≤ date.
7. **`int_client_item_cost_daily`** (site × article × date de vente → `unit_cost_ht`, `cost_unit`, `effective_from` appliqué) : jointure à date d'effet, une ligne par (site, article, jour) — testée unique.
8. **`fct_client_sales_lines_margin`** (grain ligne, mêmes colonnes que `fct_client_sales_lines` + `revenue_ht, vat_rate, unit_cost_ht, cost_unit, quantity_costed, cost_ht, gross_margin_ht, cost_known, is_below_cost`) — `is_below_cost = revenue_ht < cost_ht` seulement quand les deux sont connus et la quantité > 0.
9. **`fct_client_family_margin_daily`** (site × jour × famille : `revenue, revenue_ht, discount_amount, revenue_ht_costed, cost_ht, gross_margin_ht, margin_rate, coverage_pct, units, quantity, below_cost_lines, below_cost_revenue_ht`).
10. **`fct_client_item_margin_daily`** (site × jour × article : idem au grain article + `unit_cost_ht`, `avg_unit_price_ht`, `is_below_cost`).
11. **`fct_client_hourly_margin`** (site × jour × heure : `revenue_ht, cost_ht, gross_margin_ht, coverage_pct`, `cum_gross_margin_ht` cumulé dans la journée).
12. **`fct_client_daily_margin`** (site × jour : sommes + `coverage_pct` + `fixed_costs_month_eur`, `payroll_month_eur` en vigueur, `opening_days_ref` = jours de vente du dernier mois complet, `break_even_day_eur`, `break_even_hour` = première heure où `cum_gross_margin_ht ≥ (fixed + payroll) / opening_days_ref`, NULL sans les deux paramètres).
13. **`fct_client_monthly_result`** (site × mois complet : `revenue_ht, gross_margin_ht, coverage_pct, fixed_costs_month_eur, payroll_month_eur, net_result_eur, payroll_to_revenue_pct`, NULL tant qu'un des trois manque).
14. **Branches marge des classes de jour** : `fct_client_family_day_class_response` reçoit `family_margin` (marge brute HT de la famille, base marginal, jours où `coverage_pct ≥ 80 %`) ; `fct_location_day_class_impacts` reçoit `margin` (idem au site). Une branche `union all` chacun — ADD.
15. **Semantic, contrat enforced, tag `mart_dependent`** : `vw_insight_event_family_margin_daily`, `vw_insight_event_item_margin_daily`, `vw_insight_event_hourly_margin`, `vw_insight_event_daily_margin`, `vw_insight_event_monthly_result`, `vw_insight_event_declared_parameters` (valeurs en vigueur aujourd'hui, par site et par clé).
16. **Tests** : unicité des grains ; `coverage_pct` entre 0 et 1 ; Σ marge famille = marge jour (fermeture exacte) ; `is_below_cost` ⇒ `cost_known` ; test singulier « aucune ligne de marge sans `revenue_ht` ».
17. **Jobs** : `mart_dependent` sur tous ; les marts de marge se reconstruisent aussi par `client_sales_full_refresh` (descendants de la staging) après un dépôt de ventes ou de coûts.

---

## 4. App — ce qui reste à faire, dans l'ordre

1. **DDL** des deux tables `analytics` (M1, M5) + ALTER raw (M3) — un one-off daté dans `tools/oneoff/`.
2. **Importeur de coûts** `src/pages/api/import/costs-csv.ts` + `src/lib/import/costCsv.ts` (mapping d'en-têtes :
   code article / référence / ref, libellé / désignation, prix d'achat HT / PA HT / coût / prix d'achat,
   date d'effet / date, fournisseur ; unité kg si le libellé ou une colonne le dit, sinon pièce), même
   `resolveMapping` que les ventes, delete-supersede sur `(location_id, item_code, effective_from)`, load
   job. Réponse = lignes chargées, rejetées (motif), et **la couverture** : part du CA des 30 derniers
   jours dont l'article est au catalogue (requête sur `vw_insight_event_client_offering_daily` ×
   catalogue) — c'est le chiffre que l'exploitant lit en premier.
3. **Paramètres déclarés** : `DECLARED_METRICS` (`src/lib/ai/declaredMetrics.ts`) gagne `fixed_costs_month_eur`,
   `payroll_month_eur`, `revenue_basis`, écrits dans `analytics.declared_parameters` avec `effective_from`
   (formulaire inline du tableau de bord, patron `tableau.astro:1975-2037` ; et la déclaration en chat).
   Importeur de ventes : écrit `revenue_ht` et `vat_rate` quand l'export les porte (mapping Crisalid).
4. **KPI** : `kpiRegistry.ts` — `profit_estimated` lit `vw_insight_event_daily_margin` (`gross_margin_ht`,
   `coverage_pct`) et ne retombe sur la marge déclarée que sous 80 % de couverture, en le disant ; nouvelle
   clé `gross_margin` (mesure, `KPI_DAILY_COL` étendu d'une source par clé) ; `kpiVerdict` inchangé.
   `dashboard.ts` bloc `marges` : profit mesuré + couverture, estimation à côté tant que < 80 %.
5. **Piloter** : drapeaux `debloquer` — `cost_catalog_missing` (avec la couverture), `revenue_basis_missing`,
   `fixed_costs_missing`, `payroll_missing` ; carte CA : le profit passe de « ≈ » à mesuré, avec
   « coût connu sur X % de votre CA » ; résultat net et point mort = nouvelles tuiles **sur arbitrage
   owner** (héros v11 : rangée 1 = mesures qui existent).
6. **Explorer** : provider `marge` dans `FAMILIES` (patron `salesDecomp.ts`) : marge par famille et par
   article sur la période, ventes sous le coût, point mort du jour ; réutilisé par `family-report.ts` et
   par le rapport de ventes (section « Marge »). Réponses grounded, absence honnête chiffrée.
7. **Cartes Agir** (après 1-6, lot à part) : « vendu sous le coût », « remise qui efface la marge »
   (`family_discount_move` relu en marge), « marge du jour vs résultat habituel », « point mort atteint à
   N h contre M h votre <jour> habituel », « famille lourde en CA, légère en marge ». Chaque carte = ligne
   candidate dbt + les huit déclarations (audit § 3.6) + trois plans en voix owner + barre `card-review`.
8. **Onboarding Épices et Tout** : ordre § 12.12 — mapping Crisalid (net HT, `vat_rate`, `document_type`)
   → fichier de prix d'achat → marge → charges.

---

## 5. Preuve de mécanique (11/09, catalogue SYNTHÉTIQUE)

Pour prouver la jointure à date d'effet, la couverture et la détection sous le coût sans aucun prix réel :
`_audit_scratch.lotB_cost_catalog_synth` = un coût par site × article = 60 % du prix unitaire médian, date
d'effet = première vente, **20 % des articles volontairement sans coût**. Les chiffres du § 5 bis sont
ceux de cette graine ; ils prouvent la mécanique, pas un fait sur un commerce.

### 5 bis. Résultat (30 derniers jours, `mart.fct_client_sales_lines`, jointure à date d'effet par site × article × jour puis aux lignes)

| Site | Lignes avant / après jointure | CA | CA au coût connu | Couverture | Marge brute | Taux | Lignes sous le coût |
|---|---|---|---|---|---|---|---|
| f10c3e58 (compte owner) | 11 063 / 11 063 | 53 461 € | 37 438 € | 70 % | 14 945 € | 39,9 % | 0 |
| 29383776 (démo Sèvres) | 11 870 / 11 870 | 46 640 € | 32 341 € | 69 % | 9 522 € | 29,4 % | 3 |
| ff2aeb35 | 11 661 / 11 661 | 54 213 € | 38 063 € | 70 % | 15 157 € | 39,8 % | 0 |

Ce que ça prouve : la jointure à date d'effet ne multiplie aucune ligne (M1, étape 7) ; la couverture se
mesure en CA et non en articles (20 % des articles retirés = 30 % du CA hors couverture) ; un coût à 60 %
du prix médian rend un taux de 40 % là où le prix ne bouge pas, 29 % là où la démo remise davantage ; les
trois lignes sous le coût sont des lignes remisées (KPI 8 se détecte à la ligne, M2). Les sites Sage 100
n'apparaissent pas : dernière vente au 27/07, hors des 30 jours.

## 6. Décisions owner attendues

1. Les mots d'interface de M7 (« coût connu sur X % de votre CA ») et de KPI 8 (« vendu sous le coût » /
   « à perte ») — le lexique reçoit les cinq mots actés (CA net HT, marge brute, résultat net, point mort,
   masse salariale) avec cette spec.
2. Le seuil de couverture de M8 (80 %).
3. `revenue_basis` : déclaré par site (M3), ou déduit de la caisse (`crisalid` ⇒ HT par la règle d'ingestion) avec repli déclaré.
4. Tuiles Piloter : résultat net et point mort au héros, ou dans Explorer et le rapport seulement.
5. Format des dates du fichier de prix d'achat (JJ/MM/AAAA attendu) et décimales (virgule).

— SPEC DE TRAVAIL ; se réécrit en définitif quand la passation est buildée et les vues vérifiées.
