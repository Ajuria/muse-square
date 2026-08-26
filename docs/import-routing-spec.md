# Routage d'import des ventes — DÉFINITIF

> **GO owner 06/08/2026.** Préfixe `F*` = facture (FR/FV inclus) ; suffixe `PA/PAT` = Esprit de
> Fabrique.

**Le principe** : le raw reste **fidèle au fichier importé** — c'est ce qui a permis la validation
au centime de l'analyse JF. Le sens s'applique au **staging**, via des règles déclaratives par
compte, parce qu'un fichier = plusieurs flux/sites se reproduira (Houdan, tout Sage multi-flux).

État vérifié dans le code et en base le 26/08/2026. Le chemin d'application vit dans `git log`
(app `2ba7842`, dbt `bf127ce`).

---

## Les règles

`analytics.import_routing_rules` : `rule_id`, `clerk_user_id`, `source_location_id`,
`source_system`, `invoice_regex`, `target_location_id`, `is_invoiced`, `priority`, `enabled`,
`note`, `created_at`, `updated_at`.

Deux règles actives, toutes deux sur Olivades :

| règle | prio | regex | effet |
|---|---|---|---|
| `oliv-pat-esprit` | 10 | `^[A-Za-z]*(PA\|PAT)[0-9]` | re-route vers Esprit de Fabrique (`2dc69ea6…`) |
| `oliv-nonfacture` | 20 | `^[DdCcBbPp]` | `is_invoiced = FALSE` |

**Défaut sans règle** : site inchangé, `is_invoiced = TRUE`. Les autres comptes (seed, café…) sont
donc strictement inchangés — c'est le contrat d'isolation.

Deux points que la lecture des colonnes ne dit pas :

- **`source_system = NULL` signifie « toutes les sources »**, et le mécanisme existe au staging —
  mais **les deux règles réelles portent `source_system = 'sage100'`**. Un futur import Olivades
  depuis une autre source ne serait donc **pas** routé. Choix implicite, jamais arbitré.
- **La table est peuplée à la main.** Aucune ligne de l'app n'y écrit (`grep import_routing_rules
  src/` → vide). Toute nouvelle règle exige un DML manuel.

### Le garde-fou contre les chevauchements — ce n'est PAS un test d'unicité

Contrainte v1 : au plus **une** règle par facette peut matcher une ligne. Deux règles concurrentes
sur la même facette dupliqueraient des lignes par fan-out du JOIN, et tout le CA aval serait
surcompté.

Ce chevauchement est policé par **`tests/assert_stg_client_transactions_no_routing_fanout.sql`**,
qui vérifie que le staging porte **exactement le même nombre de lignes que le raw**.

**Il n'existe aucun test d'unicité du grain sur ce staging, et il ne peut pas en exister** : le
grain (site, date, facture, article) **n'est pas unique** — un export Sage porte plusieurs lignes
d'un même article sur une même facture (441 clés en doublon, toutes légitimes). Le `schema.yml` le
dit explicitement : « Pas de test d'unicité ici ».

---

## Ce que le staging fait

`models/ms_open_data/staging/stg_client_transactions.sql` — **le fichier fait foi, ce document ne
le recopie pas.** Il a évolué depuis l'étape A : deux facettes à l'origine, **trois** aujourd'hui
(la facette CANAL est arrivée avec `channel-grain-spec.md`), quatre sources au lieu de deux, et un
correctif « minuit pile » du 23/08 sur `transaction_hour`. Toute copie figée ici serait une
régression en puissance.

Les deux facettes du routage d'import :

- **re-routage de SITE** — un fichier peut porter plusieurs établissements ;
- **`is_invoiced`** — devis, commandes et bons sont **conservés** au staging (c'est le pipeline
  commercial, pas du déchet) et exclus du CA par les consommateurs de mesure.

Colonnes contractuelles testées `not_null` : `is_invoiced` et `source_location_id` (le site
d'ORIGINE du fichier, avant re-routage — audit et debug).

---

## Où le filtre s'applique : la mesure ne compte que le facturé

Quatre consommateurs portent `is_invoiced` :

| modèle | ligne |
|---|---|
| `intermediate/int_client_daily_performance.sql` | 55 |
| `intermediate/int_client_offering_profile.sql` | 29 |
| `mart/fct_client_offering_daily.sql` | 42 |
| `mart/fct_client_hourly_sales.sql` | 27 |

Subtilité à préserver dans `int_client_daily_performance` : la sous-requête interne des dates
touchées reste **sans** filtre — une ingestion de devis doit elle aussi rafraîchir sa partition.

---

## Le contrat chiffré — établi le 06/08, re-vérifié le 26/08, exact

| Site routé | Facturé | Lignes / CA |
|---|---|---|
| Les Olivades (`14379e18…`) | oui | 5 701 / **588 851 €** (FC + FR + FV) |
| Les Olivades | non | 257 / 148 849 € (CC + DC + BC + PC) |
| Esprit de Fabrique (`2dc69ea6…`) | oui | 145 / **74 477 €** (FAPA) |
| Esprit de Fabrique | non | 194 / 147 553 € (DPAT + BCPAT) |

Facturé **663 328 €** ; non facturé **296 402 €**. Sur 6 297 lignes réelles. Rejoué sur
`intermediate.int_client_daily_performance` le 26/08 : **588 851 €** et **74 477 €**, au centime —
Esprit de Fabrique est bien allumé.

Référence externe : JF annonce 661 776 €, l'écart de 1 552 € correspond à 11 lignes de dédup
d'import. Non recalculable depuis le code.

Requête de re-vérification :

```sql
select location_id, count(*) n, round(sum(daily_revenue)) ca
from `muse-square-open-data.intermediate.int_client_daily_performance`
where location_id in ('14379e18-2060-4b50-871d-edf0818eab8c','2dc69ea6-1d5a-4257-876e-162d07168633')
group by 1
```

---

## Ce qui reste ouvert

1. **Aucune écriture des règles par l'app.** L'intention initiale (« l'app les posera à
   l'onboarding, UI plus tard ») n'a jamais été codée. Décision non prise : onboarding, UI, ou
   statu quo manuel.
2. **Une dizaine de fichiers app lisent encore `raw.client_transactions` en direct** — donc **sans
   `is_invoiced` ni `channel`** : ils voient le non-facturé. Le raw **n'a pas** de colonne
   `is_invoiced` (elle naît au staging), donc c'est structurel. Seul
   `src/lib/insightFamilies/channels.ts` a migré vers le staging avec le filtre. Arbitrage non
   tranché : migrer les lecteurs vers staging/marts, ou porter `is_invoiced` jusqu'au raw ?
3. **La mesure « après » du bruit n'a jamais été consignée.** Le contrat d'origine prévoyait de
   re-mesurer le taux de jours sous 70 % du 30 j chez Olivades (référence avant : 57 %). Le chiffre
   de référence n'apparaît nulle part ailleurs dans le dépôt et aucune mesure « après » n'existe.
4. **Règles scopées `sage100`** (voir plus haut).

**Ce qui a été livré depuis, par un autre chemin** : l'étape B (boutique vs pro) n'a **pas** été
bâtie sur une nouvelle facette de `import_routing_rules`, contrairement à ce que l'étape A
prévoyait — elle repose sur deux tables nouvelles, `analytics.import_invoice_parties` et
`analytics.party_directory`. Voir `channel-grain-spec.md`. La capture de `source_file` à l'import
est faite (`src/pages/api/import/sales-csv.ts`).
