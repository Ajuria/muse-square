# Typologie des dispositifs permanents, documentation visuelle, parcours d'achat — SPEC DE TRAVAIL

Écrit le 03/09/2026 après la session avec l'owner. Ce document répond à trois questions :
comment classer les dispositifs permanents d'un magasin (vitrines, rayons, comptoirs…) pour
pouvoir les comparer à des bonnes pratiques précises ; comment les photographier et relier ce
qu'on voit sur la photo aux produits vendus ; et à quelles conditions on peut lire le parcours
d'achat des clients. Il sert la page `intent.md`, sections « Le test de valeur » et « Les objets ».

Chaque affirmation dit d'où elle vient : **[owner]** = décision de l'owner ; **[vérifié 03/09]** =
lu dans le code ou mesuré dans la base ce jour-là. Les huit décisions du § 8 sont toutes tranchées.

---

## 1. Ce qui existe déjà [vérifié 03/09]

**Les dispositifs sont déjà classés en trois genres.** Quand un dispositif est enregistré, on
sait s'il s'agit d'une opération (elle a des dates de début et de fin), d'une série (elle se
répète, par exemple un producteur invité chaque mois) ou d'un dispositif permanent (il n'a ni
date ni fin). Les enregistrements anciens, faits avant cette distinction, comptent comme des
opérations. Techniquement : colonne `dispositif_nature` de la table `analytics.action_commitments`.

**Un pôle est un dispositif permanent.** Il n'y a pas de table séparée pour les pôles. Quand
l'exploitant crée un pôle, il choisit les familles de produits que ce pôle couvre, en les
prenant dans la liste des familles qui apparaissent vraiment dans ses ventes. Il ne les tape pas
en texte libre. Techniquement : colonne `pole_families`.

**Une opération peut être rattachée à un pôle.** Dans ce cas, son résultat se lit sur les
familles de ce pôle, et non sur tout le magasin. Techniquement : colonne `attached_pole_id`.
La spec de référence est `poles-dispositifs-permanents-spec.md`.

**Réorganiser un dispositif crée une nouvelle version du même dispositif.** Le dispositif garde
son identité, seul le numéro de version augmente. Tout ce qu'on apprend s'accumule sur le
dispositif, version après version. Techniquement : `dispositif_id` inchangé, `version_no` + 1.

**Le registre des types de composant existe** (`src/lib/dispositifTypes.ts`, 03/09) : dix types,
leurs rôles, une liste de questions par type, la sélection par métier, « Autre » en fin de chaque
liste. Sa garde (`dispositifTypes.guard.test.ts`, 13 tests) attrape une valeur dupliquée, une
liste qui ne finit pas par « Autre », une question qui vise un rôle inexistant, un mot banni dans
un libellé ; chacun de ces trois défauts a été introduit volontairement et vu rougir le test.
Il est construit sur le modèle du registre des types d'opération, `src/lib/eventTypes.ts` :
23 types (dégustation, venue de producteurs, vente privée…), rangés en cinq listes selon le
métier du lieu, chaque liste finissant par « Autre ». Ce registre suit quatre règles qui
serviront de modèle : la liste est fermée (pas de texte libre) ; une valeur ne se renomme jamais
parce que des enregistrements la portent ; le formulaire et tous les affichages lisent la même
liste ; on l'étend en ajoutant une ligne.

**Les composants d'un dispositif sont en base, à l'API et au formulaire** (03/09, étape 3 de
ce document). La table des dispositifs a une colonne `components` (position 80, texte JSON,
vérifiée en base) : une liste de composants, chacun avec une clé stable, un type et un rôle du
registre, un libellé libre. À la création d'un pôle, l'endpoint valide cette liste contre le
registre (type inconnu, rôle hors du type, clé dupliquée → refus) et fabrique la clé qui manque ;
une version suivante créée sans composants hérite ceux de la version précédente. Preuve par sonde
sur Muse Square le 03/09 : une V1 à deux composants écrite puis relue exacte, une V2 sans
composants relue avec les mêmes clés, les deux sondes effacées. Le document du pôle (page
engagement, `card-kit.js`) rend la section « Composants » avec le libellé, le type et le rôle,
ou dit l'absence. Le formulaire de pôle (`pole-form.js`, sur « Nouvelle opération » et sur l'onglet
Pôles du compte) propose les composants quand le contexte de création lui sert les types du
métier ; **il ne sert que les types et rôles dont le mot est arbitré** : sur Muse Square
(métier commerce) ce sont Vitrine, Linéaire, Gondole, Tête de gondole, Point service / vente avec
une personne, Autre ; table ou îlot, caisse, espace dégustation / atelier et tous les rôles du
libre-service attendent leur mot (lexique) pour apparaître. Le guard lexique scanne désormais
`pole-form.js`.

**La couche semantic connaît les composants** (03/09, appliqué par l'owner dans dbt Cloud
IDE). La colonne JSON est dépliée en lignes, une par composant et par version, dans un modèle
intermédiaire ; un mart en fact mince la matérialise en vue ; une vue semantic
(`vw_insight_event_dispositif_components`, contrat de 20 colonnes) expose les composants de la
version courante avec leur libellé et le drapeau « provisoire » lus dans deux seeds générés
depuis le registre de l'app. La vue mémoire (`vw_insight_event_commitment_memory`) porte les
composants et le coût saisi. Toute la chaîne est en vues : un composant déclaré dans l'app se
lit dans la session. Vérifié de bout en bout le 03/09 sur deux versions sonde de Muse Square,
lues dans les vues de production en 8,8 s, puis effacées. Le résolveur Explorer connaît les composants (03/09, étape 5.5 faite) : ils sont chargés
depuis la vue semantic, reconnus par leur libellé ou par leur type quand ils sont seuls de ce
type (« ma vitrine »), et une question sur un composant rend ses faits déclarés — pôle, type,
rôle s'il a un mot, version et date — puis les chiffres de son pôle, en disant que ses articles
ne sont pas encore reconnus. Le volet pôle de Piloter et l'onglet Pôles du compte listent les
composants ; le document du pôle lit les siens dans la vue mémoire. Plus aucun lecteur de composants
sur la table analytics, ni sur le mart (frontière entrepôt : l'app lit semantic). Vérifié le 03/09 sur une sonde de Muse Square (résolveur, lecture,
blocs, liste, prompt, mart), effacée ensuite.

**Une opération née d'une carte entre dans la mémoire du pôle** (03/09). Le formulaire
« M'engager » ouvert depuis une carte porte le même contrôle « Rattacher à un pôle » que
« Créer opération » ; la liste des pôles arrive avec le contexte d'objectif que le formulaire
lisait déjà, et l'engagement part avec son pôle. Le KPI de l'engagement reste celui de la carte :
le rattachement inscrit l'opération dans la mémoire du pôle, il ne change pas sa mesure.

**Les photos des composants existent, de bout en bout** (03/09, étape 4 incrément 1). Le bucket
privé `ms-dispositif-photo` (Europe) reçoit l'image ; l'application la sert elle-même, rien n'est
public ni signé. La table `analytics.dispositif_photos` garde une ligne par photo lue (clés de la
check-list du registre, codes d'articles de la liste du site, prix lus, couverture, modèle et
version de consigne). Sur le document d'un pôle, chaque composant porte « Documenter → » : le
navigateur réduit la photo à 1600 px, l'API l'écrit, la fait lire par le modèle avec une consigne
et un schéma générés depuis le registre, passe la réponse à la porte (toute clé hors registre ou
tout code hors liste = refus et image effacée) et rend la photo lue : réponses question par
question, articles reconnus par leur désignation. **Déviation acceptée par l'owner le 03/09** :
la détection d'une personne se fait par la lecture elle-même, côté serveur, et non sur le
téléphone ; quand une personne est visible, l'image est effacée aussitôt et aucune ligne n'est
écrite. Vérifié le 03/09 sur Muse Square avec une image de rayon synthétique portant trois de ses
articles et un intrus : lecture en 7,6 s, huit réponses, les trois articles reconnus (l'un à
confiance moyenne — l'appariement reste une proposition), l'intrus ignoré, ligne et image relues,
sondes effacées. L'exploitant confirme ou corrige les articles reconnus (03/09, incrément 2a) : sur la photo
lue, une case cochée par article et « Confirmer → » ; la confirmation est une nouvelle ligne de
la même photo, la dernière gagne, et les articles confirmés priment partout sur les reconnus.
Reste de l'étape 4 : l'étape d'onboarding qui appelle ce dépôt (D6), la marche filmée.

**Le premier livrable du chantier existe : ce qui est exposé et ne se vend pas** (03/09, livrable 2
du § 6). La couche semantic porte désormais la photo courante de chaque composant et les signaux
quotidiens par article (lot dbt 2, appliqué le 03/09). Sur le document d'un pôle, une section
« Articles des photos — 30 derniers jours » lit les articles vus sur les photos courantes, confirmés
par l'exploitant sinon reconnus, face à leurs ventes des trente derniers jours comparées à votre
résultat habituel par article : ceux en retrait (au moins cinq jours vendus, écart d'au moins dix
pour cent sous l'habituel), les autres, et les articles des familles du pôle vendus sans être vus
sur aucune photo. Dans Explorer, la lecture d'un composant nomme les articles de sa photo et ceux
en retrait. Tout vient des vues semantic. Vérifié le 03/09 sur Muse Square avec une photo sonde
confirmée sur deux articles : lecture en 0,9 s, deux vus avec leurs chiffres, dix-neuf non vus,
sondes effacées.

**On sait quel produit est sur chaque ligne de vente.** Chaque ligne importée de la caisse
contient le code de l'article, sa désignation, sa famille, le numéro de ticket ou de facture, et
l'heure. À partir de ces lignes, trois tables sont calculées : le profil de chaque article sur
30 jours (chiffre d'affaires, prix, rang), le signal quotidien de chaque article (écart de ses
ventes à son résultat habituel), et une vue qui expose tout cela à l'application.
Techniquement : `raw.client_transactions` (colonnes `item_code`, `item_description`,
`item_category`, `invoice_number`, `transaction_datetime`), puis `mart.fct_client_offering_profile`,
`mart.fct_client_item_signals_daily`, et la vue `semantic.vw_insight_event_client_offering`.

**Sur le compte de test Muse Square, il n'y a aucun panier.** Le compte compte 80 articles
distincts et 8 921 lignes de signal article du 03/04/2026 au 01/09/2026. Mais sur ses 30 204
lignes de vente entre le 02/07/2026 et le 30/09/2026 (les données de démonstration portent des
dates futures), il y a 30 204 numéros de facture différents : chaque ticket contient une seule
ligne. On ne peut donc pas y voir ce qu'un client achète ensemble. Mesure : `COUNT(*)` et
`COUNT(DISTINCT invoice_number)` sur `raw.client_transactions`, filtré
`STARTS_WITH(location_id,'f10c3e58')`.

**L'application ne sait pas stocker d'images.** BigQuery ne stocke pas de fichiers image et
aucune librairie de stockage de fichiers n'est installée. En revanche, le compte de service
Google que l'application utilise déjà pour BigQuery peut aussi écrire dans Cloud Storage.

**L'application n'envoie que du texte au modèle.** La fonction qui appelle Claude accepte une
consigne et un message texte ou JSON, et sait exiger une réponse dans un format imposé. Elle ne
sait pas encore envoyer une image. Techniquement : `callClaudeMessagesAPI` dans
`src/lib/ai/runtime/claude.ts`.

**La bibliothèque de références sectorielles ne connaît pas les types de dispositif.** Les cas
crawlés sont classés par métier, par levier (faire venir, convertir, augmenter le panier, fixer
le prix, faire revenir) et par intention. Rien n'y distingue un rayon d'une vitrine. Le registre
de sources fiables et le filtre qui rejette les cas non recommandables restent valables.
Techniquement : table `analytics.best_in_class_plays`, contrat `bestInClassCrawlCore.mjs`.

**Explorer comprend six sortes de questions.** Planifier une période, lire le résultat d'une
entité (un pôle, une famille, une opération, une personne), consulter le journal, demander
pourquoi, soumettre une idée, et tout le reste. Quand l'utilisateur soumet une idée, Explorer
reconnaît le levier et la condition visée, puis la place sur les jours à venir qui s'y prêtent.
Techniquement : `lib/ai/resolver.ts`, `lib/semanticRegistry.ts`, `lib/ideaPlacement.ts`.

**Le bouton « Documenter » existe déjà.** Sur le tableau, il transforme un objectif atteint en
dispositif déclaré, et sur les cartes de pôle il ouvre la fiche du pôle. C'est par là que la
photo entrera.

---

## 2. Les mots — validés le 03/09 [owner, D2], à inscrire au lexique

Aucun libellé visible par l'utilisateur ne s'écrit avant que l'owner ait choisi le mot. Les mots
ci-dessous sont ceux que l'owner a employés ou proposés pendant la session du 03/09 ; ils sont
validés par l'owner le 03/09 (D2) et sont inscrits au lexique. Les mots de l'après-midi du 03/09
ont levé presque tous les libellés provisoires : Îlot, Caisse, Espace dégustation, Service client
(forme courte de « point service / vente avec une personne »), Produits du quotidien, Produits de
connaisseur, Promotion, Service au comptoir, Conseiller clientèle, Accueil, Signalétique, et
« Rôle » pour le second menu du formulaire. Restent SANS mot, donc non rendus : le rôle impulsion
(« Achat d'impulsion » proposé) et le sous-type panneau de salle. Les seeds dbt se régénèrent
depuis le registre (`docs/dbt-handoff/HANDOFF-seeds-composants-2026-09-03.md`). Les clés de code, elles, sont internes et se figent au
premier enregistrement.

| Ce qu'il faut nommer | Mot employé ou proposé par l'owner le 03/09 | Clé interne |
|---|---|---|
| Le composant d'un dispositif : l'objet physique qu'on photographie | proposition owner : les mots du merchandising — **linéaire** (la longueur d'étagère ou d'alignement de meubles dédiée à une catégorie), **gondole** (le meuble central double face), **tête de gondole** (l'extrémité d'un rayon, très utilisée pour les promotions). « Rayon » reste le mot courant de la zone d'une catégorie, plus proche du pôle que du meuble. | `dispositif_type` |
| Ce que l'unité contient et comment on le choisit | aucun mot employé ; décrit par « courant », « expert », « impulsion », « promo » dans ce document | `dispositif_role` |
| La présentation qu'on voit depuis la rue | « vitrine » | `vitrine` |
| L'endroit où une personne sert ou conseille | « point service/vente avec une personne » | `point_assiste` |
| Ce qui permet à un musée de parler à son public (cartel, dispositif multimédia…) | « dispositif de médiation » | `mediation` |
| Ce que le client fait pour acheter : où il va, ce qu'il combine, ce qu'il doit marcher ou demander | « parcours d'achat », « customer's journey » | `parcours` |
| Le trajet le plus court qui permet d'acheter ce qu'un ticket contient | « idéal-type » (owner 03/09 : ce n'est pas la réalité, on ne sait pas s'il a hésité ou fait des allers-retours) | `parcours_minimal` |
| La photo, ou la série de photos d'une marche dans le magasin, comme pièce de la mémoire | aucun mot employé | `photo`, `walk` |

## 3. Le modèle [owner 03/09 : D1 et D2 tranchées]

**Trois niveaux : le pôle, ses dispositifs, leurs composants.** Le pôle est l'organisation (des
familles de produits, un responsable, des moyens). Un dispositif est une mise en place que le
pôle fait tourner, permanente ou datée ; un pôle peut en avoir plusieurs [owner 03/09]. Un
composant est une unité physique de ce dispositif : un linéaire, une gondole, une tête de
gondole, une vitrine… Un dispositif peut avoir plusieurs composants, et **c'est le composant
qu'on photographie** [owner 03/09, D1].

**Comment on gère plusieurs dispositifs sur un même pôle.** C'est déjà ainsi pour les
opérations datées : chacune est rattachée à son pôle (colonne `attached_pole_id`), le pôle lit
ses familles, l'opération lit son propre résultat. Les dispositifs permanents suivent la même
règle :

- chaque dispositif d'un pôle est un enregistrement à part, de nature permanente, rattaché au
  pôle par la même colonne ; la lecture continue du pôle ne change pas ;
- les composants sont listés DANS le dispositif (colonne `components`, une liste de
  {clé stable, type, rôle, libellé}), pas dans des enregistrements séparés ; réorganiser un
  composant crée une nouvelle version de son dispositif. Les versions restent au niveau du
  dispositif : la mémoire reste en un seul endroit ;
- chaque photo est rattachée à un dispositif, à une version et à une clé de composant ;
- le résultat d'un dispositif se lit sur les articles reconnus sur ses composants ; celui d'un
  composant, sur ses propres articles ; jamais de verdict « atteint / manqué » sur un permanent ;
- si deux dispositifs d'un même pôle vendent le même article, l'article compte pour les deux et
  la page le dit. On ne répartit jamais les ventes d'un article entre deux dispositifs par
  supposition ;
- par défaut, un pôle reçoit un dispositif créé avec lui et nommé comme lui ; un second n'existe
  que si l'exploitant le déclare.

**Un second registre, construit comme celui des types d'opération.** Un fichier
`src/lib/dispositifTypes.ts` liste les types de composant, leurs rôles, la liste de questions
attachée à chaque type, et la sélection à proposer selon le métier du lieu. Chaque liste finit
par « Autre ». Le formulaire, les affichages, la lecture des photos et le crawl lisent ce fichier
et lui seul. Chaque composant porte un type (l'objet physique) et, quand cela a un sens, un rôle
(ce qu'il contient).

**Une photo prouve une version.** Elle est rattachée au dispositif, à sa version et à son
composant, jamais au magasin en général. Réorganiser un composant, c'est une nouvelle version
du dispositif, donc une nouvelle photo.

**Une case cochée n'est jamais une carte.** Constater sur une photo qu'il manque quelque chose
ne suffit pas : l'exploitant voit son linéaire aussi bien que nous. Cela devient une carte
seulement quand trois pièces sont réunies : la case (ce que la photo montre), un écart mesuré
sur les articles ou la famille du composant, et une pratique documentée par une source fiable
pour ce type et ce rôle précis. Sans l'écart, c'est un audit d'étagère. Sans la source, c'est
un avis.

## 4. Les types, leurs rôles, et ce qu'une photo peut prouver

Deux axes, parce que les questions à poser dépendent des deux [owner 03/09] :

- **le type** dit l'objet physique : vitrine, linéaire, gondole, tête de gondole, table ou îlot,
  point assisté, caisse, espace expérience, dispositif de médiation ;
- **le rôle** dit ce que l'objet contient et comment le client le choisit : courant (par
  habitude, sans conseil), expert (il faut connaître pour choisir : poivres du monde, thés, vins),
  impulsion (de petits articles près du passage ou de la caisse), promo (une offre temporaire).

Une tête de gondole a presque toujours le rôle promo ; un linéaire peut avoir n'importe quel
rôle ; une vitrine ou un dispositif de médiation n'ont pas de rôle. Pour chaque type, une liste
de questions auxquelles une photo répond par oui, non, ou « on ne voit pas » ; certaines
questions ne se posent que pour un rôle donné. Les clés sont fermées ; les libellés visibles
restent à arbitrer.

### `vitrine` — ce qu'on voit depuis la rue

| Clé | La question | Levier | Ce que ça prouve, croisé avec les ventes |
|---|---|---|---|
| `vt_lisible_rue` | Peut-on lire le contenu depuis le trottoir, à hauteur d'œil ? | faire venir | entrées comparées au passage estimé des jours de même classe |
| `vt_prix_visible` | Au moins un prix est-il affiché ? (obligation légale en France) | convertir | case de conformité, pas de carte |
| `vt_offre_datee` | Le message porte-t-il une date ou une échéance ? | faire venir | l'opération correspondante existe-t-elle dans le journal ? |
| `vt_article_apparie` | Un article exposé figure-t-il dans la liste des articles vendus ? | panier | ventes de cet article pendant les jours d'exposition |
| `vt_change_depuis` | Le contenu a-t-il changé depuis la photo précédente ? | — | alimente la version ; jamais une carte seule |
| `vt_eclairee` | La vitrine est-elle éclairée et dégagée ? | faire venir | — |

### `lineaire`, `gondole`, `tete_de_gondole` — le libre-service

Les trois types partagent la même liste. Les questions marquées d'un rôle ne se posent que pour
ce rôle.

| Clé | La question | Rôle | Levier | Ce que ça prouve, croisé avec les ventes |
|---|---|---|---|---|
| `ls_moyen_essai` | Y a-t-il un moyen d'essayer : sentir, goûter, toucher, un échantillon ? | expert | convertir | famille ou articles sous leur habituel + « non » ici = la cause candidate du cas des poivres |
| `ls_usage_explique` | Un support dit-il à quoi sert le produit ou comment le choisir, et pas seulement d'où il vient ? | expert | convertir | idem |
| `ls_prix_par_article` | Chaque article porte-t-il son prix ? | tous | convertir | conformité ; article sans prix comparé à ses ventes |
| `ls_entree_gamme_oeil` | Y a-t-il un article d'entrée de gamme à hauteur d'œil ? | expert | panier | ventes des articles selon leur hauteur |
| `ls_groupement` | Les produits sont-ils groupés par usage (cuisine, moment) ou par origine ? | tous | panier | paires d'achats (nécessite des paniers) |
| `ls_facing_vide` | Un emplacement est-il vide au moment de la photo ? | tous | — | jours sans vente de l'article à la date de la photo |
| `ls_article_apparie` | Quels articles de la liste vendue reconnaît-on ? | tous | — | la base de toute lecture par article |
| `ls_meilleure_vente_visible` | Le meilleur vendeur de l'unité est-il visible et accessible ? | tous | panier | — |
| `ls_offre_datee` | L'offre affichée porte-t-elle une date de fin ? | promo | convertir | l'opération existe-t-elle dans le journal ? |
| `ls_double_face_coherente` | Les deux faces de la gondole se répondent-elles (même univers) ? | gondole | panier | paires d'achats entre les deux faces (nécessite des paniers) |

### `table_ilot` — une présentation libre au milieu du magasin

Questions : le regroupement raconte-t-il un usage ou une saison (`il_theme_lisible`), les prix
sont-ils visibles (`il_prix_visible`), quels articles reconnaît-on (`il_article_apparie`), a-t-il
changé depuis la dernière photo (`il_change_depuis`).

### `point_assiste` — une personne sert ou conseille

Rôles propres à ce type : `comptoir_service` (la personne sert le produit : traiteur, fromage,
découpe), `point_conseil` (la personne conseille, le produit est ailleurs), `billetterie_accueil`
(accueil ou vente de billets, dans la culture et les loisirs).

| Clé | La question | Levier | Note |
|---|---|---|---|
| `pa_produit_visible_client` | Le client voit-il les produits depuis son côté du comptoir ? | convertir | |
| `pa_prix_visible` | Les prix sont-ils affichés côté client ? | convertir | conformité |
| `pa_degustation` | Une dégustation ou un essai est-il proposé ? | convertir | |
| `pa_file_lisible` | Sait-on où se mettre pour attendre ? | convertir | |
| `pa_heures_tenues` | À quelles heures le point est-il tenu ? | — | **Une photo ne le montre pas.** Il faudrait le planning, qui n'existe pas dans nos données : on connaît l'équipe, pas ses heures. |

### `caisse` — la zone d'encaissement

Questions : y a-t-il des articles d'impulsion (`cs_impulsion_presente`), le programme de
fidélité est-il visible (`cs_fidelite_visible`), les moyens de paiement sont-ils affichés
(`cs_paiement_affiche`). Leviers : panier, faire revenir.

### `espace_experience` — dégustation, atelier, démonstration

Questions : le voit-on depuis l'entrée (`ex_visible_depuis_entree`), les articles concernés
sont-ils à portée (`ex_lie_a_articles`), l'horaire est-il affiché (`ex_horaire_affiche`).
Leviers : convertir, faire revenir.

### `mediation` — ce qui permet à un musée de parler à son public [owner 03/09]

Ce type ne vend rien : son résultat ne se lit pas sur des articles mais sur la fréquentation et
le temps passé, qui existent dans nos données (affluence estimée par classe de jour ; comptage
si le lieu en a un). La boutique du musée, elle, reste un linéaire.

| Sous-type | Ce que c'est |
|---|---|
| `cartel` | l'étiquette d'une œuvre ou d'un objet |
| `panneau_de_salle` | le texte d'introduction d'une salle ou d'une section |
| `multimedia` | écran, borne, audioguide, dispositif interactif |
| `signaletique` | ce qui guide le visiteur dans le parcours |

| Clé | La question | Ce que ça prouve, croisé avec la fréquentation |
|---|---|---|
| `md_lisible_hauteur` | Le texte se lit-il à hauteur d'œil, avec une taille de caractère suffisante ? | — |
| `md_eclaire` | Le support est-il éclairé sans reflet ? | — |
| `md_langues` | Quelles langues le support propose-t-il ? | à croiser avec les classes de jours de tourisme étranger mesurées sur le lieu |
| `md_pres_de_l_oeuvre` | Le support est-il placé à côté de ce qu'il explique ? | — |
| `md_en_marche` | Le dispositif multimédia est-il allumé et en état de marche au moment de la photo ? | jours de panne comparés à l'affluence |
| `md_change_depuis` | Le support a-t-il changé depuis la photo précédente ? | alimente la version |

### `autre`

Toujours en fin de liste. Pas de questions. Jamais de texte libre sur le type.

### Quels types proposer selon le métier du lieu

| Métier (codes du profil) | Types proposés |
|---|---|
| Commerce et retail | vitrine, linéaire, gondole, tête de gondole, table ou îlot, point assisté, caisse, espace expérience, autre |
| Restauration et bars, marchés et halles, œnotourisme | vitrine, linéaire, point assisté, espace expérience, caisse, autre |
| Culture et patrimoine, galeries, cinéma et théâtre, sciences | dispositif de médiation, point assisté (billetterie et accueil), vitrine, linéaire (la boutique), caisse, autre |
| Hôtellerie, camping, parcs, sport, bien-être | point assisté (accueil), vitrine, linéaire (la boutique), autre |
| Salons professionnels, centres de congrès, coworking, événementiel | point assisté, vitrine, autre |
| Métier inconnu | tous les types |

## 5. Comment ça marche techniquement

### 5.1 La prise de vue : des photos déposées ; la marche filmée en plus [owner 03/09, D3]

**Les premières photos se prennent à la création du compte** [owner 03/09, D6]. L'onboarding
(`src/pages/onboarding.astro`) gagne une étape après la déclaration des pôles : pour chaque pôle,
ses dispositifs et leurs composants, avec une photo par composant. Un composant sans photo est
accepté, mais l'application le redemandera. Ensuite, l'application demande des précisions
seulement quand elle en a besoin : un composant sans photo, une nouvelle version déclarée sans
nouvelle photo, une lecture qui ne peut pas conclure (« on ne voit pas » sur une question qui
compte). Jamais de rappel à date fixe.

**Le chemin courant : déposer des photos.** Depuis le bouton « Documenter » d'un pôle,
l'exploitant choisit le dispositif, le composant, et dépose une ou plusieurs photos prises avec
son téléphone. Une consigne à l'écran : le composant en entier, de face, sans personne dans le
champ. Tout le reste du document fonctionne à partir de ces seules photos.

**Le plus : une marche filmée.** L'exploitant filme une marche de deux minutes dans son magasin,
avant l'ouverture, quand il est vide, et s'arrête deux secondes devant chaque composant. La page
enregistre avec la caméra, repère elle-même les moments où l'image est immobile, en tire des
photos fixes et les envoie avec l'heure de chacune ; la vidéo ne quitte jamais le téléphone et
le serveur ne traite aucune vidéo. La marche n'apporte qu'une chose de plus que les photos
déposées : l'ordre de passage, donc le plan du magasin (§ 7).

Toute image où apparaît une personne est écartée : la lecture elle-même le détecte et l'API
efface l'image aussitôt, sans écrire de ligne (déviation acceptée par l'owner le 03/09 — un
navigateur n'a pas de détecteur de personne fiable ; le contrôle est côté serveur, avant tout
enregistrement). Une photo de composant avec un visage devient une donnée personnelle. La règle
est automatique ; on ne compte pas sur la mémoire de l'exploitant.

Écarté : le scan LiDAR (réservé aux iPhone Pro, exige une application native, donne des murs
sans produits, et aucune lecture n'a besoin de mètres) ; toute captation des clients.

### 5.2 Le stockage

**Les images sont stockées chez nous, pas chez le client** [owner 03/09, D7]. L'application
doit lire chaque image pour l'analyser, puis la montrer des mois plus tard comme preuve d'une
version : lire dans le Drive de chaque client demanderait un connecteur par client et casserait
la mémoire le jour où un dossier est déplacé. Elles vont donc dans un espace Cloud Storage de
notre projet, en région Europe, rangées par magasin puis par dispositif, et ne sont servies que
par des liens signés à durée limitée. C'est le même compte de service que pour BigQuery, avec la
librairie `@google-cloud/storage`. Trois règles, à écrire dans les conditions du service : les
images appartiennent au client ; elles sont supprimées à sa demande ou à la fermeture du compte ;
aucune image contenant une personne n'est stockée. La vidéo, elle, ne quitte jamais le téléphone.

Deux tables dans BigQuery, alimentées par l'application, où l'on ajoute des lignes sans jamais en
modifier :

- **La table des marches** (seulement si la marche est construite) (`analytics.dispositif_walks`) : une ligne par marche, avec le
  magasin, la date et l'heure, le nombre d'images, et la liste des composants reconnus dans l'ordre
  du passage avec l'heure de chacun. L'ordre de passage donne quels composants sont voisins ;
  l'écart de temps donne une distance relative (même allée, voisin, loin), jamais des mètres.
- **La table des photos** (`analytics.dispositif_photos`) : une ligne par photo, avec la marche
  d'origine s'il y en a une, le magasin, le dispositif, sa version et la clé du composant, la position dans la marche,
  le lien vers l'image, le type et le rôle, les réponses à la liste de questions, les
  articles reconnus avec leur degré de confiance, les articles confirmés par l'exploitant, un
  indicateur de couverture (a-t-on vu tout le composant ?), le modèle et la version de consigne
  utilisés, et la date. Pour lire l'état d'un dispositif, on prend la dernière photo de sa
  version courante. C'est le même fonctionnement que la table du contexte web
  (`context_enrichment`).

Les créations de colonnes et de tables suivent le geste du 27/08 (écrire une ligne de sonde, la
relire, l'effacer) et sont consignées dans `data-model-index.md` dans le même commit.

### 5.3 La lecture des photos

La fonction qui appelle Claude est complétée pour accepter des images en plus du texte, dans le
même fichier : `module-index.md` interdit de créer un second point d'appel.

Une photo, un appel. La réponse est un formulaire imposé, jamais un texte libre : pour chaque
question du type (et du rôle, s'il en a un), oui, non ou « on ne voit pas », avec la zone de l'image concernée ; la
liste des articles reconnus ; les prix lisibles. La liste des articles du magasin (80 lignes sur
Muse Square) est fournie au modèle dans la consigne, et il répond par des codes d'article, pas
par des noms.

Un contrôle automatique vérifie ensuite la réponse, sur le même principe que le contrôle du mode
enquête : un code d'article qui n'est pas dans la liste du magasin est rejeté ; une question qui
n'est pas dans le registre est rejetée ; on vérifie que le modèle n'a pas refusé de répondre
avant de lire sa réponse. Le test qui prouve que ce contrôle attrape bien une invention est
livré dans le même commit.

Quand plusieurs photos montrent le même composant, elles se fondent en un seul état par version :
une réponse nette l'emporte sur « on ne voit pas » ; deux réponses contradictoires donnent
« on ne voit pas ».

La reconnaissance des articles reste une proposition. Quand l'exploitant la confirme ou la
corrige, c'est sa version qui compte partout ensuite.

### 5.4 Les références sectorielles par type de dispositif

Le crawl des bonnes pratiques gagne une dimension : le type de dispositif et son rôle, en plus du
métier et du levier. Chaque cas trouvé dit quelle question de la liste il documente. Le registre de
sources fiables et le filtre qui écarte les cas non recommandables ne changent pas : un cas venu
d'une source hors registre reste rejeté.

Un cas crawlé est une preuve (« telle pratique, telle source »), jamais un plan (mémoire
`methodes-pertinentes-chantier`).

### 5.5 Explorer

Explorer apprend à reconnaître un dispositif permanent et ses composants parmi les entités du compte, par son type, son
rôle et le nom de son pôle. Demander le résultat d'un dispositif ou d'un composant sur une période donne la
lecture de ses articles reconnus. Demander « pourquoi » montre la photo de la version en preuve.
Une question de la liste qui a reçu « non » peut être soumise comme une idée, avec son levier,
et Explorer la place comme n'importe quelle idée. Aucune nouvelle sorte de question n'est
nécessaire dans cette première version.

---

## 6. Ce que l'exploitant obtient, dans l'ordre, et à quelle condition

| # | Ce qu'il obtient | Ce qui existe | Ce qui manque | Passe-t-il la barre (vrai · invisible seul · actionnable) ? |
|---|---|---|---|---|
| 1 | La version d'un dispositif avec les photos de ses composants, dans sa lecture continue | la chaîne de versions, la lecture de pôle, la page engagement | le stockage (5.2) | oui : la photo dit à quoi ressemblait ce que la mesure juge |
| 2 | Les articles exposés qui ne se vendent pas ; les articles vendus qu'on ne voit sur aucune photo | **FAIT 03/09** : vues semantic photos + signaux article, section du document du pôle, prose du composant dans Explorer | — | oui : invisible seul ; l'absence est relative aux photos prises |
| 3 | Une question à « non », un écart mesuré et une source, réunis en un dispositif à mettre en test | l'idée soumise, les leviers, le filtre des références, les versions | la typologie (§ 4), 5.3, 5.4 | oui, seulement avec les trois pièces |
| 4 | Ce qui a changé entre deux photos d'un même composant, proposé comme nouvelle version | les versions | la comparaison entre deux lectures | oui : c'est la réponse au chantier « Notez ce qui a changé » |
| 5 | Le parcours d'achat | le numéro de ticket, l'heure des ventes | des paniers, un plan des zones (§ 7) | **bloqué par les données** |
| 6 | Le point tenu par une personne comparé aux ventes par heure | les ventes par heure, l'équipe | les heures de présence | bloqué : aucun planning dans nos données |

## 7. Le parcours d'achat : trois obstacles, une réponse chacun

**Premier obstacle : aucun panier sur le compte de test.** C'est un défaut des données de
démonstration, pas de l'import : l'import lit déjà le numéro de ticket ligne par ligne. Réponse :
re-semer le compte Muse Square avec un jeu de données où les tickets ont plusieurs lignes
(D4 : oui, plus tard), puis valider sur un vrai export d'Épices et Tout ou de Sage 100.

**Deuxième obstacle : un ticket ne dit jamais où le client est allé.** Il dit ce qu'il a acheté.

Ce qu'on peut tout de même reconstituer à partir du ticket [owner 03/09] : **le parcours
idéal-type**. Connaissant le plan des zones et les zones où se trouvent les articles du ticket,
on calcule le trajet le plus court qui part de l'entrée, passe par ces zones et finit à la
caisse. C'est l'effort minimal que cet achat exigeait. Ce n'est pas la réalité : on ne sait pas
si le client a hésité, fait des allers-retours ou traversé une zone sans rien y prendre. Il
s'affiche donc toujours comme un minimum. Il donne deux lectures honnêtes : la distance minimale
par ticket (en nombre de zones traversées), et les combinaisons d'articles qui obligent à
traverser le magasin.

Pour savoir où le client est réellement passé, trois réponses, de la moins chère à la plus
chère :

- un relevé fait par l'équipe : quinze minutes sur quelques créneaux, devant une unité donnée,
  compter combien de personnes s'arrêtent, touchent, achètent. Aucune donnée personnelle. Cela
  passe par les canaux déjà en place (Slack, vue membre). C'est la seule réponse qui produit une
  observation, et non une déduction ;
- le taux d'achat par zone, comme substitut : la part des tickets qui contiennent les familles
  de cette zone, et le nombre de tickets par visiteur si un comptage à l'entrée existe. Cela se
  dit « on y a acheté », jamais « on y est passé » ;
- des capteurs en magasin (Wi-Fi et Bluetooth, très encadrés par la CNIL ; caméras sous
  conditions) : écartés, ce n'est pas notre métier.

**Troisième obstacle : aucun plan du magasin.** Réponse : la marche filmée (5.1). L'ordre de
passage dit quelles unités sont voisines ; l'écart de temps donne une distance relative (même
allée, voisin, loin). **Le scan LiDAR n'est pas nécessaire** [owner 03/09, question posée] :
il ajouterait des mètres et un plan dessiné, et aucune lecture ci-dessus n'en a besoin. Une
seule chose échappe au film : les deux faces d'une gondole sont loin l'une de l'autre en temps
de marche mais dos à dos physiquement. L'exploitant le confirme en une minute (« ces deux
unités sont dos à dos ») à la fin de la marche ; le plan est corrigé sans mesure.

Une fois les paniers et le plan disponibles, on peut lire : les familles achetées ensemble (et
combien plus souvent que le hasard), le parcours idéal-type de chaque ticket, et les tickets qui
contiennent un article vendu uniquement au comptoir (le client a donc demandé un vendeur). La
carte qui en sort : des familles achetées ensemble mais placées loin l'une de l'autre, ce que
l'exploitant peut changer. Toute lecture des « zones délaissées » est une déduction et se
présente comme telle.

## 8. Les décisions — toutes tranchées le 03/09 [owner]

| # | La question | Décision |
|---|---|---|
| D1 | Qu'est-ce qu'on photographie ? | Un composant du dispositif ; un dispositif peut en avoir plusieurs (§ 3). |
| D2 | Les mots du § 2 | Validés, avec la règle du § 3 pour un pôle à plusieurs dispositifs. À inscrire au lexique. |
| D3 | La prise de vue | Les photos déposées sont le chemin obligatoire ; la marche filmée est un plus, pas une condition. |
| D4 | Re-semer Muse Square avec des tickets à plusieurs lignes (remplacer les ventes de démonstration du compte de test par un jeu où un ticket contient plusieurs articles) | Oui, mais plus tard. Aucune spec du parcours avant. |
| D5 | Photographier les vitrines des concurrents | Écartée : personne ne photographie un concurrent pour nous. Retirée du document. |
| D6 | Quand demande-t-on des photos à l'exploitant ? | À la création du compte : les photos des composants font partie de l'onboarding. Ensuite, l'application demande des précisions quand elle en a besoin (un composant sans photo, une version déclarée sans nouvelle photo, une lecture qui ne peut pas conclure). Pas de rappel mensuel. |
| D7 | Les images chez nous ou chez le client ? | Chez nous : bucket `ms-dispositif-photo` (Cloud Storage, EU, privé — créé le 03/09), avec les trois règles de propriété, suppression et absence de personnes (5.2). |
| D8 | Le parcours idéal-type reconstitué depuis le ticket entre-t-il dans la première spec du parcours ? | Oui. |

## 9. Ce qui reste à faire, dans cet ordre

1. (fait le 03/09 pour onze mots — § 2.) Restent : le rôle impulsion et le panneau de salle ;
   appliquer la passation des seeds dans dbt Cloud IDE.
2. (fait le 03/09 : mots au lexique, registre et garde, ligne dans `module-index.md`.)
3. (fait le 03/09 : colonne, endpoint, document du pôle, formulaire — § 1.) Reste, lié au
   point 1 : les rôles du libre-service et trois types n'apparaissent au formulaire qu'une fois
   leur mot arbitré.
3b. (fait le 03/09 : chaîne semantic en base — PR #93 — et lecteurs Explorer / Piloter /
   Compte / document du pôle basculés sur la vue et le mart, § 1.)
4. (fait le 03/09 : bucket, table, transport image, lecture + porte avec lie-bait — § 1.)
5. (fait le 03/09 : dépôt sur le document du pôle et confirmation des articles — § 1.) Reste
   l'étape d'onboarding qui l'appelle pour chaque composant (D6).
6. Livrer les résultats 1 et 2 sur Muse Square (80 articles, photos d'Épices et Tout), vérifiés
   par le harnais et non à l'œil.
7. Ajouter le type et le rôle au crawl (5.4) ; livrer le résultat 3.
8. Les demandes de précision de l'application (D6, second temps) : composant sans photo, version
   sans photo, lecture non concluante.
9. La marche filmée (5.1, le plus) : seulement quand le parcours (§ 7) est à l'ordre du jour.
10. D4 (re-semer le compte de test), puis la spec du parcours avec le parcours idéal-type (D8).
