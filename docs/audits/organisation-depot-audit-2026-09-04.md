# Audit de l'organisation du dépôt — 04/09/2026 (avant rangement) — DÉFINITIF

Instantané pris le 04/09/2026 au matin, avant les 8 phases de rangement (fusionnées dans `dev` le
05/09/2026, commit `73d2cde`). Il décrit l'état d'AVANT : ne pas y lire l'état courant, qui est dans
`docs/organisation-depot.md`. Comme tout audit, il ne se met pas à jour.

## L'état mesuré, avant rangement

### 1.1 La racine

| Fichier | Taille | Dernier commit | Consommateur | Verdict |
|---|---|---|---|---|
| `1` | 0 o | 04/04 | aucun | commis par accident |
| `repo_snapshot.txt` | 1,3 Mo | 22/02 | aucun | mort |
| `communes_full.json` | 3,2 Mo | 05/03 | `src/generate_seeds.py` | donnée de référence, pas du code |
| `city_map.csv`, `communes_coords.csv`, `departments_map.csv` | 260 Ko, 220 Ko, 4 Ko | 04/06 | `python/enrich_cities.py` | idem |
| `README.md` | 4 Ko | 26/08/**2025** | — | décrit l'init Astro, plus le produit |
| `explorer-battery-*.{md,json}` | — | — | batterie | artefacts de run, déjà ignorés (correct) |

La racine porte aussi `shots/` (10 captures JSON + 1 HTML, lues par 6 scripts), `python/`
(scraping Nîmes, juin), `sample-data/` (2 CSV), `content/` (5 pages marketing — à sa place).

### 1.2 `public/` — 188 fichiers suivis, 81 à la racine du dossier

`public/` est copié TEL QUEL dans l'artefact Vercel. Aujourd'hui, à sa racine :

| Famille | Nombre | Livré en prod ? |
|---|---|---|
| Libs runtime chargées par les pages (`card-kit.js`, `action-cards.js`, `commit-form.js`, `ms-loader.js`, `pole-form.js`, `event-form.js`, `bp-form.js`, `draft-workspace.js`, `reco-library.js`, `map-markers.js`, `reactions.js`) | 11 | oui, voulu |
| `kpi.js` | 1 | oui — **0 consommateur**, 26/08/2025 |
| `*-proto.html` (+ `-v2`, `-v3`) | 45 | non — purgés au build par `tools/build/strip-protos.mjs` |
| `*-proto-data.js` (données réelles de compte figées) | 15 | non — idem |
| `*-harness.html` | 5 | non — idem |
| favicon ×3, `robots.txt` | 4 | oui |

Sous-dossiers sains : `fonts/` 22, `icons/` 16, `images/` 53, `vendor/` 12, `docs/` 3 PDF,
`scripts/` 1 (`ie-prompt.js`, seul script client rangé dans un dossier).

Le tri livré / non livré repose sur un **motif de NOM de fichier** (`-(proto|proto-data|proto-vN|harness).(html|js)`),
pas sur un dossier. Tout fichier de dev nommé autrement part en prod, servi sans authentification
(le défaut que `strip-protos` a corrigé le 24/08 — il l'a corrigé pour ce motif seulement).
`docs/perimetre-client-prototype.html` est un prototype hors motif, hors `public/` : il n'est pas
servi, mais il montre que le nom ne suffit pas comme règle.

Versions côte à côte : `evenement-dossier-proto{,-v2,-v3}.html`, `atelier-dispositif-proto{,-v3}.html`,
`agir-proto{,-v3}.html`, `hero-proto{,-tableau,-lieu,-dispositifs}.html`, `piloter-*-proto.html` ×8.
Aucun de ces fichiers ne dit s'il est l'état retenu, une piste refusée ou une étape dépassée.

### 1.3 `scripts/` — 71 fichiers à plat, six natures mélangées

| Nature | Exemples | Combien |
|---|---|---|
| Générateurs de protos (écrivent `public/*-proto-data.js` depuis BigQuery) | `piloter-full-proto-harness.ts`, `hero-kpis-proto-harness.ts` | 14 |
| Harnais de rendu et vérifications de surface (portes de merge) | `pulse-render-verify.mjs`, `card`-side via `card-harness.html`, `tableau-v4-render-verify.mjs`, `vue-equipe-*-harness.ts` ×8 | ~30 |
| Batteries (portes de merge permanentes) | `explorer-quality-battery.ts`, `prompt-conversation-battery.mjs` | 2 |
| Revues et audits datés, à usage unique | `copy-review-2308.ts`, `audit-verite-2608.ts`, `copy-review-edge-ab.ts` | 8 |
| Migrations et réparations one-shot | `migrate-pos-systems.mts`, `backfill-kpi-verdicts.ts`, `repair-competitor-duplicates.ts` | 6 |
| Brouillons | `_tmp-audit.ts`, `_tmp-cartes.ts` (contient `"14379e18-REPLACE"`), `_tmp-members.ts`, `_tmp-runs.ts` | 4, commis le 24/08 |
| Outillage de build et d'index | `strip-protos.mjs` (seul script branché dans `package.json`), `index-freshness-check.sh`, `shot-capture.ts` | 3 |

35 de ces scripts sont cités par `CLAUDE.md`, `docs/`, les skills ou la mémoire comme LA preuve
d'une surface. Aucun n'est lançable par un `npm run` : chaque commande se recopie de mémoire.

### 1.4 `src/` — 414 fichiers

- `src/lib/` : 199 fichiers, **72 à plat au premier niveau** (dont 22 tests), sans regroupement
  par domaine : `commitment{Constants,Context,Copy,Effect,Origins,Resolve,Shape}.ts` et
  `actionCommitments.ts` sont neuf fichiers d'UN domaine posés parmi soixante autres.
- `src/lib/ai/` : 92 fichiers, dossiers d'époques successives : `ui/`, `ui_normalized/`,
  `ui_packaging_v3/`, `impact_rules/v1_5/` (**0 importeur**), `assertions/` (1), `render/` (1),
  `find_dates/` (1) — datés de février à mai. `contracts/packagerUiV3Prompt.ts` fait 0 ligne.
- `src/scripts/` : 8 fichiers, 5 sans aucun consommateur depuis février (`ai_runtime_smoke.mjs`,
  `days.ts`, `month.ts`, `print_env.mjs`, `prompt.ts`) ; `crawl-best-in-class.mjs` et
  `sensitivity-engine.cjs` vivants. Deux `.cjs` et un `.py` (`src/generate_seeds.py`) dans un
  arbre TypeScript.
- `src/pages/app/insightmarketing/prompt.astro` : aucune Nav n'y mène, dernier commit 17/02.
  `src/pages/api/legacy/` : 0 importeur (ce sont des routes — vérifier les hits avant de conclure).
- `src/layouts/astro` : fichier vide de 0 octet, 30/08/2025.
- **Tests : 54 fichiers, trois conventions à la fois** — co-localisés (`src/lib/x.test.ts`, 40),
  un dossier `src/client/` (10 tests qui exercent `public/*.js` — le code testé n'est pas dans
  `src/`), un `__tests__/` (`impact_narrations`), et un `.spec.ts` dans `scripts/`.

### 1.5 `docs/` — 70 fichiers suivis + 4 non suivis

49 `.md` à la racine : 34 `— DÉFINITIF`, 14 `— SPEC DE TRAVAIL`, 1 non qualifié
(`plateforme-copie-brief.md`). Au même niveau : `bq-catalog.json` (catalogue généré),
`refresh-bq-catalog.sh`, un `.sql` de passation (`dbt-handoff-fct_location_daily_action_candidates.sql`)
alors que `docs/dbt-handoff/` existe avec 8 passations, un prototype HTML, et quatre sous-dossiers
de natures différentes : `features/` (4 docs anglais, juillet), `terminal/` (logs de session
d'août **2025**), `pack-copie-site/`, `dbt-handoff/`.

Les instantanés datés (`*-2026-08-23.md`, `card-truth-audit-2026-08-22.md`, 7 fichiers) sont
posés parmi les documents vivants : `head -1 docs/*.md` les mélange, et un lecteur pressé lit un
audit du 23/08 comme un état courant — le contraire de ce que `docs/README.md` demande.

### 1.6 Ce que ça coûte

- **Un choix de dossier à chaque fichier**, donc pas de choix : tout va à la racine du dossier le
  plus proche. 81 fichiers à la racine de `public/`, 72 à celle de `src/lib/`, 71 dans `scripts/`.
- **La sécurité repose sur un regex de nom.** Un prototype figeant des données de compte est en
  prod dès qu'il s'appelle autrement.
- **Aucune trace du cycle de vie.** Un proto retenu, un proto refusé et un proto dépassé ont le
  même nom, la même place, et restent — 45 HTML aujourd'hui, dont 18 créés depuis le 24/08
  (plus 14 fichiers de données ; `git log --since=2026-08-24 --diff-filter=A -- 'public/*proto*'`).
- **Les chemins cités font loi.** 49 chemins `public/*-proto*|*-harness*` distincts sont cités
  dans `CLAUDE.md`, les skills, `docs/` et la mémoire : tout déplacement sans réécriture de ces
  citations casse les portes de vérification (« le harnais EST la page »).

