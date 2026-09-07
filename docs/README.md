# Convention des documents — DÉFINITIF

Comment lire et écrire les documents de `docs/`. Cette convention est née d'un défaut mesuré le
26/08/2026 : `competition-split-spec.md` portait, un mois après leur application, des blocs
« Remplacer X par Y ». Un `grep` tombait sur le **X** (l. 81) avant le **Y** (l. 85) et en repartait
avec l'unité périmée — c'est-à-dire avec le bug exact que ce document avait servi à corriger.

Un document qui raconte comment on en est arrivé là tend un piège à son prochain lecteur.

---

## Les deux natures — le mot est dans le titre

Le titre `#` de chaque document se termine par sa nature. `head -1 docs/*.md` donne l'index à jour ;
il n'y a **pas** d'index recopié ici, un index recopié dérive.

### `— DÉFINITIF`

Dit **ce qui est**. Doctrine, définitions, contrats, état d'un modèle. Aucune instruction à
appliquer, aucun « avant/après ». On le lit pour savoir comment le produit fonctionne aujourd'hui.

### `— SPEC DE TRAVAIL`

Dit **ce qui reste à faire**. Contient des instructions, des blocs à appliquer, des arbitrages en
attente. Il est destiné à être consommé, puis converti.

### Le cas des audits et diagnostics

Un audit, un diagnostic, une revue de copie décrivent **un moment**, pas l'état courant. Ils sont
`— DÉFINITIF` (il n'y a rien à y appliquer) et leur **date reste dans le titre** : elle dit que le
document est un instantané. On ne les met jamais à jour — un audit réécrit n'est plus un audit. Si
le constat doit être rejoué, c'est un nouveau document (`card-truth-audit-2026-08-22` à côté de
`card-truth-audit`), et le plus récent cite le précédent.

Corollaire : **ne jamais fonder une décision sur un audit sans re-vérifier ses chiffres**. Ce qu'il
affirme était vrai à sa date, pas aujourd'hui.

---

## Les trois règles

**1. La discipline d'écriture est la même pour les deux natures : écrire l'ÉTAT, jamais le chemin.**
C'est la règle qui désamorce le piège. Dans une spec de travail, ce qui est **déjà appliqué** se
décrit au présent — « le seuil est 25 % » — jamais « remplacer 25 par 0.25 ». Seul ce qui **reste**
à faire s'écrit à l'impératif. Le chemin parcouru vit dans `git log`, qui est fait pour ça.

**2. Une spec de travail dont la dernière instruction est appliquée se RÉÉCRIT en définitif.**
Elle ne se marque pas « terminé », ne se barre pas, ne s'archive pas en l'état : les instructions
disparaissent, remplacées par l'état qu'elles ont produit. Sinon elle reste indéfiniment un piège
à `grep`.

**3. Réécrire oblige à vérifier ; annoter ne l'oblige pas — c'est pourquoi on réécrit.**
Chaque affirmation conservée au présent doit être re-vérifiée dans le code au moment de la
réécriture. Sur `competition-split-spec.md`, ce seul contrôle a fait tomber trois contre-vérités
qu'un marquage aurait figées (« 53 types » → 46 ; `?v=33` → `?v=95` ; une dérive d'en-tête déjà
partiellement corrigée). **Un document propre et faux est pire qu'un document en désordre et vrai.**

---

## Ce qui garde sa date, et pourquoi

Dater n'est pas raconter le chemin. Portent toujours leur date :

- **les mesures** — un chiffre sans sa fenêtre et sa requête n'est pas réutilisable, et l'owner doit
  pouvoir le casser en une ligne ;
- **les arbitrages owner** — qui a tranché quoi, quand ;
- **les constats non re-vérifiés** — dire « relevé le 28/07, non re-vérifié depuis » est honnête et
  utile ; le passer au présent sans contrôle ne l'est pas.

Ne gardent pas leur date : les états du code, qui se lisent dans le code.

---

## Les pièges à conserver

Un piège rencontré une fois se conserve — c'est même la partie la plus utile d'un document. Mais il
se formule comme un **avertissement permanent**, pas comme un incident : « en SQL, le second
argument de `round` est le nombre de décimales » plutôt que « attention, on s'est trompé le 28/07 ».

---

## Les documents qui font loi

Trois documents priment sur tous les autres, y compris sur celui-ci :

| Document | Fait loi sur |
|---|---|
| `lexique.md` | toute chaîne visible par l'utilisateur (mots + règles 1-13) |
| `module-index.md` | le code : endpoints, libs, scripts, surfaces |
| `data-model-index.md` | les modèles dbt : grain, lignage, colonnes |

Un document non qualifié (titre sans `— DÉFINITIF` ni `— SPEC DE TRAVAIL`) n'a pas encore été
passé en revue : le lire avec méfiance, et le qualifier en le touchant.

---

## La place — le dossier dit la durée de vie (owner 04/09/2026)

La nature est dans le titre ; la **place** est dans le dossier, et elle dit combien de temps le
document vit et s'il fait partie de l'index.

| Dossier | Contenu | Index (`head -1`) | Cycle de vie |
|---|---|---|---|
| `docs/` (racine) | les documents VIVANTS : doctrine, contrats, specs de travail | oui | réécrits, jamais archivés en l'état |
| `docs/audits/` | instantanés datés : audits, diagnostics, revues (`<sujet>-AAAA-MM-JJ.md`) | oui | jamais mis à jour ; un rejeu = un nouveau fichier |
| `docs/dbt-handoff/` | passations dbt Cloud (`HANDOFF-<sujet>-AAAA-MM-JJ.md`) | non | supprimée quand appliquée, l'état passe dans `data-model-index.md` |
| `docs/catalog/` | catalogue BigQuery généré (`bq-catalog.json`, allowlist, script) | non | régénéré, jamais édité |
| `docs/site/` | copie marketing et briefs du site | non | — |
| `docs/archive/` | non re-vérifié depuis longtemps, cité par le code | non | à convertir en `— DÉFINITIF` ou à supprimer |

L'index est `head -1 docs/*.md docs/audits/*.md`. Un document qui n'est ni vivant ni un instantané
n'a pas sa place dans `docs/` : un prototype vit dans `tools/proto/`, un script dans `tools/`.
Le garde `npm run placement:check` refuse un `.md` sans nature hors `dbt-handoff/`, `site/`, `archive/`.
