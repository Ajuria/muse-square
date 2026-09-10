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

### 12.8 Quand l'agent est banalisé — ce qui reste, et à quelle condition

Ouvert le 07/09 sur une question owner : une fois l'agent marchand livré gratuitement dans la caisse
(Shopify, Square, le schéma Anthropic du 02/09), Muse Square reste-t-il pertinent ?

**Où la menace est réelle.** [vérifié 07/09] La caisse détient l'ÉVÉNEMENT D'ÉCRITURE. Quand
Alexis change un prix dans Shopify ou Square, la plateforme connaît la date, l'ancien et le nouveau
prix, et chaque vente qui suit : son agent calcule un avant/après sans que personne ne déclare
rien. Muse Square, lui, doit être prévenu. Le § 10.3 l'admet déjà : la référence est bon marché,
« n'importe qui sait calculer une moyenne glissante et un écart-type ». Toast publie déjà un
écart de cohorte, Google Merchant Center simule déjà l'effet d'un prix. **Pour tout ce qui est un
événement de caisse, en ligne ou en rayon, le verdict deviendra une fonction gratuite du POS.**
C'est la part du discours qui meurt.

**Ce qui tient structurellement — pas une avance, une position :**

- **Les dispositifs que la caisse ne voit jamais.** Un producteur invité, un stand, un pôle avec
  son responsable, un tract, un changement d'horaires, une exposition, une animation de camping.
  Pour « un lieu qui reçoit du public », l'essentiel de ce que l'exploitant met en place pour
  vendre n'est pas un événement de caisse. L'agent du POS mesure SES actions ; il ne mesure pas
  la boutique.
- **Le contexte que la caisse ignore.** Météo, vacances scolaires, événements locaux, mouvements
  concurrents, tourisme. Un avant/après sur le poivre pendant une semaine de forte chaleur est
  faux, et le POS n'a pas de classe de jour pour le savoir. C'est le « stock d'arbitrages sur
  quand se taire » du § 10.3 : ce qui rend le verdict VRAI et pas seulement calculé.
- **Un juge indépendant.** Un agent qui recommande un prix puis note sa propre recommandation est
  juge et partie. Toast publie « +8 % » ; personne ne publie « non concluant ». Un verdict ne vaut
  pour l'exploitant que s'il vient de quelque chose qui ne gagne rien quand la réponse est oui.
  C'est l'axe « juge de paix » déjà acquis pour le marketing — la banalisation le renforce.
- **La mémoire dans le temps et entre les sites.** Quelle pratique, pour quel métier, sur quelle
  classe de jour, a prouvé quoi : le palier réseau du § 6. Le POS a plus de sites, mais il a des
  transactions, pas des dispositifs avec leur verdict.

**Les deux conditions.** (1) La mémoire doit s'accumuler AVANT l'arrivée des agents de caisse en
France. Le § 8.1 a mesuré le stock : 18 dispositifs sur 4 sites, un seul client réel avec des
données de caisse — aujourd'hui la mémoire ne vaut pas plus qu'un tableur, et aucun argument de
fossé ne tient tant qu'une poignée de sites réels n'a pas une année de dispositifs jugés.
(2) Le produit doit être là où l'agent du POS n'est pas : Square et Toast sont US-only, les caisses
françaises n'ont pas d'assistant, musées et campings tournent sur des billetteries sans agent
(§ 12.1). C'est une fenêtre, de quelques années, pas une position. [à instruire : la dater]

**Trois options, chacune avec son sacrifice** (l'espace, pas la conclusion) :

1. **Système de référence du lieu physique, indépendant de la caisse** — la thèse actuelle,
   affûtée : mesurer TOUT ce que l'exploitant fait, événements de caisse compris, contre le
   contexte. Sacrifice : ne jamais revendiquer l'agent qui agit, et s'intégrer à chaque POS en
   lecteur.
2. **La couche de verdict pour les agents des autres** — exposer faits et verdicts (§ 10.5) pour
   que l'agent du POS demande à Muse Square si son action a marché. Sacrifice : l'acheteur devient
   une plateforme, ce que le § 5 a rejeté comme middleware ; et une plateforme peut le rebâtir.
3. **Se replier là où aucun agent ne viendra bientôt** — culture, campings, réseaux de lieux
   physiques, avec le rail d'équipe comme produit. Sacrifice : un marché plus petit, une preuve
   plus lente.

**Recommandation [analyse 07/09, à arbitrer owner] : l'option 1, le palier réseau comme preuve.**
C'est la seule où la banalisation travaille POUR nous : le schéma Anthropic rend notre propre
agent bon marché à construire, et ce qui reste rare est le registre sur lequel il agit. Le
paragraphe du plan doit dire que l'agent est une commodité et la mémoire l'actif — avec les
chiffres du § 8.1 à côté, parce qu'un lecteur posera la question de ce paragraphe.

**Ce qui rendrait Muse Square non pertinent :** un éditeur de caisse qui ajoute un objet
« dispositif » déclaré par le commerçant, avec des classes de jour et un refus honnête. Rien de
technique ne l'empêche ; seule son incitation l'en retient, et le fait que le registre n'est pas
ce qu'il vend.

### 12.9 « Mémoire opérationnelle » : ce que le mot recouvre, et ce qui en est copiable

Précision owner 07/09 (« a structured memory vs a list of data rows — doesn't hold ? »). Le
positionnement TIENT ; ce qui doit être dit avec précision, c'est où se trouve l'actif. Une
mémoire est trois choses, et une seule des trois est copiable :

| Composant | Ce que c'est | Où il vit | Copiable ? |
|---|---|---|---|
| **La structure** | dispositif, version, verdict, provenance, couverture. Un POS a des LIGNES (transactions, un changement de prix, une remise créée) ; il n'a aucun objet pour « ce que j'ai mis en place pour vendre, et ce que ça a prouvé ». C'est ce que « mémoire » veut dire contre « liste de lignes » | les 36 tables `analytics` que l'app ÉCRIT (dbt ne fait que les stager : `stg_client_commitments`, `stg_best_practices`) | **oui** — une structure est un schéma, une semaine de travail pour qui décide de le bâtir |
| **Le jugement** | ce qui entre dans la mémoire, et sur quelle preuve : contre le résultat habituel, avec classes de jour, facteurs confondus, planchers, refus de conclure dans le bruit. C'est ce qui fait d'une ligne une ENTRÉE de mémoire et non une ligne de journal | l'app, pas dbt — `commitmentResolve.ts` (471 lignes : VIF, portes asymétriques, `confounded`), `dayClassRegistry.ts` (1 641 lignes), `kpiRegistry.ts`, `facts_v1` + validateurs + lie-bait, lexique + gardes | **non à court terme** — deux ans d'arbitrages ; et un agent de POS qui note ses propres recommandations ne le bâtira pas, son incitation est de montrer des gains |
| **L'accumulation** | les entrées elles-mêmes, entre sites, métiers et classes de jour | les mêmes tables, remplies | **le seul fossé qui grandit avec le temps** — et presque vide aujourd'hui (§ 8.1) |

Corollaire mesuré [vérifié 07/09] : **dbt est le substrat, pas l'actif.** 347 modèles qui disent ce
qui s'est passé (références, résidus, signaux jour et article, mouvements concurrents, cadences
client) — la partie que le § 10.3 dit bon marché à refaire. L'app (101 099 lignes TS/Astro,
12 255 lignes JS client) dit ce qui a été fait et ce que ça a prouvé : le jugement, les objets, la
langue, les rails (Slack, consignes, assignation, crawl). Les deux forment UN système — sans dbt
pas de référence, sans l'app rien à retenir — mais l'actif transportable du § 5 (« leur IA avec
les paramètres MS ») est la logique de l'app, pas les modèles dbt liés à notre schéma.

**Le test pour le deck.** Si la couverture dit « mémoire structurée » et s'arrête là, elle ne tient
pas : la structure se copie. Si elle dit **une mémoire dont chaque entrée porte un verdict contre
votre résultat habituel, tenue par un juge qui ne gagne rien quand la réponse est oui**, elle
tient — et personne dans le scan ne le dit. Le § 5 le formule déjà : « Le stockage se commoditise
en 2026. Savoir QUOI garder et sur quelle preuve, non. » La vulnérabilité du § 12.8 est une
question de CALENDRIER, pas de concept. [formulation à valider owner — pas une chaîne de deck]

### 12.10 Se placer en amont, et remplir le registre sans déclaration facultative

Ouvert le 09/09 sur deux questions owner, posées après la comparaison Salesforce (§ 12.8 :
« Salesforce utilise Anthropic et n'a pas été remplacé ») : comment se placer en AMONT de la donnée
comme Salesforce l'est de son pipeline, et comment faire que le registre se remplisse comme le CRM
se remplit — parce que saisir le pipeline est le travail du commercial, alors que déclarer un
dispositif est aujourd'hui un geste facultatif de l'exploitant. Un registre qui dépend d'une
déclaration facultative n'est pas encore un fossé.

**Ce que Salesforce a subi, et ce qu'il a fait** [vérifié 09/09] : la vente massive de logiciels
de janvier-février 2026 (« SaaSpocalypse », environ 2 000 Md$ de capitalisation, Salesforce à −28 %
malgré un CA en hausse) a frappé le modèle AU SIÈGE, pas le registre : des agents qui font le
travail des commerciaux, ce sont moins de sièges. La réponse du 26/08/2026, Claudeforce, met le CRM
À L'INTÉRIEUR de Claude — « data, workflows, business logic, actions, and governance » servis à
l'agent là où il travaille. Salesforce n'a pas combattu le modèle : il a fait de son registre ce
dont le modèle a besoin. Muse Square n'a pas de sièges (prix par site, § 11) ; le § 12 est ce
même mouvement — le registre servi à l'agent, où qu'il tourne.

#### L'amont : posséder la DÉCISION, jamais la transaction

Salesforce n'a jamais possédé l'ERP. Il possède le pipeline parce que le travail du commercial s'y
fait AVANT que la vente existe. L'équivalent pour un lieu n'est pas la caisse : ce sont les trois
gestes que l'exploitant fait avant et autour de la caisse, et qu'aucun POS ne représente.

| Geste de l'exploitant | L'objet Muse Square | État [vérifié 09/09] |
|---|---|---|
| **Décider** — un prix, une opération, une cible, avant que la caisse le voie | l'engagement : promesse, fenêtre, KPI ; le tarif déclaré et le coût (§ 12.7 item 2) | engagement livré ; tarif et coût à construire |
| **Organiser le lieu** — quelle famille est où, sur quoi, avec qui | pôle → dispositifs → composants, photos lues sous schéma (D1, 03/09) | modèle, semantic, lecture des photos livrés ; onboarding D6 non livré |
| **Donner l'instruction** — à qui, quoi, quand ; et savoir si c'est fait | consigne, responsable, boutons Slack « Fait / Pas pour moi / Ajuster », trace `consigne_sends` | livré pour une occurrence ou un signal ; consigne libre à construire (§ 12.7 item 4) |

Aucun de ces trois gestes n'est facultatif pour l'exploitant : il décide ses prix, il arrange sa
boutique, il parle à son équipe. Ils ne sont facultatifs DANS Muse Square que parce qu'il peut
les faire ailleurs. **Être en amont, c'est être l'endroit où ces trois gestes se font** — et la
consigne est celui qui est déjà câblé : un exploitant qui brief son équipe par Muse Square crée
le dispositif comme sous-produit d'un travail qu'il fait de toute façon. Le cas du poivre le
montre : décidé le 10 dans Muse Square, en caisse le 12, Muse Square est en amont de cet
événement — le POS voit un changement de prix, Muse Square sait que c'est une opération, avec sa
cause et sa cible. La limite est nette : amont des décisions et de l'organisation physique,
jamais des transactions.

#### Le remplissage : trois sources, dans cet ordre

**1. L'inférence depuis la caisse, confirmée par l'exploitant — la plus forte.** C'est le mécanisme
Salesforce transposé. Les marts détectent déjà ce qui a changé : mouvement de prix par article et
par famille (`fct_client_item_signals_daily.is_price_move`, `fct_client_family_price_daily.is_price_move`),
promotions (`promo_count_30d`), part qui bouge (`is_share_move`), articles nouveaux et morts
(`is_dead_item`), écarts heure × famille. Aujourd'hui ces signaux alimentent des CARTES ; ils doivent
alimenter des PROPOSITIONS : l'agent voit le prix du poivre bouger le 12 et demande si c'est une
opération. Un geste confirme ; l'opération s'ouvre avec la bonne fenêtre et l'article comme
périmètre mesuré (`measured_scope`, livré 07/09). Non confirmé, le changement reste au registre
comme fait observé, jamais comme dispositif. **La déclaration devient une confirmation**, et le
registre se remplit de ce qui s'est passé, que l'exploitant ait pensé ou non à le déclarer. C'est
l'état « proposition » du § 12 pointé sur la caisse au lieu d'Explorer. [à instruire : le chemin
signal → proposition, et le mot]

**2. Les sections du lieu en pôles, à l'onboarding.** Proposition owner 09/09 (« l'utilisateur
documente le lieu en sections, l'agent crée un dispositif par section »), avec une correction : une
section est un PÔLE — dispositif permanent, familles, responsable, jamais de verdict — et les
opérations se font dedans, créées par la source 1. L'agent ne crée donc pas « un dispositif par
section » mais un pôle par section, depuis les photos, familles lues et confirmées. C'est D6 de
`dispositifs-typologie-spec.md` § 9 point 5 : conçu, non livré. Une section re-photographiée est
une version suivante — le registre se remplit aussi des changements du lieu lui-même, la mémoire
que personne d'autre ne tient.

**3. Le canal d'équipe.** Quand le brief passe par Muse Square, l'occurrence, le responsable et la
trace d'exécution s'écrivent sans formulaire. Les interactions Slack existent ; il manque la
consigne libre hors occurrence (§ 12.7 item 4), pour que toute instruction, pas seulement une
instruction programmée, laisse une trace.

À quoi s'ajoute la note-cause sur Agir (livrée 08/09) : quand une carte tire, la mémoire se
remplit de causes.

#### Le prérequis qui conditionne les trois : l'entrée quotidienne des données de caisse

La source 1 ne remplit rien sans un flux de caisse QUOTIDIEN. Le § 8.1 a mesuré un seul client
réel avec des données de caisse, dernière date 27/07/2026 ; le § 8.3 dit que l'entrée reste un
mapping à la main par famille de caisse (quatre overrides déclarés, tous vides). L'inférence
depuis la caisse suppose que le flux arrive chaque nuit. **Tant que cette ingestion automatisée
n'existe pas, le registre ne peut pas se remplir seul, et la comparaison Salesforce reste un
dessin, pas une propriété du produit.** C'est l'item qui passe devant les trois sources.
[à instruire : par famille de caisse — Crisalid pour Épices et Tout, Sage 100 pour Les Olivades]

#### Ce que ça change à l'argument du fossé

Avec les trois sources, le registre se remplit depuis trois entrées qu'un POS ne combine jamais :
ce qui a changé en caisse, à quoi ressemble la boutique, ce qui a été dit à l'équipe. Cette
combinaison est ce qu'un agent de caisse ne peut pas calculer depuis sa seule donnée — et c'est le
contenu concret derrière « mémoire opérationnelle » au § 12.9 : la structure se copie, le
remplissage à trois sources ne se copie pas sans posséder les trois.

### 12.11 Le contexte d'usage : la caisse qu'on subit, l'équipe qui ne remplira pas un formulaire

Ouvert le 09/09 sur une observation owner : Épices et Tout et Les Olivades ont les mêmes
difficultés d'usage avec leur caisse (Crisalid) et leur ERP (Sage 100), et la génération Z qui
arrive dans les équipes n'utilisera pas une application à l'ergonomie pénible.

#### L'observation, avec son statut

- **Deux clients réels, deux outils subis** — Crisalid chez Épices et Tout, Sage 100 aux Olivades.
  [owner 09/09, observation sur deux comptes — pas un fait de marché]
- **Épices et Tout n'a aucun ordinateur en boutique** : pour les cinq managers et le gérant, le
  téléphone EST l'application. [vérifié 07/09, chantier mobile]
- **Génération Z** : l'enquête Deloitte 2026 décrit une fatigue numérique liée à des outils « mal
  intégrés aux systèmes existants » ; une source secondaire donne la messagerie instantanée comme
  canal préféré de 78,9 % des employés Z et l'email à 0 %. [Deloitte : citable ; le chiffre
  messagerie : à revérifier à la source avant usage commercial]

#### Ce que ça change au plan — deux arguments existants, renforcés

1. **L'amont (§ 12.10) est plus facile à prendre.** Les trois gestes de l'exploitant — décider,
   organiser le lieu, instruire l'équipe — migrent vers la surface la moins pénible. Une caisse
   subie ne recevra jamais un geste de plus ; le brief et la photo du rayon iront au téléphone,
   donc à Muse Square si Muse Square s'ouvre en un geste.
2. **L'ingestion (§ 8.3) est le même verrou vu de l'autre côté.** La caisse pénible à utiliser est
   pénible à exporter : les 25 types de document de Crisalid, le HT/TTC, les lignes au poids. Posséder
   l'export automatisé, c'est devenir le visage lisible de la donnée de caisse — le prérequis du
   § 12.10 devient un argument de vente.
3. **Le créneau se précise : « ne changez pas votre caisse ».** Changer de POS ou d'ERP coûte des
   mois et de la comptabilité ; ajouter une couche que l'équipe utilise coûte un export. Le segment
   est défini par l'ÂGE de la caisse. Contre-argument à garder en face : SumUp, Square, Zettle,
   Lightspeed sont déjà mobile-first et ajouteront l'assistant (§ 12.1) — là, le créneau est étroit.

#### Le boomerang : la même barre s'applique à Muse Square

Le formulaire d'engagement porte aujourd'hui **dix champs** (`public/js/commit-form.js`, vérifié
09/09 : indicateur, fenêtre, objectif, responsable, pôle, levier, coût, ressources, le plus,
pourquoi). Un vendeur de 22 ans ne le remplira pas plus qu'il ne remplit Crisalid. Les réponses
sont déjà au plan : la confirmation au lieu de la déclaration (§ 12.10 source 1), la conversation
comme interface (§ 12.6), le rail Slack et les boutons « Fait / Pas pour moi », la barre basse et
l'icône d'écran d'accueil livrées le 08/09.

**La contrainte de produit qui en découle** [à instruire, à poser comme porte] : un membre de
l'équipe fait sa part depuis son téléphone en moins d'une minute, sans formulaire. Ce qui ne
passe pas cette porte ne s'adresse pas à l'équipe ; ça s'adresse au gérant, sur laptop, et ça se
dit.

### 12.12 Le critère d'achat du premier client réel est le profit, pas le CA

Ouvert le 10/09 sur deux faits owner, Épices et Tout : (1) Crisalid ne donne pas la lecture que
l'exploitant veut — **le CA net HT** — et c'est ainsi qu'il veut lire ses rapports ; (2) la faiblesse
principale de l'affaire est le résultat net : **1,2 M€ de CA par an, 15 k€ de profit**, et il ne sait
pas pourquoi. Les prix d'achat arrivent dans les prochains jours. **Le critère d'achat est le profit :
si le produit l'améliore, il devient client payant.** [owner 10/09]

#### « CA net HT » : une définition que le produit n'a pas encore

[vérifié 10/09] `raw.client_transactions` porte UNE colonne `revenue` (26 colonnes, aucun statut
fiscal, aucun type de document). Le mapping d'import (`src/lib/import/sourceMappings.ts`) envoie
« ca ttc », « ca ht », « montant net », « total » dans cette même colonne : l'app affiche « CA » sans
savoir s'il est HT ou TTC, brut ou net des annulations. Les quatre overrides nommés sont vides, et
aucun mapping Crisalid n'existe. Le correctif est une règle d'ingestion et un libellé : le mapping
Crisalid prend le montant net HT, annulations soustraites, et les surfaces disent ce qu'elles
montrent. **C'est la convention de tout compte professionnel français** — personne qui tient une
boutique ne raisonne en TTC. Ça se promet sans risque : c'est une définition, pas une fonction.

#### Le profit : ce que le produit peut expliquer, et la ligne honnête

15 k€ sur 1,2 M€ = **1,25 % de marge nette**. Aujourd'hui aucun coût d'achat en base : la marge est
DÉCLARÉE par famille (K9 `profit_estimated`, 24/08) et appliquée au CA. Avec les prix d'achat, la
question se coupe en deux, et la ligne honnête passe entre les deux.

| Côté | Ce que Muse Square peut dire | Avec quoi |
|---|---|---|
| **Marge brute** — expliquable avec les prix d'achat | marge réelle par famille et par article, à la place de la marge déclarée ; et **quatre fuites** : (a) les remises accordées, (b) les articles vendus sous ou près du coût, (c) les articles morts, (d) la casse et les invendus | (a) `fct_client_family_price_daily` porte déjà le taux de remise par famille et par jour ; (b) `avg_unit_price` par article + le catalogue de coûts à créer ; (c) `is_dead_item` ; (d) les types de document Crisalid `IVD` invendus, `SST` sortie stock, `RUP` rupture — que l'ingestion JETTE aujourd'hui (§ 9.2 : aucune colonne pour les recevoir). Pour un pôle périssables, c'est l'endroit le plus probable où 1,2 M€ de ventes perdent leur marge, et c'est une donnée qu'il exporte déjà |
| **Charges fixes** — hors de la base | rien : salaires, loyer, charges. Le résultat net = marge brute − charges fixes, et rien ne les porte | **un paramètre déclaré**, les charges fixes mensuelles, ferme l'arithmétique brut → net comme la marge déclarée le fait aujourd'hui. Sans lui, le produit répond « où part votre marge », pas « pourquoi 15 k€ » — et la démo doit le dire |

#### Ce que ça change au plan

- **Le prix d'achat entre comme un CATALOGUE de coûts** — article × date d'effet × prix d'achat HT —
  pas comme un champ sur chaque engagement. Ça remplace la moitié « coût » du § 12.7 item 2 et fait
  de K9 un KPI mesuré au lieu d'une estimation (repli déclaré quand le coût manque).
- **Le prérequis d'ingestion du § 12.10 reçoit trois règles de ce seul compte** : le CA net HT comme
  définition du revenu, le type de document conservé, les quantités de mouvement de stock conservées
  au lieu d'être filtrées.
- **L'ordre des builds pour Épices et Tout devient** : (1) ingestion Crisalid avec ces trois règles ;
  (2) le catalogue de coûts ; (3) la marge brute par famille et par article, les quatre fuites
  nommées ; (4) les charges fixes déclarées pour atteindre le net. Tout le reste du § 12, l'agent
  compris, vient APRÈS : il paiera pour la réponse sur la marge, et pour rien avant elle.

**Garde pour la démo et l'onboarding** : tant que les prix d'achat ne sont pas en base, aucun
chiffre de marge ne se montre. Le test de valeur (`intent.md`) interdit une estimation présentée
comme une mesure — et un chiffre de marge faux devant le seul client dont la décision en dépend
est la phrase la plus chère que le produit puisse dire. [à instruire : DDL du catalogue de coûts,
règles d'ingestion Crisalid, mart de marge, paramètre charges fixes — passation dbt à écrire]

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
- Salesforce, « Salesforce and Anthropic Announce Claudeforce », 26/08/2026 — https://www.salesforce.com/news/press-releases/2026/08/26/salesforce-and-anthropic-announce-claudeforce/ [page lue 09/09] ; Anthropic, « Expanded Salesforce partnership » — https://www.anthropic.com/news/salesforce-anthropic-expanded-partnership [recherche 09/09]
- The SaaS Sentinel, « SaaSpocalypse 2026 », 03/07/2026 — https://saassentinel.com/2026/07/03/saaspocalypse-2026-what-happened-to-saas-and-where-the-market-stands-now/ [recherche 09/09] ; FinancialContent, 24/03/2026 — https://markets.financialcontent.com/stocks/article/marketminute-2026-3-24-the-2026-saaspocalypse-why-b2b-software-stocks-are-plunging-20 [recherche 09/09]
- Deloitte, « Global Gen Z and Millennial Survey 2026 » — https://www.deloitte.com/global/en/about/press-room/deloitte-2026-gen-z-and-millennial-survey.html [recherche 09/09] ; Cake.com, « Gen Z workforce statistics 2026 » — https://cake.com/blog/gen-z-workforce-statistics/ [source secondaire, chiffre messagerie à revérifier] ; Yooz, enquête 2025 sur la résistance aux outils — https://www.getyooz.com/blog/yooz-survey-technology-resistance-in-the-workplace [recherche 09/09]
- INC, « L'information sur les prix » (L112-1, arrêté 3/12/1987, sanctions L131-5) — https://www.inc-conso.fr/content/linformation-sur-les-prix-generalites [page lue] ; art. L112-1-1 C. conso — https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000044549592 [recherche] ; DGCCRF, revente à perte — https://www.economie.gouv.fr/dgccrf/les-fiches-pratiques/revente-perte-quelles-sont-les-obligations-du-vendeur [recherche]
- Caisses françaises sans assistant (Zelty, L'Addition, Hiboutik, Cashpad, SumUp) : blog Zelty, independant.io, tool-advisor.fr, practicalecommerce.com (28/04/2026) [recherche]
