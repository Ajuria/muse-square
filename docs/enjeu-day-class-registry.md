# Enjeu €/an — day-class registry — DÉFINITIF

> Spec de référence de la pill « Enjeu ~X €/an · estimé/mesuré » des cartes d'action système, et du
> registre de classes de jours qui la calcule. Code : `src/lib/dayClassRegistry.ts` (calcul + policy),
> `api/insight/monitor.ts` (lecteur), `pulse.astro buildMetricsStrip` (rendu).
> À lire avant TOUTE extension. Tenir ce fichier + la ligne module-index à jour dans le même commit.

## Décisions verrouillées (owner, proto 24/07 — `tools/proto/enjeu-chip-proto.html`, direction B v2)

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
| *(rien)* | n < 5 OU span < 60 j OU **\|t\| < 1** OU écart positif |
| `estimé` | n ≥ 5 ET span ≥ 60 j ET \|t\| ≥ 1 |
| `mesuré` | n ≥ 10 ET \|t\| ≥ 2 ET **span ≥ 300 j** |

Le plancher **\|t\| ≥ 1** (ajout incrément 1) existe parce que les classes TERCILES passent n ≥ 5 par
construction (~1/3 des jours) : sans plancher de signal, du bruit pur s'annualise — prouvé en réel :
competition_high n=31, écart −2,8 €, t=0,08 aurait affiché « ~352 €/an ».

Le plancher span ≥ 300 j pour `mesuré` est délibéré : une fréquence extrapolée d'une saison est
biaisée (8 jours de pluie sur 90 jours d'été ≠ taux annuel). Un span court ne gagne JAMAIS `mesuré`,
quel que soit le t.

## Étape 2 (24/07 nuit) — classes complètes, contrastes PROPRES, pill verte

- **Classes ajoutées au batch** : `events_high` (tercile `events_within_500m_count` — la vraie
  variable des cartes competition_proximity/density/saturation, qui comptent des ÉVÉNEMENTS),
  `mobility_disruption` (flag), `followed_activity_high` (tercile d'intensité parmi les jours
  actifs ; garde anti-dégénérescence : une exposition permanente 89/89 j ne fait pas une classe),
  `school_holiday` + `public_holiday` (CONTRÔLÉES mois × type-de-jour, contrôle ≥ 3 jours propres).
- **Contrastes propres (policy validée)** : une classe n'agrège que ses jours PURS
  (`n_memberships = 1` sur les 8 classes). Conséquence assumée et MESURÉE : sur un historique de
  90 j, les classes d'été se recouvrent (chaleur ⊂ vacances ⊂ tourisme haut) et les pills
  marginales de l'incrément 1 (Occitanie chaleur −12 978, tourisme −12 731) DISPARAISSENT — elles
  facturaient partiellement les mêmes jours. Ce qui reste est SÉPARABLE : Occitanie `events_high`
  **+7 104 €/an à capter** (n=15 purs, t=2,87). Les autres classes reviennent quand l'historique
  s'étale sur les saisons (ou au barreau 3, VIF/co-estimation). C'est le comportement épistémique
  voulu : « indissociable sur votre historique » ⇒ pas de chiffre.
- **Pill VERTE « À capter ~X €/an »** (chip-good) : écart positif ; ambre = négatif. Policy de
  signe dans le lib, couleur au client (pulse buildMetricsStrip).
- **Attache** : mapping type→classe conforme au doc kpi-enjeu-mapping (proximity/density/saturation
  → events_high — vérité de la variable, pas du nom) ; cartes calendrier résolues par la date
  (vacances d'abord, férié sinon) ; COMBINÉS = la classe au plus grand |€/an| mesuré parmi les
  familles du combiné (dominance PAR LA MESURE, jamais une pondération inventée).
- Types BOOL vérifiés (flags mobilité/calendrier) ; suivis via `vw_insight_event_competitor_signals`
  (`event_date_end`, garde 366 j par événement).

## Étape 2.5 (24/07 nuit) — base « facteurs mêlés » : couverture sans mensonge

Deux BASES par classe dans le store (`basis` : 'pure' | 'marginal') :
- **pure** = jours purs (n_memberships = 1), gap brut vs normale (calendrier : contrôlé hors-classe) ;
- **marginal** = TOUS les jours de la classe, gap − contrôle HORS-CLASSE du même mois × type de jour
  (>= 3 j de contrôle par cellule ; contrôle possiblement contaminé par d'autres classes — c'est
  précisément ce que l'étiquette assume).
La LECTURE préfère la pure ; sinon marginale, **plafonnée 'estimé' + étiquette « estimé, facteurs
mêlés »** (`tier_label_fr`/`entangled`) — l'intrication est DITE, jamais cachée ni maquillée.
Preuves réelles (Occitanie, 90 j) : chaleur revient à **−5 690 €/an mêlé** (vs −12 978 marginal brut
de l'incrément 1 : l'ajustement saison a dégonflé un chiffre gonflé) ; vacances −4 021 mêlé (t=1,05) ;
événements reste PUR +7 104 ; tourisme reste ABSENT même en mêlé — la classe EST la saison sur cette
fenêtre (zéro contraste intra-cellule), absence honnête. Bruit toujours filtré (|t| >= 1).

## Chantiers structurels (26/07 — proto validé, section LIVRÉE)

La section « Chantiers structurels » (Pulse, sous « À piloter ») rend les motifs du store en CARTES
STRUCTURELLES — grain motif × site, SANS date :
- **Serveur** : `monitor.ts` expose `day_class_impacts` (impacts passant les gates + copy
  owner-éditable `contextCopy.structuralCardCopyFr` : titre chiffré, honnêteté du pool, chantier
  proposé par classe). Tri |€/an| décroissant, merge multi-sites côté client (location_label).
- **Client** (`pulse.astro renderStructuralSection`) : anatomie `.ab-card` validée au proto
  (`tools/proto/chantiers-proto.html`) — chips Structurel/famille/site/état, pill Enjeu partagée
  (ambre/verte), « Chantier : … », M'engager → `MSCommitForm` avec
  `origin_action_type = structural_<class_key>` (préfixe accepté par `isCommitmentOrigin` ;
  `kpiKeyForOrigin` : structural_discount_no_lift → discount, structural_traffic_high → conversion,
  défaut K1). États : **Actif** / **En amélioration** (engagement `structural_*` open/pending sur le
  site — bouton « Voir l'engagement ») ; **Résolu** = palier suivant (exige l'historique des motifs
  disparus — non implémenté, documenté) ; section vide → ligne honnête.
- **Dynamique de pureté à connaître** : l'ajout de `traffic_high` a ABSORBÉ `events_high` sur le
  site test (les jours d'événements SONT des jours de forte affluence — la classe la plus large
  porte le poids, un jour n'est jamais facturé deux fois). Réel Occitanie : affluence +28 016 (mêlé),
  vacances −5 976 (contrôlé, mêlé), chaleur −5 694 (mêlé), remises −1 039 (pur).

## Triage par site + « Motif de fond » (26/07 soir — voir docs/pulse-actions-triage.md)
Le rendu Pulse est réorganisé en blocs par site (doctrine complète dans pulse-actions-triage.md).
Côté registre : `enjeuForCandidate` gagne l'HÉRITAGE — les cartes d'anomalie ventes
(`SALES_INHERIT_TYPES` : surge / revenue_down_wow / underperformance / missed_opportunity)
héritent de la classe de leur JOUR (météo/calendrier de la date, max |€/an|) avec
`inherited: true` → pill « Motif de fond ~X €/an · <classe> ». JAMAIS l'anomalie annualisée
(circularité, position inchangée). Preuve : sales_surge un jeudi de vacances MS Test →
school_holiday −12 016 hérité.

## Retouches post-étape 4 (26/07, feedback owner)
- Étiquette d'intrication renommée : « estimé, **cause multifactorielle** » (ex-« facteurs mêlés »).
- Classes BASSES ajoutées (trou vs mapping B2/D2) : `competition_low` / `tourism_low` (tercile bas,
  fenêtres favorables → pill verte attendue) — mappées sur low_competition_window /
  weekend_vacation_low_comp / low_tourism_local_opp. Réel : les 4 lignes basses/hautes concurrence
  des sites test échouent au plancher |t|>=1 (0,30–0,87) → pas de pill, absence honnête.
- `sales_competition_cannibalization` mappée → competition_high (mapping H).

## Étape 4 (26/07) — pills remises & trafic, KPI réputation, démotions

- **`discount_no_lift`** : classe COÛT — € remisés les jours `is_discount_without_lift` (mart
  signals), stockés NÉGATIFS → pill ambre. Fait du jour : HORS masque de pureté, HORS ajustement
  saison, base 'pure' par nature. Réel : les 4 sites mesurent (−27 à −32 €/j ; Occitanie
  **~−1 039 €/an**, t=8,1).
- **`traffic_high`** : tercile haut de VOS visiteurs mesurés (`fct_client_daily_performance`) — la
  classe honnête derrière « Trafic sans conversion » ; le « manque à convertir » contrefactuel du
  mapping initial était un risque de fabrication (on MESURE le résiduel des jours à forte
  affluence, on n'invente pas un « récupérable »). Réel : Occitanie **+28 016 €/an · mêlé** (les
  jours de forte affluence SUR-performent — l'enjeu que la conversion défend) ; absent partout où
  les visiteurs ne sont pas comptés (absence honnête).
- **Trio réputation** (`review_surge/drop`, `reputation_strength`, `review_solicitation`) : chip
  neutre « Suivi : note Google » (pulse) — jamais un € inventé sur la réputation ; mesure à
  l'arrivée d'une source own-rating (GBP connect).
- **DÉMOTIONS actives** (`recoThemeMap.DEMOTED_TO_FEED`, appliquées par `filterDisabledThemes` →
  monitor + days d'un coup) : informationnelles (positioning_brief/gap, institution_campaign,
  media_mention, weekly_briefing) + signaux concurrents non-réputation (prix/horaires/contenu/offre)
  — plus jamais dans « À piloter » ; le Fil d'actualité les sert toujours.

## Couverture actuelle (incrément 1 — store offline, 24/07 soir)

- Classes : les 5 conditions météo (`lvl_* >= 2` de `fct_location_context_daily`), mutuellement
  exclusives par construction (CASE premier-match, ordre = priorité heat > rain > wind > snow > cold)
  → pas de double compte météo-vs-météo possible.
- Cartes servies : `weather_hazard_onset` (condition dans `data_payload.new_value` = "heat:2") +
  `weather_worsened` / `extended_bad_weather` / `extended_bad_weather_3d` (condition résolue depuis la
  DATE AFFECTÉE via `conditionByDate` — le payload ne la porte pas). Épisodes multi-jours : on prend la
  condition dominante du jour de la carte (simplification assumée).
- **Store offline** : `analytics.day_class_impacts` (agrégats BRUTS location × classe — la POLICY
  gates/tiers/€ reste dans `rowsToImpacts` du lib, appliquée à la LECTURE : un changement de gate ne
  demande jamais de re-batch). Rebuild nightly par `api/cron/day-class-impacts.ts` (CREATE OR REPLACE,
  une requête, Bearer CRON_SECRET soft — **l'owner enregistre le ping quotidien sur cron.org**).
  Historique borné à 730 j (partition + fraîcheur). `monitor.ts` lit le store ; store vide pour un
  site (compte neuf) → fallback calcul live, même SQL, même policy.
- **Classes en batch** : météo 5 + `competition_high` + `tourism_high` (terciles hauts de l'index du
  site — associations MARGINALES v1, policy de chevauchement à l'étape 2). Attache cartes :
  `enjeuForCandidate` (payload / date affectée / mapping type→classe).
- Surface : Pulse (monitor.ts). `days.ts` / page insight : en file.
- Preuve réelle E2E (24/07 soir, store + lib) : Occitanie → carte météo 3j+ = heat **−12 978 €/an ·
  estimé** (t=2,42, parité exacte avec le calcul live pré-store) ; carte tourisme = tourism_high
  **−12 731 €/an · estimé** (t=2,14 — vos jours de fort tourisme SOUS la normale : pill ambre sur une
  carte « opportunité », honnête et non-évident) ; carte concurrence = null (t=0,08 filtré).
  f10c3e58 : rain −103,6 €/j t=2,9 inchangé.

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

## Gel de l'enjeu à la création + page évolution J1 (26/07 soir, proto evolution-j1-proto.html)

**Gel (provenance)** : au M'engager, la surface passe les champs VERBATIM de l'enjeu de la carte
(`creation_enjeu_eur_year/tier_label_fr/label_fr/class_key/entangled/inherited` — colonnes
additives d'`action_commitments`, ALTER appliqué en prod). Pulse (`_commitOriginFor`) et insight
(`fsOpenCommit`) fournissent ; commit-form.js transmet ; /api/commitments stocke ;
/api/commitments/evolution renvoie. La page évolution rend `tier_label_fr` TEL QUEL → la pill de
la carte et la page ne peuvent pas diverger, par construction.

**Bloc Enjeu (card-kit renderEvolution)** — deux étages qui ne se mélangent pas :
- hérité (`inherited`) → « Facteur principal de cette journée : <classe> — le plus lourd des
  motifs mesurés ce jour-là chez vous. » C'est un FAIT calculé (sélection max |€/an| du registre).
- classe directe → « Ce que les <classe> vous coûtent / vous rapportent en plus à l'année,
  d'après vos ventes. » (signe du gel).
- suffixe du chiffre = tier_label_fr verbatim ; pas d'enjeu gelé → pas de bloc.
- Le kicker « Ampleur » du composant partagé `msScale` devient « Enjeu » PARTOUT (un concept =
  un mot, celui des pills).

**État J1 (< 2 journées reçues)** : la courbe est remplacée par la frise de fenêtre (dates
réelles, jours reçus pleins, verdict en anneau) + la consigne « Revenez ici pour consulter
l'impact de votre action par rapport à votre CA habituel (X €/jour) et à votre objectif
(+Y %). Verdict le JJ/MM/AAAA. » — habituel omis si baseline absente (repli honnête). Dès 2
journées, chart() reprend, inchangé. **Redirection** : après M'engager sur Pulse, succès 1,4 s
puis navigation vers `engagement?id=<commitment_id>`.

**Deux bugs préexistants attrapés par la harness J1** (public/card-kit.js) : le headline
« fenêtre démarrée » calculait l'objectif avec la constante 0,19 au lieu de lire la base `pct`
(+10 % affiché « +7 % ») ; l'intro du panneau « Votre prochain mouvement » disait « Ça marche. »
à J1 sans aucune donnée → intro neutre tant que zéro journée reçue. Preuves : harness navigateur
sur le VRAI card-kit.js (cas enjeu hérité+mêlé et cas replis), `node --check` + `tsc` propres.
