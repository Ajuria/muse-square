# Espace et pôle — le pôle comme objet de l'entrepôt, les mesures d'espace par composant, la marge par mètre linéaire et par m² — DÉFINITIF

Sert : `strategie-entreprise.md` § 12.12 (KPI 4, 5, 12) ; `intent.md` § Les objets (pôle, composant, prix d'achat) ;
`audits/profit-grains-sensibilite-audit-2026-09-11.md` § 5 D2, D3.

_Réécrit en définitif le 11/09/2026 après la fusion de la PR [ms_database#148](https://github.com/Ajuria/ms_database/pull/148)
(`a36411c`) et le run dbt Cloud `70471897078124` ; chaque affirmation re-vérifiée en base à 17 h 45 UTC. Les modèles
font foi (`~/Documents/ms_database/ms_dbt/models/ms_open_data/…`) ; le chemin parcouru vit dans
`docs/dbt-handoff/HANDOFF-espace-2026-09-11.md` et `git log`. Décisions owner du 11/09 : les mesures se saisissent
sur le composant (formulaire de pôle), jamais pendant le relevé ; **faces de préhension** ; **surface de vente** ;
« Non rattaché » dans le CA et la marge, hors du linéaire ; meubles 3-6, 19 et 49 à confirmer sur place._

---

## 1. Ce qui est en base

| Objet | Couche | Grain | Contenu (vérifié 11/09) |
|---|---|---|---|
| `analytics.space_measures` | app-write (16 colonnes) | measure_id ; la dernière `created_at` par (dispositif, version, composant) fait foi | par composant : `fixture_no` (N° sur le plan, le même que `dispositif_photos.fixture_no`), `length_m`, `depth_m`, `faces` (faces de préhension, 1 ou 2), `linear_m_facade` (= longueur × faces), `families_share` JSON `[{family, share}]` (Part de linéaire, parts 0-1) ; au pôle (`component_key` NULL) : `surface_m2`. `source` ∈ plan, ruban, saisie. **Vide.** |
| `analytics.declared_parameters.sales_area_m2` | paramètre déclaré | site, date d'effet | la surface de vente du magasin ; exposée par `vw_insight_event_declared_parameters` |
| `stg_space_measures` | staging | une mesure | types ; faces ∈ {1, 2} ; mètres de façade recalculés si absents |
| `int_client_pole_family_map` | intermediate (vue) | site × famille | **LE mapping famille → pôle** : familles réelles (`pole_families`) de la version courante des pôles (`dispositif_nature = 'permanent'`, non annulés, `attached_pole_id` NULL) ; test d'unicité (site, famille) en warn. **0 ligne : aucun pôle déclaré.** |
| `int_client_component_space` | intermediate (vue) | composant × famille | mètres de façade du composant (version courante) × Part de linéaire de la famille — déclarée (`share_source = declare`) ou parts égales entre les familles du pôle (`defaut`). Le pôle d'un composant = `attached_pole_id` du dispositif, sinon le dispositif lui-même |
| `int_client_pole_space` | intermediate | grain famille / pôle / site | mètres linéaires, Part de linéaire (sur les mètres mesurés), surface de vente (pôle : mesure ; site : `sales_area_m2`, sinon Σ pôles étiquetée par l'absence du paramètre) |
| `fct_client_pole_daily` | mart | site × jour × pôle (899 jours) | CA, ventes, tickets, part du CA du site, écart au résultat habituel (Σ des écarts famille de `fct_client_day_family_decomposition`), marge brute et couverture (`fct_client_family_margin_daily`) ; pseudo-pôle `non_rattache` : **Σ pôles = site, vérifié 162/162 jours du compte owner** |
| `fct_client_space_30d` | mart | famille / pôle / site (50 lignes, 6 sites) | 30 jours calendaires jusqu'au dernier jour de vente : CA, part de CA, marge (NULL sous `margin_coverage_min`), part de marge, mètres linéaires, **Part de linéaire**, € par mètre, surface de vente, € par m², `computed_at` |
| `fct_client_pole_day_class_response` | mart | site × pôle × classe × base × métrique (188 lignes) | `pole_revenue_gap` (base pure et marginal), `pole_revenue`, `pole_units`, `pole_share`, `pole_margin` — le moteur des classes de jour, la clé pôle |
| six vues `vw_insight_event_{pole_family_map, component_space, pole_space, pole_daily, space_30d, pole_day_class_response}` | semantic, contrat enforced, tag `mart_dependent` | id. | les surfaces que l'app lira. **Aucun lecteur app au 11/09.** |

## 2. Les règles

- **E1** Le mapping famille → pôle vit dans l'entrepôt ; une famille vit dans un seul pôle ; les familles sans
  pôle se lisent « Non rattaché », jamais perdues.
- **E2** « Non rattaché » est un pseudo-pôle : il compte dans le CA et la marge (Σ pôles = site), jamais dans le
  linéaire (aucun mètre ne lui est mesuré).
- **E3** Les mesures vivent à part (`space_measures`), jamais dans le JSON `components` ; une mesure se corrige
  sans re-versionner le dispositif ; le N° sur le plan relie la mesure à la photo du même meuble.
- **E4** La surface de vente du site est déclarée une fois (le chiffre du bail) ; celle d'un pôle se mesure ; le
  site n'est pas la somme de ses pôles.
- **E5** Sans part déclarée, les mètres d'un composant se répartissent à parts égales entre les familles du pôle,
  et la table le dit (`share_source`).
- **E6** Les ratios d'espace se lisent sur 30 jours glissants, jamais au jour.
- **E7** Le pôle au jour et sa réponse aux classes de jour sont les modèles famille, la clé pôle.

## 3. Preuves

- Lot matérialisé dans `_audit_scratch.lotC_*` avant la PR sur des entrées SYNTHÉTIQUES en scratch (compte owner :
  trois pôles de deux composants, mesures du plan et une mesure au ruban qui remplace le plan, un pôle sans
  surface — jamais écrites en production) : 8 familles → 3 pôles, `Branded` « Non rattaché » ; Σ pôles = site
  162/162 jours ; 15 lignes composant × famille dont 2 parts déclarées ; 14 lignes d'espace 30 j (site 24,5 m,
  90 m²) ; 151 lignes pôle × classe.
- En base après build (aucun pôle) : mapping 0, `fct_client_pole_daily` 899 jours tous « Non rattaché », Σ pôles =
  site 162/162 jours du compte owner, 50 lignes d'espace, 188 lignes pôle × classe.
- Le plan d'Épices et Tout, mesuré (52 meubles, 202,23 m de façade, `~/Documents/Muse_Square/Clients/epices-et-tout/map/metres_lineaires_epices_et_tout_v2_2026-09-11.csv`) :
  Cuisine 42,89 m (21,2 %), Maison 39,05 m (19,3 %), Épicerie sèche 37,34 m (18,5 %), Produits frais 31,09 m
  (15,4 %), Cave 23,62 m (11,7 %), Petit déjeuner 20,41 m (10,1 %), Caisse 7,83 m (3,9 %). Trois meubles à confirmer
  sur place : n° 3 et 6 (le L « Récipients »), n° 19 (nature), n° 49 (part Couteaux / Céréales).

## 4. Ce qui existe côté app, et ce qui reste (état au 11/09)

- **Entrées (11/09, dev)** : le formulaire de pôle (`public/js/pole-form.js`) saisit par composant « N° sur le plan »,
  « Longueur (m) », « Faces de préhension » et, à plusieurs familles, la « Part de linéaire » (Σ = 100 %) ; au pôle
  la « Surface de vente (m²) ». Les mesures partent sous `space_measures` du POST /api/commitments (jamais dans
  `components`), écrites par `lib/dispositifs/spaceMeasures.ts` dans `analytics.space_measures` ; une mesure se
  corrige sans re-version par `api/commitments/space-measures`. Sans vente importée, le formulaire dit « Pôle en
  projet — Aucune vente importée » et les familles s'écrivent. La création du pôle vit dans
  `lib/dispositifs/poleCreate.ts`, partagée par la route et le one-off.
- **Épices et Tout (11/09)** : sept pôles déclarés depuis les zones du plan (Cave, Cuisine, Maison, Épicerie
  sèche, Produits frais, Petit déjeuner, Caisse), 52 composants mesurés chargés (`source = 'plan'`,
  `fixture_no` = N°, Part de linéaire = 100 % de la famille du plan), par
  `tools/oneoff/2026-09-11-epices-et-tout-poles-et-mesures.mts`. En base après reconstruction ciblée (run dbt Cloud
  70471897084223) : 7 lignes pôle et 24 lignes famille dans `vw_insight_event_pole_space`, site 202,21 m (le
  tableau du plan dit 202,23 : arrondi au cm de longueur × faces), n° 19 sans faces donc sans mètre. Les familles
  sont les libellés du plan, à rapprocher de la caisse à la première importation — cinq sont des noms de
  composant plutôt que des familles (Ilot spiritueux, Ilot maison, Ilot varié, Ilot entrée, Frigidaires). Aucune
  surface de vente de pôle (non mesurée). `vw_insight_event_space_30d` est vide pour ce site : la fenêtre 30 j se
  cale sur le dernier jour vendu.
- **Lecteurs (11/09, dev)** : Piloter, carte « Vos pôles » : « N m de linéaire · Part de linéaire N % » et
  l'état « Pôle en projet — … » ; volet « Espace — 30 derniers jours » (mètres, Part de linéaire, m² de surface
  de vente, € de CA et de marge brute par mètre, € de CA par m², « Part de marge N % contre Part de linéaire N % »)
  ou « Aucune mesure d’espace pour l’instant. » — `listPoleSpace` lit `vw_insight_event_pole_space` (mesures en
  vigueur) puis `vw_insight_event_space_30d` (€ par mètre quand le site vend). « Vos pôles » du profil porte
  l'état « Pôle en projet ». Harnais `npm run harness:tableau-espace` (17 contrôles).
- **Reste** : la déclaration de la surface de vente en chat (`sales_area_m2` dans `DECLARED_METRICS` écrit
  aujourd'hui le journal des corrections, pas `declared_parameters`) ; la saisie des mesures sur la fiche du pôle
  (page de l'engagement, à côté du N° sur le plan des photos) ; Explorer, rapport, cartes (audit § 6 A6-A8) ;
  chez Épices et Tout, les n° 3, 6, 19, 49 à confirmer sur place et les familles à rapprocher de la caisse.
