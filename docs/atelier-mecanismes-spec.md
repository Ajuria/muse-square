# Atelier des mécanismes — spec dédiée (01/08/2026, chantier SUIVANT)

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
- **L'étape 2 n'est pas un formulaire : c'est la fiche que la conversation vient d'écrire.**
  Chaque champ est SOURCÉ (votre phrase du chat / le jour cité du bloc preuves / le test
  proposé par l'assistant), l'utilisateur relit-corrige-enregistre. Champs en français
  d'exploitant : « Ce que vous aviez fait » / « Les jours qui le montrent » / « Comment on
  saura que ça marche ». Les trois retombées affichées sur la fiche : réutilisable (bonnes
  pratiques), testable (graduation), apprend au système (contexte LLM + candidat d'ingestion).

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

## Périmètre des signaux : les trois cercles (owner, 01/08 soir — le cas « documentaire avocat »)

Cas déclencheur (beta-testeur POS) : « un mauvais documentaire télé sur les avocats fait
chuter les ventes » — la cause est hors de notre portée, MAIS :

1. **Cercle 1 — l'interne, déjà ingéré, sous-exploité : la moitié de la réponse.** « Les
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
   matériau).
4. Pièce 3 en continu (lie-bait à chaque relaxation).
5. Type B branché en dernier (il a sa propre feuille de route).

## Décisions owner ouvertes

1. ~~Le nom utilisateur de l'objet~~ — **TRANCHÉ (01/08 soir) : « dispositif »** (« mécanisme »
   reste le nom interne/technique de l'objet). CTA « Reproduire le dispositif », page
   « Reproduire le dispositif gagnant ».
2. La famille pilote du mode enquête (recommandation : affluence sur le compte café).
3. Le seuil de graduation (proposer l'engagement dès la capture, ou seulement quand le
   `confirmation_test` est daté ?).
