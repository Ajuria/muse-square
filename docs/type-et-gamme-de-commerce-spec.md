# Type de commerce et gamme — deux axes déclarés, puis les familles confirmées — SPEC DE TRAVAIL

Sert : `intent.md` § Le test de valeur (une menace dit quelque chose de **vrai**) et § Les objets
(**suivi**).

Arbitrages owner 10/09 :
- **option C** — deux axes déclarés tout de suite (A), les familles vendues par un concurrent
  confirmées par l'exploitant (B) ;
- **Type de commerce** : **Spécialiste** — un seul type de produit (primeur, fromager, caviste) ;
  **Généraliste** — plusieurs pôles très différents. Définition owner : « pas mono produit,
  multiplicité de pôles très différents » ;
- **Gamme** : **Entrée de gamme · Milieu de gamme · Haut de gamme · Luxe** — quatre niveaux,
  déclarée, jamais déduite ;
- les deux champs ne s'affichent que pour **Commerce & Retail** et **Marchés & Halles** ;
- **Épices et Tout = Commerce & Retail, Généraliste.** Bee-Fruit (primeur) et Cave Saint Matthieu
  (caviste) sont des spécialistes ;
- la gamme est **graduée** : un niveau d'écart laisse une paire directe, deux niveaux ou plus la
  font passer « partielle » ;
- conséquence acceptée : face à un généraliste, un spécialiste voisin passe « partiel » —
  l'exposition se lit alors au **pôle**, par les familles confirmées ;
- « Ce sont les familles confirmées qui disent sur quoi porte la concurrence » ; aucun seuil.

Question d'origine (owner 10/09) : « Un supermarché n'a pas les mêmes clients qu'Épices et Tout alors
qu'à l'heure actuelle, ils partagent la même industrie et les mêmes clients. » Réponse retenue : ce
n'est pas la largeur de l'offre qui les sépare (les deux sont généralistes), c'est la **gamme**.

---

## 1. Le problème, mesuré (10/09)

**Le secteur est le seul discriminant du calcul de menace.** Une paire est « directe » si le site et
le concurrent ont le même `industry_code` et que le public recouvre à plus de 50 % — ou que le public
du concurrent est inconnu (`int_competitor_threat_profile.sql`, CTE `with_tiers`). Une menace
« haute » exige une paire directe (porte du 09/09, PR ms_database #131).

**Le public des concurrents est rarement observé.** Sur les 39 concurrents actifs de l'annuaire, 17
n'ont aucun public en base (44 %). Le seed `competitor_industry_profile_defaults.csv` comble avec
`commercial → local, mixed`, et `mixed` compte comme commun à tout (owner 23/08).

**Chez Épices et Tout**, les trois voisins sortent en menace haute sur ce défaut : Bee-Fruit (0,86),
La Cave à Fromages (0,85), Cave Saint Matthieu (0,85), recouvrement de 66,67 % bâti sur le défaut du
seed. Un supermarché déclaré en `commercial` recevrait exactement la même ligne.

**Pourquoi ni un secteur ni un public plus fins.** Scinder `commercial` toucherait les 12 fichiers de
l'app qui recopient la liste des codes, et poserait le mauvais diagnostic. Aucune donnée
socio-économique n'existe dans la base (vérifié le 10/09), et un indicateur de zone donnerait la même
valeur à deux commerces de la même rue.

---

## 2. Les mots

| Élément | Champ | Valeurs (code) | État |
|---|---|---|---|
| Largeur de l'offre | **Type de commerce** | Spécialiste (`specialiste`) · Généraliste (`generaliste`) | owner 10/09 |
| Niveau de prix et de qualité | **Gamme** *(libellé du champ proposé)* | Entrée de gamme (`entree`) · Milieu de gamme (`milieu`) · Haut de gamme (`haut`) · Luxe (`luxe`) | valeurs owner 10/09 ; libellé du champ au lexique § À arbitrer |
| Où ils s'affichent | — | Commerce & Retail (`commercial`), Marchés & Halles (`market_hall`) | owner 10/09 |

« Entrée de gamme » est déjà un mot de l'app : la check-list photo pose *« Y a-t-il un article
d'entrée de gamme à hauteur d'œil ? »* (`dispositifTypes.ts`). Écartés : « Premium » et « Mass market »
(anglais), « Grand public » (pris : le convertisseur de public le range dans « Public mixte »,
`competitive/constants.ts`).

**Le type et la gamme se déclarent, ils ne se déduisent pas.** Ils appartiennent à l'exploitant (ou à
l'owner qui prépare le compte) — jamais à l'app, jamais à une valeur par défaut. Deux éléments existants
peuvent **aider** sans décider : la comparaison de prix « eux plus cher / vous plus cher »
(`competitor-profile.ts`, seulement quand les deux côtés ont un prix) et le positionnement extrait des
sites concurrents (`brand_positioning`, 25 concurrents sur 39, adjectifs libres).

---

## 3. A — les deux axes déclarés

### Où ils vivent

- **Sur le concurrent** : colonnes `commerce_type` et `commerce_gamme` de `raw.competitor_directory`
  — des propriétés du commerce, pas du suivi.
- **Sur le site** : les mêmes colonnes dans `raw.insight_event_user_location_profile`.
- **NULL veut dire inconnu** — et c'est la valeur de tout site ou concurrent hors des deux secteurs.

### La règle

Elle ne joue que si **les deux côtés sont dans Commerce & Retail ou Marchés & Halles**. Une paire
n'est alors « directe » que si, en plus des conditions actuelles :
- les deux **types** sont égaux, ou l'un des deux est inconnu ;
- **et** les deux **gammes** sont à **moins de deux niveaux** l'une de l'autre, ou l'une des deux est
  inconnue — dans l'ordre Entrée de gamme < Milieu de gamme < Haut de gamme < Luxe (owner 10/09 : un haut
  de gamme et un luxe partagent une partie de leurs clients ; une entrée de gamme et un haut de gamme, non).

Sinon elle est au plus « partielle » : le signal reste, il n'est plus promu — même doctrine que la
porte du 09/09. Dans tous les autres cas, le calcul est inchangé.

Vérification attendue sur Épices et Tout (généraliste) : un supermarché généraliste d'une autre
gamme sort « partiel » ; Bee-Fruit et Cave Saint Matthieu, spécialistes, sortent « partiels » eux
aussi — leur poids se lit au pôle concerné (B).

### Le chemin des données (amont → aval — ordre du DAG, lu sur `origin/main` le 10/09)

1. `ALTER TABLE` additifs sur les deux tables raw.
2. `stg_competitor_directory` : ajout aux CTE `src` et `cleaned` (sélection explicite, `select *` final).
3. `int_competitor_directory` : ajout aux CTE `enriched` et au `select` final.
4. `fct_competitor_directory` : ajout aux branches `directory` **et** `ms_database` (à NULL — l'union
   exige le même ordre de colonnes), puis au `select` final.
5. `stg_insight_event_user_location_profile` : ajout à la CTE `src` (`select *` final).
6. `int_client_website_profiles` : ajout à la CTE `shaped` (propagé par `s.*` / `e.*`).
7. `dim_client_company_profile` : ajout à `seed_src` (à NULL — l'union avec `website_src` exige le
   même ordre), à `website_src` et à `cleaned`.
8. `int_competitor_threat_profile` : lecture côté site (`dim_client_company_profile`) et côté concurrent
   (`fct_competitor_directory`), la règle dans `with_tiers`, les quatre colonnes au `select` final.
9. `fct_competitor_threat_profile` : les quatre colonnes au `select` explicite.

Aucun de ces modèles n'a de contrat `enforced` (vérifié le 10/09). La seule vue contractuelle en aval,
`vw_insight_event_competitors_followed`, lit une liste explicite de `fct_location_competitors_followed` :
elle n'est pas touchée.

### Les portes de saisie (app)

- **Profil du site** (`profile.astro` + `api/profile/save.ts`) : deux listes qui n'apparaissent que si
  le secteur choisi est Commerce & Retail ou Marchés & Halles, et qui se vident s'il change.
- **Préparation d'un compte** (`app/admin/admin.astro` + `api/admin/invite.ts`) : les deux mêmes listes.
- **Ajout d'un concurrent** (`api/competitive/add-competitor.ts` + le bloc « Suivre des concurrents ») :
  les deux champs acceptés et écrits.
- **Modification d'un concurrent suivi** : aucun endpoint n'écrit aujourd'hui ces attributs pour un
  concurrent existant — à construire sur la page Suivis.

---

## 4. B — les familles confirmées

- La lecture du site d'un concurrent **propose** les familles réelles du site suivi qu'il vend — liste
  fermée servie au modèle, porte qui refuse toute famille hors liste (patron de la lecture de photo).
- **L'exploitant confirme**, sur la fiche du suivi — même patron que les articles d'une photo
  (`withConfirmedItems`, `items_confirmed`) ; une famille que la lecture n'avait pas trouvée est
  acceptée.
- **Ce sont les familles confirmées qui disent sur quoi porte la concurrence** ; la part du CA du site
  qu'elles portent en découle (par exemple, FRUITS ET LEGUMES confirmée = 31,7 % du CA d'Épices et
  Tout, relevé Crisalid 02/01 → 09/09, TTC).
- **Aucun seuil** : un compte d'articles ne mesure rien, la lecture n'est qu'un échantillon (10 articles
  en médiane par concurrent). La confirmation n'a pas besoin de la lecture : un concurrent sans site
  lisible se confirme directement.
- Grain : site × concurrent × famille.

**A et B ne font pas le même travail.** B mesure des produits communs, pas des clients communs : un
supermarché vend les mêmes familles qu'une épicerie. A dit si deux commerces se ressemblent ; B dit sur
quelles familles ils se disputent.

---

## 5. Lien avec l'audit des seeds

A et B portent sur les paires de l'annuaire, dont le secteur est un code. **Ils ne protègent pas des
lieux d'événements** (type et gamme NULL, familles confirmées par personne) : la garde « un lieu
d'événement n'est jamais un concurrent direct » (`audits/seeds-secteur-audit-2026-09-10.md`, owner
10/09) reste indispensable au lot 1.

---

## 6. Ordre de construction

1. Mots au lexique — fait le 10/09.
2. **A** : colonnes raw, chaîne dbt (PR ms_database), portes de saisie de l'app ; déclaration
   d'Épices et Tout et de ses voisins.
3. **A, suite** : modification d'un concurrent suivi depuis la page Suivis.
4. **B** : proposition des familles à la lecture, confirmation sur la fiche du suivi, table au grain
   site × concurrent × famille, mart.

## 7. Décisions owner restantes

1. **La gamme d'Épices et Tout.**
2. Le type et la gamme de La Cave à Fromages et de La Marnière ; la gamme de Bee-Fruit et de Cave
   Saint Matthieu.
3. Le libellé du champ « Gamme ».
