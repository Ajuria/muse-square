# Menaces vs bruit — AMENDEMENT à `competition-split-spec.md` (25/08) — SPEC DE TRAVAIL

> **Ce document a été RÉÉCRIT le 25/08 au soir.** Sa première version rouvrait une question
> déjà tranchée : elle re-dérivait la doctrine de `docs/competition-split-spec.md` (28/07)
> sans la citer, et proposait un seuil CONCURRENT du seuil déjà en production. Ce qui suit
> ne garde que ce qui n'existait nulle part, et corrige les trois erreurs.

## Ce qui existe déjà, et fait loi

**`docs/competition-split-spec.md` (28/07)** pose EXACTEMENT la question du 25/08 —
« la densité autour de moi cannibalise-t-elle ou entraîne-t-elle ? » — et la tranche :

> Cannibaliser exige une substitution → événement du **même secteur**.
> Entraîner ne l'exige pas → n'importe quel événement met du public dans le quartier.

Et ses 5 modifications sont **EN PRODUCTION** (vérifié dans `origin/main` du dépôt dbt,
25/08) : `* 100` sur l'unité à 6 endroits, seuils `>= 0.25` / `> 0.25` à 3 endroits, la
scission exposée (`events_within_5km_same_bucket_count`, l. 644 et 762-763), et la copie
qui bifurque déjà sur le même-secteur :

> ≥ 25 % : « …% sont dans votre secteur - ils disputent votre public. Differenciez votre offre. »
> < 25 % : « Seulement …% sont dans votre secteur : ce public est dans le quartier sans vous
> etre dispute. Allez le capter. »

## Les trois erreurs de la première version (corrigées ici)

1. **Seuil forké.** Elle proposait « carte si part ≥ 40 % » comme décision owner. Le seuil
   du même-secteur est **25 %**, arbitré et déployé le 28/07, et il gouverne déjà les deux
   gestes ci-dessus. Aucun seuil à décider : il existe.
2. **Verdict périmé (unité).** Elle écrivait « payload affichant "0" (bug d'unité) ».
   Corrigé le 28/07 (modification 1).
3. **Verdict périmé (proximité) — le plus grave.** Elle écrivait « durcir ≥ 40 % ou
   démettre » pour `competition_proximity`, en citant l'audit du 28/07. Or le **RÉEXAMEN DU
   31/07** (même fichier) le reclasse **A — déclaratif** et conclut « **non jugeable
   aujourd'hui** » ; et le **30/07, l'owner avait refusé de la démettre** et imposé la
   question du périmètre à la place. La spec rouvrait une décision owner déjà prise.

Erreur de méthode adjacente : « la règle de tir ignore le même-secteur » était présentée
comme un défaut. C'est une décision explicite du 28/07 — « **Ne pas la tuer** : une forte
densité non concurrente reste actionnable […] c'est la **copie et le payload** qui doivent
se brancher sur la scission, **pas la règle de tir** ».

## Ce qui est réellement neuf (deux choses)

### 1 · La re-mesure de `competition_proximity` est DÉBLOQUÉE

Le réexamen du 31/07 la suspendait à une condition précise : « re-mesurer après les
premières réponses » au périmètre (`client_catchment` NULL sur les 32 lieux à l'époque).

**Mesuré le 25/08** : `mart.fct_location_context_daily`, date du jour — 32 lieux,
**1 réponse**, et c'est **la vôtre** : `f10c3e58 → commune`.

La condition posée le 31/07 est donc remplie **sur votre compte**. Le geste n'est pas
d'écrire une spec : c'est de **re-mesurer le recouvrement au rayon commune** et de comparer
aux 33 % mesurés à l'ancien rayon. Le verdict suivra la mesure, pas l'inverse.

### 2 · La densité ambiante comme CONTEXTE au bandeau

Rien dans les docs existants ne dit OÙ va la densité non concurrente. Aujourd'hui elle
reste une carte-action (« Différenciez-vous… »), donc un impératif, alors que la doctrine
du 28/07 en fait du public à capter — pas une menace.

**Proposition** : sous le seuil de 25 %, le fait descend dans la colonne du jour du bandeau
Agir (fait + infobulle nommant les plus proches) et quitte le fil des actions.
`days[]` porte déjà `events_within_500m/1km/5km_count` — zéro requête de plus, zéro dbt.

**Seule décision owner** : le mot du bandeau. Proposition : « N événements à 1 km », nu,
sans qualificatif (« autour de vous » est déjà acté au tableau, réutilisable).

## Ordre

1. Re-mesurer le recouvrement de `competition_proximity` au périmètre déclaré `commune`
   (votre site) — chiffre d'abord, verdict ensuite.
2. Bandeau contexte, dès que le mot est validé.
