# POST-MORTEM — la carte du périmètre ne s'affichait pas dans Pulse

> **RÉSOLU le 31/07/2026.** Ce document était une passation rédigée par la session qui n'avait pas
> résolu le problème. Il est conservé pour ses leçons, mais **il contenait une affirmation fausse
> présentée comme prouvée** — corrigée ci-dessous. Ne pas le lire comme un état des lieux : l'état
> du chantier vit dans `docs/perimetre-client-chantier.md`.

---

## ⚠️ CE QUE CE DOCUMENT AFFIRMAIT À TORT

La passation listait, dans un tableau intitulé « Ce qui est PROUVÉ (ne pas re-vérifier, c'est
mesuré) », la ligne :

> | Le registre pose le drapeau | `enjeuWithReasonForCandidate` renvoie `needs_catchment: true`
> pour `competition_proximity` et **seulement** pour lui |

**C'était faux — et du genre de faux le plus coûteux : une observation exacte dont on tire la
conclusion inverse.** Le drapeau sortait bien à `true`, mais **parce que la lecture du périmètre
était cassée**, pas parce qu'elle fonctionnait.

`dateResolutionQuery` lisait `c.client_catchment` sur `mart.fct_location_context_daily`, **où la
colonne n'existe pas** (49 colonnes, vérifié live). La requête échouait en entier, son
`.catch(() => [])` avalait l'erreur, et `clientCatchment` valait donc **toujours `null`** — d'où un
`needs_catchment` **toujours** `true`. La couche n'était pas saine : elle était incapable de rendre
autre chose, et **répondre à la question n'aurait jamais pu l'éteindre**.

En le déclarant « prouvé, ne pas re-vérifier », la passation a interdit à la session suivante
d'aller voir précisément là où était le défaut.

**Dégât collatéral**, invisible depuis cette ligne : la même requête portait aussi `conditionByDate`
et `calendarByDate`. Mesuré sur `f10c3e58` avant correctif : **0 et 0** — la résolution météo et
calendrier par date était morte **pour toutes les cartes**, ce qui explique les cartes météo
affichant « motif non séparable » au lieu d'un montant. Introduit par `4f86360`, jamais parti en
prod.

**Correctif** (`2c07b5b`) : les deux requêtes du registre lisent `dims.dim_client_location` (grain
vérifié, 32 lignes / 32 lieux). `conditionByDate` **0 → 7**, `calendarByDate` **0 → 7**,
`events_high` identique à l'avant-correctif. Aller-retour prouvé sur `f10c3e58` : `null → true`,
`beyond → false`, `commune → false`.

---

## Ce qui bloquait réellement l'affichage

**Le repli du triage, jamais testé.** `buildTriageLayout` re-trie les cartes du DOM par
`(horizon, |enjeu|)` et **replie tout au-delà du rang 3** (`display:none`). La carte périmètre n'a
pas d'enjeu — c'est sa définition — donc `data-t-e = 0` la renvoyait en fin de son groupe.

Mesuré en exécutant le vrai `action-cards.js` puis le vrai bloc de sélection sur les 16 cartes du
jour : **8 cartes pour le site, `competition_proximity` au rang 3 — le premier rang replié.**
`buildMetricsStrip` produisait bien `.ms-catchment-ask` avec le bon `location_id` : **le bloc était
caché, pas absent.**

Les huit correctifs précédents portaient tous sur la **sélection**. Le blocage était dans le
**rendu**.

### L'indice qui a tout résolu, et qui était dans la passation

L'en-tête annonçait « **Muse Square 8 actions** » alors que **3 cartes** étaient visibles. La
passation le signalait comme « la piste la moins explorée et la plus probable » — elle avait raison.
Le harnais a reproduit exactement 8, ce qui a validé la reconstitution avant même de chercher le
défaut.

---

## Les quatre pièges — la partie de ce document qui garde sa valeur

1. **Tracer la chaîne DEPUIS LE CONSOMMATEUR, pas depuis ce qu'on modifie.** Chaque fois, la session
   validait la couche qu'elle venait d'écrire : le mart alors que l'app lit une vue, puis la vue
   alors que `pulse` lit `renderActionCandidates`.
2. **Recenser mécaniquement, ne pas greper une chaîne.** 2 blocs `to_json_string` audités sur 54.
   *(Corollaire ajouté depuis : `git log -S` dit qu'un compte d'occurrences a CHANGÉ, jamais dans
   quel sens. Lire le contenu aux deux commits avant de conclure.)*
3. **Le checkout dbt local retarde sur dbt Cloud.** `git fetch && git merge --ff-only` avant toute
   instruction ; les éditions non commitées de l'IDE restent invisibles — demander.
4. **Vérifier par le comportement, jamais par `tsc` / `node --check`**, et sur des **données
   réelles** (4 des 5 comptes sont des jeux Kaggle ; le seul compte réel est Les Olivades).

**Un cinquième, né de ce post-mortem** — il est désormais dans `CLAUDE.md` : *quand tu modifies une
fonction, teste TOUTES ses sorties, pas seulement celle que tu ajoutes.* Le commit fautif avait
comparé sa sortie à `HEAD` et conclu « aucune régression » : il n'avait comparé que le drapeau qu'il
ajoutait, pas les deux autres valeurs rendues par la même requête.

---

## Contrainte de vérification, toujours valable

L'app est protégée par Clerk : l'assistant ne peut pas ouvrir Pulse authentifié. Toute vérification
passe par **(a)** BigQuery, **(b)** l'exécution du vrai code JS hors navigateur — charger
`public/action-cards.js` via `vm.runInContext` avec un `sandbox` minimal, l'alimenter avec les
vraies cartes de la vue sémantique transformées **exactement** comme `monitor.ts` le fait, puis
extraire et exécuter les blocs de `pulse.astro` **byte-exacts** — ou **(c)** l'owner. Ne jamais
annoncer « vérifié » sans l'une des trois.

---

## Où lire la suite

| | |
|---|---|
| État du chantier, arbitrages, ce qui reste | `docs/perimetre-client-chantier.md` |
| Décisions produit (question déclarative, 1 km / 20 km, aucun repli) | `docs/perimetre-client-spec.md` |
| Méthode de travail | `CLAUDE.md` |

Commits de la résolution, sur `dev` : `2c07b5b` (registre), `bdbc73e` (rendu + option B),
`6b40e4d` (docs).
