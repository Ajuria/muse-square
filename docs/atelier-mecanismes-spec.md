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

1. Le nom utilisateur de l'objet (« mécanisme » est un mot d'ingénieur — « ce qui déclenche »,
   « votre explication » ?).
2. La famille pilote du mode enquête (recommandation : affluence sur le compte café).
3. Le seuil de graduation (proposer l'engagement dès la capture, ou seulement quand le
   `confirmation_test` est daté ?).
