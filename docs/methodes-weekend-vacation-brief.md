# À rédiger (owner) — méthodes `weekend_vacation_low_comp` + complément `low_competition_window`

> **L'ACTION : écrire les textes des plans dans `public/reco-library.js` — 9 entrées pour
> `weekend_vacation_low_comp` (gabarit prêt, décommenté en fin de fichier), 2 entrées de plus
> dans le `_default` de `low_competition_window` (ligne ~187).** Rien d'autre à câbler :
> depuis le 31/07, `action-cards.js` dérive le câblage des clés de ce fichier — une entrée
> écrite = plans visibles dans « M'engager ».
>
> Le contenu ne se génère pas (décision owner 27/07) : voix de l'owner, chiffres du pipeline.
> Ce brief donne tout ce que la donnée sait, pour que la rédaction n'ait plus qu'à écrire.

---

## 1. `weekend_vacation_low_comp` — verdict d'audit et matière

**Verdict (`docs/card-truth-audit.md`)** : « Garder — la plus saine du lot » (28/07),
inchangé au réexamen du 31/07. `pressure_ratio` 0,02–0,79 (moy. 0,53) sur ses tirs →
réellement faible ✓, adossée au +88 €/j mesuré (`competition_low`, t = 2,4, n = 30 chez
Muse Square) ✓. **Aucun plan aujourd'hui — « Mon action » s'ouvre vide.**

**Ce que la carte affirme** : « Week-end de vacances — faible concurrence » (OPPORTUNITÉ).
Rare par construction : il faut week-end ET vacances ET pression sous la normale — au
01/08, 2 lignes sur 1 seul lieu du parc (ni Muse Square ni Les Olivades ce jour-là) ;
35 tirs sur la fenêtre du 28/07.

**Variables du payload** (relevé réel du 01/08, seule matière disponible pour les phrases) :

| variable | exemple réel | référentiel |
|---|---|---|
| `is_weekend` / `is_vacation` | true / true | booléens, toujours vrais quand la carte tire |
| `pressure_ratio` | 0,55 | ratio 0–1 **relatif à la normale DU lieu** : 0,55 = 45 % sous votre normale — jamais « pression faible dans l'absolu » |
| `events_5km` | 2 | entier, événements concurrents à 5 km |
| `score` | 58 | score d'opportunité 0–100 |

**Structure à écrire** : la carte porte la classe d'enjeu `competition_low`
(`dayClassRegistry.ts:598`) — la même que `low_competition_window`. Résolution
(`action-cards.js:2848`) : signe d'enjeu → `_default`.

- `enjeu_positif` (3) — le lieu gagne DÉJÀ plus ces jours-là (cas Muse Square, +88 €/j).
- `enjeu_negatif` (3) — le lieu gagne moins ces jours-là.
- `_default` (3) — aucune mesure sur ce lieu.

**Sans dupliquer `low_competition_window`** : même classe, contexte différent. Ici c'est un
week-end de vacances scolaires — l'équipe du week-end est déjà planifiée (aucun geste
planning à J-2, délai de prévenance), la clientèle est de passage/famille, et la fenêtre
est connue des semaines à l'avance (calendrier scolaire) alors que `low_competition_window`
se découvre à J-2. C'est l'angle qui distingue les 9 textes.

## 2. `low_competition_window` — compléter `_default` à 3

**Verdict d'audit** : « GARDER TELLE QUELLE » — ne pas toucher à la règle. Défaut restant
(réexamen 31/07) : la branche `_default` — servie aux lieux **sans mesure**, soit 20 sites
sur 24 — n'offre qu'**un** plan (« Vérifiez si ces jours sont bons ou mauvais chez vous »,
`public/reco-library.js:187-196`). Les branches mesurées ont déjà 3 + 3.

À écrire : **2 plans de plus** dans ce `_default`. Contrainte d'honnêteté qui a fondé le
plan unique (28/07, en tête de l'entrée) : sans mesure, aucun texte ne peut affirmer que
ces jours rapportent plus ou moins — les 2 nouveaux gestes doivent rester valables dans
les deux sens (ex. : des gestes d'observation, de préparation, ou réversibles à coût nul).

## 3. Les trois distinctions demandées (owner, 01/08) — état réel, vérifié dans les modèles

Question : pourquoi le brief ne distingue-t-il ni suivis/base secteur, ni
cannibalise/entraîne, ni les types d'événements ? Réponse : **aucune des trois n'est dans le
signal de cette carte aujourd'hui**, et l'écrire dans les méthodes affirmerait plus que ce que
la donnée sait. Détail :

| distinction | état | pourquoi elle n'entre pas dans les textes aujourd'hui |
|---|---|---|
| **suivis vs base secteur** | existe dans le produit, PAS dans ce signal | `pressure_ratio` vient de `competition_index_local` (`fct_location_context_features_daily`) : comptage pondéré de TOUS les événements par rayon (4×500m + 3×5km + 2×10km + 1×50km), aveugle aux suivis. Les suivis ont leur propre famille (cartes `competitor_*`, classe `followed_activity`). |
| **cannibalise vs entraîne** | documentée (`docs/competition-split-spec.md`), branchée côté HAUTE densité seulement | la scission `pct_same_bucket_5km` est en prod sur `high_competition_density` (28/07). Côté basse pression, ni le payload ni — surtout — la MESURE ne la portent : le +88 €/j (`competition_low`) est mesuré sur le tercile bas de l'index aveugle au secteur. Un texte « vos concurrents directs sont calmes » outrepasserait la mesure. |
| **types d'événements** (sortie produit/POS, culturel…) | hors signal | le seul typage du signal de densité est `industry_bucket` (même-secteur ou non). Les sorties produit/POS concurrentes = famille des cartes d'offre du crawl (`competitor_new_offering`…), démises au Fil le 28/07 (vigilance, amendement C2). |

**Décision de rédaction qui en découle** : les 9 textes s'écrivent SANS ces distinctions.
Ce que la carte affirme honnêtement — moins d'événements que VOTRE normale, un week-end de
vacances où le public est présent — suffit : le geste « capter » est légitime quel que soit le
mix sectoriel, précisément parce que le public est moins disputé.

**Chantier séparé si les distinctions doivent entrer un jour**, dans cet ordre :
1. exposer la scission même-secteur dans les payloads basse-pression (miroir des §3-4 de
   `competition-split-spec.md` — payload et copie, JAMAIS la règle de tir : « GARDER TELLE
   QUELLE ») ;
2. scinder la mesure `competition_low` par part même-secteur — dépend de l'arbitrage de
   `docs/residu-bruit-diagnostic.md` (le moteur de mesure d'abord, les textes ensuite) ;
3. alors seulement, des branches de méthode par régime (le mécanisme de résolution
   `_recosFor` devra porter une clé de plus).

## 4. Garde-fous de rédaction (rappel)

- Barème CLAUDE.md « Card Quality Bar » : spécifique, pilotable cette semaine, € pertinent,
  non-évident, vocabulaire du vertical.
- Droit français : pas de modification d'horaires à 2 jours, pas de revente à perte, pas de
  soldes hors dates. **Et repos dominical** (rattrapé par l'owner, 01/08) : ne jamais supposer
  le dimanche travaillé — écrire « vos jours d'ouverture du week-end », jamais
  « samedi + dimanche ». Le dimanche ouvert est une dérogation (zones touristiques,
  alimentaire jusqu'à 13 h), pas la règle.
- Les chiffres ne s'écrivent pas à la main : les phrases peuvent nommer « ces jours », le
  pipeline fournit `pressure_ratio` et l'enjeu.
- Après écriture : bump du cache-buster `?v=` sur les surfaces consommatrices
  (pulse.astro ~326, monitor ~285, insight ~137) + `node --check public/reco-library.js`.
  Le garde-fou `src/lib/recoCoverage.guard.test.ts` (dette nommée, ne peut que rétrécir)
  doit voir `weekend_vacation_low_comp` sortir de la liste des 76.
