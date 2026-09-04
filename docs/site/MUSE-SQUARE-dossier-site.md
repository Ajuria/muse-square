# Muse Square — dossier de travail site (positionnement + copie)

_Cinq documents réunis en un seul fichier. Assemblé le 20/08/2026._

Sommaire :
1. Ce que le produit fait réellement (contrainte de vérité)
2. Scan concurrentiel US + France (revendications déjà prises)
3. Lexique et voix (fait loi sur les mots)
4. Corpus de chaînes réelles (référence de style)
5. Site actuel et contraintes de format

---

# DOCUMENT 1 — CE QUE LE PRODUIT FAIT RÉELLEMENT

# Ce que Muse Square fait réellement — inventaire vérifié
Établi le 20/08/2026 en lisant le code, pas de mémoire. Chaque libellé cité existe en production.
**Règle d'usage : rien de ce qui n'est pas dans ce fichier ne peut être promis sur le site.**

---

## 1. La structure de l'app : trois onglets

L'application a exactement trois onglets (`src/components/Nav.astro`) :

| Onglet | Ce que l'utilisateur y fait |
|---|---|
| **Piloter** | Son tableau de bord. Où il en est, ce qui tourne, ce qu'il a prouvé. |
| **Agir** | Ses actions du jour. Ce qui a bougé autour de lui, et quoi en faire. |
| **Explorer** | Ses questions, en langage naturel, sur ses propres données. |

Ces trois mots sont ceux de l'app. Le site peut s'en servir ; il ne doit pas en inventer d'autres.

---

## 2. Piloter — le tableau de bord

**Bandeau de 5 indicateurs** (arbitré par l'owner le 18/08, libellés exacts) :
`Impact 30 jours` · `CA 7 jours` · `Signaux traités` · `Opérations en cours` · `Dispositifs prouvés`

**Mes dispositifs.** Un *dispositif* = une pratique qui marche, réutilisable. Trois états seulement :
**en test · prouvé · écarté**. « Écarté » veut dire : testé, cible manquée — pas réutilisable tel quel.
L'app ne dit jamais « validé », « certifié », « playbook ».

**Mes événements.** Séries et occurrences, avec un dossier à trois états : **Préparer →** (une occurrence à venir),
**Dossier →** (la série), **Bilan →** (rendre le vécu d'une occurrence passée, trois questions déclaratives).

**Vos suivis.** La veille des concurrents surveillés. Fraîcheur exprimée en « **lus cette nuit** ».
Pour chaque suivi, une fiche : proposition de valeur, offre et prix relevés, publics visés,
actualité commerciale, autres offres. Position de sa note : « parmi les mieux notés · dans la moyenne ·
le moins bien noté de vos suivis ».

**Événements publics de votre périmètre.** Ce qui se passe autour du site, avec des critères
(publics visés, nature) enrichis chaque nuit.

**Mon positionnement / Profil stratégique.**

---

## 3. Agir — les actions du jour

Chaque matin, un nombre **limité** d'actions priorisées. Le site actuel dit « Cinq actions priorisées
vous attendent. Pas vingt. » — c'est exact et c'est un bon argument.

**Une carte d'action porte trois choses :**
1. **Le fait, nommé.** Jamais « un concurrent » ou « un écart » : le nom, le chiffre, la date.
2. **L'enjeu chiffré** — un montant annualisé propre à cette carte, avec son référentiel
   (gagnés · à prendre · cible · vs votre résultat habituel). Jamais un € nu.
3. **Une action** que l'exploitant peut réellement faire.

**Les gestes disponibles sur une carte** (tous existent dans `public/action-cards.js`) :
- **Consulter la source** — remonter à la donnée derrière l'affirmation.
- **Communiquer** — un brouillon prêt à publier sur **Google Business, Instagram, Email ou Slack**.
- **Faire suivre** — passer le signal en interne avec l'action recommandée.
- **Automatiser** — déclencher sur une série OU sur un signal ; la condition se choisit dans le flux.
- **M'engager** — voir §5.

L'utilisateur choisit son niveau d'automatisation, du manuel au tout-automatique.

**Briefs par email.** Deux par semaine : le récap de ce qui a bougé, et la semaine à venir.
Sans ouvrir l'app.

---

## 4. Explorer — les questions

Question en langage naturel. La réponse est construite **sur les données du compte et son contexte
régional**, pas sur le web ouvert. Les sources sont consultables. Quand la donnée ne permet pas de
répondre, l'app le dit et le chiffre — elle ne comble pas.

---

## 5. L'engagement et le verdict — le cœur du produit, et ce que personne d'autre ne fait

L'utilisateur **déclare** ce qu'il va faire et sur quoi il sera jugé : un KPI, une **cible**,
des **dates d'opération**. C'est un **engagement**.

À l'échéance, l'app rend un **verdict** : **atteint · manqué · non concluant**.
« Non concluant » est un résultat à part entière, pas un échec de l'outil.

Ce verdict n'est pas une comparaison naïve. Il est calculé contre **votre résultat habituel**
(forme jour : « votre jeudi habituel ≈ 1 221 € »), avec une incertitude corrigée des variables
corrélées, et des portes qui refusent de conclure quand le bruit ou les vacances rendent la mesure
non fiable. **La base de mesure est affichée** — l'utilisateur peut voir sur quoi le verdict repose.

Un engagement prouvé devient un **dispositif**, réutilisable, qui reste dans l'entreprise.
Un engagement ouvert peut être **Ajusté**.

Gestes suivants : **Documentez vos résultats** (bouton « Documenter → »).
Un dispositif en cours d'exécution est un « **Dispositif actif** ».

---

## 6. Les données de contexte que l'app va chercher

- **Concurrence** — événements et activations concurrentes de **500 m à 50 km** ; et une veille des
  concurrents nommément suivis, relue chaque nuit (prix, offres, avis, horaires, actualité commerciale).
- **Météo** — précipitations horaires, température, vent, alertes Météo-France, classes de jour.
- **Mobilité** — perturbations RATP/SNCF, grèves, travaux, préavis déposés.
- **Calendrier** — jours fériés, **vacances scolaires par académie**, soldes, événements régionaux.
- **Tourisme étranger** — profils de visiteurs étrangers par région.
- **Fréquentation** — footfall, temps de présence, zone de chalandise.
- **Les ventes du client** — import CSV depuis sa caisse ; connecteurs directs en cours.

---

## 7. La discipline de mesure (l'argument de sérieux)

- Les cartes ne comparent pas deux jours : elles comparent à une **référence robuste**.
- Un montant estimé et un montant mesuré ne sont **pas présentés pareil** ; il y a des seuils
  (nombre d'observations, force du signal) en dessous desquels l'app ne chiffre pas.
- Un chiffre porte toujours son référentiel.
- **Absence dite et chiffrée** : « Prix stables — 10 tarifs comparés, rien à la lecture de cette nuit. »
  Jamais un zéro nu, jamais une section vide.
- **On NOMME ou on se tait.**
- Une suite de tests plante volontairement de fausses affirmations dans le système ; si l'app les
  laisse passer, le code ne part pas en production. C'est une **porte de merge**, pas une intention.
- Des cartes qui se déclenchaient tous les jours ont été **retirées** parce qu'elles ne
  discriminaient rien. Un audit interne (`docs/audits/card-truth-audit.md`) juge les cartes.

---

## 8. Ancrage France

Les conseils doivent être exécutables **en droit français**. Contraintes intégrées :
délai de prévenance sur les horaires (7 j, réductible à 3 en HCR par accord),
**repos dominical** (le dimanche travaillé est l'exception, pas la règle),
dates légales des soldes, interdiction de revente à perte, affichage des prix, RGPD sur les fichiers clients.

Ce que l'exploitant maîtrise réellement à 2-3 jours : ses **achats**, le fait de **ne pas appeler d'extra**,
et **ce qu'il fait faire** à l'équipe déjà planifiée. Le site ne doit jamais promettre un geste
qu'un exploitant français ne peut pas poser.

---

## 9. Ce que l'app NE fait PAS — à ne promettre sous aucune forme

- **Pas de CA par client ni de marge.** Ces données n'existent pas dans le modèle.
- **Pas d'encaissement, pas de planning RH, pas de paie, pas de CRM, pas de billetterie.**
  Muse Square ne remplace ni la caisse ni le logiciel métier.
- **Pas de connecteur caisse universel.** Aujourd'hui : export CSV pour la plupart des caisses.
  Formulation en production : « Connexion directe prévue — en attendant, export CSV… ».
  Jamais « bientôt disponible ».
- **Couverture géographique limitée** : Île-de-France, Occitanie, Provence-Alpes-Côte d'Azur.
  C'est un choix assumé et argumenté (fiabilité avant exhaustivité), pas une lacune à cacher.
- **Pas d'attribution causale certaine.** L'app donne un niveau de confiance ; elle n'invente
  jamais un pourcentage de cause.

---

## 10. Clients réels (à n'utiliser qu'avec accord)

- **Les Olivades** — imprimeur et éditeur de tissu, Entreprise du Patrimoine Vivant. Caisse Sage 100.
- **Costières de l'Art** — festival d'art contemporain.

Les deux témoignages déjà en ligne sur la home sont authentiques et réutilisables.

---

# DOCUMENT 2 — SCAN CONCURRENTIEL

# Scan concurrentiel & positionnement — Muse Square
Scan réalisé le 20/08/2026. Marchés : France + États-Unis.
Méthode : lecture directe des pages d'accueil (headline verbatim) quand accessible, recherche web sinon.
Statut de chaque ligne indiqué : **[page lue]** = homepage récupérée et citée ; **[recherche]** = reconstitué depuis des sources secondaires, à revérifier avant usage commercial.

---

## 1. Ce que le marché revendique aujourd'hui

### A. Données de contexte externe (le « signal »)

| Acteur | Pays | Promesse (verbatim ou proche) | Ce qu'il fait | Ce qu'il ne fait PAS |
|---|---|---|---|---|
| **PredictHQ** [recherche] | US | « The Real-World Context Platform for AI and Forecasting » — « the only platform in the world that uncovers the impact that real-world events have on business, at scale » | Vend la **donnée événementielle scorée en impact** (API) à qui veut l'injecter dans son propre modèle de prévision | Ne parle pas à un exploitant. C'est un fournisseur de données pour équipes data. |
| **Placer.ai** [page lue] | US | « Location Intelligence & Foot Traffic Data Software » / « Market Intelligence for the Physical World » | Fréquentation piétonne, zones de chalandise, **comparaison de performance vs enseignes concurrentes**, panel propriétaire revendiqué « +92% accuracy » | Ne connaît pas votre CA. Ne recommande rien. Ne mesure aucune décision. |
| **MyTraffic** [page lue] | FR | « Location intelligence pour l'analyse géospatiale » / « Savoir partout, décider n'importe où » | Flux piétons + véhicules, **benchmark vs concurrents locaux**, zones de chalandise, flux touristiques, assistant IA « Gini » | Outil d'implantation et de réseau (immobilier, expansion), pas d'exploitation quotidienne. Pas de CA client. |
| **Planalytics** [page lue] | US | « Weather matters. A lot. » / « Learn how much it affects your business » | « Weather-Driven Demand® » — traduit la météo en impact business chiffré, alimente les modèles de prévision de grands retailers (H-E-B, Dick's, Chipotle, Ace) | Grands comptes uniquement. Une seule dimension (météo). Aucune action. |
| **Flux Vision Tourisme (Orange)** [recherche] | FR | Observation touristique par données mobiles anonymisées | Fréquentation d'un territoire, nuitées, durée de séjour, origine des visiteurs. Utilisé par 40+ ADT | Vendu aux **territoires** (ADT, offices de tourisme), pas aux établissements. Rétrospectif. |
| **Zartico** [page lue] | US | « The Clearest View of Visitor Behavior » | Croise dépenses + hébergement + géolocalisation pour les destinations (DMO), modélisation prédictive | Client = la destination, pas le lieu. |

**Lecture :** la donnée de contexte est **un marché de fournisseurs, pas de produits**. Aucun de ces acteurs ne s'adresse à un exploitant qui doit décider ce matin.

### B. Analytics d'exploitation (le « vos chiffres »)

| Acteur | Pays | Promesse | Point d'attention pour nous |
|---|---|---|---|
| **Tenzo** [page lue] | US/UK | « Restaurant Reporting & Intelligence » / « One place for all your restaurant data » | **Le plus proche de nous.** Six piliers annoncés : AI, Aggregate, Automate, Analyse, **Predict** (« demand forecasting using weather, events, and historical data »), **Act** (scorecards temps réel + alertes objectifs). Connecte les données à des LLM (ChatGPT, Claude). |
| **Toast (ToastIQ)** [recherche] | US | Moteur d'intelligence dans le POS | **Menace de forme la plus directe** : depuis oct. 2025, un fil « For you » de **recommandations opportunes**, questions en langage naturel, et **action exécutée depuis la conversation**. C'est la même forme d'interface que Pulse/Agir. |
| **Lightspeed** [recherche] | US/FR | « Benchmarks & Trends » puis « Lightspeed AI » (janv. 2026) | Compare votre performance **à vos concurrents locaux** (ventes moyennes du marché local, mix, prix, ticket, rotation) — livré **dans le POS**, donc gratuit d'effort pour le client. |
| **5-Out** [page lue] | US | « AI Restaurant Forecasting Software to Boost Profit » | Prévision → staffing, achats, prep. Pas de données externes revendiquées sur la home. |
| **Zelty** [page lue] | FR | « Digitalisez et pilotez vos restaurants sereinement » | 4 000 restaurants. **Aucune** mention d'IA, de prédictif, de météo ou de données externes. Encaissement + gestion. |
| **Skello** [page lue] | FR | « La solution IA de gestion RH des équipes de terrain » | Planning « intelligent », assistant IA RH. L'IA est sur le planning, pas sur la performance. |

**Lecture :** **« météo + événements locaux dans la prévision » n'est plus un différenciateur** — c'est devenu une case à cocher en 2026, revendiquée par Tenzo, Lightspeed, Toast et la presse spécialisée FR. Et elle arrive **bundlée dans le POS**, donc à coût marginal nul pour le client.

### C. Lieux culturels, musées, sites de visite

| Acteur | Pays | Promesse | Écart avec nous |
|---|---|---|---|
| **Dexibit** [page lue] | US/NZ | « Decision intelligence for visitor attractions » — « AI that understands your attraction. Connected to your data, the voice of your visitors and **the world around you** » | **Le concurrent le plus dangereux sur la cible musée.** Même catégorie revendiquée (« decision intelligence »), même promesse de contexte extérieur, prévision de fréquentation et de revenus à l'heure près et jusqu'à un an, assistant conversationnel « Ask », 100+ intégrations. |
| **Arenametrix** [page lue] | FR | « La plateforme CRM et marketing des organisations culturelles et sportives » | CRM + campagnes + datavisualisation. **Aucune** mention d'IA ni de prédictif. Regarde le public, pas le contexte. |
| **Delight** [recherche] | FR | Outils data pour la culture et l'événementiel francophone | Connaissance et fidélisation des publics. Même angle qu'Arenametrix. |
| **Data&Musée** [recherche] | FR | Projet collaboratif d'agrégation de données de fréquentation inter-institutions | Recherche/consortium, pas un produit vendu. |
| **SenSource, V-Count, Mapsted** [recherche] | US | Comptage de personnes + analytics | Capteurs. Mesure la fréquentation, ne l'explique pas. |

**Lecture :** en France, la data culturelle est **du CRM de public** (Arenametrix, Delight). Personne n'y fait de l'aide à la décision d'exploitation. **Mais Dexibit y fait exactement ce que nous voulons faire**, en anglais, et le vend déjà aux musées.

### D. Copilotes IA sur la donnée (le « posez votre question »)

| Acteur | Promesse | Comment ils traitent l'hallucination |
|---|---|---|
| **ThoughtSpot** [page lue] | « Data to Decisions, Powered by Agents » / « Agentic Analytics Platform … live, explainable AI insights » | Couche sémantique gouvernée : « Business logic, joins, calendars, calculations, and security are governed before teams ask the first question ». Réponse **technique**, adressée aux équipes data. |
| **Looker / Databricks / Observable** [recherche] | Idem | LookML comme « verified enterprise truth » ; inspection du SQL généré ; « show its work ». Le consensus 2026 : *ne classez pas un outil IA sur sa démo, classez-le sur sa capacité à tracer chaque réponse jusqu'à une métrique gouvernée.* |
| **Microsoft 365 Copilot / ERP Copilote (Infologic)** [recherche] | — | **Le mot « copilote » est mort comme différenciateur en France** : la recherche « copilote opérationnel » renvoie Microsoft et un ERP agroalimentaire français installé depuis 1982. |

**Lecture :** la fiabilité de l'IA est **déjà** un axe de positionnement — mais formulé pour des directions data (gouvernance, couche sémantique, audit trail). **Personne ne le dit à un exploitant dans sa langue** : « elle vous dit quand elle ne sait pas ».

### E. Mémoire de décision (le « et ça a marché ? »)

| Acteur | Promesse | Cible |
|---|---|---|
| **Cloverpop** [page lue] | « Cloverpop Decision Intelligence unlocks the value of AI » — capture les décisions comme donnée structurée, « creating a feedback loop that learns, adapts, and compounds over time », « real institutional knowledge » | **Fortune 500** (Sanofi, Google, P&G, J&J). Déconnecté de la donnée d'exploitation et du contexte local. |
| Decision logs génériques (monday, Otter, …) [recherche] | Journal de décision, mémoire d'équipe | Outils de réunion. Aucune mesure de résultat. |

**Lecture :** le concept de « boucle d'apprentissage / mémoire de décision » **existe et est déjà occupé — mais uniquement au niveau grand compte**, et sans jamais être branché sur les ventes réelles ni mesurer si la décision a produit un effet. En dessous du Fortune 500, la place est vide.

---

## 2. Ce qui est libre, ce qui ne l'est plus

### Revendications désormais banalisées (ne pas construire dessus)
- « Vos données au même endroit / tableau de bord unifié » — tout le monde.
- « Prévision intégrant la météo et les événements locaux » — Tenzo, Lightspeed, Toast, la presse métier FR. **Bundlé dans le POS.**
- « Assistant IA, posez votre question en langage naturel » — tout le monde, y compris Zelty-like en 2026.
- « Comparez-vous à vos concurrents locaux » — Lightspeed dans le POS, Placer.ai, MyTraffic.
- « Copilote » — Microsoft a rendu le mot générique.
- « Recommandations d'actions dans un fil » — ToastIQ, depuis octobre 2025.

### Revendications libres, adossées à du code existant chez nous
1. **Mesurer si VOTRE décision a marché, et le dire avec sa base de mesure.** Personne dans le segment ne le fait. Cloverpop l'occupe au Fortune 500, hors donnée d'exploitation. → `kpiVerdict`, `verdict_basis`, résolution par résidu, portes bruit/vacances, SE corrigée du VIF.
2. **Le savoir d'exploitation reste dans l'entreprise, pas dans les têtes.** Libre en dessous du grand compte. → engagements, « Vos bonnes pratiques », track record, consignes d'opération.
3. **Une IA qui dit ce qu'elle ne sait pas — dite à un exploitant, pas à une DSI.** Les BI le formulent en gouvernance ; personne ne le formule en promesse d'usage. → suite lie-bait comme porte de merge, absence honnête, réponses sourcées.
4. **Des conseils exécutables en droit français.** Délai de prévenance, repos dominical, dates de soldes, revente à perte. Aucun acteur US ne peut le dire ; aucun acteur FR ne le revendique.
5. **Le chiffrage en euros de l'enjeu, carte par carte.** Planalytics chiffre l'impact météo pour des grands comptes ; personne ne met un montant annualisé au coin d'une action pour un exploitant.
6. **Le refus de la carte qui ne discrimine rien.** Nous avons démis des cartes qui tiraient tous les jours parce qu'elles ne servaient à rien. C'est une preuve de sérieux invérifiable chez les autres — et racontable.

### La menace à ne pas sous-estimer
Le contexte externe **n'est plus le fossé**. Il se vend en API (PredictHQ), il arrive gratuitement dans le POS (Lightspeed, Toast), et Dexibit revendique déjà « the world around you » auprès des musées. Ce qui reste défendable, c'est **ce qu'on fait du contexte après** : la mesure du résultat et la mémoire.

---

## 3. Le fossé, en une phrase

> Le contexte local qu'on ne peut pas acheter × vos ventes × une mesure qui refuse d'affirmer ce qu'elle ne peut pas prouver × une mémoire qui garde ce qui a marché.

Chaque maillon isolé est une commodité. Les quatre ensemble, personne ne les a.

---

## 4. Conséquence sur la catégorie

« Copilote opérationnel » est à abandonner : générique, et surtout **il sous-vend**. Un copilote assiste sur le moment puis oublie. Le produit mesure la décision et s'en souvient.

Axe recommandé — **l'anti-tableau de bord** :

> Les autres vous montrent vos chiffres. Muse Square vous dit ce qui les a fait bouger, ce que ça vaut, et si votre réponse a marché.

Cible horizontale qui tient pour un commerce, un musée et un site touristique — et qui existe déjà dans le `<meta description>` du site : **les lieux qui vivent de leur fréquentation.**

---

## 5. Sources

Pages lues directement : placer.ai, dexibit.com, planalytics.com, zartico.com, gotenzo.com, 5out.io, thoughtspot.com, cloverpop.com, mytraffic.io/fr, zelty.fr, skello.io, arenametrix.com.
Recherche web : predicthq.com, Toast (ToastIQ), Lightspeed (Benchmarks & Trends, Lightspeed AI), Flux Vision Tourisme, Delight, Data&Musée, Infologic Copilote, Looker/Databricks/Observable, baromètre France Num TPE-PME.

---

## 6. Test de l'intuition « tourisme (culture incluse) » — France

Critère posé par l'owner : **taille de marché × taille des équipes** (équipe trop petite → usage et budget logiciel limités).

### Volumes (France, sources publiques 2025-2026)

| Segment | Nombre | Taille d'équipe | Lecture |
|---|---|---|---|
| Musées de France | **~1 200** (sur ~1 300 recensés Muséofile au 01/01/2026) | Très variable ; beaucoup de musées territoriaux à 2-5 personnes | Comptage faible, **argent public**, marchés publics, cycles longs |
| Monuments nationaux (CMN) | ~100 | Réseau centralisé | 12 M visiteurs en 2025. Un seul acheteur pour 100 sites |
| Parcs de loisirs | **~650** | Directions d'exploitation constituées | **4 Md€ de CA cumulé** ≈ 6 M€ par parc. Vraies entreprises, vrai budget |
| Campings | **7 362** | Hôtellerie de plein air : ~2 500 entreprises pour **~45 000 salariés** ≈ 18 salariés/entreprise | Le CA dépend directement de la fréquentation **et de la météo**. Fortement saisonnier |
| Hôtels de tourisme | 16 610 | — | **Non scanné.** Catégorie très encombrée (revenue management, channel managers). À traiter avant de s'y engager |
| Résidences de tourisme / villages vacances | 2 277 / 828 | Groupes | Réseaux multi-sites |

### Ce que le critère de l'owner exclut, une fois appliqué

Le critère « équipe trop petite → pas de budget » **ne discrimine pas par verticale, il discrimine par présence d'un métier**. Il exclut :
- le commerce indépendant à 2-3 personnes (donc, en partie, la cible Houdan) ;
- une part importante des musées territoriaux — postes vacants documentés, tension budgétaire 2026, recrutement difficile en territoire rural ou intermédiaire.

Et il retient : **parcs de loisirs, hôtellerie de plein air, grands sites de visite payants, réseaux multi-sites, et les musées dotés d'un chargé du développement des publics.**

### Critère de qualification à retenir (remplace le critère « verticale »)

> Existe-t-il, dans la structure, **quelqu'un dont c'est le métier de regarder la fréquentation chaque semaine** ?

Si oui → cible. Si non → l'outil n'aura pas d'utilisateur, quelle que soit la verticale.

### Pourquoi le tourisme renforce l'axe « mémoire », et pas l'inverse

Le tourisme est **saisonnier**, et il tourne en **personnel saisonnier**. Conséquences :
1. On n'apprend qu'une fois par an : une saison ratée coûte douze mois.
2. Ce qui a été appris repart avec les saisonniers à la fin de la saison.

C'est exactement la douleur que traite la boucle engagement → verdict → bonnes pratiques. **L'argument de la mémoire est plus fort dans le tourisme que dans n'importe quelle autre verticale** — et personne dans le scan ne le formule.

### Risque à instruire avant de s'engager
- **Dexibit** est déjà positionné sur les visitor attractions, avec la même catégorie revendiquée.
- Un musée subventionné n'a pas de « CA qui dépend de la fréquentation » : son indicateur est la fréquentation et la mission, pas le résultat. **Le vocabulaire € ne s'y transpose pas tel quel** — il faut une version « fréquentation / publics » des cartes et de la copie.
- L'hôtellerie (16 610 établissements) n'a pas été scannée : catégorie du revenue management, à instruire séparément.

---

# DOCUMENT 3 — LEXIQUE ET VOIX

# Lexique, voix et règles de rédaction

Deux sources, toutes deux contraignantes.

---

## Partie A — Le lexique de l'app (fait loi)

# Lexique Muse Square — LE mot pour chaque concept

**Ce fichier fait loi.** Un concept = un mot, choisi par l'owner. Toute chaîne visible par
l'utilisateur vient d'ici ou reprend une chaîne déjà en production — jamais inventée en vol
(maquettes comprises : le garde-fou `evenement.fr.guard.test.ts` scanne aussi les protos).
Un concept sans mot ⇒ on demande LE mot à l'owner, on n'improvise pas.

_Draft assemblé le 17/08 depuis le vocabulaire déjà en production — à éditer par l'owner ;
chaque ligne modifiée ici doit être répercutée dans `src/lib/fr/evenement.fr.ts` (MOTS_BANNIS)._

## Les mots de l'app (fermé)

| Concept | LE mot | Interdits (attrapés en vrai) |
|---|---|---|
| Une pratique qui marche, réutilisable | **dispositif** (« Prouvé = réutilisable » — owner 17/08 ; jamais « rejouable ») | recette (en nom de section), méthode, playbook, rejouable |
| Statuts d'un dispositif | **en test · prouvé · écarté** (owner 17/08 : « déclaré » fusionné dans « en test » ; « écarté » = testé, cible manquée — pas réutilisable tel quel ; mot déjà en prod) | déclaré, validé, certifié |
| Ce que l'utilisateur promet de faire et mesurer | **engagement** | commitment, pari |
| Une date d'une série mesurée | **occurrence** | instance, itération |
| Événement récurrent | **série** | campagne |
| Le jugement automatique sur la cible | **cible/objectif : atteint · manqué · non concluant** | score, résultat final |
| L'objectif chiffré | **cible** / **objectif** | target, seuil (réservé aux réglages) |
| La période mesurée | **date / dates de l'opération** (owner 17/08) | fenêtre de mesure, période de test |
| La référence de comparaison | **votre résultat habituel** (forme jour : « votre jeudi habituel ») | l'attendu, la normale (sauf « CA vs normale » legacy K1) |
| Ce que vaut un motif à l'année | **enjeu annualisé** (infobulle seulement) | potentiel, opportunité € |
| Surveillance des concurrents | **veille** / **vos suivis** | couverture, tracking, crawl |
| Fraîcheur de la veille | **lus cette nuit** | dernier passage, visités, crawlés |
| Un concurrent surveillé | **suivi** | tracké, monitored |
| Zone autour d'un site | **votre périmètre** | catchment, zone de chalandise (à confirmer) |
| Contexte favorable détecté | **occasion** (Prochaine occasion · Vos prochaines occasions) | fenêtre de la semaine, momentum, jour favorable |
| Jour non couvert par une action | **couvert / sans action** | joué, manqué (réservé au verdict) |
| Déclenchement automatique | **Automatiser** (série OU signal — la condition se choisit dans le flux) | Armer, Armer sur signal |
| Message à l'équipe | **Communiquer** | partager, notifier (notification = réglage) |
| Geste sur un engagement ouvert | **Ajuster** | Modifier (mort 15/08), Évolution (mort 17/08) |
| Ouvrir le dossier d'une série/événement | **Dossier →** | Voir, Ouvrir |
| Préparer une occurrence à venir | **Préparer →** | — |
| Rendre le vécu d'une occurrence passée | **Bilan →** | feedback, débrief |
| Position d'une note parmi les suivis | **parmi les mieux notés · dans la moyenne · le moins bien noté de vos suivis** | au-dessus/en-dessous de la médiane, percentile |
| Occurrence passée dont la mesure est annulée | **passée sans mesure** | verdict en attente (faux si aucune mesure) |
| Ouvrir le détail d'un tiers (fiche → profil stratégique interne ; offre de veille → sa page) | **Consulter →** — UN seul CTA par rangée de fiche (owner 17/08 : plus de lien externe direct sur la fiche, la page externe se lit depuis le profil) | leur page, Sa page, Voir, Ouvrir, Profil stratégique → (sur une rangée) |
| La section des dispositifs | **Mes dispositifs** (première personne, aligné « Mon positionnement » — owner 17/08) | Vos dispositifs, Votre savoir-faire |
| Ce que vaut l'offre d'un concurrent (fiche enrichie) | **Proposition de valeur** puis **Offre** (la table prix/articles) | Sa proposition, Son offre & ses prix |
| Les publics d'un concurrent face aux vôtres | **Publics/Clients visés** | Son public |
| La communication du moment d'un concurrent (lecture web) | **Actualité commerciale** | Ce qu'il met en avant |
| Ses offres hors actualité (pass, promos relevées) | **Autres offres et produits** | Son offre poussée |
| Le logiciel d'encaissement déclaré au profil (P3.1-c) | **Caisse / logiciel de vente** (champ profil) ; à l'import : **votre caisse déclarée (modifiable dans votre profil)** | POS, logiciel de caisse, système d'encaissement |
| Caisse dont le connecteur n'existe pas encore | **Connexion directe prévue — en attendant, export CSV…** (consigne `export_note_fr` de `analytics.pos_systems`, jamais réécrite en dur) | bientôt disponible, coming soon |
| Suivi posé par le système à l'ouverture du compte (P3.1-f) | **suivi proposé — ajustez** (chip sur la fiche ; l'infobulle dit le critère : recouvrement mesuré) | suivi automatique, suggestion, recommandé pour vous |

## Règles de rédaction (héritées des décisions owner)

1. **CTA = un verbe + flèche (≤ 14 caractères)** — l'objet vit dans le titre de la rangée.
2. **Un montant porte toujours son référentiel** (gagnés · à prendre · cible · vs habituel) —
   jamais un € nu à côté d'un verbe qui n'en est pas la cause.
3. **Couleur = direction d'un DELTA MESURÉ** (owner 18/08, bandeau v10) : vert = delta mesuré
   positif, ambre = négatif ; les parts (%), comptes et stocks restent ENCRE ; zéro = gris
   (absence) ; bleu = prospectif/possession (hors bandeau). Le signe suit la même règle :
   un delta porte + ou −, une part n'en porte jamais.
4. **On NOMME ou on se tait** : jamais « un concurrent », « un écart » — le nom du concurrent,
   le chiffre, le fait. Un teaser vers une autre page n'est pas une information.
5. **Le technique ne s'affiche que cassé** (« échappe à votre veille ») — jamais en inventaire sain.
6. **Jours de semaine en toutes lettres** (« votre jeudi habituel »), dates `JJ/MM`.
7. **Absence dite et chiffrée** (« Prix stables — 10 tarifs comparés, rien à la lecture de cette
   nuit ») — jamais un zéro nu ni une section vide.

## Arbitrages tranchés (owner 17/08)

- « Documentez la recette » → **« Documentez vos résultats »** (proposition owner retenue ;
  « knowledge base » écarté — anglicisme). Le bouton reste « Documenter → ».
- « armée » → **« Dispositif actif »** (parmi les deux candidats owner ; « Opération en cours »
  reste le NOM DE SECTION — un état de carte ne peut pas porter le même nom que sa section).
  Frise : « ◌ = dispositif actif, mesure au jour J ».

- Bandeau Piloter v10 (owner 18/08) : **Impact 30 jours · CA 7 jours · Signaux traités ·
  Opérations en cours · Dispositifs prouvés** — « Signaux traités » assumé (même concept de
  signal partout, arbitrage owner) ; « Dispositifs validés » écarté (« validé » reste banni).

## Balayage de copie à faire (suite de ces décisions)

- « déclaré(e) » affiché → « en test » ; dernier test cible manquée → « écarté ».
- « fenêtre » (sens période mesurée) → « date(s) de l'opération » — carte par carte, le mot
  « fenêtre » au sens occasion est déjà banni (« vos prochaines occasions »).
- « vs habituel » nu → « vs votre résultat habituel » là où la place le permet ; les formes
  jour (« votre jeudi habituel ≈ 1 221 € ») restent.
- « Documentez la recette » → « Documentez vos résultats » (action-cards + tableau).
- « Armée · J-x » (chips) et « ◌ armée » (frise) → « Dispositif actif ».

---

## Partie B — Règles de voix (extraites des consignes projet)

### Français, France
- Le produit est français, basé en France. **Toutes les dates rendues à l'utilisateur : JJ/MM/AAAA.**
- Nombres et devise au format français : virgule décimale, **€ après le nombre**.
- Aucun défaut américain dans la copie ni dans les exemples.
- Conseils **applicables en droit français** : jamais un geste illégal ou impraticable ici
  (délai de prévenance sur les horaires, repos dominical, dates légales des soldes,
  revente à perte, affichage des prix, RGPD).
- Ne jamais supposer le dimanche travaillé — c'est l'exception. On écrit
  « vos jours d'ouverture du week-end », jamais « samedi + dimanche ».

### Style
- **Pas de français robotique de LLM.** Phrases nominales courtes, mots que l'exploitant emploie.
- Direct. Pas d'options ni de justification quand ce n'est pas demandé.
- **On NOMME ou on se tait** : jamais « un concurrent », « un écart ». Le nom, le chiffre, le fait.
- **Un montant porte toujours son référentiel** (gagnés · à prendre · cible · vs votre résultat habituel).
  Jamais un € nu à côté d'un verbe qui n'en est pas la cause.
- **Absence dite et chiffrée**, jamais un zéro nu ni une section vide.
- **Le jargon en infobulle seulement** (enjeu, motif de fond, estimé, à capter) — jamais dans la phrase principale.
- **Le technique ne s'affiche que cassé** — jamais en inventaire sain.
- **CTA = un verbe + flèche, ≤ 14 caractères.**
- **Aucun emoji.**

### Mots bannis sur le site
`copilote` · `playbook` · `validé` · `certifié` · `rejouable` · `recette` (comme nom de section) ·
`knowledge base` · `tracking` · `crawl` · `catchment` · `zone de chalandise` · `POS` ·
`bientôt disponible` · `coming soon` · `momentum` · `potentiel` · `opportunité €`

---

# DOCUMENT 4 — CORPUS DE CHAÎNES RÉELLES

# Corpus de chaînes réelles — la voix de l'app

Extrait automatiquement du code le 20/08/2026. Ce sont des textes VUS PAR L'UTILISATEUR aujourd'hui.
Sert de référence de STYLE : imiter cette voix, ne pas en inventer une autre.

## src/lib/fr/evenement.fr.ts
```
// Copie du DOSSIER D'ÉVÉNEMENT — LE fichier que l'owner édite (même convention que
// `factOrigins.fr.ts` et `rapportCanaux.fr.ts` : un fichier par surface, voix d'exploitant).
//
// POURQUOI CE FICHIER (owner, 10/08) : le vocabulaire a dérivé trois fois de suite — « attendu »
// (mot de statisticien, et qui SONNE l'attente alors que l'exploitant AGIT), « sans cible
// chiffrée » (un état interne nommé à l'écran), « Sur la série » / « 0/3 à la cible » (un
// libellé qui ne dit rien est du bruit). Corriger à la main dans trois fichiers ne tient pas :
// les mots vivent ici, et `evenement.fr.guard.test.ts` échoue si un mot banni revient.
//
// VOIX (standard copy 27/07 + mémoire `french-copy-voice`) :
//  - noms courts d'exploitant : « CA réalisé », « CA habituel », « votre objectif » ;
//  - jamais un état interne comme libellé : on propose LE GESTE (« Fixer un objectif ») ;
//  - un libellé doit dire ce que la section EST (« Vos 3 derniers samedis testés »), jamais
//    un mot d'architecture (« Sur la série ») ;
//  - le jargon (verdict statistique, résiduel, fenêtre) vit en infobulle, jamais en libellé.

// ── Mots BANNIS → mot maison. Le garde-fou lit cette table (clé = interdit, valeur = à écrire).
//    Ajouter une entrée ici SUFFIT à interdire le mot dans les surfaces couvertes (SURFACES du
//    fichier de garde). Recherche insensible à la casse, sous-chaîne.
//
//    PORTÉE (décisions owner 10/08) :
//    · « attendu » n'est banni QUE dans son sens de RÉFÉRENCE (« vs attendu », « l'attendu »,
//      « attendu du jour ») — le sens PRÉVISION reste correct et autorisé (« affluence
//      attendue demain », « effet attendu sur la fréquentation », « clientèle attendue ») ;
//    · « cible » et « objectif » sont tous deux acceptés — aucun des deux n'est banni ;
//    · « rejeu » est banni PARTOUT, y compris comme clé interne (owner : « ça ne veut rien
//      dire, c'est une traduction de l'anglais ») — l'échelle est déclaré → en test → prouvé.
export const MOTS_BANNIS: Record<string, string> = {
  "vs attendu": "vs votre résultat habituel",
  "vs l’attendu": "vs votre résultat habituel",
  "vs l'attendu": "vs votre résultat habituel",
  "l’attendu": "votre habituel",
  "l'attendu": "votre habituel",
  "attendu du jour": "habituel du jour",
  "sur la série": "un libellé qui dit ce que la section EST",
  rejeu: "test",
  "non-mesurable": "non mesurable",
  // Registre technique du CRAWL (owner 14/08, 3e rechute) : l'exploitant lit des TROUVAILLES
  // (« rien n'a bougé chez vos 4 suivis ») — le technique ne s'affiche que CASSÉ
  // (« échappe à votre veille »), jamais en inventaire sain.
  "lieux visités": "des trouvailles — le technique seulement s’il est cassé",
  "jamais visité": "échappe à votre veille",
  "visités cette nuit": "veille active sur tous vos suivis",
  "à chaque passage": "sous surveillance",
  "dernier passage": "sous surveillance",
  // Rechutes du 17/08 (owner : « WE HAVE A LANGUAGE IN PLACE ») — le concept s'appelle
  // DISPOSITIF ; « Armer » meurt (la condition vit DANS Automatiser) ; les teasers
  // abstraits meurent (on NOMME le concurrent et le fait, ou on ne dit rien).
  "Vos recettes": "Mes dispositifs",
  "Armer sur signal": "Automatiser (le signal est une condition du flux)",
  "Armer →": "Automatiser →",
  "lecture de positionnement": "les faits nommés (concurrent, chiffres) — jamais un teaser",
  "écart de positionnement": "nommer le concurrent et l'écart concret",
  "fenêtres de la semaine": "vos prochaines occasions",
  "Ma couverture": "Ma veille concurrentielle",
  // Balayage 17/08 (lexique owner) : la période mesurée = les DATES de l'opération ; le moment
  // favorable = une OCCASION ; l'état programmé = Dispositif actif ; « déclaré » (statut de
  // dispositif) fusionné dans « en test » ; le CTA de capture nomme les résultats.
  "Documentez la recette": "Documentez vos résultats",
  "Fenêtre close": "Dates passées",
  "fenêtre favorable": "occasion favorable",
  "Fenêtre favorable": "Occasion favorable",
  "Fenêtre rare": "Occasion rare",
  "fenêtre rare": "occasion rare",
  "meilleure fenêtre": "meilleure occasion",
  "Meilleure fenêtre": "Meilleure occasion",
  "sur toute la fenêtre": "sur les jours de l'opération",
  "Armée ·": "Dispositif actif ·",
  "(armée)": "(dispositif actif)",
  // Owner 17/08 (correctif Autour de vous) : ce qui est prouvé se RÉUTILISE — jamais « rejouable ».
  rejouable: "réutilisable",
  "se rejoue seule": "se relance seul",
  // Owner 17/08 soir : zéro label neuf — lire une page externe = « Consulter → » (label déjà
  // en prod, Consulter la source) ; sections à la première personne (« Mes dispositifs »).
  "leur page →": "Consulter →",
  "Sa page →": "Consulter →",
  "Vos dispositifs": "Mes dispositifs",
  // Fiche concurrent enrichie (owner 17/08 soir) : les labels tranchés.
  "Ce qu’il met en avant": "Actualité commerciale",
  "Ce qu'il met en avant": "Actualité commerciale",
  "Son offre poussée": "Autres offres et produits",
  "Sa proposition :": "Proposition de valeur :",
  "Son public :": "Publics/Clients visés :",
  // Owner 18/08 (bandeau) : « vs votre résultat habituel » NU est interdit — la référence porte son nom entier.
  "vs habituel": "vs votre résultat habituel",
  "vs votre habituel": "vs votre résultat habituel",
};

// ── Les mots du dossier. {x} = variable interpolée par `t(key, vars)`.
export const EVT_FR = {
  // Onglets : le job + la date (une série est en permanence après l'une et avant la suivante,
  // « Avant/Après » ne dit donc jamais laquelle).
  tab_preparer: "Préparer {date}",
  tab_resultat: "Résultat {date}",
  tab_choisir: "Choisir la date",

  // Tête de dossier.
  head_dates_one: "Le {date}",
  head_dates_serie: "Série · {n} occurrences",
  objectif_chip: "Objectif : {kpi}{valeur}",
  objectif_absent_chip: "Objectif non fixé",
  objectif_absent_line: "Aucun objectif n’était fixé — sans objectif, pas de verdict. Fixez-en un à la prochaine occurrence.",
  objectif_hors_echelle: "Objectif {ratio}× l’ordinaire ({ref} €/j) — à recalibrer si l’écart se répète.",

  // Le résultat mesuré.
  resultat_titre: "Dernière occurrence mesurée : {date}",
  objectif_atteint: "Objectif atteint",
  objectif_manque: "Objectif manqué",
  verdict_met: "objectif atteint",
  verdict_missed: "objectif manqué",
  verdict_confounded: "non mesurable (facteur externe)",
  verdict_mesure: "verdict mesuré : {verdict}",
  verdict_attente: "verdict à la fin de la fenêtre",
  box_ca: "CA réalisé",
  box_ca_ref: "vs {v} € habituel ({ecart})",
  box_tickets: "Tickets de caisse",
  box_panier: "Panier moyen",
  box_ref_dow: "vs {v} vos {jour}s (90 j)",
  box_transformation: "Transformation · {registre}",
  lecture: "Lecture :",

  // La série : le libellé DIT ce que la section est.
  serie_titre_n: "Vos {n} derniers {jour}s testés",
  serie_titre_1: "Votre premier {jour} testé",
  serie_aucun_objectif: "aucun n’a atteint votre objectif",
  serie_n_objectif: "{met} sur {n} ont atteint votre objectif",
  serie_a_venir: "{n} à venir — une tendance se lit à partir de 3.",
  serie_ligne_objectif: "{kpi} · objectif {valeur}",
  serie_ligne_ca: "CA {ecart} vs votre résultat habituel",
  serie_pas_de_mesure: "pas de mesure",

  // L'état vivant + la décision (le moteur vit sur la page Évolution — on y renvoie).
  en_cours: "Test en cours — {date}",
  en_cours_suite: " : le verdict tombe seul à la fin. Rien à déclarer avant.",
  prochaine_occurrence: "Prochaine occurrence le {date} — la mesure s’arme seule à J-7.",
  decision_cta: "Poursuivre, doubler, pivoter ou arrêter →",
  decision_aide: "diagnostic et move recommandé",
  partager_cta: "Prévenir l’équipe →",

  // Mémoire + bilan.
  memoire_titre: "Pour mémoire",
  memoire_dispositif: "Dispositif :",
  memoire_consigne: "Consigne :",
  memoire_bilan: "Votre bilan :",
  memoire_absente: "Aucune description enregistrée pour cet événement — la recette que vous écrirez ci-dessous en tiendra lieu.",
  bilan_titre: "Bilan déclaratif — votre vécu du {date}",
  bilan_intro: "{n} questions — ce que la mesure ne voit pas : vos conditions réelles{action}. Le CA, lui, est déjà mesuré ci-dessus.",
  bilan_deja: "Bilan du {date} déjà enregistré.",
  bilan_enregistre: "Bilan enregistré — il complète la mesure de cet événement.",
  visiteurs_question: "Combien de personnes sont venues ? (optionnel)",
  visiteurs_aide: "Vos {n} tickets comptent les acheteurs ; les visiteurs, seul vous les voyez — ensemble : votre taux de transformation.",
  visiteurs_conversion: "≈ {pct} % des visiteurs ont acheté ({tickets}/{visiteurs}).",
  visiteurs_incoherent: "Moins de visiteurs que de tickets ({n}) — vérifiez le nombre.",
} as const;

export type EvtCopyKey = keyof typeof EVT_FR;

/** Interpole {var} — même contrat que le `t()` de la page Évolution (commitmentCopy). */
export function tEvt(key: EvtCopyKey, vars?: Record<string, string | number>): string {
  let s: string = EVT_FR[key] ?? "";
  if (vars) for (const k of Object.keys(vars)) s = s.split("{" + k + "}").join(String(vars[k]));
  return s;
}
```

## src/lib/fr/rapportCanaux.fr.ts
```
// Copie du rapport par canal — LE fichier que l'owner édite (spec docs/rapport-canaux-spec.md § 2).
// Voix : les 4 questions de l'exploitant, jamais la voix comptable (« compensé par ») ni le
// jargon d'app. Référence de ton : le proto v5 validé (tools/proto/rapport-canaux-proto.html).
// Règle absolue (décision 10) : ces gabarits n'ORNENT jamais un chiffre et n'inventent jamais
// une cause — ils assemblent des faits mesurés qui leur sont passés.

export const CHANNEL_DEFAULT_LABELS: Record<string, string> = {
  comptoir: "Boutique",
  direct: "Professionnels",
  // __site__ (tenant sans rattachement canal) : le nom du site remplace le libellé.
};

// Seuils d'état d'un canal sur la période (évolution vs période précédente, en %).
export const ETAT = {
  down_max: -15, // ≤ −15 % → à traiter
  up_min: 15, // ≥ +15 % → en forme
  exceptional_min: 100, // ≥ +100 % → exceptionnel
  labels: {
    down: "▼ à traiter",
    up: "▲ en forme",
    exceptional: "▲ exceptionnel",
    stable: "● stable",
  } as Record<string, string>,
};

export type EtatKey = "down" | "up" | "exceptional" | "stable";

export function etatFor(evolPct: number | null): EtatKey {
  if (evolPct == null) return "stable";
  if (evolPct <= ETAT.down_max) return "down";
  if (evolPct >= ETAT.exceptional_min) return "exceptional";
  if (evolPct >= ETAT.up_min) return "up";
  return "stable";
}

export const PIED_DOCUMENT = "Document interne — les comptes clients y sont nommés.";

const frInt = (n: number) => Math.round(n).toLocaleString("fr-FR");
const eur = (n: number) => `${frInt(n)} €`;
const pct = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(Math.round(n))} %`;

// Part en mots — uniquement des fourchettes larges ; hors fourchette, le % nu.
function partEnMots(sharePct: number): string {
  if (sharePct >= 85) return "la quasi-totalité du chiffre";
  if (sharePct >= 50) return "plus de la moitié du chiffre";
  if (sharePct >= 44) return "environ la moitié du chiffre";
  if (sharePct >= 28) return "environ un tiers";
  if (sharePct >= 20) return "environ un quart";
  return `${Math.round(sharePct)} % du chiffre`;
}

// ── Les entrées des gabarits : des FAITS déjà mesurés, jamais recalculés ici. ──
export type FlowLine = { label: string; ca: number; share_pct: number; evol_pct: number | null; etat: EtatKey };
export type QQInput = {
  flows: FlowLine[]; // tous les flux (canaux + sites mono-flux), tri CA desc
  new_top: { label: string; ca: number }[]; // plus gros nouveaux comptes de la période
  missing_top: { label: string; prev_ca: number; channel_label: string } | null; // plus gros compte de la période précédente absent de celle-ci
  dormants: { label: string }[]; // comptes réguliers sans commande (mêmes que les cartes)
};

export const QUATRE_QUESTIONS = {
  argent(i: QQInput): string {
    if (!i.flows.length) return "";
    const parts = i.flows.map((f, ix) => {
      if (ix === 0) return `${f.label.toLowerCase() === f.label ? f.label : f.label} : ${partEnMots(f.share_pct)} (${eur(f.ca)})`;
      if (ix === i.flows.length - 1 && i.flows.length >= 3) return `${f.label} le reste (${eur(f.ca)})`;
      return `${f.label} ${partEnMots(f.share_pct)} (${eur(f.ca)})`;
    });
    return `${parts.join(", ")}.`;
  },

  marche(i: QQInput): string {
    const up = i.flows.filter((f) => f.etat === "up" || f.etat === "exceptional");
    const bits: string[] = up.map((f) =>
      f.etat === "exceptional"
        ? `${f.label} signe une période exceptionnelle (${pct(f.evol_pct ?? 0)})`
        : `${f.label} progresse (${pct(f.evol_pct ?? 0)})`
    );
    if (i.new_top.length) {
      const names = i.new_top.slice(0, 2).map((n) => `${n.label} ${eur(n.ca)}`).join(", ");
      bits.push(`de nouveaux comptes ont signé (${names})`);
    }
    return bits.length ? `${bits.join(" ; ")}.` : "Rien ne se détache à la hausse sur la période.";
  },

  marchePas(i: QQInput): string {
    const down = i.flows.filter((f) => f.etat === "down");
    const bits: string[] = down.map((f) => `${f.label} a moins vendu (${pct(f.evol_pct ?? 0)})`);
    if (i.missing_top) {
      bits.push(
        `la période précédente avait été portée par ${i.missing_top.label} (${eur(i.missing_top.prev_ca)}, rien depuis)`
      );
    }
    if (i.dormants.length) {
      bits.push(
        i.dormants.length === 1
          ? `un habitué n'a rien pris sur la période`
          : `${i.dormants.length} habitués n'ont rien pris sur la période`
      );
    }
    return bits.length ? `${bits.join(" ; ")}.` : "Aucun flux en retrait marqué sur la période.";
  },

  aFaire(i: QQInput): string {
    const bits: string[] = [];
    if (i.dormants.length) bits.push(`rappeler ${i.dormants.slice(0, 3).map((d) => d.label).join(", ")}`);
    if (i.missing_top) bits.push(`demander à ${i.missing_top.label} si une prochaine commande arrive`);
    return bits.length ? `${bits.join(" ; ")}.` : "Rien d'urgent — garder le rythme.";
  },
};
```

## src/lib/fr/factOrigins.fr.ts
```
// Libellés d'origine des faits cités — Explorer, attribution par section (docs/explorer-attribution-spec.md).
// OWNER-EDITABLE : ce fichier est LA source des libellés de chips affichés sous chaque section de réponse.
// Approuvés owner 07/08. Règles : jamais un nom de table, jamais un ID ; « Affluence estimée » garde le mot
// « estimée » (l'estimation externe ne doit jamais sonner aussi autoritaire que « Vos ventes »).
// « Web (source) » n'arrive qu'à l'étape 5 du chantier — ne pas l'ajouter ici avant.

export type FactOrigin =
  | "ventes"
  | "declarations"
  | "engagements"
  | "evenements_user"
  | "meteo"
  | "calendrier"
  | "concurrence"
  | "evenements_proximite"
  | "tourisme"
  | "transports"
  | "affluence_estimee"
  | "bonnes_pratiques";

export const FACT_ORIGIN_FR: Record<FactOrigin, string> = {
  ventes: "Vos ventes",
  declarations: "Vos déclarations",
  engagements: "Vos engagements",
  evenements_user: "Vos événements",
  meteo: "Météo du jour",
  calendrier: "Calendrier",
  concurrence: "Veille concurrence",
  evenements_proximite: "Événements à proximité",
  tourisme: "Tourisme régional",
  transports: "Transports",
  affluence_estimee: "Affluence estimée",
  bonnes_pratiques: "Bonnes pratiques",
};
```

## src/lib/commitmentCopy.ts (engagements)
```
// ── Engagement / "Consulter l'évolution" — ALL user-facing French copy ──
//
// OWNER: this is your voice pass. Edit the words here; no French is hardcoded
// anywhere else (page, endpoint, advice). Rules we agreed:
//   • terse noun-phrases — "CA réalisé", "CA habituel" (NOT "votre habituel")
//   • no robotic/abstract possessives, no hedge-sentences (a label, not a paragraph)
//   • drafted from the app's own voice (rapport.astro, action cards) — refine freely
//
// MECHANISM (why these are strings, not functions): the évolution page runs an
// `is:inline` script that cannot import TS, so this map is injected verbatim through
// `define:vars`. Interpolated values use {tokens} the page fills in (numbers are
// French-formatted — comma decimal — before substitution). Your WORDS are unchanged;
// only function-values became {token} templates. Keys are stable; the only splits are
// by sign (…_pos / …_neg) where the wording differs above vs below.

export const EVOL_COPY = {
  back: "Retour aux engagements",

  // subtitle under the title (goal terms recap; owner + date get their own line)
  subtitle: "Objectif : +{pct} % de CA vs votre résultat habituel · sous {window}",
  // Variante KPI-vrai (owner 15/08) : le sous-titre nomme le KPI DÉCLARÉ, jamais « CA » en dur.
  subtitle_kpi: "Objectif : +{pct} % de {kpi} vs votre résultat habituel · sous {window}",
  owner_line: "Engagé par {name} · le {date}",
  done_suffix: " · action menée le {date}",

  // ── ① Au-dessus / en-dessous de l'objectif ? ──
  q1_title: "Situation par rapport à l'objectif ?",
  q1_agg_pos: "+{pct} % au-dessus du CA habituel",
  q1_agg_neg: "{pct} % en-dessous du CA habituel",
  q1_window: "sur les {days} jours de l'opération",
  q1_days: "{up} jours sur {total} au-dessus du CA habituel",
  q1_best_worst: "meilleur : {bDate} (+{bPct} %) · moins bon : {wDate} ({wPct} %)",
  // open state (mid-window)
  q1_today_pos: "Aujourd'hui : +{pct} % au-dessus du CA habituel",
  q1_today_neg: "Aujourd'hui : {pct} % en-dessous",
  q1_running: "{up} / {received} jours reçus au-dessus",
  day_awaiting: "en attente de données",
  // shown before any window day has data — the measurable goal as a DAILY uplift (easy to read)
  q1_objective_eur: "Augmenter le CA de +{uplift} €/jour (+{pct} % vs CA habituel)",
  q1_objective_pct: "Augmenter le CA de +{pct} % vs votre CA habituel",
  q1_window_started: "L'opération a démarré — le suivi jour par jour apparaîtra ici au fil des ventes.",

  // ── ① LEAD = THE DECISION (Engine-1/2 contrast, not "situation"). NEW — OWNER: voice-pass these.
  // Causal-safe: the effect ABOVE what the context explains, never "votre action a généré". {pct}
  // arrives PRE-SIGNED. Honest on N: the verdict hedges to "à confirmer" while the sample is thin.
  q1_title_decision: "Votre action paie-t-elle ?",
  q1_lead_holiday: "{pct} % au-dessus de ce que les vacances seules expliquent",
  q1_lead_plain: "{pct} % au-dessus du CA habituel",
  q1_days_measured: "{up}/{n} jours mesurés",
  q1_split_inputs: "Situation {sit} % · dont vacances {hol} % sans action",
  q1_verdict_pays: "à ce stade, ça paie",
  q1_verdict_confirm: "à confirmer sur plus de jours",
  q1_verdict_flat: "l'effet de l'action n'est pas encore visible",
  q1_verdict_down: "à ce stade, l'action ne paie pas",
  // vs objectif — position of the effect against the owner's COMMITTED goal (not just vs votre résultat habituel).
  // Resolved → the authoritative verdict; open → the % target the owner set + current position.
  q1_objectif_line: "Objectif : +{pct} % vs votre résultat habituel",
  q1_objectif_above: "au-dessus à ce stade",
  q1_objectif_below: "en-dessous à ce stade",
  q1_objectif_met: "Objectif atteint",
  q1_objectif_missed: "Objectif non atteint",
  q1_objectif_confounded: "Objectif non mesurable (vacances)",
  // Lead hierarchy (goal-first): primary status + progress-to-goal bar + attribution.
  q1_ontrack: "Sur la bonne voie",
  q1_below: "En-dessous de l'objectif",
  q1_bar_goal: "objectif +{pct} %",
  q1_attrib_split: "Dont {action} % attribuable à votre action, hors effet vacances ({ctx} %).",
  q1_attrib_solo: "Votre action : {action} % au-dessus du CA habituel.",

  chart_realized: "CA réalisé",
  chart_habituel: "CA habituel",
  chart_note: "CA réalisé vs CA habituel (journée comparable). Au-dessus = mieux que d'habitude.",

  // §2d — holiday-adjusted honesty. NO "norme/écart" jargon; the number stays, terse.
  holiday_effect: "En vacances, le CA monte déjà de +{pct} % sans action.",
  // Decomposition line: situation − effet vacances = effet net attribuable à l'action.
  // {pct} arrives PRE-SIGNED (+/−). OWNER: voice-pass this wording if you'd phrase it differently.
  q1_decomp_action: "Effet de votre action, hors vacances : {pct} %",
  to_confirm_label: "À confirmer",
  to_confirm_holiday: "Résultat mesuré pendant les vacances scolaires. L'effet de l'action n'est pas isolable. À réessayer hors période de vacances pour trancher définitivement.",

  // ── ② Qu'est-ce qui a influencé ? ──
  // Two kinds of rows: (1) MEASURED impact (a €/% figure over history) — the weather assoc
  // when it passes the confidence gate; (2) NAMED observational context present on the
  // window (holidays, tourism, foreign visitors, nearby events) — NOT a fabricated cause,
  // just "what's happening / expected on the window", which is the useful signal on a
  // forward window. The per-driver measured engine stays queued.
  q2_title: "Qu'est-ce qui a influencé ?",
  q2_caveat: "Signaux observés sur les dates de l'opération — corrélations, pas des causes établies.",
  ctx_impact_weather: "Jours frais ou pluvieux — {cool} € en moyenne, vs {mild} € par temps doux (90 j).",
  ctx_calendar_holiday: "Vacances scolaires — {n} jours sur les dates de l'opération.",
  ctx_tourism_high: "Affluence touristique {status} sur la période.",
  ctx_tourism_foreign: "Clientèle internationale attendue : {list}.",
  ctx_events_named: "À proximité : {list}.",
  ctx_none: "Rien de notable observé sur la période.",

  // ── ③ Comment améliorer ? ──
  q3_title: "Comment m'améliorer ?",
  advice_cta: "M'engager sur cette action",
  advice_replay_offseason: "Réessayer hors vacances pour isoler l'effet.",
  advice_aim_higher: "En vacances, viser plus de +{pct} %.",
  advice_met_hold: "Objectif tenu — à reconduire.",
  // Type A track record (fct_location_commitment_learning). "N fois sur M" only — NEVER "prouvé"
  // ni "marche à X %" (self-selected operator track record, not an effectiveness rate).
  advice_track_reconduire: "Menée {done} fois — le CA a battu votre habituel {beat} fois. À reconduire.",
  advice_track_mitige: "Menée {done} fois — le CA a battu votre habituel {beat} fois. Résultats mitigés, à confirmer.",
  advice_track_ne_pas: "Menée {done} fois — le CA a battu votre habituel {beat} fois seulement. À ne pas reconduire tel quel.",
  // §2c — missed & done: descriptive honest statement, no "revoir l'approche" filler
  advice_missed_descriptive: "Aucun effet visible sur le CA.",
  advice_replay_retest: "À retenter pour confirmer.",

  // ── Diagnostic + advice (shown when under-performing: below goal open, or resolved missed) ──
  diag_title: "Pourquoi en-dessous ?",
  diag_intro: "Votre action ajoute {action} %, l'objectif est +{goal} %. Trois pistes, de la plus probable à la moins :",
  diag_ext_title: "Contexte externe",
  diag_ext_chip_obs: "observé",
  diag_ext_chip_meas: "mesuré",
  diag_ext_none: "Rien de notable observé sur les dates de l'opération.",
  diag_ext_weather: "{n} j de temps perturbé",
  diag_ext_events: "{n} événement(s) à proximité",
  diag_ext_holiday: "{n} j de vacances",
  diag_ext_calm: "Le contexte était plutôt calme — il n'explique pas l'écart.",
  diag_ext_partial: "Le contexte a pu jouer — à garder en tête avant d'ajuster.",
  diag_ext_weather_meas: "Vos jours frais : {cool} € en moyenne vs {mild} € par temps doux.",
  diag_exec_title: "Exécution",
  diag_exec_q: "L'action a-t-elle été menée comme prévu, chaque jour concerné ?",
  diag_exec_yes: "Oui",
  diag_exec_partial: "En partie",
  diag_exec_no: "Non",
  diag_lever_title: "Le levier",
  diag_lever_body: "Si le contexte était neutre et l'exécution complète, c'est le plan lui-même à ajuster.",
  diag_lever_exec: "Exécution incomplète repérée — commencez par là avant de changer de levier.",
  diag_todo_title: "Quoi faire",
  move_title: "Votre prochain mouvement",
  diag_move_intro: "Choisissez votre prochain move :",
  move_intro_ontrack: "Ça marche. À vous de décider la suite — poussez l'avantage ou sécurisez le résultat :",
  move_poursuivre: "Poursuivre",
  move_poursuivre_d: "Garder le plan, mieux le tenir.",
  move_doubler: "Doubler la mise",
  move_doubler_d: "Plus de ce qui marche.",
  move_pivoter: "Pivoter",
  move_pivoter_d: "Changer l'approche, puis remesurer sur de nouvelles dates.",
  move_stop: "Arrêter",
  move_stop_d: "Abandonner cette action — clôture, la carte revient à piloter.",
  diag_move_note_q: "Qu'avez-vous changé ?",
  diag_move_note_stop_q: "Pourquoi arrêter ?",
  diag_move_hint_caption: "Les exemples s'adaptent au type d'action.",
  diag_move_cta: "Engager →",
  diag_recommended: "recommandé",
  move_track: "ici : {hits}/{attempts} fois → objectif atteint",
  diag_bestinclass: "Comment des lieux comparables s'y prennent",
  diag_soon: "bientôt",
  diag_bic_caption: "Un cas comparable à tester — pas un résultat promis.",
  // One title (reuses the app's "dispositif" vocabulary — cf. "Votre dispositif"); the verdict→intent
  // nuance lives in the subline: pivot (en-dessous) · reinforce (aligné) · scale (au-dessus).
  diag_bic_title: "Dispositifs qui ont fonctionné ailleurs",
  diag_bic_caption_pivot: "Une autre approche à tester — pas un résultat promis.",
  diag_bic_caption_reinforce: "Comment des lieux comparables ont amplifié ce type d'action.",
  diag_bic_caption_scale: "Comment d'autres ont pérennisé ce type de résultat.",
  diag_bic_result: "Résultat",
  diag_bic_howto: "Comment faire ?",
  diag_bic_source: "Source",
  diag_bic_conf_eleve: "source fiable",
  diag_bic_conf_moyen: "à confirmer",
  diag_bic_conf_faible: "indicatif",
  diag_capitalise_title: "Capitaliser",
  diag_capitalise_body: "Ce que vous ajustez — et son résultat — rejoint votre Bilan. La mémoire du lieu, réutilisable la prochaine fois.",

  // ── ④ Action menée & retour ──
  q4_title: "Action menée & retour",
  done_question: "Action menée ?",
  done_yes: "Fait",
  done_no: "Pas encore",
  done_confirmed: "Action menée · confirmé par {name}",
  dispositif_label: "Votre dispositif",
  dispositif_ph: "Offre, canal, timing…",
  retro_question: "Qu'est-ce qui a marché, ou pas ?",
  retro_ph: "Ce que vous garderiez, ce que vous changeriez",
  // ── Documenter (Spec 2) — structured retro = the reusable knowledge-base entry.
  q4_title_doc: "Documenter",
  doc_hint: "Ce retour reste attaché à l'action — repère pour la prochaine fois et pour l'équipe.",
  edit: "Éditer",
  cancel: "Annuler",
  not_documented: "Pas encore documenté.",
  not_dispositioned: "Pas encore renseigné.",
  retro_worked_q: "Qu'est-ce qui a marché ?",
  retro_worked_ph: "Ce qui a porté le résultat",
  retro_change_q: "Qu'est-ce que je changerais ?",
  retro_change_ph: "Ce que vous ajusteriez la prochaine fois",
  retro_repeat_q: "À reproduire ?",
  repeat_yes: "Oui",
  repeat_no: "Non",
  save: "Enregistrer",
  saved: "Enregistré",

  // ── Sources & fiabilité ── (named providers = value + confidence)
  sources_title: "Sources & fiabilité",
  src_caisse: "Votre caisse — CA quotidien",
  src_weather: "Météo-France — météo & alertes vigilance",
  src_events: "OpenAgenda & Agendas régionaux — événements à proximité",
  src_tourism: "INSEE & OpenHolidays — tourisme & vacances scolaires",
  src_learning: "Vos données — CA habituel appris sur vos {days} derniers jours",
  // shown only when the action has a sufficient commitment track record (never a placeholder).
  // "N fois sur M" — never "prouvé" / "marche à X %".
  src_track_record: "Vos données — CA au-dessus de votre habituel {beat} fois sur {done} pour cette action",
  // Type A empty state — gated on commitment COUNT (not data ingestion). Honest + encourages use.
  src_track_pending: "Bilan de vos actions — se construit au fil de vos engagements menés à terme",
  // Case studies surfaced in "Dispositifs qui ont fonctionné ailleurs" — cited in the provenance list.
  src_bestinclass: "Études de cas — {list}",
};

export type EvolCopy = typeof EVOL_COPY;
```

## src/lib/sensitivityCopy.ts
```
// Type B — French copy for citing sensitivities. OWNER: your voice pass lives here; no
// French is hardcoded in consumers. Rules (see memory french-copy-voice): terse noun-phrases,
// mirror the app's real strings, no robotic LLM French, no hedge-paragraphs.
//
// THE LINE STATES THE OBSERVED HISTORY AS FACT — it happened, so no hedging ("pourrait",
// "à confirmer", "signal préliminaire"). Honesty lives in the SAMPLE shown, not weasel-words:
// always the count behind the rate ("19 jours sur 27, soit 70 % des fois") + the period it was
// drawn from, so the operator judges representativeness himself. The TIER gates INFLUENCE
// (canInfluence — whether it may drive a move/baseline), NOT the wording.
// [PERIOD: "pour la période …" is pending — needs a period field wired store→accessor→type.]

import type { Sensitivity, Tier } from "./sensitivityStore";

// feature key -> French label (extends with the taxonomy; owner refines wording)
export const FEATURE_FR: Record<string, string> = {
  heat: "Forte chaleur",
  cold: "Grand froid",
  rain: "Pluie",
  wind: "Vent fort",
  snow: "Neige",
  tourism_peak: "Affluence touristique",
  school_holiday: "Vacances scolaires",
  public_holiday: "Jour férié",
};

// section headings by register (a consumer groups rows under these)
export const TIER_SECTION: Record<Tier, { heading: string; caveat: string }> = {
  etabli: { heading: "Réactions établies", caveat: "Effets mesurés, toutes choses égales." },
  emergent: { heading: "Tendances en confirmation", caveat: "Se précisent au fil des données." },
  preliminaire: { heading: "Signaux préliminaires", caveat: "À confirmer — trop tôt pour trancher." },
};

// The ONE tier word, as a token that can appear INSIDE a sentence (TIER_SECTION's headings are for
// grouping rows; they don't fit mid-sentence). Used by the tiered causal register (Phase 1 #5): a causal
// sentence is legal only when it carries the tier token of the measured fact it cites, so the register is
// visible to the operator and checkable by the validator.
//
// This does NOT contradict the no-hedging rule above: a FACT line still states observed history flat, with
// the sample carrying the honesty. The token is required only when the model UPGRADES that fact into a
// causal claim — the upgrade is what must be labelled, not the fact.
export const TIER_TOKEN_FR: Record<Tier, string> = {
  etabli: "établi",
  emergent: "émergent",
  preliminaire: "préliminaire",
};


// ── Today-conditional operator phrasing (the A+B synthesis). LOCKED language rules:
// never "l'attendu"; "plus bas/haut que d'habitude / qu'une journée comparable"; consistency
// reads "N fois sur 10"; Type A track record reads "N fois sur M" / "ça a payé", never "prouvé".
export const ACTION_FR: Record<string, string> = {
  offre_appel: "une offre d'appel",
};
export interface TrackRecord { action_type: string; beat: number; done: number }

const pctInt = (s: Sensitivity): number => Math.round(Math.abs(s.effect_size) * 100);
const higherLower = (s: Sensitivity): string => (s.direction === "down" ? "plus bas" : "plus haut");
const actionFr = (t: string): string => ACTION_FR[t] || t;
const de = (label: string): string => (/^[aàâeéèêiîoôu]/i.test(label) ? `d'${label}` : `de ${label}`);
const featOf = (s: Sensitivity): string => de((FEATURE_FR[s.feature] || s.feature).toLowerCase());
// count behind the rate: how many feature-on days the effect actually held.
const heldDays = (s: Sensitivity): number => Math.round((s.consistency_pct / 100) * s.n_days);
// the sample tail every env line shares: "19 jours sur 27, soit 70 % des fois".
// ISO "2026-04-18" -> "18/04/2026" (JJ/MM/AAAA — France).
const frDate = (iso: string): string => { const [y, m, d] = iso.split("-"); return `${d}/${m}/${y}`; };
// "19 jours sur 27, soit 70 % des fois" + the window it was drawn from (representativeness).
const sampleFr = (s: Sensitivity): string => {
  const base = `${heldDays(s)} jours sur ${s.n_days}, soit ${Math.round(s.consistency_pct)} % des fois`;
  return (s.period_start && s.period_end)
    ? `${base} pour la période du ${frDate(s.period_start)} au ${frDate(s.period_end)}`
    : base;
};

// Engine 2 — your environment, today-conditional (insight / prompt: "comme aujourd'hui").
// States the observed history as fact; the sample (count + rate) carries the honesty, not hedging.
export function envTodayLine(s: Sensitivity): string {
  return `Les jours ${featOf(s)} comme aujourd'hui, votre CA a été ~${pctInt(s)} % ${higherLower(s)} que d'habitude — ${sampleFr(s)}.`;
}
// Engine 2 — period framing (report: "vos journées de forte chaleur").
export function envPeriodLine(s: Sensitivity): string {
  return `Vos journées ${featOf(s)} : CA ~${pctInt(s)} % ${higherLower(s)} qu'une journée comparable — ${sampleFr(s)}.`;
}
// Engine 1 — your measured track record. "N fois sur M" / "ça a payé", never "prouvé"/rate.
export function actionLine(a: TrackRecord): string {
  return `Les fois où vous avez lancé ${actionFr(a.action_type)} ces jours-là, ça a payé — ${a.beat} fois sur ${a.done}.`;
}
// The move — soft, only when the Type A track record qualifies (reconduire gate; caller enforces).
export function moveLine(a: TrackRecord): string {
  return `Envisagez de relancer ${actionFr(a.action_type)} aujourd'hui.`;
}
// The reconduire gate (mirrors commitmentContext): a real, positive track record only.
export function trackRecordQualifies(a: TrackRecord): boolean {
  return a.done >= 5 && a.beat >= 4 && a.beat / a.done >= 0.70;
}

// One vetted sensitivity -> one cited line, in its tier's register. This is what every
// consumer renders / feeds the LLM verbatim; the LLM MUST NOT rephrase beyond this.
export function citeSensitivity(s: Sensitivity): string {
  return `${FEATURE_FR[s.feature] || s.feature} : les jours comme aujourd'hui, CA ~${pctInt(s)} % ${higherLower(s)} que d'habitude — ${sampleFr(s)}.`;
}

// Engine 1 × Engine 2 decomposition — an OBSERVED DIFFERENCE, never a proven cause. The line states
// the gap between action-days and no-action-days on this factor; it NEVER says "your action generated".
// `n` is the INDEPENDENT unit (number of engagements/commitment windows) — never the inflated day count,
// so the operator judges representativeness himself.
export interface DecompositionCite { factor: string; action_delta: number; n: number }
export function decompositionLine(d: DecompositionCite): string {
  const pts = Math.round(Math.abs(d.action_delta));
  const dir = d.action_delta >= 0 ? "au-dessus" : "en-dessous";
  const feat = de((FEATURE_FR[d.factor] || d.factor).toLowerCase());
  return `Les jours ${feat} où vous avez agi, vous étiez ${d.action_delta >= 0 ? "+" : "−"}${pts} pts ${dir} de vos journées ${feat} sans action — sur ${d.n} engagement${d.n > 1 ? "s" : ""}, à confirmer.`;
}
```

## Phrases d'action réelles (public/action-cards.js — ACTION_SENTENCES)
```
'À faire : reprendre contact en direct — comprendre si la pause est saisonnière, un point de friction, ou un départ chez un concurrent.'
'À faire : reconstituer la semaine (fermetures, absence, contexte local), puis ajuster ce qui se pilote à ce terme — achats et animation.'
'À faire : identifier ce qui a porté la semaine (client, opération, contexte) — et le noter pour le rejouer sciemment.'
'À faire : passer les comptes du mois en revue — qui n’a pas commandé, et pourquoi ? Le grain client (cartes clients) dit qui relancer.'
'À faire : comprendre chaque gros compte du mois (commande unique ou nouveau rythme ?) — et sécuriser le réassort de ce qu’ils achètent.'
'À adapter : repli intérieur ou dispositif abrité — décision la veille.'
'À faire : ouvrir la comparaison et choisir le jour.'
'À faire : briefer l’équipe ce soir — Communiquer pré-rempli.'
'À faire : documenter ce qui a marché — la fiche se pré-remplit depuis le dossier (30 secondes).'
'Communiquer : sollicitez des avis clients pour équilibrer.'
'Communiquer : capitalisez sur votre réputation.'
'Faire suivre : vérifiez si vos horaires restent compétitifs.'
'À capter : un concurrent affiche complet. Adressez-vous au public qui n'
'À défendre : un concurrent intensifie ses publications. Maintenez votre présence pour ne pas perdre en partage d'
'À capter : un concurrent est silencieux sur ses canaux. Prenez la parole maintenant pour occuper l'
'À capter : une campagne institutionnelle proche peut générer du passage. Préparez une offre ou un message pour capter ce flux.'
'À capter : une mention média dans votre zone peut générer de la visibilité. Relayez-la et préparez un message pour convertir ce passage.'
'Faire suivre : partagez le bilan avec votre équipe.'
```

---

# DOCUMENT 5 — SITE ACTUEL ET CONTRAINTES

# Le site actuel et les contraintes de format

## 1. Périmètre du chantier

À réécrire : **la page d'accueil** et **la page plateforme** (`/offres`, libellée « Plateforme » dans la navigation).
`/solutions` est une page de l'ère conseil, orpheline de la navigation et en HTML cassé — elle sera supprimée, pas réécrite.

## 2. Ce qui est en ligne aujourd'hui — texte exact

### Page d'accueil

- **Titre de l'onglet** : « Muse Square — Copilote opérationnel »
- **Meta description** : « Muse Square est le copilote opérationnel des entreprises dont le chiffre d'affaires dépend de la fréquentation. »
- **H1 (sur bannière pleine largeur, texte blanc sur photo assombrie)** : « Le copilote opérationnel de votre entreprise »
- **Accroche sous le H1** (max ~560 px de large, 20 px) : « Muse Square transforme vos signaux contextuels et opérationnels en leviers d'actions — et les livre à vos équipes. »
- **Deux boutons** : « Découvrir la plateforme » → /offres · « Nous contacter » → /contact

**Trois tuiles** (titre ~22-24 px + 2 lignes, chacune sous une icône ronde, CTA « Voir nos solutions ») :
1. « Pilotez votre activité » — « Voyez chaque jour ce qui impacte votre activité: vos données internes croisées avec vos signaux contextuels. »
2. « Planifiez vos temps forts » — « Trouvez la meilleure fenêtre pour vos temps forts: opération commerciale, ouverture, événement. »
3. « Exploitez vos données » — « Obtenez des réponses sourcées à vos questions opérationnelles, basées sur vos données et votre contexte régional. »

**Bloc preuve 1** — titre « Du signal à l'action, chaque matin » + 2 paragraphes (exemples concurrent/pont férié/tramway).
**Bloc preuve 2** — titre « Détectez, agissez, automatisez. » + 2 paragraphes.
**Bloc segments** — titre « Pour toutes les organisations qui accueillent des clients ou des vsiteurs » *(faute de frappe en production : « vsiteurs »)*, puis trois cartes : Retail & marques / Événementiel / Lieux culturels & festivals, chacune avec un persona, 3 étiquettes et un paragraphe de douleur.

**Témoignages** (carrousel, authentiques, à conserver) :
> « Grâce à Muse Square, nous avons enfin pu anticiper les journées à risque pour programmer nos événements. C'est devenu un outil de pilotage quotidien pour notre équipe. » — L'équipe de Costières de l'Art, Festival d'Art Contemporain

> « Muse Square Insight nous a aidé à identifier les jours porteurs pour nos ventes de fin d'année et notre braderie 2026. Un atout précieux pour notre entreprise familiale. » — Les Olivades, Imprimeur et éditeur de tissu, entreprise du patrimoine vivant

### Page plateforme (`/offres`)

- **H1 sur bannière** : « Détectez, agissez, automatisez. »
- **Accroche** (max ~720 px) : « Veille opérationnelle, réponses prêtes à exécuter et distribution aux bonnes personnes — sur chaque site, chaque jour. »
- **« Comment ça marche ? »** — 4 paragraphes en gras-puis-texte : *Votre veille* / *Vos actions et leur automatisation* / *Vos événements et vos questions* / *Vos décideurs*.
- **Section PLANIFIER** — « Anticipez avant de vous engager » + 3 étapes numérotées avec capture (Explorer / Sélectionner / Comparer).
- **Section PILOTER** — « Suivez vos risques chaque jour » + 2 blocs texte/image.
- **Section ALERTES** — « Restez informé sans ouvrir l'application » + 3 encarts.
- **Section INTELLIGENCE ARTIFICIELLE** — « Notre approche de l'IA » + 3 colonnes (Data-driven / Vérifiable / Rigoureuse).
- **Section « Les 4 signaux de risque »** — 4 cartes (Concurrence événementielle / Mobilité / Calendrier contextuel / Météo), chacune avec un paragraphe et 2 exemples de phrases produit.
- **CTA final** — « Vous avez des besoins spécifiques ? » + paragraphe + mention de couverture beta.

## 3. Ce qui va bien et ne doit pas être perdu

- La section **« Comment ça marche ? »** de `/offres` est la meilleure page du site : concrète, séquencée, sans jargon.
- **« Cinq actions priorisées vous attendent. Pas vingt. »** — exact et différenciant.
- **« Vous vérifiez, vous décidez. »** et **« La fiabilité avant l'exhaustivité »** — bonne formulation de l'argument de confiance.
- Les **exemples nommés** (« Ligne de tramway coupée ? », « Travaux sur la ligne 4 du métro », « Fashion week — pas d'impact sur clientèle professionnelle ») : c'est ce niveau de concret qu'il faut généraliser.
- Les deux témoignages.

## 4. Défauts identifiés

- **« Copilote » est mort comme différenciateur** (Microsoft l'a rendu générique ; en France la recherche renvoie Microsoft 365 et un ERP agroalimentaire installé depuis 1982).
- Les trois tuiles de la home sont des abstractions de l'ère conseil (« Pilotez votre activité »), plus faibles que le produit réel.
- La home vise **quatre acheteurs à la fois** — c'est la cause mécanique de l'abstraction : un texte qui doit couvrir quatre lecteurs ne peut employer que des noms génériques.
- Le CTA des tuiles dit « Voir nos solutions » alors que la navigation dit « Plateforme ».
- Faute en production : « vsiteurs ».
- Répétition : « Détectez, agissez, automatisez. » sert à la fois de titre de bloc en home et de H1 sur `/offres`.

## 5. Contraintes de format à respecter dans la copie livrée

| Emplacement | Contrainte |
|---|---|
| H1 de bannière | Texte blanc sur photo assombrie. Doit rester lisible court : **une ligne sur desktop**, ~45-60 caractères. |
| Accroche sous H1 | 20 px, largeur max 560 px (home) / 720 px (offres) → **1 à 2 lignes, ~140-200 caractères**. |
| Titre de tuile | 22-24 px, ~2-4 mots. |
| Corps de tuile | **2 lignes maximum.** |
| Titre de section | ~24-26 px, une ligne. |
| CTA | **Un verbe, ≤ 14 caractères** (règle du lexique). |
| Dates | Toujours **JJ/MM/AAAA**. Jamais AAAA-MM-JJ ni MM/JJ/AAAA. |
| Nombres et devise | Format français : virgule décimale, **€ après le nombre** (1 221 €). |
| Jours de semaine | En toutes lettres (« votre jeudi habituel »). |
| Emoji | **Interdits.** |
