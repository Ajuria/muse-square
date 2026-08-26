# Atelier des mécanismes — spec dédiée (01/08/2026, chantier SUIVANT) — SPEC DE TRAVAIL

> **Design owner (01/08 soir)** : sur une carte d'IDENTIFICATION, l'utilisateur doit trouver le
> mécanisme à partir des données affichées + du dialogue LLM sur la page profonde
> (insight.astro) correspondante → une fois la cause / les variables / le motif trouvés →
> **Documenter** → alimente la base de connaissances, l'apprentissage du LLM et les suggestions
> de cartes. Différent des cartes correctives : objectif + stratégie, et la page profonde
> MESURE si ça marche.
>
> Formulation retenue : **un seul cycle de vie — mécanisme → stratégie → mesure — à deux portes
> d'entrée.** Identification entre au début (levier à découvrir) ; corrective entre au milieu
> (levier connu). Un mécanisme documenté GRADUE en stratégie : le système propose l'engagement
> correspondant. L'identification d'aujourd'hui fabrique les cartes correctives de demain.
>
> **Ce chantier ne bloque PAS le feed** (doctrine valeur d'action) : l'entrée « Explorer » des
> cartes d'identification route vers la page profonde EXISTANTE dès la v1 du feed ; l'atelier
> enrichit cette page ensuite.

---

## Ce qui existe déjà (à router, pas à reconstruire — SST)

| brique | état | rôle dans l'atelier |
|---|---|---|
| Pages profondes par famille (provider pattern : data + facts + sources) | en prod, drill-down par carte en déploiement | le PLATEAU de l'enquête et de la mesure |
| Chat groundé par carte (Consulter, prompts par famille, validator + lie-bait) | en prod | le dialogue d'enquête (à diriger, cf. pièce 2) |
| Boucle d'engagement mesurée (commitments → residual_z → bilan → learning) | en prod, E2E prouvé | l'atelier de MESURE des cartes correctives |
| Base « Vos bonnes pratiques » (`analytics.best_practices` : day_class_key, kpi, leviers ; tier déclarée→prouvée par replay) | en prod | le socle de l'objet « mécanisme » (extension, pas table parallèle) |
| Chaîne d'apprentissage LLM (corrections/déclarations → marts dbt → contexte) | en prod | le canal « le mécanisme nourrit le LLM » |
| Store des classes de jours + recouvrements inter-classes calculables | en prod (log+médiane 01/08) | la PRÉ-RÉPONSE mesurée de l'enquête |
| Moteur de sensibilité type B (OLS + SE + VIF, offline batch) | construit, dormant | le TEST propre des facteurs candidats (brancher plus tard) |

## Les trois pièces NOUVELLES

### 1. L'objet « mécanisme » — le livrable d'une session d'enquête

Extension de `best_practices` (même table, même vocabulaire — jamais un système parallèle) :

- `day_class_key` (le motif concerné — existe),
- **`mechanism_factors`** : le(s) facteur(s) supposé(s), du vocabulaire EXISTANT quand la
  machine les connaît (clés de classes, features du moteur type B), texte libre sinon,
- **`evidence_refs`** : les preuves citées — quelles données affichées appuient l'hypothèse
  (réfs de blocs de la page profonde / chiffres du store), jamais du vide,
- **`confirmation_test`** : ce qui confirmerait le mécanisme (ex. « les 3 prochains jeudis de
  marché doivent sur-performer ») — c'est la graine de la GRADUATION en engagement,
- tier : **déclaré** à la capture ; « prouvé » par le test, jamais autrement.

### 2. Le mode ENQUÊTE du chat de la page profonde

Consulter répond à des questions ; l'enquête est DIRIGÉE VERS UN BUT : converger vers un
mécanisme. Concrètement :

- un prompt de session dédié (« qu'est-ce qui distingue vos N jours de <classe> ? ») nourri du
  matériau réel : la LISTE des jours de la classe, les recouvrements inter-classes (mesurés —
  ex. MS Occitanie : 40 jours de pointe → 85 % chaleur, 55 % vacances, 25 % week-end, 2/40 sans
  facteur), les variables du payload de la carte ;
- le LLM PROPOSE des facteurs candidats UNIQUEMENT depuis ce matériau ; il pose les questions
  qui départagent (« ces 2 jours sans facteur environnemental — que s'était-il passé chez
  vous ? ») ;
- la sortie de session est structurée : l'objet mécanisme pré-rempli, que l'utilisateur édite
  et documente.

### 3. La discipline de vérité, étendue à l'enquête

- La suite lie-bait s'applique au mode enquête (c'est un changement de grounding : merge gate).
- Facteur proposé par le LLM = cité avec sa preuve mesurée, sinon il ne sort pas.
- Hypothèse de l'utilisateur = tier **déclaré**, affichée comme telle partout ; promotion par
  le `confirmation_test` uniquement (le patron bonnes-pratiques déclarée→prouvée existe).
- Le moteur type B, une fois branché, teste les facteurs candidats proprement (OLS + VIF) —
  jusque-là, les recouvrements sont des CO-OCCURRENCES, et la copie le dit.

## Le CTA et la page (owner, 01/08 soir — dernier arbitrage)

- **Bouton de la carte d'identification : « Reproduire le dispositif »** — le job-to-be-done,
  pas le moyen (« Explorer la cause » rejeté). Le clic précoce n'est pas un problème : c'est
  la PAGE qui porte le parcours.
- **La page s'intitule « Reproduire le dispositif gagnant »** et se structure en 3 étapes :
  1. l'identifier (données + dialogue — le mode enquête), 2. le documenter (l'objet mécanisme),
  3. le rejouer (le rejeu bonnes pratiques existant).
- **Garde-fous** : la page s'ouvre TOUJOURS sur l'étape 1 (jamais sur un rejeu vide — sinon
  l'utilisateur cherche un dispositif écrit nulle part) ; le dispositif documenté naît au tier
  « déclaré » et ne devient « prouvé » que par le rejeu. Nota : même quand l'enquête conclut
  « c'était l'environnement » (85 % chaleur), la sortie EST un dispositif — une routine
  d'anticipation déclenchée par la prévision.

## Affichage « idiot-proof » (owner, 01/08 soir — proto v2)

- **Le récit en français d'exploitant est le SEUL texte courant** ; pourcentages, méthode et
  nuances (« co-occurrence ≠ cause ») vivent AU SURVOL (l'affordance pointillé des coins,
  amendement 2 de la doctrine). Ex. : visible « 38 de vos 40 jours de pointe tombent des jours
  de chaleur, de vacances ou de week-end » ; survol « 85 % / 55 % / 25 % — co-occurrences
  mesurées, pas des causes prouvées ». Le verbe visible est FACTUEL (« tombent »), jamais
  causal (« expliquent »).
- Les tables de preuves sont repliées (« Voir vos 40 jours ») ; seules les journées à
  expliquer restent visibles.
- **Le multifactoriel se dit en une phrase honnête et se TRANCHE par le test daté** — jamais
  par une statistique d'observation qu'on n'a pas : « chaleur et vacances arrivent ensemble
  sur votre historique — indissociables, et on ne prétendra pas le contraire ». L'intervention
  datée (le test de confirmation) est ce qui casse la structure de corrélation ; le moteur
  type B (VIF) refusera l'attribution confondue quand il sera branché.
- **La page cache la méthode — le job d'abord** (owner 02/08, sur la page réelle) : trois blocs
  en langue d'exploitant (« Ce que vos données disent » / « Votre explication » / « Testez-la »),
  pas de rail d'étapes, pas de table de preuves, pas de discours sur les tiers ou les retombées —
  tout ça vit en infobulle. Le champ « preuves » est INVISIBLE (backend, pré-rempli — il part
  dans la fiche, il ne se lit pas). Une seule question visible : « que s'était-il passé ? ».
- **L'étape 2 n'est pas un formulaire : c'est la fiche que la conversation vient d'écrire.**
  Chaque champ est SOURCÉ (votre phrase du chat / le jour cité du bloc preuves / le test
  proposé par l'assistant), l'utilisateur relit-corrige-enregistre. Champs en français
  d'exploitant : « Ce que vous aviez fait » / « Les jours qui le montrent » / « Comment on
  saura que ça marche ». Les trois retombées affichées sur la fiche : réutilisable (bonnes
  pratiques), testable (graduation), apprend au système (contexte LLM + candidat d'ingestion).
- **VERDICT UX (owner, 03/08, sur la page resserrée réelle) : la page-formulaire ne peut pas
  porter ce job — la conversation EST l'interface.** Le processus en blocs statiques est
  cognitivement lourd ; les libellés d'étapes (« Ce que vos données disent / Votre
  explication / Testez-la ») tombent avec lui. La page cible : UN message d'ouverture de
  l'assistant (nourri par le provider `dispositifFamily`, se terminant sur UNE question) +
  une zone de réponse ; la fiche est PROPOSÉE en tour de chat (« Je résume : […]. On
  l'enregistre ? ») et l'engagement est un CTA en chat — la mécanique décision→engagement
  du 16/07 existe. La page statique actuelle est un échafaudage : on n'itère plus dessus,
  on construit le mode chat (pièce 2b, chirurgie `prompt.ts` en session fraîche).
  Micro-correctif de mots en attendant : « suivent » → « arrivent avec ».

## Interaction d'enquête (owner, 01/08 soir — « the default explanation may be wrong »)

Le chat est le Consulter existant, incrusté dans la page, en conversation LIBRE — pas un
script à trois messages. Discipline du mode enquête :

1. **Jamais de convergence sur la première hypothèse.** L'assistant ouvre l'espace
   (fermeture anticipée ? équipe réduite ? groupe ? animation ?) et pose la question qui
   départage.
2. **Vérification INTERNE systématique avant toute hypothèse externe.** Chaque hypothèse
   testable dans nos données EST testée avant d'être proposée ou écartée :
   - « journée écourtée » → la courbe horaire (`fct_client_hourly_sales` / lignes horaires) —
     cas réel MS Occitanie 10/04 : ventes de 6 h à 19 h, 196 tickets → écartée ;
   - « effet produit » → la répartition produits du jour vs habituelle (lignes
     `raw.client_transactions`) — 10/04 : café 42 %, thé 26 %, mix normal → écartée ;
   - « conversion » → les métriques du jour (signals mart).
   L'assistant DIT ce qu'il a écarté et pourquoi, source citée — c'est ce qui l'autorise à
   demander « que s'était-il passé ? ».
3. **Rien de retenu sans test.** La fiche reste modifiable, « ce n'est pas ça » relance
   l'enquête, plusieurs dispositifs candidats peuvent coexister — chacun au tier déclaré,
   chacun avec son test.

## Hiérarchie de l'enquête (owner, 03/08 — « focus on what works ; side notes, not action cards »)

Correction du dernier sur-cadrage : le premier message proposé « faisait un mystère » des
journées inexpliquées. Trois règles, désormais dures :

1. **Le job de l'enquête, c'est ce qui MARCHE — pas les micro-mystères.** La question qui
   vaut de l'argent sur un motif d'identification : « vos jours de pointe sont prévisibles
   (38/40 arrivent avec chaleur/vacances/week-end) et valent +33 402 €/an — qu'est-ce que
   vous FAITES ces jours-là qui les fait réussir, et est-ce écrit pour que l'équipe le
   rejoue à chaque pic prévu ? » Le dispositif à documenter est la routine de réussite des
   jours MATÉRIELS, reproductible sur prévision — pas l'anecdote des exceptions.
2. **Porte de matérialité étendue à l'enquête : une exception ne devient un sujet que si
   son impact mesuré est matériel.** Le provider porte le gap € de chaque journée — la
   règle est mécanique. En dessous du seuil : **note annexe**, ton bas, ignorable sans
   coût (« deux journées du tercile haut sans facteur connu — poids faible, possiblement
   la variation ordinaire ; un souvenir ? notez-le, sinon laissez »). Un clic pour annoter
   la base de connaissances — un type de capture LÉGER (annotation), jamais une fiche
   complète ni une carte d'action. Cas mesuré MS Occitanie : les 2 jours hors motif ont
   un CA quasi normal (gaps ≈ 0) → notes annexes, pas questions.
3. **Humilité statistique en règle de voix : jamais un résidu sans l'explication nulle à
   côté.** Les jours diffèrent par nature, les motifs ne sont jamais parfaits (effets
   combinés de petites variables, saison) — l'assistant le DIT (« peut n'être que la
   variation ordinaire »). C'est le pendant conversationnel de « co-occurrence ≠ cause » :
   présenter du bruit comme une énigme qui exige une explication est un sur-vendu.

Message d'ouverture de référence (re-problématisé, validé 03/08) : « Vos jours de pointe
valent +33 402 €/an, et 38 sur 40 sont prévisibles — ils arrivent avec la chaleur, les
vacances ou le week-end. La question qui compte : qu'est-ce qui fait réussir une journée
de pointe chez vous — et est-ce écrit, pour que l'équipe le rejoue à chaque pic annoncé ?
Si c'est dans votre tête, ça dépend de vous ; documenté, ça devient un dispositif. (En
marge : deux journées du tercile haut n'ont aucun facteur connu — 10/04, 20/05 — poids
faible, possiblement la variation ordinaire ; un souvenir ? notez-le, sinon laissez.) »

Ces trois règles entrent telles quelles dans le system prompt du mode enquête (pièce 2b).

## Périmètre des signaux : les trois cercles (owner, 01/08 soir — le cas « documentaire avocat »)

Cas déclencheur (beta-testeur POS) : « un mauvais documentaire télé sur les avocats fait
chuter les ventes » — la cause est hors de notre portée, MAIS :

1. **Cercle 1 — l'interne, déjà ingéré, sous-exploité : la moitié de la réponse.** **[SHIPPED
   03/08 : movers produits du jour sur les jours inexpliqués du provider dispositif — écart €
   par famille vs SA moyenne journalière du lieu (référentiel DIT dans le fait : tous jours
   confondus, v1), deux sens, familles à zéro incluses (l'absence est un signal), top 3 par
   |écart| ; dans les faits de l'enquête + l'infobulle de marge. Prouvé sur les 2 lieux.]** « Les
   ventes chutent » n'est pas le bon grain — QUELLES ventes ? Les lignes produit existent
   (`item_code`/`item_category`/`quantity` dans `raw.client_transactions`, `revenue_share`
   dans `fct_client_offering_profile`). Le jour dit, la donnée montre « chute concentrée sur
   la famille avocats » : le QUOI est chez nous, seul le POURQUOI est dehors — et un
   exploitant qui lit le quoi trouve le pourquoi en trente secondes. **Chantier concret :
   les movers produits du jour dans le bloc de preuves de l'enquête** (données présentes,
   non branchées). Sert aussi Les Olivades (séparation détail/grossiste, 6 297 lignes).
2. **Cercle 2 — l'externe NOMMÉ : vérification à la demande, jamais surveillance.** Une
   cause déclarée, datée (« un documentaire est passé mardi ») se VÉRIFIE par le crawl
   agent-augmenté existant (enrich-context) — on vérifie une déclaration, on n'espionne pas
   un flux. Le fait vérifié entre dans la fiche comme preuve externe citée.
3. **Cercle 3 — l'externe OUVERT (monitoring TV/réseaux) : jamais par défaut.** Autre
   métier, cher, bruyant, inattribuable — le promettre casserait la barre de vérité.
   Graduation par récurrence (même doctrine que les marchés) : plusieurs fiches partageant
   un TYPE de cause (« média national sur un produit ») → évaluation d'une source CIBLÉE
   comme candidat d'ingestion, mesurée. Le périmètre grandit par besoin démontré, jamais
   par crawling spéculatif.

## Détection des signaux hors base (owner, 01/08 soir)

Le résidu EST le détecteur ; l'exploitant est le nommeur ; la graduation est l'ingesteur :

1. **Détection** — bloc permanent « journées inexpliquées » : les jours au gap notable
   qu'AUCUNE classe connue ne couvre (ex. réel MS Occitanie : ven 10/04, 980 visiteurs, et
   mer 20/05, 755 — ni chaleur, ni vacances, ni week-end). Régularités affichées quand n
   suffit (même jour de semaine, même quinzaine) — jamais affirmées sur 2 points.
2. **Nommage** — l'enquête fait dire la cause à celui qui la connaît (« le marché des
   producteurs ») ; capturée au tier déclaré.
3. **Ingestion** — un dispositif documenté, RÉCURRENT et DATÉ devient un candidat
   d'ingestion (les calendriers de marchés sont publics ; le crawl agent-augmenté existant
   sait chercher une source nommée). Jamais un signal inventé — déclaré, puis vérifié, puis
   ingéré.

Chaque trou de données devient ainsi une source future — c'est la réponse structurelle à
« comment détecter ce qu'on n'ingère pas encore ».

## L'échelle d'enjeu — un référentiel par étape (owner, 02/08)

« C'est comme ça qu'un manager arbitre son temps » : chaque étape répond à « shall I care ? » —
mais JAMAIS avec le même nombre, et jamais le poids total du motif sur le test d'un dispositif
(le dispositif n'explique qu'une PART du motif — promettre le tout serait le sur-vendu tué le
01/08 sur la carte de conversion) :

| étape | le nombre | référentiel |
|---|---|---|
| 1 · Identifier | le poids TOTAL du motif (ex. +33 402 €/an) | pourquoi cette page mérite du temps — en en-tête |
| 2 · Documenter | la valeur d'UNE journée de ce type (la médiane mesurée, `impact.avg_gap_eur` — ex. +272 €) | documenter = la rendre déclenchable |
| 3 · S'engager sur le test | la journée déclenchée (médiane) + **le potentiel annuel écrit comme LA multiplication de l'exploitant** : « vous visez N jours × +272 € » | la fréquence de déclenchement est SON choix et SON levier — un potentiel affiché tout fait serait une promesse ; le même nombre écrit comme sa multiplication est un outil de décision |

Après rejeu PROUVÉ : le dispositif gagne son propre €/an — au rythme CONSTATÉ de
déclenchement, jamais estimé. Le « prouvé au rejeu, jamais avant » ne disparaît pas : il
devient l'étape d'après.

## La graduation mécanisme → stratégie

Quand un mécanisme est documenté avec un `confirmation_test` :

1. le système propose l'engagement correspondant (origine `structural_<class_key>` — existe),
   pré-rempli avec le test comme objectif ;
2. l'issue de l'engagement (boucle commitments) met à jour le tier du mécanisme ;
3. un mécanisme prouvé nourrit : la base de connaissances (déjà), le contexte LLM (chaîne
   corrections — déjà), et **les suggestions de plans** de la carte du motif (reco-library :
   la voix owner reste la règle — le mécanisme FOURNIT la matière, il n'écrit pas les plans).

## Séquencement et dépendances

1. AVANT : le feed doctrine (spec `doctrine-valeur-action.md`) ship — « Explorer » route vers
   la page profonde existante, sans mode enquête.
2. Pièce 1 (objet mécanisme, extension best_practices) — petite, indépendante.
3. Pièce 2 (mode enquête) — dépend du drill-down par carte (rollout en cours : sales/weather/
   engagement faits) ; commencer par UNE famille (affluence/`traffic_high`, la plus riche en
   matériau). **SHIPPED v1 (03/08, dev)** : mode `body.dispositif` dans `prompt.ts` (early-return,
   discipline en system, porte chiffrée `validateEnqueteOutput` + lie-bait même commit),
   provider émet `facts`, page `dispositif.astro` réécrite chat-first (ouverture déterministe +
   note de marge, fiche en tour de chat → POST best-practices, M'engager → MSCommitForm + PATCH).
   E2E 2 tours prouvé sur le lieu à visiteurs mesurés (fiche au tour 2, tous chiffres fondés).
   **Extension 03/08 : les 3 motifs d'identification couverts** (traffic_high / followed_activity_high /
   competition_low — appartenance-jour copiée du moteur, `class_meta` par classe : libellés + question
   de fond ; « prévisibles » revendiqué seulement si co-occurrence env ≥ 60 %). Vérifié sur données
   réelles : traffic_high byte-identique avant/après ; café competition_low +9 964 €/an ;
   muse followed_activity_high +7 208 €/an (visiteurs absents omis des faits) ; refus honnêtes ailleurs.
   **Incrément suivis (03/08 soir)** : les jours « sans facteur connu » de la classe suivis NOMMENT
   les événements suivis actifs ce jour-là (tri par durée croissante — le court est discriminant,
   l'expo permanente ne l'est pas ; identité par la clé lieu+plage, pas le libellé ; 3 max + total).
   Cas réel : sur les 5 jours inexpliqués de Muse Square (29/06→03/07), l'heuristique fait remonter
   « Raoul Dufy » (ouvert le 27/06 au Centre Pompidou) — une CO-OCCURRENCE mise sous la main de
   l'enquête, JAMAIS une cause (owner 03/08 : l'attribution a posteriori sans reproduction ni
   séparation des causes — y compris celles hors base — est un bris de confiance ; seul l'historique
   de profils comparables ou un test futur mesuré peut l'établir). Le fait porte son registre
   (« co-occurrence, pas une cause établie ») ; la note de marge dit « portaient des événements »,
   pas « expliqués par ».
4. Pièce 3 en continu (lie-bait à chaque relaxation).
5. Type B branché en dernier (il a sa propre feuille de route).

## Décisions owner ouvertes

1. ~~Le nom utilisateur de l'objet~~ — **TRANCHÉ (01/08 soir) : « dispositif »** (« mécanisme »
   reste le nom interne/technique de l'objet). CTA « Reproduire le dispositif », page
   « Reproduire le dispositif gagnant ».
2. La famille pilote du mode enquête (recommandation : affluence sur le compte café).
3. Le seuil de graduation (proposer l'engagement dès la capture, ou seulement quand le
   `confirmation_test` est daté ?).
