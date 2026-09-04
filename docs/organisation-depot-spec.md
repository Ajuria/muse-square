# Organisation du dépôt — dossiers, fichiers, cycle de vie — SPEC DE TRAVAIL

Sert : `docs/README.md` (la convention dit la NATURE d'un document, pas sa PLACE) et
`CLAUDE.md` § Code Discipline (aucune règle de placement n'y figure : c'est la cause mesurée).

**Statut : audit fait le 04/09/2026, rien n'est déplacé.** Ordre convenu : (1) ce document,
(2) les règles de placement entrent dans `CLAUDE.md`, (3) seulement ensuite les déplacements,
une phase par commit.

---

## 1. Ce qui est — l'audit (04/09/2026, `git ls-files`)

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

---

## 2. Ce qui sera — la cible

### 2.1 Le principe : la PLACE dit si c'est livré, et pour combien de temps

Un dossier répond à deux questions, et le nom du fichier n'en répond à aucune :

1. **Est-ce livré en prod ?** `src/` et `public/` : oui. Tout le reste : non.
2. **Combien de temps ça vit ?** Un dossier par durée de vie — permanent (`src/`, `public/`,
   `docs/` vivant), tant que la surface existe (`tools/harness/`), jusqu'à l'arbitrage owner
   (`tools/proto/`), une fois (`tools/oneoff/`), instantané (`docs/audits/`).

### 2.2 L'arborescence

```
muse-square/
├── CLAUDE.md  README.md  package.json  astro.config.mjs  tailwind.config.cjs  tsconfig.json  vitest.config.ts
│   (la racine ne porte QUE la configuration et les deux README ; aucune donnée, aucun script)
│
├── src/                       LIVRÉ — le code Astro
│   ├── pages/  components/  layouts/  styles/         (inchangés)
│   ├── lib/                   regroupé par DOMAINE (phase 6, sur go owner) :
│   │   ├── ai/                (inchangé dans un premier temps ; les dossiers d'époque partent en phase 5)
│   │   ├── commitments/  dispositifs/  explorer/  kpi/  poles/  events/  channels/  competitive/  dates/  fr/  import/  insightFamilies/
│   │   └── *.ts               ce qui ne relève d'aucun domaine (bq.ts, scope.ts, rate-limit.ts, error-logger.ts…)
│   └── (src/scripts/ et src/client/ disparaissent — voir 2.4 et 2.5)
│
├── public/                    LIVRÉ — uniquement ce qui doit être servi
│   ├── js/                    les 11 libs runtime (phase 7, optionnelle : touche les URL de prod)
│   ├── scripts/ie-prompt.js   (déjà rangé)
│   ├── fonts/  icons/  images/  vendor/  docs/
│   └── favicon*  robots.txt
│
├── tools/                     NON LIVRÉ — tout l'outillage de développement
│   ├── proto/                 prototypes HTML + leurs `-data.js`, UN fichier par piste EN ATTENTE d'arbitrage
│   │   └── archive/           pistes refusées ou dépassées qu'on veut garder lisibles (sinon : supprimées, git garde l'histoire)
│   ├── harness/               harnais de rendu (HTML + le .ts/.mjs qui les pilote), un par surface, vivent tant que la surface vit
│   ├── battery/               les portes de merge permanentes (explorer-quality-battery, prompt-conversation-battery, lie-bait via vitest)
│   ├── generators/            scripts qui ÉCRIVENT des données de proto ou de fixture depuis BigQuery
│   ├── oneoff/                migrations, backfills, réparations, revues datées — préfixe `AAAA-MM-JJ-`, jamais réexécutés
│   ├── build/                 strip-protos.mjs (devient un tripwire), index-freshness-check.sh, shot-capture.ts
│   └── python/                l'actuel `python/` + `src/generate_seeds.py`
│
├── data/                      NON LIVRÉ — données de référence et captures
│   ├── ref/                   communes_full.json, city_map.csv, communes_coords.csv, departments_map.csv
│   ├── samples/               l'actuel `sample-data/`
│   └── shots/                 l'actuel `shots/`
│
├── tests/                     tests dont le sujet n'est PAS dans src/ (les 10 de `src/client/` sur `public/*.js`, le .spec de scripts/)
│
├── docs/                      documents vivants à la racine (DÉFINITIF / SPEC DE TRAVAIL), et :
│   ├── audits/                instantanés datés (les 7 `*-2026-08-2x.md`), jamais mis à jour
│   ├── dbt-handoff/           (existe) + le .sql orphelin de la racine
│   ├── catalog/               bq-catalog.json, bq-catalog.allowlist.json, refresh-bq-catalog.sh
│   ├── site/                  pack-copie-site/ + les deux briefs « plateforme »
│   └── archive/               features/ (anglais, juillet) et terminal/ (2025) — ou suppression
│
└── content/                   (inchangé)
```

### 2.3 `public/` ne contient QUE du livré — et le build le PROUVE

- `tools/proto/` et `tools/harness/` sont servis en dev par un serveur statique enraciné à la
  RACINE du dépôt (`.claude/launch.json` : `--directory .`), pas dans `public/`. Les pages de
  harnais chargent les libs runtime par `/public/card-kit.js` et leurs données par un chemin
  relatif (`./x-proto-data.js`). Ce sont les seules réécritures dans les HTML.
- `strip-protos.mjs` cesse de purger : il **échoue** si l'artefact de build contient un fichier au
  motif, ou n'importe quoi hors de la liste blanche de `public/`. Une purge silencieuse masque le
  défaut ; un tripwire le montre.
- Les générateurs (`tools/generators/`) écrivent dans `tools/proto/`, plus jamais dans `public/`.

### 2.4 Un cycle de vie par nature de fichier

| Nature | Où | Naît quand | Meurt quand | Nom |
|---|---|---|---|---|
| Prototype | `tools/proto/` | une piste est proposée à l'owner | l'owner a tranché : la piste retenue devient du code dans `src/`, le proto est **supprimé** dans le commit qui livre la surface (git garde l'histoire ; la décision vit dans `docs/`) | `<surface>-<sujet>-proto.html` ; **jamais `-v2` à côté de `-v1`** : une version remplace la précédente, sauf pistes concurrentes soumises ENSEMBLE (alors `-piste-a`, `-piste-b`, supprimées ensemble) |
| Harnais | `tools/harness/` | une surface rendue existe | la surface disparaît | `<surface>-harness.html` + `<surface>-harness.ts` |
| Batterie | `tools/battery/` | une porte de merge est instituée | jamais sans arbitrage owner | nom stable, cité par `CLAUDE.md` |
| Générateur | `tools/generators/` | un proto ou une fixture a besoin de données réelles | avec le proto qu'il sert | `<proto>-data.ts` |
| One-off | `tools/oneoff/` | une migration, un backfill, une revue datée | **après exécution** : supprimé, le commit qui l'a exécuté porte son résultat ; gardé seulement s'il documente une mesure citée par un doc | `AAAA-MM-JJ-<sujet>.ts` |
| Brouillon | **jamais dans le dépôt** — le scratchpad de session | — | — | (`_tmp-*` interdit par le hook) |
| Donnée de référence | `data/ref/` | — | — | — |
| Capture / artefact de run | `data/shots/` ou ignoré | — | — | daté |
| Test de `src/` | co-localisé `x.test.ts` | avec `x.ts` | avec `x.ts` | — |
| Test hors `src/` | `tests/` | — | — | `<sujet>.test.ts` |
| Document vivant | `docs/` racine | — | réécrit, jamais archivé en l'état | (convention existante) |
| Instantané | `docs/audits/` | une mesure | jamais mis à jour | `<sujet>-AAAA-MM-JJ.md` |
| Passation dbt | `docs/dbt-handoff/` | — | quand appliquée : réécrite en état dans `data-model-index.md`, le fichier supprimé | `HANDOFF-<sujet>-AAAA-MM-JJ.md` |

### 2.5 Les portes qui tiennent la règle dans le temps

Une règle écrite se relit ; une règle exécutée s'applique. Les trois portes :

1. **Le hook pre-commit** (`.claude/hooks/precommit-check.sh` existe déjà) refuse : un fichier
   nouveau à la racine hors liste blanche ; `*-proto*` ou `*-harness*` hors `tools/` ; `_tmp`
   n'importe où ; un `.test.ts` hors co-localisation / `tests/` ; un `.md` dans `docs/` sans
   suffixe de nature.
2. **`npm run`** porte les commandes que la mémoire recopiait : `gate` (lie-bait + batteries),
   `harness` (serveur statique racine), `proto:<nom>` (générateur), `index:check`. Une commande
   qu'on ne peut pas taper depuis `package.json` n'existe pas.
3. **`strip-protos` en tripwire** (2.3) — la prod ne contient rien de `tools/`, prouvé à chaque build.

### 2.6 Ce qui entre dans `CLAUDE.md` (étape 2, avant tout déplacement)

Un paragraphe « Placement », douze lignes, qui reprend le tableau 2.4 en règles :
un fichier par nature, une nature par dossier ; la racine ne reçoit rien ; `public/` = livré ;
un proto est supprimé au commit qui livre ; un one-off est daté et supprimé après exécution ;
un brouillon vit dans le scratchpad ; toute nouvelle commande de vérification passe par `npm run`.
Et la ligne qui manque à `module-index.md` : **sa colonne « fichier » porte le chemin complet**,
puisque le dossier fait désormais partie de l'identité.

---

## 3. Les phases — une par commit, chacune vérifiable et réversible

Chaque phase : `git mv` (jamais supprimer-recréer, l'histoire suit), puis les cinq contrôles :
`npx tsc --noEmit` · `npx vitest run` · `npm run build` + inventaire de l'artefact (0 fichier de
`tools/`) · `grep` des anciens chemins = 0 sur `CLAUDE.md`, `.claude/`, `docs/`, `src/`, `tools/`
ET la mémoire (`~/.claude/projects/…/memory/`) · la porte de merge de chaque surface touchée
(`explorer-quality-battery`, `pulse-render-verify`, `card-harness.html` ouvert et capturé).

| Phase | Périmètre | Risque | Preuve de fin |
|---|---|---|---|
| **0** | Ce document ; règles dans `CLAUDE.md` ; hook + `npm run` écrits mais tolérants (avertissent, ne bloquent pas) | nul | le hook signale l'existant sans le bloquer |
| **1 — racine et morts évidents** | supprimer `1`, `repo_snapshot.txt`, `src/layouts/astro`, `scripts/_tmp-*` ; `data/ref/`, `data/samples/`, `data/shots/` ; `tools/python/` ; réécrire `README.md` (le produit, pas l'init) | faible : 6 scripts lisent `shots/`, 2 lisent les CSV | build + vitest + les 6 scripts relancés |
| **2 — `tools/`** | protos, harnais, générateurs, batteries, one-offs, build ; réécriture des `src=` dans les HTML et des `../public/` dans les `.ts` ; `launch.json` ; `strip-protos` → tripwire ; `package.json` ; **réécriture des 49 chemins cités** (docs, skills, CLAUDE.md, mémoire) | moyen : c'est la phase qui touche les portes de vérification | serveur statique racine : `card-harness.html` capturé ; `explorer-quality-battery` verte ; `pulse-render-verify` vert ; grep anciens chemins = 0 |
| **3 — `docs/` étagères** | `audits/`, `catalog/`, `site/`, `archive/` ; le `.sql` orphelin dans `dbt-handoff/` ; `perimetre-client-prototype.html` vers `tools/proto/archive/` ; qualifier `plateforme-copie-brief.md` ; § « Place » dans `docs/README.md` ; `head -1 docs/*.md docs/*/*.md` devient l'index | faible : `data-model-index.md` et `vue-equipe-slack-spec.md` citent des chemins de `docs/` | `head -1` lisible en deux blocs (vivant / instantanés) ; grep = 0 |
| **4 — tests, une convention** | `src/client/*.test.ts` → `tests/` ; `__tests__/` co-localisé ; `scripts/*.spec.ts` → `tests/` ; `vitest.config.ts` porte `include` explicite | faible | `vitest run` : même nombre de tests avant/après (54), même verts |
| **5 — morts dans `src/`** | un commit par famille, chacun avec sa preuve (0 importeur ; pour `api/legacy/`, 0 hit sur 30 j dans les logs Vercel) : `src/scripts/` ×5, `insightmarketing/prompt.astro`, `public/kpi.js`, `lib/ai/impact_rules/`, `packagerUiV3Prompt.ts`, `docs/terminal/`, protos dépassés (`-v2` quand `-v3` existe) ; lignes `module-index.md` retirées dans le même commit | moyen : « 0 importeur » se prouve, « 0 usage » d'une route se mesure | tsc + build + gates ; `module-index` sans ligne orpheline |
| **6 — `src/lib` par domaine** | sur go owner ; un domaine par commit (commitments, dispositifs, explorer/résolveur, kpi/poles…) ; réécriture d'imports par outil, jamais à la main | élevé en volume, nul en comportement si tsc est vert | tsc + vitest + les batteries ; `module-index` réécrit avec les chemins complets |
| **7 — `public/js/`** (optionnelle) | les 11 libs runtime ; 16 surfaces consommatrices (15 pages + `BaseLayout.astro`) ; cache-busters remis à `?v=1` | touche les URL de prod | build + parcours des 15 pages sur f10c3e58 |

Phases 1 à 4 se font en une session. Les phases 5, 6 et 7 sont chacune un go owner distinct.

Hors dépôt mais à traiter au passage : `.claude/worktrees/` contient 8 worktrees, 4 en HEAD détaché,
chacun une copie complète de `src/` (déjà exclus de vitest). `git worktree list` puis `git worktree
remove` sur ceux dont la session est finie — jamais sans avoir vérifié qu'aucune session ne tourne.

---

## 4. Décisions owner — tranchées le 04/09/2026

| # | Question | Décision owner |
|---|---|---|
| 1 | Nom du dossier d'outillage | **`tools/`** |
| 2 | Protos dépassés | **supprimer** (git garde l'histoire, `docs/` porte l'arbitrage) ; pas de `tools/proto/archive/` |
| 3 | `docs/features/`, `docs/terminal/` | supprimer `terminal/` ; relire `features/`, convertir ce qui est vrai, supprimer le reste |
| 4 | Phase 6 (`src/lib` par domaine) | **maintenant**, un domaine par commit |
| 5 | Phase 7 (`public/js/`) | **faire**, en dernier |

**Contrainte owner ajoutée le 04/09 : tout fichier de seed ou de jeu de données se CONSERVE.**
`communes_full.json`, `city_map.csv`, `communes_coords.csv`, `departments_map.csv`, `sample-data/`,
`python/*.csv` sont déplacés vers `data/`, jamais supprimés.

**Exécution.** Les phases se font dans un worktree dédié (branche `claude/organisation-depot`),
pas dans le checkout principal : au 04/09 07:30 une autre session y édite en direct
`api/insight/prompt.ts`, `lib/ai/resolver.ts`, `lib/semanticRegistry.ts`, `lib/entityReading.ts`,
`tools/battery/prompt-conversation-battery.mjs`, `docs/module-index.md` — des fichiers que les phases 2
et 6 déplacent. La fusion dans `dev` se fait APRÈS le commit de cette session ; les renommages
se résolvent par détection de renommage git. Les chemins cités dans la mémoire
(`~/.claude/projects/…/memory/`) se réécrivent au moment de la fusion, pas avant.

### Historique de la question (avant décision)

1. **Le nom du dossier d'outillage** : `tools/` (recommandé, lisible par quiconque ouvre le dépôt)
   ou `dev/`.
2. **Protos dépassés : supprimer ou archiver.** Recommandé : supprimer (git garde tout, et
   `docs/` porte l'arbitrage) ; `tools/proto/archive/` seulement pour les pistes REFUSÉES qu'on
   veut pouvoir rouvrir — à dire proto par proto sur la liste des 45.
3. **`docs/features/` et `docs/terminal/`** : archiver ou supprimer. Recommandé : supprimer
   `terminal/` (logs de 2025), relire `features/` (4 docs anglais de juillet) et convertir ce qui est
   encore vrai en `— DÉFINITIF`, supprimer le reste.
4. **Phase 6 (`src/lib` par domaine)** : maintenant, ou seulement pour les nouveaux fichiers avec
   déplacement au fur et à mesure. Recommandé : maintenant, un domaine par commit — un état mixte
   qui dure est exactement ce qu'on corrige.
5. **Phase 7 (`public/js/`)** : la seule phase qui touche des URL de prod. Recommandé : la faire,
   en dernier, dans une fenêtre où l'owner peut parcourir les 12 pages.
