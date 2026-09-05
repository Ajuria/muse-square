# Muse Square — l'application

Astro SSR + TypeScript, déployé sur Vercel ; données dans BigQuery EU (`muse-square-open-data`) ;
modèles dbt dans le dépôt voisin `ms_database`. Les règles de travail sont dans `CLAUDE.md`,
l'intention du produit dans `docs/intent.md`.

## Le dépôt

| Dossier | Livré en prod | Contenu |
|---|---|---|
| `src/` | oui | pages, API, libs (rangées par domaine sous `src/lib/`) |
| `public/` | oui | UNIQUEMENT ce qui doit être servi : libs runtime, fonts, icônes, images, vendor |
| `tools/` | non | outillage de dev, un sous-dossier par durée de vie : `proto/`, `harness/`, `battery/`, `generators/`, `oneoff/`, `build/`, `python/` |
| `data/` | non | `ref/` données de référence et seeds, `samples/` échantillons, `shots/` captures de run |
| `tests/` | non | tests dont le sujet n'est pas dans `src/` (les tests de `src/` sont co-localisés) |
| `docs/` | non | documents vivants à la racine ; `audits/`, `dbt-handoff/`, `catalog/`, `site/` |
| `content/` | oui | pages marketing |

La règle complète : `CLAUDE.md` § Placement des fichiers ; l'état et l'historique :
`docs/organisation-depot.md`.

## Commandes

```
npm run dev               # serveur de dev, port 4321
npm run build             # build + tripwire : échoue si un fichier d'outillage atteint l'artefact
npm run test:run          # vitest — tests co-localisés dans src/ + tests/
npm run gate              # porte de merge permanente : lie-bait (contrats + honestAbsence)
npm run battery:explorer  # batterie Explorer (dev server sur 4321 requis)
npm run battery:prompt    # batterie conversation (idem)
npm run harness           # serveur statique enraciné ici, port 4173 : /tools/harness/*.html, /tools/proto/*.html
npm run placement:check   # chaque fichier suivi est à sa place (CLAUDE.md § Placement)
```
