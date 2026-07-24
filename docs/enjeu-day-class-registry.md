# Enjeu €/an — day-class registry

> Spec de référence de la pill « Enjeu ~X €/an · estimé/mesuré » des cartes d'action système, et du
> registre de classes de jours qui la calcule. Code : `src/lib/dayClassRegistry.ts` (calcul + policy),
> `api/insight/monitor.ts` (lecteur), `pulse.astro buildMetricsStrip` (rendu).
> À lire avant TOUTE extension. Tenir ce fichier + la ligne module-index à jour dans le même commit.

## Décisions verrouillées (owner, proto 24/07 — `public/enjeu-chip-proto.html`, direction B v2)

1. **Enjeu TOUJOURS annualisé (€/an)** — « who acts over 110 € ? Nobody. » Le €/an = poids annuel du
   MOTIF : écart résiduel moyen des jours de la classe × fréquence réelle de ces jours dans
   l'historique du site. **Jamais** « écart du jour × N » (extrapolation interdite).
2. **Baseline** : `fct_client_day_residual` (CA réel − attendu dow+trend). Jour de semaine et
   tendance déjà contrôlés. Ce qu'on mesure est une **association conditionnelle**, jamais une cause
   (voir « échelle de causalité » plus bas). Formulation carte : « sur vos jours de X… », jamais
   « X vous coûte ».
3. **Pas de mesure → pas de pill** (absence honnête). Positif sur carte menace → pas de pill
   (variante verte « à capter » designée au proto, pas câblée).
4. **UI** (pulse.astro) : pill ambre système `#FEF3E2/#B45309`, `.ab-metric`, PREMIÈRE position de la
   strip, format fr-FR, tier en suffixe. Strip épurée : « Sans pilote » et « À traiter » par défaut
   SUPPRIMÉS (seuls Répondu / Déjà fait / Pas pour moi s'affichent) ; « Action menée ? » reste partout.

## Gates (tier = niveau épistémique)

| Tier | Conditions |
|---|---|
| *(rien)* | n < 5 OU span < 60 j OU écart positif |
| `estimé` | n ≥ 5 ET span ≥ 60 j |
| `mesuré` | n ≥ 10 ET \|t\| ≥ 2 ET **span ≥ 300 j** |

Le plancher span ≥ 300 j pour `mesuré` est délibéré : une fréquence extrapolée d'une saison est
biaisée (8 jours de pluie sur 90 jours d'été ≠ taux annuel). Un span court ne gagne JAMAIS `mesuré`,
quel que soit le t.

## Couverture actuelle (v1 + Phase 1, 24/07)

- Classes : les 5 conditions météo (`lvl_* >= 2` de `fct_location_context_daily`), mutuellement
  exclusives par construction (CASE premier-match, ordre = priorité heat > rain > wind > snow > cold)
  → pas de double compte météo-vs-météo possible.
- Cartes servies : `weather_hazard_onset` (condition dans `data_payload.new_value` = "heat:2") +
  `weather_worsened` / `extended_bad_weather` / `extended_bad_weather_3d` (condition résolue depuis la
  DATE AFFECTÉE via `conditionByDate` — le payload ne la porte pas). Épisodes multi-jours : on prend la
  condition dominante du jour de la carte (simplification assumée).
- Surface : Pulse (monitor.ts). `days.ts` / page insight : en file.
- Calcul : à la requête (2 queries légères par site, échec soft). Le store offline nightly est le
  prochain palier (voir backlog) — les chiffres bougent au mois, pas à la requête.
- Preuve réelle (f10c3e58, 90 j) : rain n=8, avg −103,6 €, t≈2,9 → **~3 363 €/an · estimé** (span
  90 j < 300 → jamais mesuré) ; heat n=2 → sous plancher → pas de pill. `conditionByDate` : 18-19/07
  → heat, 20/07 → rain, 24/07 → aucune.

## Échelle de causalité (advisory owner 24/07 — à respecter dans toute extension)

1. **Aujourd'hui** : association conditionnelle sur baseline dow+trend. Vrai descriptivement,
   suffisant pour choisir QUELS jours défendre.
2. **Matching / contrastes propres** : mesurer une classe en excluant les jours où une autre classe
   est active ; appariement même-jour-de-semaine/même-saison. Obligatoire avant d'ajouter des classes
   inter-familles (chevauchements → double compte).
3. **Ajustement multivarié** : moteur Type B (OLS + SE + **VIF**) = « toutes choses égales » au sens
   régression ; quand le VIF échoue, on REFUSE la séparation (« chaleur et saison touristique
   indissociables sur votre historique »), on n'invente pas un split.
4. **Quasi-expériences** : onset soudain vs prévu, dose-réponse par seuils (31° vs 33°), fenêtres de
   perturbation bornées (grèves) — matière du pattern finder.
5. **Preuve interventionnelle** : la boucle d'engagement (M'engager → baseline → delta mesuré) — seul
   vrai test causal ; futur tier « prouvé par vos actions ».
   Auto-tests bon marché à encoder au palier registre-offline : placebo (la pluie de DEMAIN
   « explique »-t-elle l'écart d'aujourd'hui ? oui → fuite saisonnière), stabilité (effet présent sur
   les deux moitiés de l'historique). Échec → tier plafonné `estimé`.

> **24/07 pm — voir `docs/kpi-enjeu-mapping.md`** : mapping complet des 83 sous-types → (KPI, enjeu ou non + raison, KPI de suivi), dictionnaire de KPIs vérifié bq-verify, décisions en attente owner. Il PRÉCÈDE ce backlog : le palier 2 s'implémente selon ce mapping une fois tranché.

## Backlog (ordre recommandé)

1. **Store offline nightly** (pattern Type B : batch → `analytics.*` → lecteur) : une ligne
   location × day_class ; monitor devient lecture pure ; cron type `crawl-best-in-class`.
2. **Classes inter-familles** via `impactContrast.ts` (les gates y vivent déjà) : pression
   concurrentielle ambiante (`competition_index_local` terciles — mesuré NULL sur f10c3e58, pill
   absente = correct), activité concurrents suivis (POSITIF +21,6 pp sur f10c3e58 → pill VERTE),
   densité événementielle même-secteur (+14,2 pp), mobilité (jours à perturbation), tourisme étranger
   (`fct_foreign_tourism_context_daily` terciles). PRÉREQUIS : policy de chevauchement (rung 2) —
   un jour pluie+grève ne se facture pas deux fois.
3. **Pill verte « à capter »** (chip-good `#E6F6F0/#059669`) pour les classes positives.
4. **`discount_no_lift`** : € de remises sans lift mesuré — SEULEMENT après bq-verify des colonnes
   remise. Les autres cartes sales (anomalies) n'auront JAMAIS d'Enjeu : annualiser « les jours où le
   CA est bas » est circulaire. Les cartes score (`score_up/down`) non plus : composite → double
   compte des familles.
5. **Cartes structurelles (pattern finder)** : même store, même registre — une carte structurelle =
   une classe dont le poids annuel passe les gates. Grain location × pattern_id (sans date),
   `action_category='structurel'`, section « Chantiers structurels » (PILOTER), réévaluation
   mensuelle. Voir memory `enjeu-chip-and-structural-cards`.
