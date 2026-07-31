# PASSATION — la carte du périmètre ne s'affiche pas dans Pulse

> Rédigé le 31/07/2026 par la session précédente, qui n'a pas résolu le problème.
> Ce document dit ce qui est **prouvé**, ce qui ne l'est **pas**, et où chercher.

---

## 1. Le problème, en une phrase

Une carte `competition_proximity` doit afficher, à la place de son motif d'absence,
une question au format :

```
Pour chiffrer ce que cette concurrence vous coûte, une seule chose manque :
la plupart de vos clients viennent-ils de votre commune, ou de plus loin ?
   ⟨ De ma commune ⟩   ⟨ De plus loin, ils se déplacent ⟩
Votre réponse fixe le périmètre sur lequel on mesure — une seule fois, pour toutes vos cartes.
```

**Elle ne s'affiche pas.** Après huit tentatives de correction, aucun changement visible
dans la copie locale de l'owner, serveur redémarré, sur le compte `f10c3e58` (Muse Square).

---

## 2. Ce qui est PROUVÉ (ne pas re-vérifier, c'est mesuré)

| fait | preuve |
|---|---|
| La carte existe en base | `semantic.vw_insight_event_action_candidates`, `location_id=f10c3e58`, `date=CURRENT_DATE()` : 16 cartes dont `competition_proximity` (priorité 3) |
| Son payload porte le périmètre | `events_catchment`, `catchment_label`, `events_catchment_same_sector` — 36/36 lignes. Mart reconstruit le 31/07 à 08:21:28 |
| Le registre pose le drapeau | `enjeuWithReasonForCandidate` renvoie `needs_catchment: true` pour `competition_proximity` et **seulement** pour lui (1 sur 16 types testés) |
| `monitor.ts` le transmet | ligne ~984, dans le même objet que `action_type` et `data_payload` |
| Le drapeau survit à `renderActionCandidates` | **Testé en exécutant réellement `public/action-cards.js` dans un contexte Node vm**, alimenté par les 16 vraies cartes : 16 entries rendues, 1 porte `needs_catchment=true`, `alert_level=3`, `data_payload.events_catchment=7` |

**Le harnais qui a produit la dernière preuve** (à reconstruire, il n'a pas été conservé) :
charger `public/action-cards.js` via `vm.runInContext` avec un `sandbox` minimal
(`window`, `document.addEventListener`, `document.querySelectorAll`), lire les cartes
dans la vue sémantique, les transformer **exactement** comme `monitor.ts` le fait
(date aplatie via `?.value`, `data_payload` parsé, `needs_catchment` posé), puis appeler
`sandbox.window.renderActionCandidates(cands, {}, {}, today, 'veille', {}, today)`.

---

## 3. Ce qui n'est PAS prouvé — c'est là qu'il faut chercher

**Aucun test n'a été fait au-delà de `renderActionCandidates`.** La chaîne restante :

```
renderActionCandidates  →  candidates (pulse.astro:1484)
                        →  passe « PÉRIMÈTRE PASS » (pulse.astro, ~1584)   ← jamais testée
                        →  top[]
                        →  cardsHtml = top.map(...)                         ← jamais testée
                        →  buildMetricsStrip(entry, currentDay)             ← jamais testée
                        →  HTML rendu                                       ← jamais observé
```

### Indice fort, non exploité

Dans le rendu de l'owner, l'en-tête d'un site annonce **« Muse Square 8 actions »**
alors que **3 cartes seulement sont visibles**. Si la sélection produit bien 8 entrées
et que 3 s'affichent, le blocage est **dans le rendu ou un repli (« pli »)**, pas dans
la sélection — et toutes les corrections faites jusqu'ici portaient sur la sélection.

**À faire en premier** : déterminer d'où vient le nombre « 8 actions » et pourquoi
5 entrées ne sont pas rendues. C'est la piste la moins explorée et la plus probable.

### Autres suspects, par ordre

1. **La passe réservée ne s'exécute pas** — vérifier qu'elle est bien atteinte
   (un `console.log` dans la passe, ou `window.__msDbg`).
2. **`buildMetricsStrip` reçoit un `entry.item` sans le drapeau** — la fonction lit
   `a.needs_catchment === true` où `a = entry.item`.
3. **Le cache navigateur** — `public/action-cards.js` est statique, mis en cache par
   `?v=`. Passé de v36 à **v37** sur les 4 surfaces. Vérifier dans l'onglet Réseau
   que `action-cards.js?v=37` est bien chargé, et non une version en cache.
4. **Le HTML est produit mais invisible** — le bloc `.ms-catchment-ask` est injecté
   dans une liste de « pills » (`pills.unshift(...)`) ; un conteneur en `flex` ou
   `overflow:hidden` pourrait l'écraser. **Chercher `ms-catchment-ask` dans le DOM
   avant de conclure qu'il n'est pas généré.**

---

## 4. Méthode de travail — les règles violées ici, à ne pas re-violer

`CLAUDE.md` à la racine fait foi. Les quatre pièges dans lesquels la session précédente
est tombée, tous documentés d'avance :

1. **Tracer la chaîne DEPUIS LE CONSOMMATEUR, pas depuis ce qu'on modifie.**
   § Data Path. J'ai vérifié le mart alors que l'app lit une vue sémantique ; puis la
   vue alors que `pulse` lit `renderActionCandidates`. Chaque fois j'ai validé la couche
   que je venais d'écrire.
2. **Recenser mécaniquement, ne pas greper une chaîne.** J'ai audité 2 blocs
   `to_json_string` sur **54** parce que j'avais grepé `events_within_500m_count`.
3. **Le checkout dbt local retarde sur dbt Cloud.** `~/Documents/ms_database/ms_dbt` —
   faire `git fetch && git merge --ff-only origin/Ajuria-branch` **avant** toute
   instruction. Les éditions non commitées de l'IDE restent invisibles : demander.
4. **Vérifier par le comportement, jamais par `tsc`/`node --check`.** Et sur des
   **données réelles** : 4 des 5 comptes sont des jeux Kaggle (même fenêtre
   03/04→30/09, ~50 000 lignes). **Le seul compte réel est Les Olivades** (6 297 lignes,
   28/08/2025→27/07/2026).

**Contrainte forte** : l'app est protégée par Clerk, l'assistant ne peut pas ouvrir Pulse
authentifié. Toute vérification passe par (a) BigQuery, (b) l'exécution du vrai code JS
hors navigateur (le harnais vm ci-dessus), (c) l'owner. Ne jamais annoncer « vérifié »
sans l'une des trois.

**L'owner exige** : instructions `REMPLACER ceci PAR cela` byte-exactes avec le **nom du
fichier en tête**, aucune supposition, et l'action à faire **en première ligne** de la
réponse.

---

## 5. Fichiers et emplacements

### Spécifications (à lire avant de coder)
| fichier | contenu |
|---|---|
| `docs/perimetre-client-spec.md` | la décision produit : question déclarative, 1 km / 20 km, aucun repli automatique, mesures à l'appui |
| `docs/perimetre-client-chantier.md` | les 5 étages, tous livrés, avec les corrections apportées en route |
| `docs/competition-split-spec.md` | cannibalisation vs entraînement — le 5 km est HORS périmètre |
| `docs/card-truth-audit.md` | l'audit de vérité des cartes |
| `docs/module-index.md` | index de tout le code (endpoints, libs, scripts) — SST |
| `docs/data-model-index.md` + `docs/bq-catalog.json` | index des modèles dbt + catalogue BQ |
| `CLAUDE.md` | méthode de travail, non négociable |

### Code applicatif (dépôt `Ajuria/muse-square`, branche `dev`)
| fichier | rôle dans ce chantier |
|---|---|
| `src/lib/dayClassRegistry.ts` | pose `needs_catchment` ; `CATCHMENT_DEPENDENT_TYPES` ; lit `client_catchment` via `dateResolutionQuery` (zéro aller-retour ajouté) |
| `src/pages/api/insight/monitor.ts` ~984 | transmet le drapeau au client |
| `public/action-cards.js` ~2216 | **LISTE BLANCHE** — tout champ absent de cet objet `item` n'existe pas pour `pulse` |
| `src/pages/app/insightevent/pulse.astro` | « PÉRIMÈTRE PASS » (place réservée) + rendu de la question dans `buildMetricsStrip` + gestionnaire de clic en fin de fichier |
| `src/pages/api/profile/set-catchment.ts` | endpoint d'écriture, `commune` \| `beyond` strictement |
| `src/pages/profile.astro` | le même choix dans le formulaire de profil |
| `src/pages/app/insightevent/insight.astro` ~312 | page de détail, bascule sur `catchment_label` |

### Modèles dbt (dépôt `Ajuria/cda_dbt`, branche `Ajuria-branch`, local `~/Documents/ms_database/ms_dbt`)
| modèle | rôle |
|---|---|
| `mart/fct_location_events_radius_daily` | porte la bande **20 km** |
| `mart/fct_location_events_topn_daily` | `top_events_20km`, `radius_precedence` 1→6 |
| `mart/fct_location_context_daily` | propage `client_catchment` (lu par le registre) |
| `mart/fct_location_daily_action_candidates` | `events_within_catchment_count`, `catchment_label_fr`, `events_within_catchment_same_bucket_count` |
| `dims/dim_client_location` | colonne `client_catchment` |

**Attention** : dans l'IDE dbt Cloud, « Preview » n'écrit rien. Seul « Run » matérialise.
Vérifier avec `creation_time` dans `INFORMATION_SCHEMA.TABLES`.

---

## 6. État des données

- `client_catchment` = **NULL sur les 32 lieux** — personne n'a encore répondu. C'est
  l'état attendu, et c'est ce qui doit faire apparaître la question.
- `competition_proximity` et `high_competition_density` sont les **seules** cartes dont
  le contenu dépend du périmètre (recensement mécanique : 2 blocs sur 54).
- `same_bucket_saturation` est à 5 km : **hors périmètre**, ne doit PAS porter la question.

---

## 7. Commits de cette session, si un retour arrière est souhaité

Du plus ancien au plus récent, sur `dev` :

```
4e35f79  perf(dayContext): action_commitments amorcée en tête
ec69710  feat(perimetre): étages 1.2 + 1.3 — endpoint + formulaire
bf72ef0  feat(perimetre): étage 2 — le registre lit le périmètre
4f86360  feat(perimetre): étage 4 — la question sur la carte
7c491dc  fix(cartes): retrait des 7 mappings concurrent
d184bf3  feat(perimetre): place réservée
404d1b4  docs(perimetre): le tri en deux temps
f86d9d9  fix(perimetre): needs_catchment restreint à 2 types
5feb2ba  feat(perimetre): insight.astro bascule sur catchment_label
0129f08  fix(perimetre): needs_catchment dans la liste blanche + cache-buster v37
```

**Les seuls qui touchent l'affichage de la question** : `4f86360`, `d184bf3`, `f86d9d9`,
`0129f08`. Les autres sont indépendants et fonctionnels (`7c491dc` corrige un défaut réel
et vérifié ; `4e35f79` fait partie du travail de performance mesuré : chemin de page
2 903 ms → ~1 200 ms de médiane, 0 dépassement du budget de 3 s sur 21 mesures).

**Aucune régression n'a été constatée** sur les fonctionnalités existantes — chaque commit
a comparé sa sortie à celle de `HEAD` — mais cela n'a jamais été confirmé dans le navigateur
par l'owner. À vérifier avant de faire confiance à cette affirmation.
