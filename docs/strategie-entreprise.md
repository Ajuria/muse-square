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
| KPI et signaux sur mesure | **à construire** — la liste des KPI est un type + un registre FIGÉS en code (`src/lib/kpiRegistry.ts:47`), un seul foyer volontaire. Un KPI client = un déploiement, pas un réglage |

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

## 8. Questions ouvertes

- Arbitrer « mémoire » dans le lexique, et statuer sur « Connaissances créées ». [à instruire]
- Écrire la variante publics/fréquentation pour la cible culture. [à instruire]
- Hôtellerie (16 610 établissements) toujours **non scannée** — catégorie du revenue management,
  à instruire avant de s'y engager. [scan §6, toujours ouvert]
- Prix par palier : aucun chiffre arrêté. [à instruire]
- Financement des 4 chantiers grands comptes : autofinancé par le palier réseau, ou levée. [à instruire]
