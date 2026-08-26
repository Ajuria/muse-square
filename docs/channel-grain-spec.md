# Canal par facture + porte de régime (étape B) — DÉFINITIF

> **GO owner 06/08/2026** : « étape B + porte de régime — pas de quick hack, on construit
> l'infrastructure pour les prochains cas de grain ».

Deux chantiers en un :

- **Canal** — chaque ligne de vente reçoit son compte tiers et son canal (`comptoir` = caisse
  boutique, `direct` = facturation sur compte). Mécanique **générique** : deux tables `analytics`
  app-write + une 3ᵉ facette au staging, **aucun nom de compte en dur dans dbt**.
- **Porte de régime** — un modèle mesure le RYTHME de vente de chaque site et le classe
  (`daily` / `weekly` / `episodic` / `insufficient`) ; les cartes de ventes **quotidiennes** ne
  tirent plus que sur les sites `daily`. Tout futur compte (grossiste, corner, facturation
  épisodique) est classé par ses données, jamais déclaré.

État vérifié dans le code et en base le 26/08/2026. Le chemin d'application vit dans `git log`
(dbt `f146640`+).

---

## Le canal — comment une ligne de vente reçoit le sien

Deux tables `analytics`, app-write, chargées par load job (pas de streaming, donc DML possible) :

| table | grain | rôle |
|---|---|---|
| `import_invoice_parties` (871 lignes) | `source_location_id × source_system × invoice_number` → `party_code` | **rattrapage** : rattache un tiers aux historiques importés sans colonne tiers |
| `party_directory` (485 lignes) | `source_location_id × party_code` | l'annuaire : nom lisible, canal, **rôle**, vague, géo, provenance |

Chacune est gardée par un test d'unicité de grain dédié (`assert_import_invoice_parties_unique_grain`,
`assert_party_directory_unique_grain`).

Le staging (`stg_client_transactions.sql`) dérive le canal en cascade :
**canal du tiers** → sinon **`'direct'` si le tiers est connu** → sinon la valeur du fichier. Le
`channel` n'est donc plus un passthrough. Quand le re-export Sage portera le tiers ligne à ligne,
il convergera dans cette même colonne sans toucher les consommateurs.

> **`party_role` vit aussi dans `party_directory`** et n'appartient pas à ce chantier : il pilote le
> filtre de la carte `client_dormant` (voir `client-patterns-spec.md`). Il est cité ici parce que
> toute lecture de l'annuaire le rencontre.

### Défaut latent : deux vocabulaires de `channel` qui ne s'accordent pas

| Où | Valeurs admises |
|---|---|
| test dbt (`staging/schema.yml`, `accepted_values`, severity `warn`) | `comptoir`, `direct` |
| API app (`src/pages/api/analytics/party-role.ts`, `VALID_CHANNEL_KINDS`) | `corner`, `commission`, `canal` |

**Aucune intersection.** Aujourd'hui sans conséquence : les deux seules lignes valuées de
`party_directory` portent `comptoir`. Mais **le premier geste owner « ce compte est un corner »**
écrira `corner`, qui remontera dans `stg_client_transactions.channel`, puis dans
`fct_location_channel_weekly` / `_monthly` (`channel_key`), et fera passer le test dbt en warn.
**Arbitrage non pris** — c'est le seul vrai défaut ouvert de ce chantier.

---

## La porte de régime

`models/ms_open_data/mart/fct_location_sales_regime.sql` classe chaque site depuis
`fct_client_daily_performance`, sur une fenêtre de 180 jours.

Seuils : **tickets/jour ≥ 10**, **dispersion (p75/p25) ≤ 3**, **jours actifs/semaine ≥ 4**.

La porte s'applique en toute fin de `fct_location_daily_action_candidates.sql`, par un
`left join sales_regime using (location_id)` : une carte dont le type commence par `sales_` ne sort
que si le site est `daily`.

> **Contrainte de nommage, non écrite ailleurs et pourtant de sécurité.** La porte filtre sur le
> **préfixe `sales_`**. Toute future carte de ventes **quotidienne** DOIT être nommée `sales_*`,
> sinon elle échappe silencieusement à la porte et tirera sur des sites où le verdict quotidien n'a
> aucun sens. Les cartes C2/C3 s'appellent `weekly_sales_*` / `monthly_sales_*` et passent donc à
> côté **volontairement** — elles ne sont pas quotidiennes.

---

## Calibrage — sortie réelle du mart, relue le 26/08

**Canal**, sur le site principal Olivades — chiffres du 06/08, rejoués aujourd'hui, **exacts** :

| canal | factures | CA facturé |
|---|---|---|
| `comptoir` | 271 | 176 019 € |
| `direct` | 600 | 487 308 € |
| lignes sans tiers | — | **0** |

Hors Olivades : uniquement `on_site`, 196 898 lignes — **aucune contamination**. 242 tiers
facturés, 871 factures rattachées, et 441 clés de grain en doublon, toutes légitimes.

**Régime** — la sortie du modèle aujourd'hui :

| site | jours actifs | méd. j/sem | méd. tickets/j | p75/p25 | régime |
|---|---|---|---|---|---|
| muse `f10c3e58` | 180 | 7 | 245 | 1,70 | `daily` |
| café `ff2aeb35` | 180 | 7 | 257 | 1,72 | `daily` |
| `29383776` | 180 | 7 | 260 | 1,76 | `daily` |
| Poeiti `2af6eb18` | 180 | 7 | 245 | 1,70 | `daily` |
| **Olivades `14379e18`** | 118 | 5 | **3** | **6,08** | **`weekly`** |
| **Paris `2dc69ea6`** | 18 | 1 | **1** | **6,29** | **`episodic`** |

Les six verdicts sont ceux visés. La marge sur la dispersion est confortable : 1,76 d'un côté du
seuil de 3, 6,08 de l'autre.

**La porte tient** : `sales_*` = **0 carte** sur Olivades et **0** sur Paris. Les quatre sites
`daily` en portent 6, 4, 4 et 4 — un catalogue qui a bougé depuis le 06/08 (retrait de
`sales_underperformance`, arrivée des cartes € du 23/08), donc **aucun compteur d'avant n'est
comparable**. Le contrat à re-vérifier est « zéro sur les deux sites non-`daily` », pas un total.

Requêtes de re-vérification :

```sql
-- régime
select location_id, sales_grain, active_days, med_daily_txn, round(iqr_ratio, 2) iqr
from `muse-square-open-data.mart.fct_location_sales_regime` order by sales_grain;

-- la porte
select location_id, count(*) cartes_ventes
from `muse-square-open-data.mart.fct_location_daily_action_candidates`
where starts_with(action_type, 'sales_') group by 1 order by 2 desc;
```

---

## Les fichiers, et pourquoi ce document ne les recopie pas

`stg_client_transactions.sql` **fait foi**. Il a évolué depuis l'étape B : le correctif « minuit
pile » du 23/08 (un `transaction_datetime` à 00:00:00 ne vaut plus « 0 h » mais NULL — 5 958 lignes
Sage concernées) vit dedans. Toute copie figée dans un document redeviendrait une régression le jour
où quelqu'un la republierait.

Même remarque pour `fct_location_daily_action_candidates.sql` : ses ancrages ont bougé (le select
final part de `final_candidates`, plus de `deduped`), et le fichier dépasse 3 300 lignes.

**Le garde-fou contre la duplication de lignes** est
`tests/assert_stg_client_transactions_no_routing_fanout.sql` : il compare le nombre de lignes raw et
staging. Il couvre bien les **trois** facettes — mais **son propre en-tête n'en décrit que deux**,
il n'a pas été mis à jour quand la facette canal est arrivée.

---

## Ce qui reste ouvert

1. **Le conflit de vocabulaire `channel`** (voir plus haut) — le seul défaut actionnable.
2. **Vagues W manquantes** (W1/W2/W5-W8, demandées à JF) : les vagues réellement présentes sont W0,
   W3 et W4. Il reste **200 tiers facturés** hors annuaire.
3. **Une dizaine de fichiers app lisent encore `raw.client_transactions` en direct**, donc sans
   `is_invoiced` ni `channel`. Seul `insightFamilies/channels.ts` est passé au staging. Voir
   `import-routing-spec.md`, même arbitrage.
4. **Re-export Sage** avec compte tiers ligne à ligne : le point de convergence est prévu au staging
   (`else channel`), jamais exercé.
5. **En-tête périmé du test de fan-out** (deux facettes sur trois), et commentaires « à venir /
   chantier C » restés dans le code de production alors que le chantier C est livré.

**Livré depuis, retiré de la queue** : le **chantier C entier** — C1 motifs par client
(`client-patterns-spec.md`), C2 hebdo (`weekly-sales-spec.md`), C3 mensuel
(`monthly-sales-spec.md`), plus le rapport par canal (`rapport-canaux-spec.md`) et la spec rôle des
comptes. La capture de `source_file` à l'import est faite.

> **Une cible renversée par la mesure, à retenir** : le chantier C3 devait servir le studio
> parisien. C'est le canal pro d'Olivades qui se juge au mois — Paris reste trop dispersé même à ce
> grain. La donnée a tranché contre l'intuition de départ.
