# Type de commerce du concurrent — spécialiste ou généraliste, puis les familles confirmées — SPEC DE TRAVAIL

Sert : `intent.md` § Le test de valeur (une menace dit quelque chose de **vrai**) et § Les objets
(**suivi**).

Arbitrages owner 10/09 :
- **option C** — un type de commerce déclaré tout de suite (A), les familles vendues par le
  concurrent là où on peut les établir (B) ;
- le champ s'appelle **« Type de commerce »**, ses valeurs sont **Spécialiste** et **Généraliste**, et
  il ne s'affiche que pour les secteurs **Commerce & Retail** et **Marchés & Halles** ;
- **« Ce sont les familles confirmées qui disent sur quoi porte la concurrence »** — la confirmation
  par l'exploitant remplace tout seuil.

Question d'origine (owner 10/09) : « Un supermarché n'a pas les mêmes clients qu'Épices et Tout alors
qu'à l'heure actuelle, ils partagent la même industrie et les mêmes clients. »

---

## 1. Le problème, mesuré (10/09)

**Le secteur est le seul discriminant du calcul de menace.** Une paire est « directe » si le site et
le concurrent ont le même `industry_code` et que le public recouvre à plus de 50 % — ou que le
public du concurrent est inconnu (`int_competitor_threat_profile.sql` l. 190-198). Une menace
« haute » exige une paire directe (porte du 09/09, PR ms_database #131).

**Le public des concurrents est rarement observé.** Sur les 39 concurrents actifs de l'annuaire,
17 n'ont aucun public en base (44 %). Le seed `competitor_industry_profile_defaults.csv` comble avec
`commercial → local, mixed`, et `mixed` compte comme commun à tout (owner 23/08). Un public par
défaut suffit donc à fabriquer un recouvrement.

**Chez Épices et Tout**, les trois voisins sortent en menace haute sur ce défaut :

| Concurrent | Public en base | Public utilisé | Recouvrement | Score |
|---|---|---|---:|---:|
| Bee-Fruit | local | local + mixed | 66,67 % | 0,86 |
| La Cave à Fromages | — | local + mixed | 66,67 % | 0,85 |
| Cave Saint Matthieu | — | local + mixed | 66,67 % | 0,85 |

Un Carrefour City déclaré en `commercial` recevrait exactement la même ligne : le modèle ne sait pas
distinguer une supérette d'une épicerie.

**Correction d'un chiffre donné le 10/09 au matin.** « 99,54 % des paires ont un public inconnu »
mêlait les lieux d'événements (192 202 paires, 99,7 % inconnus — voir
`audits/seeds-secteur-audit-2026-09-10.md`). Sur les 456 paires de l'annuaire, le public est
inconnu pour 103 (22,6 %). La conclusion tient pour d'autres raisons : le public ne sépare pas deux
commerces de la même rue, et celui des clients d'un concurrent ne s'observe pas.

**Pourquoi ni un secteur ni un public plus fins.** Scinder `commercial` toucherait 12 fichiers de
l'app qui recopient la liste des codes, le seed de défauts et la table des regroupements — et poserait
le mauvais diagnostic : un supermarché *est* un concurrent d'une épicerie sur les familles qu'ils
vendent tous deux. Aucune donnée socio-économique n'existe dans la base (sémantique, mart,
intermédiaire, raw et staging vérifiés le 10/09), et un indicateur de zone donnerait la même valeur à
deux commerces de la même rue.

---

## 2. Les mots

| Élément | Mot | État |
|---|---|---|
| Champ | **Type de commerce** | owner 10/09 |
| Valeurs | **Spécialiste** · **Généraliste** | owner 10/09 |
| Secteurs où le champ s'affiche | Commerce & Retail (`commercial`), Marchés & Halles (`market_hall`) | owner 10/09 |
| Définition | « On y va pour faire ses courses, ou pour un produit précis ? » — ses courses → généraliste ; un produit précis ou un conseil → spécialiste | **proposée, à valider** |

**Le type d'un commerce se déclare, il ne se déduit pas.** Il appartient à l'exploitant (ou à l'owner
qui prépare le compte) — jamais à l'app, jamais à une valeur par défaut, jamais à moi. Leçon du 10/09 :
le client Épices et Tout a été décrit depuis le catalogue du site de démo fictif Maison Sèvres, puis
classé sur cette description.

---

## 3. A — le type de commerce déclaré

### Où il vit

- **Sur le concurrent** : colonne `commerce_type` (`'specialiste'` | `'generaliste'` | NULL) dans
  `raw.competitor_directory`. C'est une propriété du commerce, pas du suivi : un supermarché est
  généraliste pour tous les sites qui le suivent.
- **Sur le site** : même colonne dans `raw.insight_event_user_location_profile`.
- **NULL veut dire inconnu** — et c'est la valeur de tout site ou concurrent hors des deux secteurs.

### La règle

La règle ne joue que si **les deux côtés sont dans Commerce & Retail ou Marchés & Halles** et que
**les deux types sont connus**. Deux types différents donnent alors au plus « partielle » : le signal
reste, il n'est plus promu — même doctrine que la porte du 09/09. Dans tous les autres cas, le calcul
est inchangé.

Vérification attendue : un généraliste face à un spécialiste sort « partiel », et au plus « modéré » ;
deux commerces du même type gardent le niveau qu'ils avaient.

### Le chemin des données (amont → aval)

1. `ALTER TABLE` additifs : `raw.competitor_directory.commerce_type`,
   `raw.insight_event_user_location_profile.commerce_type`.
2. `stg_competitor_directory` : la sélection est explicite (lu le 10/09) — y ajouter la colonne.
3. `int_competitor_directory` → `fct_competitor_directory` : branche annuaire ; branche `ms_database` à NULL.
4. `stg_insight_event_user_location_profile` → `int_client_website_profiles` → `dim_client_company_profile`
   (sélection explicite ou non : à lire au build).
5. `int_competitor_threat_profile` : la règle ; `fct_competitor_threat_profile` et la vue semantic
   exposent les deux types.

### Les portes de saisie (app)

- **Le champ n'apparaît que si le secteur choisi est Commerce & Retail ou Marchés & Halles**, et il se
  vide si le secteur change pour un autre : un musée ne garde pas un type de commerce.
- Concurrent : `add-competitor.ts` accepte `commerce_type` ; le bloc « Suivre des concurrents » de la
  page admin et la page Suivis le proposent.
- Site : `save.ts`, le formulaire du compte et le formulaire d'invitation admin — quatrième liste à
  côté de « Secteur d'activité… », « Public principal… », « Public secondaire… », dans la même forme.

---

## 4. B — les familles confirmées

### Ce qui existe (10/09)

- `raw.competitor_offering_history` : catégorie, article, prix — **22 603 lignes pour 26 concurrents**.
  Sur la dernière lecture de chaque concurrent : 10 articles en médiane, 20 au plus.
- Les catégories sont du texte libre, choisies par la lecture (`cron/competitor-surveillance.ts`
  l. 149) : « Exposition », « Boutique », « Visite guidée »… — jamais les familles de la caisse.
- La lecture voit déjà ce qu'un concurrent vend : La Marnière, lue le 10/09 — Boucherie,
  Poissonnerie, Primeur, Cave / Épicerie, Catalogue promotionnel.

### Le modèle

1. **La lecture propose.** Chaque article lu chez un concurrent est rangé dans une des familles
   réelles du site qui le suit, ou dans aucune — la liste fermée des familles du site est servie au
   modèle, et une porte refuse toute famille hors liste (patron de la lecture de photo :
   `dispositifPhotos.ts` `listSiteItems`, `photoExtractionChecks.ts`).
2. **L'exploitant confirme**, sur la fiche du suivi, les familles que le concurrent vend vraiment —
   même patron que les articles d'une photo (`withConfirmedItems`, colonne `items_confirmed`) :
   ajout-seul, la dernière confirmation gagne, et une famille que la lecture n'avait pas trouvée est
   acceptée (l'exploitant connaît son voisin mieux que la lecture).
3. **Ce sont les familles confirmées qui disent sur quoi porte la concurrence** (owner 10/09). La part
   du CA du site qu'elles portent en découle — par exemple, une famille FRUITS ET LEGUMES confirmée
   chez un concurrent porte sur 31,7 % du CA d'Épices et Tout (relevé Crisalid, 02/01 → 09/09, TTC).
4. **Aucun seuil** (owner 10/09). Un compte d'articles ne mesure rien — un traiteur dépasse cinq plats
   à lui seul — et la lecture n'est qu'un échantillon : elle peut montrer qu'une famille est vendue,
   jamais qu'elle ne l'est pas. Le seul garant est la confirmation.

Grain : site × concurrent × famille — un même concurrent est suivi par des sites dont les familles
diffèrent.

**La confirmation n'a pas besoin de la lecture.** Pour un concurrent sans site lisible — trois des
quatre voisins d'Épices et Tout aujourd'hui (deux pages Facebook, un commerce sans site) —
l'exploitant confirme ses familles directement.

### A et B ne font pas le même travail (correction du 10/09)

B mesure des **produits** en commun, pas des **clients** en commun : un supermarché vend les mêmes
familles qu'une épicerie. **B ne remplace donc pas A** pour décider qui est concurrent direct.
A dit si c'est le même type de commerce ; B dit sur quelles familles la concurrence porte, et quelle
part du CA elle touche.

---

## 5. Lien avec l'audit des seeds

A et B portent sur les paires de l'annuaire, dont le secteur est un code : ils ne dépendent pas du
correctif des libellés. Mais **ils ne protègent pas des lieux d'événements** : leur type de commerce
est NULL et leurs familles ne sont confirmées par personne. La garde « un lieu d'événement n'est
jamais un concurrent direct » (owner 10/09) reste indispensable au lot 1.

---

## 6. Ordre de construction

1. Mots au lexique — fait le 10/09.
2. **A** : colonnes raw, saisie conditionnelle (concurrent et site), passation dbt dans l'ordre du § 3.
3. **B** : proposition des familles à la lecture, confirmation sur la fiche du suivi, table au grain
   site × concurrent × famille, mart.

## 7. Décision owner restante

1. **La définition** des deux valeurs (§ 2).
