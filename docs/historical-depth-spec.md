# Profondeur historique — spec des chantiers (29/07/2026)

> **Question owner** : « spécifie le chantier d'ingestion de l'historique météo + précise si la
> même chose ne doit pas être faite pour les événements et autres données qui ont de la profondeur
> historique ? Il ne s'agit pas de partir tête baissée dans la météo et d'oublier tout le reste. »
>
> Il avait raison de m'arrêter : la météo est **une famille sur huit**, et ce n'est même pas celle
> qui rapporterait le plus.

## Le constat déclencheur

Les Olivades importent **223 jours de ventes** (28/08/2025 → 27/07/2026) et l'app répond « on ne
sait pas encore ce que ces journées vous coûtent ». Trois plafonds successifs ont été remontés le
29/07 avant de trouver la vraie cause :

1. `sales_signals_output_days` = 90 → **corrigé** (porté à 730)
2. `analog_lookback_days` = 120 sur `fct_client_day_residual` — non corrigé
3. **La profondeur des données de CONTEXTE au grain lieu** — la vraie cause

## Profondeur mesurée, par famille de classe de jours

Mesuré sur les deux sites Les Olivades le 29/07/2026.

| famille | source | jours passés disponibles | nature du chantier |
|---|---|---|---|
| **calendrier** (`school_holiday`, `public_holiday`) | `stg_school_vacations_periods` **depuis 1990**, `stg_holidays_daily` **depuis 2005** | projetés sur le lieu : **19** | **REJEU** |
| **tourisme** (`tourism_high/low`) | INSEE mensuel/annuel (profond) | index régional projeté : **102** | **REJEU** |
| **concurrence** (`competition_high/low`) | dérivée de la densité d'événements | **23** | acquisition partielle |
| **événements** (`events_high`) | `int_events_daily_paca` **6 j**, `int_events_daily_idf` **57 j** | **6 à 57** | **ACQUISITION** |
| **météo** (`heat_32_34`, `heat_35_plus`, `rain`, `wind`, `snow`, `cold`) | `stg_new_weather_forecast_10d` — **prévisions uniquement, aucune archive** | **19** | **ACQUISITION** |
| **mobilité** (`mobility_disruption`) | flux perturbations temps réel | depuis le branchement | **non rejouable** |
| **suivis** (`followed_activity_high`) | crawl concurrents | depuis la mise sous surveillance | **non rejouable** |
| **ventes** (`traffic_high`, `discount_no_lift`) | ventes du client | **la profondeur qu'il importe** | déjà bon |

**Lecture** : deux familles sur huit sont bloquées par une simple **fenêtre**, alors que la donnée
existe depuis des décennies. Deux autres exigent une vraie **acquisition**. Deux ne sont pas
rejouables par nature.

## Chantier A — REJEU : élargir les fenêtres (le meilleur rapport)

La donnée calendrier existe depuis 1990. Elle est tronquée à 19 jours **au moment de la projection
sur le lieu**, par une chaîne de trois bornes à 120 jours :

| # | fichier | borne | forme |
|---|---|---|---|
| A1 | `fct_location_context_daily.sql` ligne 66 | `var('backfill_days', 120)` | variable |
| A2 | `fct_location_context_features_daily.sql` ligne 77 | `interval 120 day` | **codée en dur** |
| A3 | `fct_client_day_residual.sql` ligne 44 | `var('analog_lookback_days', 120)` | variable |

A2 doit d'abord être **paramétrée** (elle ne l'est pas), puis les trois portées à la même valeur.

**Ce que ça débloque** : le calendrier et le tourisme, sur toute la profondeur des ventes du
client. Pour Les Olivades, `school_holiday` est **déjà leur plus gros enjeu** (+87 572 €/an) avec
seulement 15 jours mesurés et un t à 1,06 — à la limite du plancher. Avec l'historique complet, la
classe devient robuste au lieu d'être à la merci d'un jour.

**Ce que ça coûte** : `backfill_days` de 120 à 730 multiplie par ~6 la fenêtre de construction du
contexte, **pour tous les lieux**, sur des modèles qui joignent météo, événements et calendrier.
C'est le poste de coût à chiffrer avant de trancher la valeur exacte — 365 jours suffisent
probablement, la classe « mesuré » exigeant déjà `span >= 300`.

**Attention** : élargir les fenêtres n'inventera pas de météo ni d'événements là où il n'y en a
pas. A ne débloque QUE le calendrier et le tourisme. C'est réel, mais il faut le dire.

## Chantier B — ACQUISITION : archive météo

**Le fournisseur est déjà en place.** Le schéma de `stg_new_weather_forecast_10d` — `daily`,
`hourly`, `daily_units`, `hourly_units`, `generationtime_ms`, `utc_offset_seconds`,
`timezone_abbreviation` — est la signature exacte d'**Open-Meteo**, ingéré via Airbyte.

Open-Meteo expose une **API d'archive** (réanalyse ERA5) qui rend la **même forme de réponse**,
avec des paramètres `start_date` / `end_date`. C'est donc le même connecteur, la même table cible,
le même parseur de `daily` — pas une nouvelle intégration.

**À spécifier avant de lancer :**
- **Licence.** Open-Meteo est gratuit pour l'usage non commercial ; Muse Square est commercial.
  **Le régime tarifaire doit être vérifié avant tout développement** — c'est le premier point à
  trancher, pas le dernier.
- **Déclencheur.** L'archive doit être tirée **à la création d'un lieu** et **à l'import de ventes
  couvrant une période antérieure** — sinon le problème se reproduit à chaque nouveau client.
- **Étendue.** La période à rejouer est celle des ventes du client, bornée par la profondeur
  retenue au chantier A. Inutile de descendre plus bas que la fenêtre de contexte.
- **Volume.** Une requête par lieu couvrant N jours (l'API rend une plage entière en un appel),
  pas une requête par jour.
- **Idempotence.** Le rejeu doit pouvoir être relancé sans doubler — même discipline de
  delete-supersede que l'import de ventes.

**Ce que ça débloque** : les six classes météo, sur toute la profondeur. Pour Les Olivades,
`heat_35_plus` passerait de 11 jours (t = 0,63) à plusieurs dizaines. Le signe observé est
**positif** (+1 229 €/j) : leurs journées de forte chaleur leur rapportent. Aujourd'hui la carte
météo leur dit l'inverse en ne mesurant rien.

## Chantier C — ACQUISITION : historique événementiel (le plus lourd, le moins sûr)

`int_events_daily_paca` remonte à **6 jours**, `int_events_daily_idf` à **57**. Les connecteurs
OpenAgenda et Open Data Paris ont été construits pour la **découverte prospective**, pas pour le
rejeu du passé.

Difficultés propres, à ne pas sous-estimer :
- les agendas publics **purgent** ou dépriorisent les événements passés — la donnée peut ne plus
  être servie du tout ;
- la couverture varie fortement par région (PACA 6 j vs IdF 57 j) — un rejeu donnerait un
  historique **hétérogène**, ce qui biaiserait les classes `events_high` et `competition_*` d'une
  région à l'autre ;
- le rayon événementiel est recalculé par lieu, donc tout rejeu implique de rejouer
  `fct_location_events_radius_daily` sur la même profondeur.

**Conclusion honnête** : à faire **après** A et B, et seulement après une vérification de ce que
les sources servent réellement du passé. Un rejeu partiel vaudrait peut-être moins que pas de
rejeu du tout, puisqu'il ferait croire à une mesure là où la couverture est trouée.

## Ce qui n'est pas rejouable — et doit être dit

- **Mobilité** : les perturbations sont un flux temps réel. Le passé non capturé est perdu.
- **Suivis concurrents** : l'activité d'un concurrent n'existe que depuis sa mise sous
  surveillance.

Pour ces deux familles, la seule voie est le **temps qui passe**. La copie doit le dire ainsi
(« se construit à partir d'aujourd'hui »), et non « on ne sait pas encore », qui laisse croire à
un défaut.

## Ordre recommandé

1. **A (rejeu des fenêtres)** — le moins cher, débloque la famille qui porte déjà le plus gros
   enjeu du seul vrai client. Chiffrer d'abord le coût de calcul.
2. **B (archive météo)** — vrai travail d'ingestion, mais fournisseur et connecteur déjà en place.
   **Trancher la licence commerciale AVANT de développer.**
3. **C (archive événementielle)** — le plus lourd, le rendement le plus incertain, et un risque
   d'hétérogénéité qui peut nuire plus qu'aider.

## Le défaut de conception derrière tout ça

Le contexte d'un lieu est construit **en avant depuis son entrée dans le système**, alors que les
ventes d'un client arrivent **en arrière sur des mois**. Les deux ne se rencontrent que sur
l'intersection — 19 jours chez Les Olivades pour 223 jours de ventes.

Tout nouveau client vivra la même chose tant que l'**import de ventes ne déclenchera pas le rejeu
du contexte sur la période importée**. C'est ce chaînage, plus que chaque source prise isolément,
qui est le vrai chantier.


## CORRECTION du 29/07 — le chantier A est MORT, ne pas le relancer

**Le chantier A ci-dessus était faux sur son affirmation centrale.** Je l'avais bâti en lisant
trois bornes à 120 jours dans le code, **sans vérifier qu'elles étaient effectivement
contraignantes**. Elles ne le sont pas.

Vérifié après coup :

- `fct_location_context_daily` est matérialisé en **`table`** — donc entièrement reconstruit à
  chaque run, avec `backfill_days = 120`, ce qui autoriserait le **31/03**. Il produit quand même
  **18/04**. Entre les deux, la source n'a rien.
- Ce plancher du 18/04 est **identique pour les 8 lieux du parc**, à la journée près. Ce n'est donc
  pas un effet de la date de création d'un compte : c'est la profondeur réelle de la donnée amont.
- `fct_client_day_residual` couvre déjà **99 des 102 jours** de contexte disponibles. Il n'y a rien
  à libérer.

**Conclusion** : élargir `backfill_days` ou `analog_lookback_days` produirait des **jours vides**,
pas des jours de mesure. Le seul chantier qui déplace l'aiguille est l'**acquisition** (B et C) —
et la météo à 19 jours reste le plafond dur pour toutes les classes météo.

**Leçon de méthode** : une borne lue dans le code n'est pas une contrainte tant qu'on n'a pas
montré que la donnée EXISTE au-delà. Mesurer la donnée d'abord, lire le code ensuite.
