# Menaces réelles vs bruit ambiant — spec courte (25/08, point 7 owner)

**Constat owner (25/08)** : « Différenciez-vous de vos concurrents proches » cite des
événements du rayon qui ne le concernent pas. Le problème est structurel : les cartes de
densité comptent TOUT le rayon, pas ce qui vous prend des clients.

**Verdicts de `docs/card-truth-audit.md` (cités, pas re-déduits)** :
- `competition_proximity` — recouvrement d'audience plat à **33 %**, sous la barre **40 %**
  que la page profonde concurrence applique déjà ; « concurrents » = Louvre, Orsay,
  Quai Branly ; classe `competition_high` mesurée +14 €/j, t = 0,4 → bruit.
  Verdict audit : **durcir (overlap ≥ 40 %) ou démettre**.
- `high_competition_density` — la règle de tir **ignore le même-secteur** (pressure_ratio +
  events_5km, jamais une densité concurrente) ; part même-secteur réelle 53 % sur f10c3e58,
  payload affichant « 0 » (bug d'unité). Verdict audit : **brancher la copie sur la part
  même-secteur + corriger l'unité**.
- `low_competition_window` — règle **SAINE** (tercile bas de `competition_index_local`,
  mesure +88 €/j t = 2,4). **Garder telle quelle.**

## Doctrine (ratifiée 25/08)

**Une MENACE a un lien DIRECT à vous**, trois sources déjà en base :
1. **Vos suivis** — `competitor_tracking` × directory par location_id (la vérité, mémoire
   23/08) : leurs événements, changements de prix, offres (la veille les calcule déjà —
   `fct_competitor_offering_changes`).
2. **Le recouvrement mesuré** — `threat_profile` (public commun × distance), seuil ≥ 40 %,
   le même que la page profonde concurrence (aucun nouveau seuil à inventer).
3. **Le même secteur dans votre périmètre déclaré** — part même-secteur (`same_bucket`),
   jamais la densité toutes-catégories.

**Le reste est du CONTEXTE** : la densité d'événements ambiante quitte les cartes-action et
descend dans le **bandeau** comme fait du jour (« N événements à 1 km », infobulle : les plus
proches nommés) — visible, jamais impératif. `days[]` porte déjà
`events_within_500m/1km/5km_count` : zéro fetch de plus.

## Sort des cartes

| Carte | Sort |
|---|---|
| `competitor_threat_direct`, `competitor_event_launch`, `competitor_audience_conflict`, `competitor_review_*`, `competitor_hours_change`, `competitor_new_offering`, `competitor_sold_out` | **Gardent l'action** — déjà fondées sur les suivis |
| `competition_proximity` | Porte lien-direct : ne tire que si overlap ≥ 40 % OU l'événement le plus proche appartient à un suivi ; sinon son fait part au bandeau |
| `high_competition_density`, `competition_pressure_spike` | Copie re-branchée sur la part MÊME-SECTEUR (verdict audit) ; sous le seuil → bandeau |
| `low_competition_window` | Inchangée (audit : saine) |

## Incréments

1. **App — bandeau contexte** : ligne densité dans la colonne jour (fait + infobulle),
   retrait des tirs ambiants du fil. Aucun changement dbt.
2. **App — porte lien-direct** sur `competition_proximity` (overlap déjà dans le payload de
   la page profonde ; vérifier sa présence dans le payload candidates via bq-verify avant de
   coder — sinon petite passe dbt pour l'y joindre).
3. **dbt (éventuel)** : joindre événement ↔ suivi (event × competitor_id des suivis) pour que
   « le plus proche » ne soit nommé que s'il est un concurrent au sens ci-dessus.

## Décisions owner AVANT code

- Le mot du bandeau pour la densité ambiante (« autour de vous » est acté au tableau ;
  proposer : « N événements à 1 km » nu, sans qualificatif) — un mot à valider.
- Démettre ou durcir `competition_proximity` (l'audit laisse les deux ouverts).
- Le seuil même-secteur qui sépare carte (action) et bandeau (contexte) — l'audit mesure
  53 % sur votre site ; proposition : carte si part ≥ 40 % (cohérence avec l'overlap), sinon
  bandeau.
