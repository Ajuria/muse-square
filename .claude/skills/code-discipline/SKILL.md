---
name: code-discipline
description: Discipline de code Muse Square pour SQL/BigQuery, dbt/YAML, TypeScript/Astro, JS inline (action-cards, card-kit) et Python. Utiliser cette compétence AVANT d'écrire ou modifier la moindre requête, modèle dbt, endpoint, script client, test ou config — même un one-liner, même « juste ajouter une colonne » — et avant tout diagnostic (« pourquoi X ne s'affiche pas », « ce chiffre est faux », « c'est cassé »). Porte les portes de vérification par langage : schéma prouvé avant requête, modèle dbt lu avant spec, sortie tracée avant « done », passation vérifiée avant « allez voir ».
---

# code-discipline

Chaque porte vient d'un échec réel, daté dans CLAUDE.md. La règle générale : **ne jamais
conclure de la sortie d'un outil sans avoir vérifié qu'il a tourné et répondu à la question
posée.** Une sortie vide peut être une commande qui a échoué ; une sortie tronquée n'est pas
une absence (contrôler sur un témoin connu) ; un compte qui change ne dit pas dans quel sens.

## Portes universelles (tout langage)

- **SINGLE SOURCE OF TRUTH avant de créer.** Avant tout nouvel endpoint, module lib, script
  client ou modèle dbt : grep `docs/module-index.md` (code) et `docs/data-model-index.md`
  (dbt, + `docs/catalog/bq-catalog.json` en snapshot) pour la capacité visée — étendre l'existant,
  jamais forker. Quand un fichier change de handlers ou de sources, sa ligne d'index se met
  à jour dans le MÊME commit.
- **Zéro nom deviné.** Toute colonne, table, champ, id, suffixe d'UUID se vérifie dans le
  code ou le schéma avant d'être écrit — y compris dans les requêtes de VÉRIFICATION
  (copier l'id d'une sortie précédente, ou `STARTS_WITH`, jamais un suffixe de mémoire).
- **Lire le fichier avant d'écrire.** Énoncer les correspondances de champs avant de coder.
- **Diagnostic avant fix**, trois gestes : identité par la CLÉ (jamais un libellé) ;
  référentiel de chaque nombre établi avant de comparer (ratio ≠ %, CP ≠ INSEE) ; modèle
  producteur lu. Un défaut annoncé à tort coûte à l'owner le travail de réfuter.
- **Une fonction par commit.** ADD, don't REPLACE : ne jamais retirer ou restyler du contenu
  approuvé en passant. Ne jamais supprimer une ancienne fonction avant que sa remplaçante
  soit testée.
- **Fonction modifiée = TOUTES ses sorties testées** avant/après sur données réelles, pas
  seulement celle qu'on ajoute (cas `dateResolutionQuery` : un `.catch(() => [])` a tué la
  résolution météo de toutes les cartes pendant une semaine).
- **Un test vert ne prouve rien tant qu'on ne l'a pas vu tomber** (casser, voir rouge,
  remettre). Un test rouge s'instruit ou se supprime — jamais se contourne.
- **Tout se vérifie contre LE compte réel** : Muse Square,
  `location_id f10c3e58-326e-4e38-947c-d59fcbe51df5`, et l'URL de carte exacte de l'owner.
  Jamais un autre compte démo.
- Chaque chiffre livré porte sa requête et sa fenêtre réelle.

## SQL / BigQuery

- Invoquer la compétence `bq-verify` avant toute requête : schéma réel via
  `INFORMATION_SCHEMA`, échantillon, fraîcheur. Projet `muse-square-open-data` (EU)
  seulement — `ms-database-472505` est facturation.
- Casts `DATE()` explicites — le client Node rend 0 ligne en silence sur un mismatch
  DATE/STRING.
- « On n'a pas X » exige la recherche sur `semantic` + `mart` + `intermediate` — jamais
  le schéma d'une seule table.
- `bq query` tronque l'affichage sans le dire : passer `--max_rows` et contrôler la liste
  sur un témoin connu.
- Vérifier la fenêtre RÉELLE des données avant d'écrire « mesuré sur N jours »
  (`COUNT(DISTINCT date)`, pas le filtre).

## dbt / YAML

- Tout travail dbt passe par dbt Cloud IDE — jamais le CLI. L'IDE écrit en PRODUCTION
  (`muse-square-open-data.mart`), et ses changements sont locaux jusqu'au sync explicite.
- **LIRE le fichier modèle** (`~/Documents/ms_database/ms_dbt/models/…`) — en-tête, grain,
  WHERE — avant toute spec ou requête. Un schéma + une ligne d'échantillon ne disent rien
  de l'intention. Ne jamais reconstruire un modèle depuis le SQL compilé BQ.
- Un `{{ ref() }}` dans un commentaire SQL (`--`, `/* */`) crée une VRAIE arête de DAG ;
  seuls les commentaires Jinja `{# #}` sont ignorés.
- Incrémental : les nouvelles colonnes n'arrivent qu'avec `--full-refresh`. Le job Cloud
  n'est pas un run complet et ne tire pas les ancêtres — vérifier dans l'historique de runs.
- Aucun fragment livré sans exécution BQ du SQL compilé ; base de diff =
  `git show origin/main:<chemin>` (ou la branche owner), jamais le checkout local.
- **Passation « colle ce bloc » = un portail** : première ligne = LE fichier à ouvrir (chemin
  complet — un nom de modèle désigne deux fichiers) ; générer depuis la branche de l'owner ;
  fins de ligne vérifiées (`file <chemin>`) ; geste REJOUÉ par programme et sortie relue
  (« le YAML parse » ne prouve rien) ; version dbt lue avant d'en écrire la syntaxe ; UN
  geste prouvé plutôt que 19 opérations manuelles ; message de commit fourni d'office.

## TypeScript / Astro / JS inline

- `.ts` → `npx tsc --noEmit` ; scripts inline `.astro` et `public/*.js` → `node --check`
  (extraire le `<script>`). Syntaxe seulement : « done » = sortie réelle tracée (requête de
  l'endpoint + rendu confirmé sur `f10c3e58`).
- Le rendu se prouve au HARNAIS, pas à l'œil : `tools/harness/card-harness.html` pour
  `card-kit.js` et les réponses Consulter ; harnais `vm` (bytes exacts de `pulse.astro` +
  `action-cards.js`) pour Pulse. Le harnais EST la page.
- `public/action-cards.js` est statique mais cache-busté par `?v=` — bump sur les surfaces
  consommatrices + hard-refresh. Astro dev ne recharge pas les routes API `.ts` : restart
  du serveur après édition serveur.
- HTML injecté dynamiquement = styles inline (les `<style>` scopés ne l'atteignent pas).
  Tokens de `src/styles/design-tokens.css`, jamais de couleur inventée.
- Pas d'emoji dans les scripts inline (échappements unicode via un pass python construisant
  `chr(92)`), pas de template literals imbriqués dans `.map()`.
- Aucune dépendance CDN pour le formatage/UX : self-host ou dégrader proprement.
- **France** : dates affichées `JJ/MM/AAAA` (ISO en interne seulement), `frDec`/`frInt`
  pour les nombres, aucune chaîne visible sans passer par `docs/lexique.md` (compétence
  `marketing-copy` pour l'extérieur, règles 1-13 pour l'app).
- **Budget 3 s par page, MESURÉ jamais déduit** (`npx tsx` + `Date.now()` par phase). Toute
  lenteur se compte en allers-retours BigQuery séquentiels (~500 ms nu) : amorcer tôt sans
  `await`, attendre en place ; prouver l'indépendance avant de fusionner deux vagues.
- Diagnostic d'affichage : compétence `trace-data-path` — tracer BQ → API → fetch → rendu
  avant tout fix. Grounding : la suite lie-bait
  (`npx vitest run src/lib/ai/contracts/ src/lib/ai/honestAbsence.test.ts`) est la porte de
  merge de tout changement validator/prompts.

## Python

- Fichiers temporaires dans le scratchpad de session, jamais `/tmp` ni le repo.
- Un script d'analyse rend ses chiffres AVEC la requête/fenêtre qui les produit.

## Docs (`docs/*.md`)

- **Le titre dit la nature, le corps dit l'ÉTAT** : tout doc se termine par `— DÉFINITIF`
  (ce qui est) ou `— SPEC DE TRAVAIL` (ce qui reste à faire) ; `head -1 docs/*.md` est
  l'index. Ce qui est appliqué s'écrit au PRÉSENT — jamais « remplacer X par Y » (un grep
  tombe sur le X et repart avec la valeur périmée). Une spec dont la dernière instruction
  est appliquée se RÉÉCRIT en définitif, en re-vérifiant chaque affirmation gardée — elle
  ne se marque pas « terminé ».
- Avant toute liste de priorités sur des cartes : ouvrir `docs/audits/card-truth-audit.md` et
  CITER son verdict. Le volume de tirs n'est pas un critère — c'est souvent le symptôme
  inverse.

## Aiguillage vers les compétences sœurs

Chaîne visible par l'utilisateur → `docs/lexique.md` (app) ou compétence `marketing-copy`
(extérieur). Carte d'action → `card-review`. UI Pulse/Monitor/Insight → `pulse-ui`.
Requête BQ → `bq-verify`. Diagnostic d'affichage → `trace-data-path`.

## Git & passation

- `git status` avant commit ; fichiers stagés explicitement, jamais `git add .` ; push sur
  `dev` seulement. dev→prod : `--ff-only` en garde, `--no-ff` pour le merge, jamais de squash.
- **Passation « allez voir la page »** : `lsof -nP -iTCP:4321 -sTCP:LISTEN` (un process plus
  vieux que la dernière édition = zombie → kill + restart) puis `curl` d'une empreinte du
  nouveau code sur LE port owner (4321). Jamais de port éphémère.
