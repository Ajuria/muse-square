# Trou « l'heure » — diagnostic en données (23/08/2026)

> Second trou selon `questions-exploitant-vs-cartes-2026-08-23.md`. Question d'exploitant :
> « quelle tranche porte ma journée, laquelle a manqué ? » — grain que l'owner a dit stratégique
> le 22/08 (micro-événementiel). Aucune carte ne le lit.

## Le modèle est sain, la donnée ne l'est que sur la démo

`fct_client_hourly_sales` : grain site × date × heure, depuis `stg_client_transactions`,
incrémental sur 3 jours, `transaction_hour` = colonne d'import OU `extract(hour from
transaction_datetime)`. Rien à redire au modèle.

| site | heure dans les ventes brutes | dans le mart |
|---|---|---|
| 4 comptes de démo (graine Kaggle clonée) | **oui** — 15 heures, 6 h–20 h | 181 jours, 15 heures |
| **Les Olivades — le seul vrai client (Sage 100)** | **non** — 6 297 lignes, `transaction_hour` NULL, 0 `transaction_datetime` | **218 jours, 1 heure : `0`** |
| Esprit de Fabrique | non | 33 jours, heure `0` |

**Le mart range silencieusement les ventes sans heure à minuit.** Une carte horaire tirerait
chez le seul client réel sur une tranche « 0 h » qui n'existe pas. C'est le même défaut que le
`pressure_ratio = 0` d'hier : une absence qui ressemble à une mesure.

## Pourquoi les Olivades n'ont pas d'heure

L'import (`src/lib/import/sourceMappings.ts` ligne 63) reconnaît `heure`, `heure de vente`,
`tranche horaire`, `hour` — **optionnel**. L'export Sage 100 des Olivades (`source_system =
sage100`, 29/07) n'a pas porté cette colonne. Sage 100 Gestion commerciale sait l'exporter
(champ « Heure » sur les documents de vente) ; elle n'était simplement pas dans le fichier.

## Ce qui se fait, dans l'ordre

1. **dbt, une ligne, maintenant** : dans `fct_client_hourly_sales`, exclure les lignes sans heure
   réelle — `where transaction_hour is not null` existe déjà en amont, mais la `coalesce` du
   staging produit `0` quand `transaction_datetime` est à minuit pile ou… à vérifier : sur les
   Olivades, `transaction_hour` et `transaction_datetime` sont-ils NULL tous les deux, ou le
   datetime vaut-il `date 00:00` ? **C'est ça qui décide de la ligne à écrire.** (mesure ci-dessous)
2. **Import** : demander aux Olivades un export avec la colonne « Heure ». Sans ça, pas de carte
   horaire pour le seul client réel — et c'est la première chose à demander à chaque nouveau
   client POS.
3. **La carte** : elle se construit sur les 4 démos (signal net : 7 h–10 h = 51 % du CA chez
   f10c3e58, chute à 11 h) et **ne tire que sur les sites dont ≥ 80 % des lignes portent une
   heure réelle**. Règle de tir : tranche forte du jour < X % de sa moyenne 30 j même jour de
   semaine.
