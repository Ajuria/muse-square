# PASSATION — état réel au 01/08/2026 et travail à finir

> Écrit par la session du 31/07-01/08, qui a livré du travail utile ET commis six erreurs de
> méthode ayant coûté à l'owner plusieurs heures et fait écrire cinq fiches pour rien à un chat
> annexe. **Ce document commence par ce qu'il ne faut PAS croire.** Le reste n'a de valeur que si
> cette partie est lue d'abord.

---

## 0. CE QUE J'AI DIT ET QUI ÉTAIT FAUX — à ne pas reprendre

| affirmation | réalité | comment je me suis trompé |
|---|---|---|
| « 128 tirs sur 90 jours » | 128 lignes sur **4 dates** | filtre `>= CURRENT_DATE - 90` appliqué à une vue qui ne porte que **22 dates** |
| « 27/32 lieux couverts » par le profil régional | vrai par `region_name`, **faux par la clé** que le modèle utilise | j'ai joint par libellé ; le modèle joint par `region_code`, où seule l'Île-de-France apparie |
| « les champs sont réservés, jamais remplis — il faut câbler » | le câblage **existe** (CTE `foreign_tourism_named`) | j'ai lu le payload, pas le modèle |
| « le build dbt a écrit dans un schéma de dev » | il n'y a **aucune isolation de dev** | supposé au lieu de lire `macros/generate_schema_name.sql` |
| « le nœud du modèle n'a pas tourné » | il tournait | `INFORMATION_SCHEMA.TABLE_STORAGE` **retarde** ; `bq show` donne l'heure réelle |
| liste de priorités des cartes = les 4 qui tirent le plus | **aucune des 4 n'est jugée saine** par l'audit | je n'ai pas ouvert `docs/card-truth-audit.md` |

**Le motif est unique : affirmer depuis un intermédiaire au lieu de la source.** Un horodatage au
lieu de la table. Un grep qui a échoué au lieu du fichier. Un payload au lieu du modèle. Un libellé
au lieu de la clé. Un audit cité sans être ouvert.

Les deux règles ajoutées à `CLAUDE.md` aujourd'hui (§ Working Method) viennent de là. **Les lire
avant de commencer**, et savoir que je les ai enfreintes dans l'heure qui a suivi leur écriture —
donc elles ne se respectent pas toutes seules.

---

## 1. LES TROIS OBJECTIFS DE L'OWNER

1. **Chaque carte d'action porte une valeur en euros.**
2. **Trois méthodes par défaut pour chaque sous-type de carte**, qui permettent d'atteindre
   l'objectif que la carte fixe.
3. **Arrêter les erreurs systématiques de méthode.**

Ils sont dans cet ordre, mais **le 1 et le 2 sont bloqués par le même préalable**, décrit en §3.

---

## 2. CE QUI EST LIVRÉ ET VÉRIFIÉ (branche `dev`, poussé)

Vérifié **par exécution**, pas par lecture. Réutilisable tel quel.

- **La carte du périmètre s'affiche** (`bdbc73e`). Cause trouvée : `buildTriageLayout` re-trie et
  replie au-delà du rang 3 ; sans enjeu, la carte tombait au rang 3 en `display:none`. Reproduit
  exactement l'en-tête « 8 actions » de l'owner en exécutant le vrai `action-cards.js` en `vm`.
- **`dateResolutionQuery` réparée** (`2c07b5b`) — elle lisait `client_catchment` sur une table qui
  ne porte pas la colonne, échouait en entier, et son `catch` avalait tout : `conditionByDate` et
  `calendarByDate` étaient à **0** depuis une semaine, tuant la résolution météo/calendrier de
  TOUTES les cartes. Mesuré après : **0 → 7** et **0 → 7**.
- **Parité des thèmes** (`63b0c90`) — deux types étaient dans le taxonomy client sans exister côté
  serveur : couper le thème dans /profile ne les filtrait pas. Le bouton mentait.
- **Câblage de la reco-library dérivé des clés** (`54b6a71`) + **garde-fou à 7 assertions**
  (`9aa40cc`), chacune vérifiée par mutation.
- **Suite de tests : 27 échecs → 0**, worktrees exclus de la découverte (`vitest.config.ts`).
- **`days.ts` : 1086 → 910 lignes** — quatre champs calculés à chaque requête et lus par personne,
  chacun recensé avant retrait.

---

## 3. LE PRÉALABLE QUI BLOQUE LES OBJECTIFS 1 ET 2

**Écrire des plans sous une prémisse fausse ne corrige rien.** C'est écrit dans le préambule de
`docs/card-truth-audit.md` depuis le 27/07, et c'est exactement l'erreur que j'ai commise.

`docs/card-truth-audit.md` juge 9 cartes. Son § **RÉEXAMEN DU 31/07** (que j'ai écrit après que
l'owner m'a repris) reclasse les verdicts par **la nature de ce qui manque** — c'est cette grille
qu'il faut appliquer avant toute chose :

| classe | ce qui manque | geste |
|---|---|---|
| A — déclaratif | un paramètre que seul l'exploitant détient | **demander** (c'est le motif du périmètre) |
| B — non branché | une donnée que nous avons, non jointe | **câbler** |
| C — copie | la donnée discrimine, le texte n'en dit rien | **réécrire** |
| D — règle | seuil ou unité faux | **corriger** |
| E — inexistant | la mesure n'existe nulle part chez nous | Fil légitime |
| F — trop mince | mesure réelle sous le plancher statistique | « pas encore », revoir à date |

État par carte (verdict 28/07 → réexamen 31/07) :

- `competition_proximity` (347) — **non jugeable** tant que personne n'a répondu à la question du
  périmètre (`client_catchment` NULL sur les 32 lieux). Son recouvrement de 33 % a été mesuré à un
  rayon que la réponse peut changer.
- `high_competition_density` — C + D : brancher la copie sur la part même-secteur, corriger l'unité.
- `foreign_tourism_signal` — **B, câbler** (§4, en cours, NON terminé).
- `audience_shift_opportunity` — **C : démise à tort le 28/07.** Elle discrimine (94 payloads
  distincts / 31 lieux) ; c'est sa copie qui n'affirme rien. À re-promouvoir **avec** la réécriture.
- `low_competition_window` — saine, « GARDER TELLE QUELLE » (+88 €/j, t = 2,4, n = 30). Mais elle ne
  rend qu'**1 plan sur 3**.
- `tourism_peak_window` — F : `tourism_high` existe (3 lieux, +171 €/j) mais n ≈ 2, sous le plancher.
- `weekend_opportunity` — D : durcir (pas d'opportunité si alerte ≥ 2) ; sa copie appelle en plus
  « météo acceptable » une alerte de niveau 3.
- `weekend_vacation_low_comp` — **la plus saine du lot, et AUCUN plan.** C'est par elle qu'il faut
  commencer l'objectif 2.
- `review_solicitation` — E, Fil légitime : tous les `google_rating` du dépôt sont sur les
  CONCURRENTS ; la seule note côté client (`besttime_rating`) est **100 % NULL**.

`DEMOTED_TO_FEED` (`src/lib/recoThemeMap.ts`) contient aujourd'hui `audience_shift_opportunity`,
`tourism_peak_window`, `review_solicitation` + 13 autres. **Une carte démise ne paraît plus aux
« Actions du jour » : elle n'a plus de menu « M'engager », donc écrire ses plans est du travail
perdu.** C'est ce qui est arrivé au chat annexe.

---

## 4. LE CHANTIER EN COURS ~~, NON TERMINÉ~~ — ✅ RÉSOLU LE 01/08

> **Mise à jour 01/08 (session suivante)** : cause trouvée en lisant le SQL réellement
> exécuté (job BigQuery `5bf9a650…`, lisible dans `JOBS_BY_PROJECT` de `ms-database-472505`) —
> **le correctif n'avait jamais été déployé**, et il portait en outre un bug de grain
> (jointure au mois sans dédup → ×31). Spec corrigée, appliquée par l'owner dans l'IDE,
> buildée, vérifiée : 108/128 lignes remplies, `f10c3e58` porte « Royaume-Uni 14%… 33 % »,
> millésime 2025. Détail complet : `docs/foreign-tourism-cablage.md`, § RÉSOLU.

**`foreign_tourism_signal` — câblage du profil régional.** Spec complète et SQL byte-exact dans
`docs/foreign-tourism-cablage.md`.

Deux défauts diagnostiqués **par mesure directe des tables** — c'est la seule partie de ce fil à
laquelle se fier :

1. **La date.** `region_foreign_mix` filtre `p.date >= current_date()` sur un mart qui ne projette
   que `reference_year = 2025` (`max(date) = 2025-09-30`) → **0 ligne**, donc jointure vide depuis
   le 01/01/2026.
2. **La clé.** `m.region_code = d.region_id` compare deux codages : le mart dit `FR81` pour
   l'Occitanie, les lieux disent `FRJ`. Seule l'Île-de-France coïncide (`FR10`). Aucune règle de
   préfixe ne tient.

**État : NON RÉSOLU.** Le mart a été reconstruit le 01/08 à 06:14 UTC, mais le payload ne contient
toujours ni la clé `profile_reference_year` (donc l'étape 3 du correctif n'est pas appliquée) ni de
valeur pour `countries_named`. Il faut **lire le SQL réellement déployé** — impossible pour moi, le
checkout local n'est pas ce qui tourne.

⚠ **Il n'y a AUCUNE isolation de dev en dbt.** `macros/generate_schema_name.sql` (dépôt ombrelle,
`macro-paths: ["../macros"]`) renvoie le schéma custom tel quel : un `dbt build` depuis l'IDE écrit
**directement dans `muse-square-open-data.mart`**. Ne pas chercher de copie de dev, il n'y en a
jamais. Et `dbt compile` avant `dbt build` n'est pas du confort : c'est le seul filet.

---

## 5. OBJECTIF 1 — LE € SUR CHAQUE CARTE

Le moteur existe : `src/lib/dayClassRegistry.ts` + store `analytics.day_class_impacts`, portes
`n ≥ 5`, `span ≥ 60 j`, `|t| ≥ 1`, plus une porte de matérialité à 0,3 % du CA.

**Ce qui bloque n'est pas le calcul, c'est le bruit du résidu.** Mesuré :

- `events_high` sur Muse Square : 500 m → n=6, t=0,41 · 1 km → n=10, t=0,55 · 20 km → n=3, t=0,32.
  **Aucun ne passe.**
- Les Olivades à 20 km : n=21, span 334 j, **+948 €/jour**, soit 21 771 €/an — **rejeté, t = 0,36**.
- Cause : sur Les Olivades, `daily_revenue - expected_revenue` a un **écart-type de 5 750 €** pour
  un CA moyen de 4 304 €/jour, avec une journée à **+51 216 €**. Le résidu est biaisé
  (gap moyen +1 942 €) et dominé par des valeurs extrêmes.

**Donc la question à instruire d'abord n'est pas « comment annualiser » mais « pourquoi le résidu
est-il si bruité »** — `expected_revenue` sous-estime systématiquement, et une seule journée
extrême suffit à faire tomber le `t` sous 1. Tant que ce n'est pas traité, ajouter des € revient à
annualiser du bruit, ce que les portes existent justement pour empêcher.

Le « temps 2 » envisagé (calculer l'enjeu sous les deux hypothèses 1 km / 20 km et afficher « entre
X et Y €/an ») **a été mesuré et ne produirait rien aujourd'hui** : les six combinaisons
lieu × rayon échouent aux portes. Une variante honnête existe — afficher le **nombre de jours
mesurables** que chaque réponse débloquerait (Les Olivades : 0 à 1 km, 21 à 20 km) — validée par
l'owner mais non implémentée.

---

## 6. OBJECTIF 2 — TROIS MÉTHODES PAR SOUS-TYPE

**Mesuré : 33 types tirent, 6 ont des plans, 27 n'en ont pas.** Sur les 83 types déclarés dans
`ACTION_CARDS`, **7** portent `.recos`.

Ce qui est en place :

- **Le câblage dérive désormais des clés de `public/reco-library.js`** — une entrée suffit, plus de
  second geste à oublier. C'était le vrai blocage : `action-cards.js` avait une liste de 7 types en
  dur, et le 26/07 l'allowlist des engagements a été complétée à 83 types sans que personne suive.
- **Un échafaudage commenté** en fin de `public/reco-library.js` : 27 entrées, chacune avec les
  variables réellement présentes dans le payload de sa carte. ⚠ **Son ordre de priorité est faux**
  (établi au volume de tirs) — un bandeau d'avertissement le dit en tête.
- **Un garde-fou** (`src/lib/recoCoverage.guard.test.ts`) : cliquet à 7 assertions, la dette de
  76 types listée nommément et qui ne peut que rétrécir.
- **Un prompt de recherche** pour un chat séparé : `docs/prompt-recherche-methodes.md`. ⚠ Il porte
  la même priorisation fausse, signalée par un bandeau.

**Par où commencer, selon l'audit et non selon le volume** : `weekend_vacation_low_comp` (la plus
saine, aucun plan), puis compléter `low_competition_window` à 3 plans.

**Le contenu ne se génère pas.** Décision owner du 27/07, après une purge de 36 lignes sur 64 : un
crawl produit des **preuves**, jamais des **plans** ; le « comment » est vendu par les
institutionnels, pas publié. La voix est celle de l'owner. Les chiffres viennent du pipeline,
jamais de la plume.

---

## 7. LA MÉTHODE — OBJECTIF 3

`CLAUDE.md` fait foi. Deux règles y ont été ajoutées aujourd'hui, adossées à des cas réels :

- **Quand tu modifies une fonction, teste TOUTES ses sorties**, pas seulement celle que tu ajoutes.
- **Ne conclus jamais de la sortie d'un outil sans avoir vérifié qu'il a tourné et qu'il a répondu
  à la question que tu crois lui avoir posée.**

Trois pratiques qui ont réellement fonctionné aujourd'hui, à reprendre :

1. **Le harnais `vm`** — charger `public/action-cards.js` hors navigateur, l'alimenter avec les
   vraies cartes de la vue sémantique transformées exactement comme `monitor.ts`, puis extraire et
   exécuter les blocs de `pulse.astro` **byte-exacts**. C'est ce qui a reproduit « 8 actions » et
   trouvé le pli. L'app est protégée par Clerk : c'est le seul moyen de vérifier un rendu.
2. **La vérification par mutation** — un test vert ne prouve rien tant qu'on n'a pas cassé ce qu'il
   est censé attraper et vu qu'il tombe.
3. **Chaque chiffre livré avec sa requête et sa fenêtre réelle**, pour que l'owner puisse le casser
   en une ligne. C'est ce qui a permis de m'attraper trois fois.

**Et une contrainte à ne jamais oublier** : l'owner teste UN compte, `f10c3e58` (Muse Square).
4 des 5 comptes sont des jeux Kaggle ; le seul compte réel est Les Olivades (`14379e18`).
