# Organisation du dépôt — dossiers, fichiers, cycle de vie — DÉFINITIF

Sert : `CLAUDE.md` § Placement des fichiers (les règles) et `docs/README.md` § La place (les documents).
L'état d'AVANT est un instantané : `docs/audits/organisation-depot-audit-2026-09-04.md`.

**État : rangement APPLIQUÉ, fusionné dans `dev` le 05/09/2026 (`73d2cde`, 8 phases, 17 commits + fusion).**
Vérifié à la fusion : tsc 0 · vitest 62 fichiers / 467 tests · `npm run build` vert (304 fichiers dans
l'artefact, aucun outillage) · `npm run placement:check` OK sur 784 fichiers suivis · mémoire de session
réécrite (44 fichiers, 265 renommages).

---

## Le principe : la PLACE dit si c'est livré, et pour combien de temps

Un dossier répond à deux questions, et le nom du fichier n'en répond à aucune :

1. **Est-ce livré en prod ?** `src/` et `public/` : oui. Tout le reste : non.
2. **Combien de temps ça vit ?** Un dossier par durée de vie — permanent (`src/`, `public/`,
   `docs/` vivant), tant que la surface existe (`tools/harness/`), jusqu'à l'arbitrage owner
   (`tools/proto/`), une fois (`tools/oneoff/`), instantané (`docs/audits/`).

## L'arborescence

```
muse-square/
├── CLAUDE.md  README.md  package.json  astro.config.mjs  tailwind.config.cjs  tsconfig.json  vitest.config.ts
│   (la racine ne porte QUE la configuration et les deux README ; aucune donnée, aucun script)
│
├── src/                       LIVRÉ — le code Astro
│   ├── pages/  components/  layouts/  styles/         (inchangés)
│   ├── lib/                   regroupé par DOMAINE :
│   │   ├── ai/                (grounding, packagers, résolveur — inchangé)
│   │   ├── commitments/  dispositifs/  explorer/  kpi/  events/  sensitivity/  context/  recos/  bestInClass/  profile/  channels/  competitive/  dates/  fr/  import/  insightFamilies/
│   │   └── *.ts               ce qui ne relève d'aucun domaine (bq.ts, scope.ts, rate-limit.ts, error-logger.ts…)
│   └── (src/scripts/ et src/client/ n'existent plus)
│
├── public/                    LIVRÉ — uniquement ce qui doit être servi
│   ├── js/                    les 11 libs runtime + ie-prompt.js — UN dossier client
│   ├── fonts/  icons/  images/  vendor/  docs/
│   └── favicon*  robots.txt
│
├── tools/                     NON LIVRÉ — tout l'outillage de développement
│   ├── proto/                 prototypes HTML + leurs `-data.js`, UN fichier par piste EN ATTENTE d'arbitrage
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
│   └── archive/               features/ (4 as-built anglais, juillet) — à convertir ou supprimer (owner)
│
└── content/                   (inchangé)
```

## `public/` ne contient QUE du livré — et le build le PROUVE

- `tools/proto/` et `tools/harness/` sont servis en dev par un serveur statique enraciné à la
  RACINE du dépôt (`.claude/launch.json` : `--directory .`), pas dans `public/`. Les pages de
  harnais chargent les libs runtime par `/public/card-kit.js` et leurs données par un chemin
  relatif (`./x-proto-data.js`). Ce sont les seules réécritures dans les HTML.
- `strip-protos.mjs` cesse de purger : il **échoue** si l'artefact de build contient un fichier au
  motif, ou n'importe quoi hors de la liste blanche de `public/`. Une purge silencieuse masque le
  défaut ; un tripwire le montre.
- Les générateurs (`tools/generators/`) écrivent dans `tools/proto/`, plus jamais dans `public/`.

## Un cycle de vie par nature de fichier

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

## Les portes qui tiennent la règle dans le temps

Une règle écrite se relit ; une règle exécutée s'applique. Les trois portes :

1. **Le hook pre-commit** (`.claude/hooks/precommit-check.sh` existe déjà) refuse : un fichier
   nouveau à la racine hors liste blanche ; `*-proto*` ou `*-harness*` hors `tools/` ; `_tmp`
   n'importe où ; un `.test.ts` hors co-localisation / `tests/` ; un `.md` dans `docs/` sans
   suffixe de nature.
2. **`npm run`** porte les commandes que la mémoire recopiait : `gate` (lie-bait + batteries),
   `harness` (serveur statique racine), `proto:<nom>` (générateur), `index:check`. Une commande
   qu'on ne peut pas taper depuis `package.json` n'existe pas.
3. **`strip-protos` en tripwire** (2.3) — la prod ne contient rien de `tools/`, prouvé à chaque build.


---

## Décisions owner — tranchées le 04/09/2026

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


---

## Ce qui reste — owner

- **Parcours des 15 pages** de l'app sur f10c3e58 : les URL des libs client ont changé (`/js/<lib>.js`,
  `/js/ie-prompt.js`) — le build et le harnais sont verts, la navigation authentifiée ne l'est que par vous.
- **`src/pages/api/legacy/`** (2 routes, 0 appelant interne) : supprimer après 0 hit dans les logs Vercel.
- **`docs/archive/features/`** (4 as-built anglais, juillet) : convertir ce qui est vrai en `— DÉFINITIF`,
  supprimer le reste — 822 lignes à re-vérifier contre le code.
- **`tools/proto/`, 44 HTML** : la règle veut qu'un proto meure au commit qui livre sa surface ; ceux des
  surfaces déjà livrées sont à trancher un par un.
- **`tools/proto/schema-4-questions.svg`** (session du 04/09) : aucune référence dans `src/`, `content/`,
  `tools/` — rangé avec les protos ; à mettre dans `public/images/` s'il est destiné au site.

## Écarts d'exécution (04/09)

Le garde de placement a été écrit EN DERNIER contre la disposition finale (pas de mode tolérant préalable) ;
les cache-busters `?v=` sont CONSERVÉS (le chemin change, le cache tombe seul, les docs citent ces
numéros) ; `docs/features/` est archivé avec bandeau, pas converti.
