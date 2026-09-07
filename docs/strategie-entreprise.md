# Stratégie d'entreprise — place, offre, segments, séquençage — SPEC DE TRAVAIL

Graine du business plan. Ouvert le 30/08/2026 (session deck de présentation).
Chaque affirmation porte sa source : **[owner]** = arbitrage, **[vérifié]** = lu dans le code
ou une source datée, **[à instruire]** = ouvert. Le scan de marché vit à part
(`positionnement-scan-concurrentiel.md`, DÉFINITIF) — ce document dit ce qu'on en FAIT.

---

## 1. La place revendiquée

**Muse Square est le système de référence des actions commerciales et de leurs résultats.**
[owner 30/08]

L'analogie qui l'installe en une phrase, sans jargon :
> La caisse dit ce qui s'est vendu. Le CRM dit qui a acheté.
> Muse Square dit ce que vous avez fait, et si ça a marché.

Le CRM est le système de référence de la relation client ; Muse Square est celui des dispositifs
commerciaux et de leur verdict. Personne n'occupe cette place sous le Fortune 500 (Cloverpop
l'occupe au-dessus, hors donnée d'exploitation — scan §1.E).

**Ligne de couverture du deck** [owner 30/08, adjectif révisé le 01/09] :
> Muse Square, la mémoire opérationnelle de votre organisation

Objectif à terme : que « mémoire » suffise, sans adjectif — comme « CRM » s'est imposé.

**L'adjectif est passé de « commerciale » à « opérationnelle » le 01/09** [owner], après
vérification : « mémoire commerciale » n'est pas libre — la formule circule comme surnom du
CRM (« Le CRM est la mémoire commerciale de votre entreprise ») et désigne la mémoire du
CLIENT (coordonnées, échanges, pipeline), pas celle de ce qu'on a fait. Elle rangeait donc le
produit dans la catégorie dont il se distingue. « Mémoire opérationnelle » a un sens gestion
établi — l'ensemble des processus, procédures et **bonnes pratiques** qui assurent le
fonctionnement au quotidien — qui recouvre les dispositifs et les bonnes pratiques du produit.
Son autre sens, cognitif (mémoire de travail, en psychologie et ergonomie), est académique et
ne parasite pas un lecteur d'entreprise. **Appliqué sur le site le 01/09** (11 occurrences :
H1, title, meta, description par défaut de BaseLayout, JSON-LD, 3ᵉ bloc de l'accueil, protos)
et sur le deck.

**Appui de marque [vérifié]** : dans la mythologie grecque, les Muses sont les filles de
Mnémosyne, Titanide de la Mémoire. Le nom et la place partagent la même racine.

### Ce qui a été écarté, et pourquoi

| Candidat | Motif de rejet |
|---|---|
| « copilote opérationnel » (couverture actuelle du deck + site) | générique depuis Microsoft ; sous-vend — un copilote assiste puis oublie [scan §4] |
| « votre direction commerciale automatisée » | en France « direction commerciale » = prospection/CRM (Modjo, HubSpot) ou direction externalisée à temps partagé ; menace le directeur commercial qui lit le deck ; vend l'automatisation, que le POS bundle gratuitement [vérifié 30/08] |
| « votre RevOps automatisé » | RevOps 2026 = PME **B2B**, alignement marketing/ventes/CS autour d'un pipeline ; un camping ou un musée n'a ni pipeline ni le mot [vérifié 30/08] |
| « ERM — Environment Relationship Management » | ERM = Enterprise Risk Management, catégorie logicielle vendue en France ; « environnement » se lit écologie/RSE en français ; et le nom désigne l'ENTRÉE (le contexte, banalisé) au lieu de ce qui est stocké [vérifié 30/08] |
| créer un sigle à trois lettres | l'espace commercial en *M est saturé (CDM = Decision Management IBM/ACTICO ; CAM = Corporate Actions + CAO industrielle) ; imposer une catégorie coûte des années de budget |
| « mémoire **commerciale** » | surnom courant du CRM en France — la formule désigne la mémoire du client (coordonnées, échanges, pipeline), pas celle des opérations menées ; elle range le produit dans la catégorie dont il se distingue [vérifié 01/09] |

**Piège français permanent** : ne jamais employer « gestion commerciale » — catégorie massive et
occupée (Sage, EBP : facturation, devis, stocks). Le prospect entend « compta ».

### Deux chantiers ouverts par ce choix

1. **« mémoire » n'a AUCUNE entrée dans `docs/lexique.md`** [vérifié 30/08]. Le savoir accumulé
   s'y appelle « Connaissances créées » (tuile) et « Mes dispositifs » (section). Le mot ne
   deviendra « mémoire tout court » que si le PRODUIT le dit aussi : arbitrer le mot au lexique,
   puis décider si « Connaissances créées » s'aligne ou reste distinct. [à instruire]
2. **Variante « publics »** : le vocabulaire € ne se transpose pas à un musée subventionné ni à
   une régie publique — cibles que le critère de qualification retient. Une variante
   fréquentation/publics reste nécessaire. Le passage à « organisation » (au lieu d'« entreprise »)
   et à « opérationnelle » (au lieu de « commerciale ») lève une partie du problème : les deux
   mots couvrent le public comme le privé. [à instruire]

---

## 2. Qui est client — le critère, corrigé

Le critère du 20/08 (« existe-t-il quelqu'un dont c'est le métier de regarder la fréquentation
chaque semaine ? ») excluait le commerce à 2-3 personnes — et contredisait Épices et Tout, client
réel. **Formulation corrigée [owner 30/08]** :

> Existe-t-il une personne qui DÉCIDE du commerce et qui regardera chaque semaine ?

Dans une TPE, c'est le patron : Épices et Tout a déclaré ses pôles, donc quelqu'un lit. Ce que le
critère exclut vraiment : le lieu où PERSONNE n'a cela dans ses attributions (gérant absent, musée
sans chargé de développement des publics).

---

## 3. L'échelle d'offre

À chaque palier, le client achète **sa** mémoire opérationnelle. Les paliers ne diffèrent que par
**où elle vit** et **combien de sites elle couvre** — jamais par une liste de fonctionnalités.

| Palier | Cible | Ce qui est vendu | État |
|---|---|---|---|
| **Solo / mono-site** | TPE type Épices et Tout, Houdan | le produit tel quel, chez nous, un site | livrable aujourd'hui |
| **Réseau** (le palier qui paie) | parcs de loisirs (~650, 4 Md€), hôtellerie de plein air (~2 500 entreprises, ~18 salariés), grands sites payants, réseaux multi-sites | le produit tel quel, tous les sites, avec la répartition par site | livrable aujourd'hui, **prix supérieur, zéro R&D** |
| **Grand compte** | structures à DSI | la MÉTHODE sur leur pile, avec leurs paramètres | 4 chantiers à construire (§4) |

**Le palier du milieu est le moteur de trésorerie** : il achète sans R&D et finance les chantiers
grands comptes. L'échelle esquissée le 30/08 (TPE puis grands comptes) le sautait — des clients de
la taille d'Épices et Tout ne financent pas de la R&D grands comptes ; sans ce palier, il faut lever.

---

## 4. État vérifié de la pile face à l'offre grands comptes

[vérifié 30/08, lecture du code]

| Ligne d'offre | État réel |
|---|---|
| Données traitées chez MS | **existe** — BigQuery EU, isolation applicative par requête |
| Couche sémantique du client hébergée chez MS | **partiel** — la couche dbt existe mais elle est MUTUALISÉE : tous les clients dans le même projet BigQuery. Un tenant dédié est un chantier d'infrastructure |
| Exécution chez le client (BYOC / on-prem) | **à construire** — déploiement, mises à jour, support, chaîne dbt Cloud à répliquer. L'engagement le plus lourd du SaaS |
| Leur IA / IA locale avec les paramètres MS | **à construire** — un seul adaptateur existe (`src/lib/ai/runtime/claude.ts`), aucun autre fournisseur : il faut d'abord une abstraction |
| KPI et signaux sur mesure | **à construire** — la liste des KPI est un type + un registre FIGÉS en code (`src/lib/kpi/kpiRegistry.ts:47`), un seul foyer volontaire. Un KPI client = un déploiement, pas un réglage |

---

## 5. Thèse de marché — la mémoire et l'IA

Le marché de la mémoire IA est réel et en croissance, mais **deux marchés portent ce mot** et ils
ne se vendent pas au même acheteur :

- **Infrastructure de mémoire pour agents** — Mem0 (41 000 étoiles GitHub, 24 M$ levés), Zep/Graphiti,
  Letta, Cognee, Supermemory, LangMem, Cloudflare. Acheteur = développeur ; open source ; acteurs
  américains financés ; convergence annoncée vers un standard (graphe + temporel) fin 2026, donc
  **commoditisation**. [vérifié 30/08]
- **Mémoire des décisions commerciales d'un lieu** — acheteur = exploitant ; aucun concurrent sous
  le Fortune 500 ; le fossé est la connaissance métier.

**Arbitrage [owner 30/08 + analyse] : ne pas devenir un middleware générique** entre serveurs et
base client. Ce rôle change l'acheteur (une DSI), efface le fossé (une couche générique ne
transporte ni la méthode de verdict, ni les portes de bruit, ni le droit français, ni les classes
de jour) et met en face Cube, dbt, Databricks et Mem0 réunis, tous mieux capitalisés.

**La version qui tient** : ce qui est portable chez Muse Square n'est pas le stockage, c'est **le
jugement**. Mem0 et Zep stockent et retrouvent des faits ; aucun ne dit si une décision a produit
un effet. L'actif transportable est la méthode — mesure contre le résultat habituel, refus de
conclure dans le bruit, correction des variables corrélées, base de mesure affichée.

> Le stockage se commoditise en 2026. Savoir QUOI garder et sur quelle preuve, non.

C'est ce que « leur IA avec les paramètres MS » veut dire — et ça se vend au même acheteur que le
produit, pas à une DSI.

---

## 6. Séquençage

1. **Court terme** — Épices et Tout et gabarits équivalents : la preuve et les premiers revenus.
2. **Moyen terme** — le palier réseau : le produit tel quel, plus cher, sans R&D. C'est lui qui finance la suite.
3. **Ensuite** — grands comptes sur mesure, vendus comme MÉTHODE sur leur pile, jamais comme
   middleware — financés par le palier réseau ou par une levée.

---

## 7. Conséquences immédiates sur le deck

- **Rien de cette stratégie ne va dans le deck de lancement** : c'est une thèse d'entreprise, pas
  une promesse client. La règle tient — ne rien écrire que la démo ne tienne.
- La page 5 « Sécurité & Données » affirme l'hébergement BigQuery EU et l'API Anthropic. Toute
  offre « chez eux, avec leur IA » la contredit page à page : les deux ne peuvent pas coexister
  dans le même document.
- Répartition arrêtée pour la couverture : **le titre porte l'actif (la mémoire), la page 2 prouve
  l'usage quotidien** (signaux et actions du jour) et referme sur ce qui reste.

---

## 8. Ce qui manque pour l'échelle — diagnostic mesuré

Ouvert le 05/09/2026 sur une question owner : que manque-t-il pour que Muse Square soit la mémoire
opérationnelle de toutes les entreprises, en produit de masse ? Les manques ne sont pas du même
ordre — un seul est un problème d'ingénierie.

### 8.1 L'accumulation réelle, à ce jour

[vérifié 05/09, requêtes sur `muse-square-open-data`]

| Ce qui est accumulé | Mesure |
|---|---|
| Sites profilés (`raw.insight_event_user_location_profile`) | 18 |
| Sites portant des données de caisse | **5**, dont 4 sur la graine de démonstration (`seed_maven`) |
| Données de caisse d'un client réel | **1 site** — `sage100`, 6 297 lignes, dernière date 27/07/2026 |
| Dispositifs, toutes natures (`analytics.action_commitments`, latest-wins) | 18, sur 4 sites, du 25/06 au 30/08/2026 |
| Dispositifs jugés | 10 |
| Cas « ailleurs » (`analytics.best_in_class_plays`) | 63, sur 5 codes métier sur 23 — tous CRAWLÉS : la table porte `source_name` / `source_url` / `source_tier`, **jamais de `location_id`** |

C'est toute la mémoire que le produit a accumulée. **Il n'a jamais tourné à une échelle où la
mémoire vaut plus qu'un tableur** : tout ce qui suit reste une prédiction tant qu'une poignée de
sites réels n'a pas accumulé une année de dispositifs. C'est le premier fait à aller chercher,
avant tout arbitrage sur la suite.

### 8.2 Le substrat du verdict ne se généralise pas — ce n'est pas un problème d'ingénierie

`intent.md` dit « un lieu qui reçoit du public ». Ce n'est pas un périmètre commercial, c'est une
PRÉCONDITION STATISTIQUE. Le résultat habituel — la référence de toute comparaison — n'existe que
parce qu'un lieu produit des centaines de transactions par jour, tous les jours, avec une
saisonnalité hebdomadaire. Le résidu, les portes de bruit, la correction des variables corrélées et
les classes de jour sont tous bâtis dessus.

Une agence, un éditeur, un industriel, un grossiste n'ont pas ce régime : douze affaires par
trimestre, aucun effet jeudi, ni météo ni zone de chalandise. **Il n'y a pas de résultat habituel du
jeudi pour une entreprise qui facture au mois.** Or le fossé revendiqué au § 5 est le JUGEMENT, pas
le stockage : sans ce substrat, il ne reste qu'un journal de décisions sans verdict — la place que
Cloverpop occupe déjà (scan § 1.E).

« Toutes les entreprises » se scinde donc en deux produits, pas en un marché plus grand.

### 8.3 L'entrée de données — le seul manque purement technique

[vérifié 05/09, `src/lib/import/sourceMappings.ts`]

Quatre sources nommées sont déclarées — `isavigne`, `tpvin`, `sumup`, `sage100` : **les quatre
overrides sont vides**. Tout tourne sur la couche générique, et chaque fichier réel est mappé à la
main depuis un export réel. Brancher un client = obtenir un export, lire ses en-têtes, écrire un
mapping, vérifier ses pièges — une journée par famille de caisse, et la France en compte des
centaines. C'est un geste de conseil, pas un produit.

L'inverse — « déposez n'importe quel CSV » — ne marche pas davantage. Relevé le 05/09 en instruisant
la caisse Crisalid d'Épices et Tout : HT ou TTC, les annulations à soustraire, les 25 types de
document dont l'inventaire et les mouvements de stock à exclure, les lignes vendues au poids qui
arrondissent à zéro sur une colonne `quantity INT64`. Ces choix-là font qu'un chiffre est vrai ou
faux. Le self-serve suppose donc une **inférence sémantique automatique avec une boucle de
vérification que le client voit et corrige** — jamais un importeur permissif. [à instruire]

### 8.4 La mémoire est par site ; il n'y a pas de mémoire croisée

À 500 clients, le produit ferait aujourd'hui 500 carnets isolés : la valeur ne monterait pas avec le
nombre. C'est ce qui sépare un actif d'un abonnement.

Les objets existent déjà — `means_lever`, `mechanism_factors`, `confirmation_test` sur la pratique ;
le verdict et les versions sur le dispositif. **Ce qui manque est la boucle qui transforme le
dispositif prouvé du site A en hypothèse du site B**, avec la discipline intacte : prouvé chez A
n'est pas une preuve chez B, c'est une mise en test. Le palier réseau (§ 3) le traite comme un prix ;
c'est d'abord un mécanisme de connaissance. [à instruire]

### 8.5 La curation est le fossé ET le plafond — le même objet

[vérifié 05/09]

`eventTypes.ts` : 23 valeurs, 17 codes métier curatés sur 23. `reco-library.js` : 786 lignes dont
457 commentées, soit 13 plans écrits en voix owner. `kpiRegistry.ts` : 9 clés de KPI, union
TypeScript figée. Plus le lexique et les contraintes de droit français.

Tout est curaté à la main, par l'owner, métier par métier — c'est précisément ce qui fait qu'une
carte dit quelque chose qu'un outil générique ne peut pas dire (test de valeur, `intent.md`). C'est
aussi pourquoi le produit ne monte pas en ajoutant des clients, mais en ajoutant de la curation :
**tant que la curation vient de l'owner, le nombre de clients est plafonné par son temps.**

S'y ajoutent la couche dbt mutualisée, sans tenant dédié (§ 4), l'absence de prix par palier (§ 11)
et un onboarding self-serve non prouvé de bout en bout [à instruire].

### 8.6 Trois destinations, trois sacrifices — arbitrage owner ouvert

Elles ne s'excluent pas dans le temps, mais une seule peut être la prochaine. [à instruire]

| Destination | Ce qu'on gagne | Ce qu'on sacrifie |
|---|---|---|
| **A — tous les lieux à signal dense** (commerce, restauration, hôtellerie, loisirs, culture, vente en ligne) | la méthode transfère telle quelle ; il ne manque presque que le § 8.3 | le marché reste celui d'aujourd'hui, en plus large — ce n'est pas « toutes les entreprises » |
| **B — toutes les entreprises, verdict dégradé** | la taille du marché | le fossé : sans résultat habituel, le produit devient un journal de décisions, dans une catégorie déjà occupée |
| **C — le réseau comme moteur** (§ 8.4) | la valeur monte avec le nombre de clients, au lieu de monter avec le temps de curation | ne paie qu'à partir d'une masse critique par métier : ne finance rien la première année |

---

## 9. La logistique — la seule autre verticale que l'architecture porte

Ouvert le 05/09/2026 sur une question owner : l'architecture peut-elle servir à autre chose que la
vente — marketing, RH, formation, logistique ? Le test n'est pas l'intérêt du sujet, ce sont les
**trois conditions que le code impose** [vérifié 05/09, `src/lib/kpiRegistry.ts`] : une grandeur qui
bouge tous les jours par site (référence = 30 jours glissants, `>= 5` jours de données, bande de
bruit = écart-type journalier) ; un dispositif datable et répété ; un effet qui tombe dans une
fenêtre qu'on peut fermer.

| Candidat | Verdict | Motif |
|---|---|---|
| **Logistique / stocks** | **oui** | les trois conditions passent, et la donnée arrive déjà dans le fichier de caisse (§ 9.2) |
| **RH** | partiel | seules les heures travaillées sont denses ; absentéisme et turnover sont écrasés par la porte de bruit. Une fois mesurées contre le résultat, elles donnent le CA par heure travaillée — un KPI de plus, pas une verticale. Le grain individuel est fermé par `intent.md` (« pas un outil de surveillance ») avant de l'être par le droit du travail |
| **Marketing** | ce n'est pas une autre verticale | un dispositif EST déjà le plus souvent une action commerciale ou de communication (`means_lever` porte `communication` ; le registre des types d'événement porte promotion, animation, vente privée). L'effet se lit sur les ventes et la fréquentation — la série déjà mesurée. Les séries propres au marketing (impressions, clics, coût par contact) sont mesurées nativement par les régies |
| **Formation** | non | deux ou trois occurrences par an — pas de mémoire possible ; effet diffus sur des mois, sans fenêtre à fermer, ce que `intent.md` interdit déjà (« pas un verdict sur ce qui n'a pas de terme ») |

### 9.1 Pourquoi la logistique passe

Ruptures, invendus et casse, écarts d'inventaire, taux de service, délais fournisseur sont des
grandeurs **journalières et denses** dans un commerce ou un lieu de restauration. Les dispositifs
sont datables et répétés : changer de fournisseur, changer la fréquence de commande, bouger un seuil
de réapprovisionnement, changer une implantation. L'effet tombe dans une fenêtre courte.

### 9.2 Ce que l'architecture porte déjà, et ce qui manque

[vérifié 05/09, lecture du code et du modèle dbt]

- **Le moteur de verdict est générique sur une COLONNE.** `KPI_DAILY_COL` associe une clé de KPI à
  un nom de colonne ; `measureKpiMean` / `measureKpiBaseline` / `measureKpiWindow` /
  `measureKpiDailySd` sont écrites contre `${col}` et ne contiennent aucune logique de chiffre
  d'affaires. Un KPI de plus s'ajoute là et nulle part ailleurs.
- **Mais il y a DEUX moteurs.** Sur 9 clés, 5 passent par le chemin générique (`footfall`,
  `conversion`, `basket`, `transactions`, `discount`). `revenue_residual` n'y passe pas : il est
  traité par `commitmentResolve`, avec le résultat habituel par jour de semaine, la correction des
  variables corrélées (rho, VIF), les classes de jour et le contexte météo/vacances. **Un KPI
  non-vente obtient donc aujourd'hui un verdict plus faible que le CA** — moyenne glissante contre
  écart-type, sans référence par jour de semaine ni correction des facteurs confondus. C'est le coût
  réel d'un usage hors vente, et c'est de la généralisation de `commitmentResolve`, pas une
  réécriture. [à instruire]
- **Le tuyau, lui, est unique.** `mart.fct_client_daily_performance` a 25 colonnes ;
  `int_client_daily_performance` lit `stg_client_transactions` et rien d'autre — y compris
  `daily_visitors`, qui vaut `sum(visitor_count)` de l'import de ventes. Le seul KPI « non-vente » du
  registre est lui-même alimenté par le fichier de caisse.
- **La donnée logistique arrive DÉJÀ dans ce fichier, et on n'a nulle part où la mettre.** La spec
  NF525 de Crisalid porte 25 types de document, dont `IVT` inventaire, `EST` entrée stock, `SST`
  sortie stock, `IVD` invendus, `RUP` rupture [vérifié 05/09, doc architecture Crisalid]. Or
  `raw.client_transactions` n'a **aucune colonne** pour les recevoir : ni type de document, ni
  mouvement de stock (26 colonnes, vérifiées). Au mieux ces lignes seront filtrées pour ne pas
  polluer le chiffre d'affaires — donc jetées.

**Ce qui manque est donc borné** : des colonnes à l'ingestion, un mart journalier, des lignes dans
`KPI_DAILY_COL`. Aucun moteur à réécrire. C'est la seule des quatre verticales où le tuyau existe
déjà.

### 9.3 Valeur ajoutée face à ce qui existe — et ce qu'il ne faut pas revendiquer

**Le scan concurrentiel ne couvre PAS cette catégorie** (`positionnement-scan-concurrentiel.md` :
aucune occurrence de stock, inventaire, approvisionnement). Rien ne se vend là-dessus avant qu'il
soit fait. [à instruire]

Ce qui est vérifié à ce jour [05/09] :

- **La caisse bundle déjà la gestion de stock.** Crisalid annonce inventaire, fidélité, multi-sites
  et analytique temps réel dans le produit. C'est exactement la menace déjà nommée au scan § 2 : ce
  qui arrive gratuitement dans le POS n'est pas un fossé. **La valeur ne peut donc pas être le suivi
  de stock lui-même.**
- **Une couche prédictive dédiée existe déjà et se branche sur la même caisse.** Inpulse s'intègre à
  Crisalid par API et utilise les données transactionnelles pour affiner ses prévisions, tenir le
  stock théorique et recommander les commandes.
- **Tout cela est tourné vers l'AVANT** : prévoir la demande, dire combien commander. **Aucun ne
  ferme la boucle en arrière** : est-ce que ce changement de fournisseur, de fréquence de commande ou
  de seuil a produit un effet, mesuré contre l'habitude du lieu, avec le refus de conclure dans le
  bruit ? C'est le même fossé qu'au scan § 3, appliqué à un autre objet — et c'est la seule
  revendication défendable ici.

### 9.4 Ce que ça change pour l'offre — et ce que ça ne change pas

Même acheteur, même site, même fichier de caisse, même curation métier. **Ce n'est pas un nouveau
marché : c'est de la profondeur sur un client déjà acquis** — une deuxième raison de venir tous les
jours, sans acquisition ni tuyau supplémentaires. L'arbitrage du § 8.6 est donc inchangé : la
logistique renforce la destination A, elle n'en ouvre pas une quatrième.

---

## 10. Les cartes comme socle d'agents IA — ce qui est vrai, ce qui ne l'est pas

Ouvert le 05/09/2026 sur une question owner : les cartes d'action peuvent-elles servir de prompt à
des agents IA, et est-ce un avantage face à quelqu'un qui aurait la donnée brute et un bon modèle ?

### 10.1 Une carte, en base, n'est pas un prompt

[vérifié 05/09, `mart.fct_location_daily_action_candidates` + deux cartes réelles de `f10c3e58`]

La table porte 12 colonnes. Le `data_payload` est une **enveloppe de signal plate**, un schéma large
partagé par tous les types de carte : `signal_type`, `old_value`, `new_value`, puis une trentaine de
champs à `null`. Certains titres sont stockés en anglais (`"Weather alert decreased (2 → 0)"`).

Le contenu réel d'une carte — ce qui la rend vraie et lisible — n'est pas dans la table : il est
assemblé au RENDU, par les endpoints et `public/card-kit.js`. **Il n'existe donc aujourd'hui aucun
objet « carte » qu'un agent pourrait consommer.**

### 10.2 L'objet fait pour ça existe déjà — et ce n'est pas la carte

[vérifié 05/09, `src/lib/ai/contracts/facts_v1.ts` et ses consommateurs]

`FactV1` porte un **`fact_id` stable** (`F.competition.count_10km.2026-06-01`) ; `CoverageBlockV1`
déclare, dimension par dimension, `full | partial | none` avec les champs présents et manquants. La
règle est écrite dans l'en-tête du contrat : **aucune phrase sans `fact_id`, aucun `fact_id`
inconnu.** Douze modules le consomment — prompts, validateurs, rendu, assertions. Au-dessus,
`msAsterContract.ts` porte les invariants communs à tous les usages IA, et la suite lie-bait est une
porte de merge permanente.

C'est cela, la matière exploitable par un agent : **un fait adressable qui porte sa provenance et
l'aveu de ce qui manque** — pas une phrase bien tournée.

### 10.3 Face à « la donnée pure » : ce qui tient, et ce qui n'est qu'une avance

Trois choses qu'un concurrent muni de la même donnée et d'un bon modèle ne produit pas facilement :

- **la référence** — le résultat habituel du lieu, par jour de semaine, avec sa bande de bruit, est
  CALCULÉ ; il ne se raisonne pas. Un modèle interrogé sur une journée s'ancre sur la comparaison la
  plus commode ;
- **le refus** — la sortie qui a de la valeur est souvent « on ne peut pas conclure », et un modèle
  de langage ne la produit presque jamais spontanément : il est fait pour répondre. Portes de bruit,
  `honestAbsence`, validateurs, couverture déclarée, lie-bait : c'est la partie la plus coûteuse à
  refaire ;
- **la mémoire** — un agent n'a pas d'état sur trois mois ; le dispositif, sa version et son verdict,
  si.

Mais le test du concurrent (« qui pourrait écrire ça aussi ? », `positionnement-scan-concurrentiel.md`)
départage : n'importe qui sait calculer une moyenne glissante et un écart-type. **Ce n'est pas la
référence qui est chère, c'est le stock d'arbitrages sur QUAND SE TAIRE** — classes de jour, facteurs
confondus, planchers, droit français, lexique. C'est une avance, pas un brevet.

### 10.4 La forme défendable : boucle de retour, pas générateur de prompts

Pour un agent, la carte est la mauvaise unité. Deux choses comptent, et elles se répondent :

1. **un fait qui porte sa provenance et sa couverture** — il rend l'agent SÛR. Beaucoup sauront le
   produire ;
2. **un verdict, après coup, sur ce que l'agent a fait** — il rend l'agent AMÉLIORABLE. **Personne ne
   le produit aujourd'hui pour un lieu physique.**

C'est l'argument du § 5 transposé : Mem0, Zep, Letta et les autres stockent et retrouvent des faits ;
aucun ne dit si une décision a produit un effet. Un agent qui agit sur un commerce a exactement le
même trou — il n'a aucun signal de retour ancré. **Si Muse Square est un avantage pour les agents,
c'est comme BOUCLE DE RETOUR, pas comme générateur de prompts** : transformer de la donnée en
instruction, un modèle le fait déjà mieux que nous. [à instruire]

### 10.5 Ce qui manque pour pouvoir le revendiquer

[vérifié 05/09]

- **Aucune surface n'est exposée à un agent tiers** : ni MCP, ni endpoint à clé. Les usages IA
  actuels sont tous internes et sortants.
- **Le `data_payload` des cartes est trop pauvre pour servir de socle.** C'est `facts_v1` qu'il
  faudrait exposer, pas la carte — et une exposition de faits est un contrat public, donc une
  décision de produit avant d'être un chantier technique.

Deux chantiers, aucun des deux ouvert. [à instruire]

---

## 11. Questions ouvertes

- Arbitrer « mémoire » dans le lexique, et statuer sur « Connaissances créées ». [à instruire]
- Écrire la variante publics/fréquentation pour la cible culture. [à instruire]
- Hôtellerie (16 610 établissements) toujours **non scannée** — catégorie du revenue management,
  à instruire avant de s'y engager. [scan §6, toujours ouvert]
- Prix par palier : aucun chiffre arrêté. [à instruire]
- Financement des 4 chantiers grands comptes : autofinancé par le palier réseau, ou levée. [à instruire]
- Ouvrir, ou non, un chemin d'écriture pour l'IA sous approbation de l'exploitant — la décision produit
  dont dépend toute revendication « agentique » (§ 12.7). [à instruire]

---

## 12. L'IA agentique — ce que l'agent exécute, ce que l'exploitant décide

Ouvert le 07/09/2026 sur une question owner : le business plan veut dire que **l'exploitant s'occupe
de ses clients et que l'IA agentique fait le reste**. Cas d'étude fourni par l'owner : Alexis, Épices
et Tout, veut monter le prix du poivre. Il ne connaît ni le prix de ses concurrents, ni l'effet sur
ses volumes, ni l'effet sur sa marge, ni le report sur les autres rayons, ni le risque qu'un client
ne revienne pas. Le faire proprement demande une méthode (relever, évaluer, décider, appliquer,
mesurer, garder ou arrêter), une opération pour mesurer, une équipe qui change l'étiquette, et un
coéquipier qui suit. Ce paragraphe dit ce qui tient de cette promesse, contre le marché et contre la
pile, au 07/09.

### 12.1 « Fait le reste » : aucun agent livré ne le revendique

[vérifié 07/09, pages produit et centres d'aide]

| Agent | Ce qu'il fait | Ce qu'il fait AVANT d'agir | Mesure l'effet ? | Confie le suivi ? | France |
|---|---|---|---|---|---|
| **Shopify Sidekick** [page lue] | crée ou modifie produits, remises, collections, commandes | « The order updates only after you review the changes and click Update » | non | non | interface FR |
| **Square Managerbot** (28/04/2026) [page lue] | bilans du jour, alertes de stock, brouillons de planning, catalogue | « proposes an action, waits for the seller's approval and then executes » | non | non | bêta US seulement |
| **Lightspeed AI** (09/01/2026) [page lue] | questions-réponses ; « will evolve … into a more autonomous agent » | n'agit pas | non | non | non annoncé |
| **Toast IQ** (2026) [page lue] | campagnes, réglages salle/cuisine, propose des prix « margin-based » en retail | « you'll be prompted to confirm your changes before they're published » | comparaison de cohorte seulement | non | US, CA, UK, IE |
| **Claude Commerce Agents** (Anthropic, 02/09/2026) [page lue] | l'agent marchand « suggests pricing and promotions » | « a person approves it before anything goes live » | non | non | schéma, pas produit |
| **Nory** [page lue] | plannings et commandes fournisseurs | « One click to approve » | agrégat (−20 % main-d'œuvre), jamais par action | non | multi-sites |

Aucune caisse française n'embarque d'assistant, encore moins d'agent : Zelty, L'Addition, Cashpad,
Hiboutik, SumUp (ex-Tiller) [recherche 07/09]. Les agents de Square et de Toast ne sont pas
disponibles en France.

**Lecture :** « l'IA fait le reste » est la formule marketing de Square (« automates daily tasks for
Main Street sellers ») et de tout le marché ; en réalité chacun s'arrête à « propose, l'humain
approuve ». La revendiquer, c'est se ranger dans la même phrase que tous, en promettant plus qu'eux.

### 12.2 Les cadres d'autonomie convergent sur une règle

[vérifié 07/09, documents lus]

- **OpenAI, *Practices for Governing Agentic AI Systems* (12/2023), § 4.2** : certaines décisions sont
  « too important for users to delegate to agents … (such as independently initiating an
  irreversible large financial transaction) » ; l'autorisation préalable est « a standard way to
  limit egregious failures », la revue après coup convient aux actions « more easily reversible ».
- **Mitchell et al., Hugging Face (02/2025)** : cinq niveaux, du simple processeur à l'agent pleinement
  autonome ; « risks to people increase with the autonomy of a system ».
- **Anthropic, cadre agents (08/2025)** : lecture seule par défaut, approbation humaine « before taking
  any actions that modify … systems », permissions durables pour les routines de confiance. Mesure
  (02/2026) : 73 % des sessions gardent l'humain dans la boucle, 0,8 % d'actions irréversibles, et
  la part d'auto-approbation monte de 20 % à 40 % après 750 sessions — **l'autonomie se gagne sur un
  historique, elle ne se décrète pas.**
- **Microsoft, modèle de maturité agentique (03/2026)** : classer les agents « by intended use and
  blast radius », « delegate low-risk approvals … within guardrails », droits de décision par classe.

Règle commune : **argent ou irréversible ⇒ approbation avant ; réversible ⇒ agir, tracer, relire
après ; l'autonomie s'élargit par classe d'action, sur preuve.**

### 12.3 Le cas du poivre contre la pile — état vérifié

[vérifié 07/09, `kpiRegistry.ts`, `commitmentResolve.ts`, `fct_client_item_signals_daily`,
`competitor_offering_history`, `fct_location_client_patterns`, `intent.md`]

| Question d'Alexis | Ce que la pile porte | La réponse honnête du produit |
|---|---|---|
| Le prix des concurrents | `raw.competitor_offering_history.price_numeric` par article des suivis, cartes de hausse et de baisse de prix en prod ; **aucun appariement** entre son catalogue et le leur ; prix web seulement | « Voici ce que les sites suivis affichent. Le prix en rayon d'une boutique physique, personne ne l'a ; un relevé de quinze minutes par l'équipe le donne. » |
| L'effet sur les volumes | `units`, `unit_price`, `expected_item_revenue`, `delta_z` par article et par jour existent ; **aucun KPI au grain article** dans le registre (`family_revenue` s'arrête à la famille) ; aucune donnée d'élasticité pour une boutique seule, nulle part | Avant : inconnu, et tout chiffre serait une inférence à libeller comme telle. Après : mesurable sur une fenêtre, avec sa bande de bruit. |
| Ses clients (démographie) | audience et zone de chalandise EXTERNES seulement ; rien sur ses propres clients | Pas de réponse — et `intent.md` dit « pas un CRM ». Le doute de l'owner est fondé. |
| Volume contre marge | marge **déclarée** par famille, aucun coût d'achat en base | Une saisie d'Alexis, le prix d'achat du poivre, rend la marge par unité calculable. Sans elle, silence. |
| Report sur les autres rayons, retour des clients | mix par famille ; tickets de comptoir anonymes (`client_patterns` exclut le comptoir) ; ni taux de retour, ni valeur client ; nombre de tickets et panier au grain SITE | Le nombre de tickets du site sur la fenêtre peut signaler une chute hors bruit, sans l'attribuer au poivre. |

**L'écart structurant : la décision s'arrête au grain famille (cible, verdict, mémoire) alors que la
donnée descend déjà au grain article.** Le patron de mesure existe (`measureFamilyRevenueMean`, trois
lignes de SQL sur `raw.client_transactions`) et se transpose à l'article sans toucher la machinerie
de verdict. La méthode, elle, est déjà arbitrée — lexique 07/09 : « notez votre prix et votre marge
sur <article>, puis regardez vos ventes pendant deux semaines avant de changer quoi que ce soit. »
**L'agent est l'exécutant de cette phrase**, pas une intelligence de plus.

**Le risque à écrire dans le cas d'usage, pas à cacher :** un article seul vend souvent trop peu
d'unités pour qu'une variation de prix de 10 % soit détectable en deux semaines. La première sortie
honnête de l'agent sera parfois « non mesurable à ce grain — tester sur la famille des poivres, ou
sur quatre semaines ». Ce refus est le différenciateur du § 10.3 ; il doit être calculé AVANT de
proposer le test (effet minimal détectable), jamais découvert au verdict.

### 12.4 Ce que personne ne fait — la partie revendicable

[vérifié 07/09, scan ci-dessus]

1. Personne ne **mesure le résultat** d'un changement de prix contre le résultat habituel du lieu et
   ne rend « garder / arrêter ». Le plus proche est Engage3 (test-et-témoin), vendu à des chaînes ;
   son plus petit client cité fait 25 magasins.
2. Personne ne **confie le suivi** à un coéquipier : absent de Sidekick, Managerbot, Toast IQ, Nory.
3. Personne ne donne à un indépendant **les prix en rayon** de ses concurrents physiques : tous les
   outils PME sont web-only (Prisync 99 $/mois, Boardfy, Paarly) ; Minderest InStore est une
   application d'audit terrain vendue aux grands comptes.
4. Aucun outil ne fait un test de prix sur UN article dans UNE boutique (volume, marge,
   cannibalisation, retour client) sous 25 magasins.
5. Aucune caisse française n'a d'assistant ; aucun agent de caisse n'est disponible en France.

Ce sont les points 1 et 2 qui portent le paragraphe : ils prolongent le § 10.4 (la boucle de retour)
et le § 1 (« ce que vous avez fait, et si ça a marché »). Les points 3 à 5 disent que la fenêtre est
ouverte, pas qu'elle est à nous.

### 12.5 Le partage qui tient — trois niveaux et une autonomie acquise

[analyse 07/09, à valider owner]

- **L'agent seul, tracé, relu après** : calculer l'état, écrire l'opération (KPI, fenêtre, résultat
  habituel, effet minimal détectable), rédiger la consigne à l'équipe, programmer la mesure, rendre
  le verdict, le poster sur le canal du pôle, ranger la pratique au registre.
- **Une approbation de l'exploitant** : ouvrir le dispositif en test au prix choisi, envoyer la
  consigne, nommer le responsable, garder ou arrêter au verdict. Les libellés livrés de
  l'automatisation (« Prévenir seulement / Prévenir, geste prêt ») portent déjà ce niveau.
- **L'exploitant seul, toujours** : le chiffre du prix ; tout ce que le client voit (étiquette, prix
  en ligne) ; tout ce qui touche le planning de l'équipe (délai de prévenance, § Localisation de
  `CLAUDE.md`). Droit français vérifié 07/09 : aucune règle ne limite la fréquence d'un changement
  de prix en rayon ; l'affichage TTC sans ambiguïté s'impose (art. L112-1 C. conso, arrêté du
  3/12/1987) ; **si un test arrêté revient à l'ancien prix, ce retour ne s'annonce pas comme une
  réduction**, sinon la référence du prix le plus bas des 30 derniers jours s'applique
  (art. L112-1-1, en vigueur depuis le 28/05/2022).
- **Autonomie acquise** : une classe de propositions approuvées sans modification plusieurs fois de
  suite passe en « prévenir seulement ». C'est le mécanisme mesuré par Anthropic (20 % → 40 %), pas
  une promesse.

Au-delà du prix, la même forme couvre les objets qui existent : consigne sur n'importe quel signal
(le détecteur v1 ne connaît que la chaleur annoncée), lecture hebdomadaire d'un pôle vers son canal,
proposition de suite après verdict (poursuivre, doubler, pivoter, arrêter), demande de relevé à
l'équipe, pratique écrite depuis un verdict. Ce que l'agent ne prend jamais : choisir le prix,
contacter un client, modifier un planning.

### 12.6 Où ça vit dans l'interface — deux portes, un cycle

[vérifié 07/09, `src/lib/ai/resolver.ts`, `src/lib/dispositifs/ideaPlacement.ts`,
`src/pages/app/insightevent/dispositif.astro`, `atelier-mecanismes-spec.md`]

**Le champ « que voulez-vous faire aujourd'hui » existe déjà : c'est Explorer.** Le résolveur porte
une intention `idee` (owner go 28/08) : l'utilisateur écrit une idée d'opération, la réponse la
PLACE (fenêtres calmes, jours de la condition visée), l'entoure d'analogues mesurés (ses dispositifs
prouvés du même levier, les références crawlées du secteur) et la cadre en mise en test — « M'engager »
reprend ses mots. La page dispositif est chat-first pour la même raison, tranchée par l'owner le
03/08 (`atelier-mecanismes-spec.md`) : **« la conversation EST l'interface »**. Un second champ
libre sur Agir dupliquerait le résolveur — c'est le motif que le dépôt interdit.

La question n'est donc pas « Explorer ou Agir » : ce sont **deux portes sur un seul cycle**, la
formule même de l'atelier (« un seul cycle de vie — mécanisme → stratégie → mesure — à deux portes
d'entrée ») :

- **Explorer est la porte de l'INTENTION.** Alexis écrit qu'il veut monter le prix du poivre. Le
  travail de l'agent se fait dans la réponse : ce qu'il sait (prix crawlés des suivis, unités et prix
  réalisé de l'article, marge déclarée de la famille), ce qu'il ne sait pas et lui demande (le coût
  d'achat), l'opération qu'il propose (KPI, fenêtre, effet minimal détectable), et le refus honnête
  quand l'article vend trop peu pour être mesuré.
- **Agir est la porte du SIGNAL, et le lieu de l'approbation.** Un mouvement de prix concurrent y
  arrive déjà en carte. La proposition née dans Explorer y arrive de la même façon : une carte dont
  « M'engager » est pré-rempli — Agir est « Vos actions du jour », et l'exploitant sait déjà qu'une
  carte y attend un geste. **L'approbation unique du § 12.5 est le clic « M'engager » existant, pas
  un contrôle nouveau.**
- **Piloter et Slack portent la suite** : responsable, consigne à l'équipe, verdict posté sur le
  canal du pôle, puis poursuivre / doubler / pivoter / arrêter sur la page engagement.

**L'écart concret est dans le résolveur, pas dans la mise en page.** La forme `ResolvedIdea`
accepte cinq leviers (`frequentation | conversion | panier | yield | fidelisation`) et une condition
météo ou calendaire (`rain | heat | school_holiday | public_holiday | tourism_peak | calme | aucune`).
**Aucun levier « prix », aucune entité article** : la phrase du poivre serait routée ailleurs.

Le mot de ce que l'agent propose et attend qu'on approuve n'existe pas au lexique ; il se demande à
l'owner avant qu'une chaîne s'écrive. [à instruire]

### 12.7 Ce qui manque pour le démontrer

[vérifié 07/09]

Dans l'ordre où chacun s'appuie sur le précédent :

1. **KPI au grain article** (`item_revenue`, `item_units`) dans `kpiRegistry.ts`, sur le patron K8.
2. **Tarif déclaré et coût d'achat** sur l'engagement : sans la date de l'étiquette, le produit
   déduit le changement de `price_delta_pct` au lieu de le savoir ; sans le coût, pas de marge.
3. **Appariement article ↔ article concurrent** (`item_norm` du crawl contre `item_description` /
   `item_code` du client) — avec l'aveu de couverture : web seulement.
4. **Consigne ponctuelle** hors occurrence et hors pôle (« allez relever trois prix », « changez
   l'étiquette le 12 ») : aujourd'hui seule une opération ou un signal armé porte une consigne.
5. **Détecteur de mouvement de prix concurrent** pour l'automatisation : les cartes existent, le
   détecteur v1 n'en lit aucune.
6. **Le levier « prix » et l'entité article dans le résolveur** (`ResolvedIdea`), pour qu'Explorer
   prenne la phrase du poivre au lieu de la router ailleurs (§ 12.6).
7. **Un chemin d'écriture pour l'IA, sous approbation.** Aujourd'hui l'IA n'écrit rien : aucun outil
   d'écriture, aucun MCP, aucun endpoint à clé (§ 10.5). Toute écriture part d'un clic sur un
   formulaire pré-rempli. **C'est une décision de produit, pas un chantier** — et tant qu'elle n'est
   pas prise, le cas du poivre ne se démontre pas.

Le compte Épices et Tout lui-même n'est pas encore branché au 07/09 : pôles non déclarés, membres
non invités, Slack non posé, import Crisalid non validé (`vue-equipe-slack-spec.md`,
`poles-dispositifs-permanents-spec.md`). Le scénario se raconte sur un compte qui n'existe pas
encore en base. [à instruire]

### Sources du § 12 (lues le 07/09/2026)

- Shopify, centre d'aide Sidekick — https://help.shopify.com/en/manual/ai-powered-tools/sidekick/help-and-guidance [page lue]
- PYMNTS, « New Square AI Agent Automates Daily Tasks for Main Street Sellers », 28/04/2026 — https://www.pymnts.com/artificial-intelligence-2/2026/new-square-ai-agent-automates-daily-tasks-for-main-street-sellers/ [page lue]
- Lightspeed, communiqué Lightspeed AI, 09/01/2026 — https://www.lightspeedhq.com/news/lightspeed-commerce-launches-lightspeed-ai-a-new-ai-powered-intelligence-layer-for-retail-and-hospitality/ [page lue]
- Toast, « Toast IQ Overview » — https://support.toasttab.com/en/article/Toast-IQ-Overview [page lue] ; Blue Book Services, 08/01/2026 — https://www.bluebookservices.com/toast-upgrades-platform-with-ai-updates/ [page lue]
- Anthropic, « Claude for Commerce Agents », 02/09/2026 — https://claude.com/blog/claude-for-commerce-agents [page lue]
- Nory, « Agentic AI » — https://www.nory.ai/agentic-ai [page lue]
- OpenAI, *Practices for Governing Agentic AI Systems*, 12/2023 — https://cdn.openai.com/papers/practices-for-governing-agentic-ai-systems.pdf [page lue]
- Mitchell et al., « Fully Autonomous AI Agents Should Not be Developed », 02/2025 — https://arxiv.org/abs/2502.02649 [page lue]
- Anthropic, « Our framework for developing safe and trustworthy agents », 04/08/2025 — https://www.anthropic.com/news/our-framework-for-developing-safe-and-trustworthy-agents [page lue] ; « Measuring agent autonomy », 18/02/2026 — https://www.anthropic.com/research/measuring-agent-autonomy [page lue]
- Microsoft, « Agentic adoption maturity model — security & governance », 31/03/2026 — https://learn.microsoft.com/en-us/agents/adoption-maturity-model/maturity-model-security-governance [page lue]
- Engage3, clients indépendants, 07/2021 — https://www.engage3.com/2021/07/leading-independent-retailers-leverage-engage3-to-track-their-competitive-price-position-and-optimize-prices-to-drive-traffic-and-margin/ [page lue] ; Hypersonix / Carlie C's (25 magasins) — https://progressivegrocer.com/independent-grocers-adopt-ai-solution [recherche]
- Boardfy — https://www.boardfy.com/ [page lue] ; Paarly — https://paarly.com/ [page lue] ; Minderest InStore — https://www.minderest.com/ [page lue] ; Prisync, tarifs — https://prisync.com/compare-plans/ [recherche]
- Grocery Dive, « The promise and peril of AI-driven pricing », 23/02/2026 — https://www.grocerydive.com/news/promise-peril-artificial-intelligence-driven-pricing-retailers/812037/ [page lue]
- INC, « L'information sur les prix » (L112-1, arrêté 3/12/1987, sanctions L131-5) — https://www.inc-conso.fr/content/linformation-sur-les-prix-generalites [page lue] ; art. L112-1-1 C. conso — https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000044549592 [recherche] ; DGCCRF, revente à perte — https://www.economie.gouv.fr/dgccrf/les-fiches-pratiques/revente-perte-quelles-sont-les-obligations-du-vendeur [recherche]
- Caisses françaises sans assistant (Zelty, L'Addition, Hiboutik, Cashpad, SumUp) : blog Zelty, independant.io, tool-advisor.fr, practicalecommerce.com (28/04/2026) [recherche]
