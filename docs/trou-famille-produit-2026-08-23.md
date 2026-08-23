# Trou « famille produit » — diagnostic en données (23/08/2026)

> Troisième trou selon `questions-exploitant-vs-cartes-2026-08-23.md`. Question : « quelle famille
> bouge ? qu'est-ce qui s'est bien / mal vendu ? ». Une carte au registre, `offering_mix_shift` —
> **fantôme** : présente dans `recoThemeMap`, `commitmentOrigins`, `bestInClassStore`, et dans
> AUCUN modèle dbt. Jamais née.

## La donnée

`fct_client_offering_daily` — grain site × jour × famille, `revenue`, `revenue_share`,
`revenue_rank`, `promo_count`, incrémental par jour. Modèle sain.

| site | familles | couverture |
|---|---|---|
| 4 comptes de démo | **9** (Coffee, Tea, Bakery, Drinking Chocolate, Coffee beans, Branded, Packaged Chocolate, Flavours, Loose Tea) | 181 jours |
| **Les Olivades** (seul client réel) | **1 — « non classe » sur 218 / 218** | l'export Sage ne porte pas `item_category` |
| Esprit de Fabrique | 1 — « non classe » | idem |

**Même frontière que l'heure** : la donnée est complète sur la démo, absente chez le client réel.
L'import reconnaît `item_category` (optionnel) ; l'export Sage des Olivades ne l'a pas fourni.

## Le piège que la revue d'hier n'avait pas vu

Le 22/08 sur `f10c3e58`, **toutes** les familles sont en hausse en € (Coffee +227, Tea +206,
Bakery +41). Ce n'est pas une famille qui bouge, c'est **la journée** qui est forte. Une carte
« Coffee +24 % » (ce que la revue d'hier proposait) aurait menti par omission.

**L'unité juste est la PART du CA, pas l'€** (règle 13 du lexique — jamais un volume absolu).
En part, contre la moyenne glissante 30 j de la famille, |z| ≥ 2 :

| site | jours (60 j) | jours avec un mouvement de part | hausses | baisses |
|---|---|---|---|---|
| f10c3e58 | 60 | **12** | 13 | 7 |
| ff2aeb35 | 60 | 13 | 13 | 6 |
| 29383776 | 60 | 14 | 13 | 8 |

Un jour sur cinq. Exemples réels sur `f10c3e58` :
- 14/08 : **Tea 16,6 % du CA, contre 27,8 % d'habitude** (z = −2,7) — et Packaged Chocolate 3 %
  contre 1,3 %.
- 06/08 : Drinking Chocolate 15,9 % contre 9,4 % (z = +2,8).
- 30/07 : Bakery 21,1 % contre 12,6 % (z = +3,3).

Ce sont des faits qu'un exploitant ne lit pas dans son total du jour, et qu'il peut **bouger**
(réassort, mise en avant, prix).

## Ce qui se fait

1. **Côté dbt** — une CTE dans `fct_location_daily_action_candidates`, `family_share_move` :
   famille dont la part du CA de la veille s'écarte de ≥ 2 σ de sa moyenne 30 j glissante ;
   payload = famille, part hier, part habituelle, z, CA €, `promo_count`, rang. Porte : site
   avec ≥ 2 familles réelles (exclut « non classe ») et ≥ 20 jours d'historique. **Un tir par
   jour maximum** : la famille au |z| le plus fort.
2. **Côté app** — une carte nouvelle, donc **une copie** : titre, corps, geste. Règle 4 (citer
   la surface), tableau 8-13 montré, **avant** de partir. Le KPI `family_revenue` de
   `kpiRegistry` est déjà là pour l'engagement.
3. **Côté import** — demander `item_category` aux Olivades et à chaque client POS. Sans ça, 0 tir
   chez le seul client réel — et c'est exact.

**Ne pas faire** : `offering_mix_shift` côté app est un nom sans producteur — à retirer du
registre, de `recoThemeMap`, `commitmentOrigins`, `bestInClassStore` quand la vraie carte naît.
