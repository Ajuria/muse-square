# Lexique Muse Square — LE mot pour chaque concept — DÉFINITIF

**Ce fichier fait loi.** Un concept = un mot, choisi par l'owner. Toute chaîne visible par
l'utilisateur vient d'ici ou reprend une chaîne déjà en production — jamais inventée en vol
(maquettes comprises : le garde-fou `evenement.fr.guard.test.ts` scanne aussi les protos).
Un concept sans mot ⇒ on demande LE mot à l'owner, on n'improvise pas.

_Draft assemblé le 17/08 depuis le vocabulaire déjà en production — à éditer par l'owner ;
chaque ligne modifiée ici doit être répercutée dans `src/lib/fr/evenement.fr.ts` (MOTS_BANNIS)._

## Les mots de l'app (fermé)

| Concept | LE mot | Interdits (attrapés en vrai) |
|---|---|---|
| Un ensemble de règles de gestion posé face à un signal | **dispositif** (owner 22/08 — l'objet, à N'IMPORTE QUEL état ; ses règles sont testées puis prouvées ou invalidées) | recette (en nom de section), méthode, playbook, rejouable, plan, routine, rituel, protocole, programme |
| Un dispositif dont les règles ont été prouvées | **dispositif prouvé** (owner 22/08 — corrige la ligne du 17/08, qui définissait « dispositif » par son seul état final : « une pratique qui marche » EST un dispositif prouvé, pas un dispositif en soi) | dispositif (employé seul pour dire « prouvé »), recette |
| Statuts d'un dispositif | **en test · prouvé · écarté** (owner 17/08 : « déclaré » fusionné dans « en test » ; mot déjà en prod). **Redéfini par les arbitrages du 27/08 — l'axe d'EFFET est séparé de l'axe CIBLE** : « écarté » = **effet négatif prouvé** (le test a bougé le réel dans le mauvais sens, |z| ≥ 1 vs votre résultat habituel) — il se dit en contre-indication et ne se re-propose jamais sur son signal ; « prouvé » = effet positif prouvé, **que la cible soit atteinte ou non** — le cas cible manquée se dit « effet positif, objectif manqué » (mots owner) avec la calibration de cible ; un test dont l'effet reste dans le bruit du lieu = « testé, non concluant » — ce n'est PAS un écarté, il se poursuit ou se re-teste. L'ancienne définition (« écarté » = cible manquée) confondait les deux axes : une cible surestimée fabriquait un faux échec. La grammaire de référence : `bestPractices.dispositifStateFr` | déclaré, validé, certifié, écarté (au sens « cible manquée » seule) |
| Ce que l'utilisateur promet de faire et mesurer | **engagement** | commitment, pari |
| Un sous-ensemble permanent du dispositif de vente d'un site (familles produits + responsable + ressources) | **pôle** (owner 27/08 — cas de référence Épices et Tout : périssables, traiteur libanais, art de vivre ; spec `poles-dispositifs-permanents-spec.md`) | corner, stand, rayon ; rattacher le pôle à une personne (le responsable est un attribut — le pôle demeure jusqu'à fermeture) |
| La nature sans terme d'un dispositif | **dispositif permanent** (owner 27/08 — pas de dates ; mesure = lecture continue de ses familles vs résultat habituel) | tout verdict « atteint/manqué » sur un permanent (pas de terme → pas de verdict) |
| Une date d'une série mesurée | **occurrence** | instance, itération |
| Événement récurrent | **série** | campagne |
| Le jugement automatique sur la cible | **cible/objectif : atteint · manqué · non concluant** | score, résultat final |
| L'objectif chiffré | **cible** / **objectif** | target, seuil (réservé aux réglages) |
| La période mesurée | **date / dates de l'opération** (owner 17/08) | fenêtre de mesure, période de test |
| La référence de comparaison | **votre résultat habituel** (forme jour : « votre jeudi habituel ») | l'attendu, la normale (sauf « CA vs normale » legacy K1), « votre habituel » nu (owner 24/08 — la référence porte son nom entier ; « votre CA habituel » reste correct) |
| Ce que vaut un motif à l'année | **enjeu annualisé** (infobulle seulement) | potentiel, opportunité € |
| Un écart de pourcentage affiché | **% (ou €)** (owner 27/08 — « pp » n'existe pas pour l'utilisateur ; un chiffre affiché est idiot-proof : des euros ou des pour cent, le référentiel dit dans la phrase) | pp, points de pourcentage |
| Surveillance des concurrents | **veille** / **vos suivis** | couverture, tracking, crawl |
| Fraîcheur de la veille | **lus cette nuit** | dernier passage, visités, crawlés |
| Un concurrent surveillé | **suivi** | tracké, monitored |
| Zone autour d'un site | **votre périmètre** | catchment, zone de chalandise (à confirmer) |
| Contexte favorable détecté (le volet du tableau) | **Opportunités** (owner 24/08 — titre du volet ; contenu = prospective chaleur + couverture, renvoi « les cartes des 7 prochains jours → Agir ») ; « occasion » reste le mot d'une occasion individuelle | Vos prochaines occasions (trop long, owner 24/08), fenêtre de la semaine, momentum, jour favorable |
| Le groupe de volets du dehors (activité, opportunités, positionnement, veille) | **Mon environnement** (owner 24/08) | Compétitivité (owner 24/08 — dit un jugement, le contenu est de la surveillance) |
| Créer une opération depuis le tableau (bouton) | **Nouvelle opération** (owner 24/08 — boutons tableau + evenement renommés au build ; PAS de ban mécanique : « Nouvel événement repéré chez un suivi » est l'ÉVÉNEMENT DU CONCURRENT, sens légitime — règle de relecture) | Nouvel événement (comme bouton de création) |
| La tuile héros du savoir accumulé ET sa carte-volet | **Connaissances créées** (owner 24/08 la tuile ; 25/08 la carte-volet à part dans Processus métiers — alignement FAIT, « Mes dispositifs » ouvre sur sa liste) | Ce que l'app a appris de vos sites (comme titre de surface) |
| Cause non isolable par la mesure | **facteurs mêlés** | cause multifactorielle |
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
| Un concurrent à public commun élevé et proche | **concurrent direct** (owner 25/08 — « menace » jugé dramatique pour le secteur ; mot déjà en prod dans la ligne de valeur du volet, 17/08) | menace, menace forte (sur le tableau) |
| Ce qu'un geste NE PEUT PAS demander | **le stock** — nous n'avons aucune donnée de réserve, le mart ne connaît que ce qui s'est VENDU ; **l'heure d'ouverture / l'amplitude horaire** — le planning est encadré en France (délai de prévenance 7 j, 3 en HCR) et les horaires déclarés ont été jugés non fiables le 22/08 (owner 25/08). Ce que l'exploitant maîtrise à 2-3 jours : ses **achats**, **ne pas appeler d'extra**, et **ce qu'il fait faire** à l'équipe déjà planifiée (mise en avant, place, prix, communication). Contrat permanent dans le harnais. | vérifiez le stock, il ne doit pas manquer, stock vérifié, assurez l'ouverture à l'heure, amplitude horaire, ajuster l'effectif |
| L'indice de fréquentation BestTime (`ft_day_mean`, 0-100) mesuré par classe de jour | **affluence estimée** — « votre affluence estimée · ces jours-là », et son absolu en **points d'affluence estimée** (owner 25/08). Métrique DISTINCTE de « vos visiteurs », qui compte des personnes (`daily_visitors`) : mêler les deux comparerait un rang à des gens. Elle n'entre pas dans `KpiKey`/`KPI_DAILY_COL` — ce registre pilote les ENGAGEMENTS, et on ne s'engage pas sur un indice qu'on ne contrôle pas. | visiteurs, fréquentation (pour cet indice), trafic |
| Ce que mesure `competition_index_local` (classes `competition_high` / `competition_low`, `competition_pressure_ratio`) | **activité dans votre périmètre** — « jours à forte / faible activité dans votre périmètre » (owner 25/08 : « il faut dire la vérité, c'est le contrat de confiance minimal »). L'indice vaut `0,7 × (4×événements 500 m + 3×5 km + 2×10 km + 1×50 km)` sur `fct_location_events_radius_daily`, **sans aucun filtre de secteur** — c'est de l'agenda local, pas de la concurrence. Les variantes filtrées existent dans la même table (`*_same_bucket_count`, commentées « direct competitors ») et ne sont PAS utilisées par l'indice. Le mot « concurrent » reste réservé aux suivis (`competitor_tracking`) et au même secteur (`same_bucket`). | pression concurrentielle, concurrence, jours disputés, cannibalisation — dès lors que la source est cet indice |
| Les deux natures de signal, dans les filtres du fil Agir | **Menaces** / **Opportunités** (owner 25/08). Remplacent « À défendre » / « À capter », qui nommaient le GESTE ; l'owner veut la NATURE du signal. À noter : « menace » avait été refusé le 25/08 au tableau de bord (« dramatique pour mon secteur ») — il est ici ARBITRÉ par l'owner pour l'étiquette de filtre, où il ne qualifie aucun concurrent en particulier. | À défendre, À capter (comme étiquettes de filtre) |
| Le préfixe de la ligne de recommandation d'une carte | **Action conseillée :** — et **Actions conseillées :** quand la ligne porte deux gestes (owner 25/08 : « Unifie les préfixes → Action(s) conseillée(s) »). **GÉNÉRALISATION FAITE le 25/08** : les 16 préfixes historiques sont convertis, 89 occurrences, 99 lignes au total ; l'accord se décide au rendu (`accordActionPrefix`, action-cards.js) en comptant les GESTES — impératifs en -ez hors « vous …ez », plus l'enchaînement « …, puis … » — jamais les phrases, la plupart de ces lignes ouvrant sur un fait. | À adapter :, À amplifier :, À analyser :, À capter :, À consulter :, À corriger :, À défendre :, À exploiter :, À faire :, À noter :, À pousser :, À reproduire :, À réorienter :, À temporiser :, À transmettre :, À vérifier : **Chantier :**, **Enquête :** (owner 25/08, « Chantier aussi » — les motifs structurels portent le même préfixe que les cartes datées ; le mot « Dispositif » reste dans le PLAN, seule l'étiquette change), et les 16 préfixes qui re-décrivaient le signal avant d'agir — désormais BANNIS, la conversion est faite |
| L'en-tête de la page Agir | **Vos actions du jour** (owner 25/08 — l'en-tête dit l'ACTION ; « carte » reste le mot de l'objet : « 9 cartes ce jour ») | Vos cartes du jour |
| La section des dispositifs | **Mes dispositifs** (première personne, aligné « Mon positionnement » — owner 17/08) | Vos dispositifs, Votre savoir-faire |
| Ce que vaut l'offre d'un concurrent (fiche enrichie) | **Proposition de valeur** puis **Offre** (la table prix/articles) | Sa proposition, Son offre & ses prix |
| Les publics d'un concurrent face aux vôtres | **Publics/Clients visés** | Son public |
| La communication du moment d'un concurrent (lecture web) | **Actualité commerciale** | Ce qu'il met en avant |
| Ses offres hors actualité (pass, promos relevées) | **Autres offres et produits** | Son offre poussée |
| Le logiciel d'encaissement déclaré au profil (P3.1-c) | **Caisse / logiciel de vente** (champ profil) ; à l'import : **votre caisse déclarée (modifiable dans votre profil)** | POS, logiciel de caisse, système d'encaissement |
| Caisse dont le connecteur n'existe pas encore | **Connexion directe prévue — en attendant, export CSV…** (consigne `export_note_fr` de `analytics.pos_systems`, jamais réécrite en dur) | bientôt disponible, coming soon |
| Suivi posé par le système à l'ouverture du compte (P3.1-f) | **suivi proposé — ajustez** (chip sur la fiche ; l'infobulle dit le critère : recouvrement mesuré) | suivi automatique, suggestion, recommandé pour vous |
| L'objet physique d'un dispositif, celui qu'on photographie (un dispositif peut en avoir plusieurs ; un pôle peut avoir plusieurs dispositifs) | **composant** (owner 03/09, D1 — spec `dispositifs-typologie-spec.md` § 3) | meuble, unité typée, sous-type (brouillons du 03/09, attrapés à la relecture owner) |
| La longueur d'étagère ou d'alignement de meubles dédiée à une catégorie de produits | **linéaire** (owner 03/09) | rayonnage (comme nom de type) |
| Le meuble central double face | **gondole** (owner 03/09) | — |
| L'extrémité d'un rayon, très utilisée pour les promotions | **tête de gondole** (owner 03/09) | TG à l'écran (abréviation, règle 6 de tournure) |
| La présentation qu'on voit depuis la rue | **vitrine** (owner 03/09 ; mot déjà en prod dans les champs mémoire) | — |
| L'endroit où une personne sert ou conseille | **point service / vente avec une personne** (phrase owner 03/09 matin) ; forme courte à l'écran : **Service client** (owner 03/09 après-midi) | comptoir (comme nom de type), point assisté (clé interne seulement) |
| Ce qui permet à un musée de parler à son public | **dispositif de médiation** (owner 03/09 : cartel, dispositif multimédia…) | — |
| Ce que le client fait pour acheter : où il va, ce qu'il combine, ce qu'il doit marcher ou demander | **parcours d'achat** (owner 03/09) | customer journey |
| Le trajet le plus court qui permet d'acheter ce qu'un ticket contient | **parcours idéal-type** (owner 03/09 — s'affiche toujours comme un minimum : on ne sait pas si le client a hésité ou fait des allers-retours) | parcours réel, trajet |
| Ce qu'un composant contient et comment le client le choisit (le second menu du formulaire) | **Rôle** (owner 03/09) ; ses valeurs : **Produits du quotidien** (courant), **Produits de connaisseur** (expert), **Promotion** (promo) — owner 03/09 ; **impulsion : EN ATTENTE** (« Achat d'impulsion » proposé, non validé — reste `provisoire`, non rendu) | Produits courants, Produits d'expert, Offre temporaire (brouillons du 03/09 matin) |
| L'image d'un composant, pièce de la mémoire d'une version | **photo** (mot employé par l'owner le 03/09 — D6 « les photos des composants font partie de l'onboarding » ; le CTA qui y mène reste **Documenter →**) | image, cliché, visuel |
| Présentation libre au milieu du magasin (type de composant) | **Îlot** (owner 03/09) | Table ou îlot, table |
| La zone d'encaissement (type de composant) | **Caisse** (owner 03/09 — même mot que le champ profil « Caisse / logiciel de vente » : le contexte tranche) | Zone de caisse |
| Dégustation, atelier, démonstration (type de composant) | **Espace dégustation** (owner 03/09) | Espace dégustation / atelier, atelier |
| Forme courte de « point service / vente avec une personne » (menu déroulant) | **Service client** (owner 03/09) | Point service, point assisté, comptoir (comme nom de type) |
| Rôles d'un Service client | **Service au comptoir** (la personne sert le produit) · **Conseiller clientèle** (la personne conseille, le produit est ailleurs) · **Accueil** (accueil / billetterie) — owner 03/09 | Comptoir, Point conseil, Billetterie |
| Sous-types de médiation | **Cartel** · **Dispositif multimédia** · **Signalétique** (owner 03/09) ; **panneau de salle : EN ATTENTE** (proposé, non validé — reste `provisoire`, non rendu) | Texte de salle, parcours fléché |

## Les mots des interactions humaines (Slack — registre distinct, owner 28/08)

Registre ouvert le 28/08 (chantier vue équipe) : les messages Slack entre personnes
suivent une AUTRE logique que les surfaces applicatives — mots arbitrés à part, texte des
notifications ENTIÈREMENT arbitré par l'owner selon l'étape du cycle de la carte (« rien
à la discrétion » — les gabarits vivent dans `vue-equipe-slack-spec.md` § incrément 8).

| Concept | LE mot | Interdits / notes |
|---|---|---|
| Une carte partagée à une personne (message de partage) | **priorité** (owner 28/08 — registre interactions humaines SEULEMENT ; sur les surfaces app, la carte reste une « action ») | |
| Refuser une carte partagée / rendre une carte dont on est responsable | **Pas pour moi** (owner 28/08) | |
| Ouvrir la fiche du dispositif depuis un message Slack | **Ajuster** (owner 28/08 — « Piloter » proposé puis RETIRÉ par l'owner : collision avec l'onglet Piloter) | Piloter (comme bouton de carte) |
| Marquer l'action réalisée (bouton Slack) | **Fait** (miroir du geste app) | Action menée ? Oui (formulation app, pas Slack) ; **Pas encore** (supprimé des messages Slack — le silence le dit, owner 28/08) |
| Envoyer une carte vers le canal Slack (geste owner sur la carte) | **Faire suivre** (mot du brief owner 27/08 — bouton livré inc 6, veto possible) | |
| Une carte assignée à une personne (message d'assignation) | **tâche** (owner 28/08 — « {Prénom} vous a assigné une tâche ») | engagement (dans CE message — le mot app reste engagement sur les surfaces app) |
| Le fait mesuré de la carte, montré à l'assigné | **Preuve** (owner 28/08 — slot du gabarit G2, EN ATTENTE de données : la carte d'origine n'est pas encore reliée à l'engagement au moment de l'envoi) | |
| L'objectif au-delà de la cible (verdict `beat`) | **dépassé** (owner 28/08 — le 3ᵉ état existait en donnée sans mot français) | beat |
| Un dispositif qui décroche (3 mauvaises journées la même semaine) | **a sous-performé** (owner 28/08 — gabarit G4 ; « mauvaise journée » = nettement sous votre résultat habituel, hors bande de bruit) | sous l'attendu |

## Onglets du Compte & fiche membre (owner 28/08, vue équipe inc 9)

| Concept | LE mot | Notes |
|---|---|---|
| L'onglet des familles d'actions reçues (ex-Recommandations) | **Signaux** | « Opérations confiées » essayé puis retiré ; « Signaux traités » resté à la tuile Piloter |
| L'onglet des concurrents suivis (ex-Suivis) | **Établissements suivis** | |
| Le champ description d'un pôle | **Description du dispositif** (placeholder « Ce que le pôle fait au quotidien ») | Levier (sur un pôle — reste le mot des opérations datées) ; Périmètre d'activité (collision « votre périmètre ») |
| Le libellé familles du pôle | **Familles de produits & services** | Familles du pôle |
| États d'accès app d'un membre (fiche Destinataires) | **aucun · en attente · actif** (neutres — proposés au build, veto owner possible) | Connectée/Invitée (genre inconnaissable) |
| L'email d'invitation | copie owner 28/08 VERBATIM au foyer `slackMessagesFr.invitationEmailFr` (élision de/d', « intrapreneuriat » normalisé) | |

## Les tournures de machine (owner 28/08) — GARDE-FOU MÉCANIQUE

Verdict owner du 28/08 : « le langage est toujours celui d'une llm qui parle mal le
français… ce problème est récurrent ! C'est sans fin ». Six chaînes refusées le même jour,
aucune ne contenant de mot banni — parce que la faute n'est pas un MOT, c'est une
CONSTRUCTION, et toujours la même : **la phrase parle de la page ou du calcul au lieu de
parler du commerce.**

| Refusé (28/08) | Ce qui cloche | Écrit maintenant |
|---|---|---|
| « le niveau se lit en haut, ici se lit ce qui a bougé » | la page explique sa propre mise en page | « 1 jour mesuré sur 7. » |
| « Comparaison à vos 4 mêmes jours de semaine précédents » | tournure qui n'existe pas en français | « Comparé à vos 4 derniers jeudis. » |
| « La tranche 9 h–10 h prend plus de place » | euphémisme au lieu du fait | « Votre meilleur créneau : 9 h–10 h » |
| « Les écarts se compensent : c'est la part de chaque famille qui bouge » | narration de calcul | « Vos 9 familles, de la plus forte hausse à la plus forte baisse. » |
| « 403 achats, contre 467 pour ce résultat habituel » | référentiel collé au mauvais endroit | « 403 achats au lieu de 467 » |
| « Les deux se compensent : c'est ce qui tient l'écart du jour à +39 € » | démonstration mathématique | « …, mais un panier de 5,57 € au lieu de 4,71 €. » |
| « 1 événement(s) · 4 j de vacances » | pluriel entre parenthèses, abréviation | « 1 événement à proximité · 4 jours de vacances scolaires » |
| « Vos jours frais : 1 166 € vs 1 346 € » posé sans lien avec la journée | statistique orpheline (« énigme ») | ne s'affiche QUE si l'opération a connu un jour perturbé |

**Ces tournures sont désormais MÉCANIQUES** : `src/lib/fr/tournures.fr.ts` les porte avec
la phrase refusée qui les a fait naître, et `tournures.fr.guard.test.ts` échoue si l'une
d'elles réapparaît dans une chaîne visible. Les règles 8-13 ci-dessous restent à la
relecture ; celles-ci n'y sont plus. **Ajouter une ligne à la table est le geste normal
quand l'owner refuse une phrase** ; en retirer une demande son accord.

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

- **« Famille produits & services »** (owner 28/08) : LE mot des familles à l'interface —
  les services vendus sont des familles au même titre que les produits (item_category).
  Remplace « famille produit » sur les 4 chaînes visibles (formulaire opération ×2, infobulle
  profit du héros, infobulle marge du plan). Le registre sémantique porte la même définition.
  **ÉTENDU EN PROD le 31/08 (owner : « partout y compris en prod »)** : le KPI famille aussi —
  `kpiRegistry` (nom + label/jour), le pli de lecture et le bandeau du tableau disent désormais
  « CA famille produits & services ». La forme NOMMÉE ne l'empile pas : quand la famille est
  connue, la règle owner du 27/08 s'applique (« CA de la famille « Branded » »). Piège mesuré :
  le `&` est ÉCHAPPÉ au rendu (`&amp;`) — un test qui asserte la source échoue, il faut asserter
  la forme RENDUE ; contrôlé sur le rendu réel, aucun double-échappement.

- Indice de corrélation (owner 28/08) : **« Indice de corrélation »** — palier + chiffre
  (« Indice de corrélation fort (r = 0,42) », paliers faible < 0,3 / moyen / fort ≥ 0,5) ;
  **« Facteurs multiples »** remplace « mesure mêlée » dans les rendus ; **« Signal à
  confirmer »** = l'étiquette de la porte de concordance (spec
  `docs/indice-correlation-spec.md`). En attente : les mots de NATURE du lien (« pilote
  structurel » / « levier épisodique » proposés), « en jeu » après le €.

- Plan de période — diagnostic (owner 27/08) : « quick wins » = **« À portée de main »**
  (mot owner). Titre du point santé : **« La santé de l'entreprise »** (proposition appliquée
  depuis le mot du cadrage owner « santé de l'entreprise » — à confirmer). Les autres titres
  du plan viennent de la maquette validée : « Vos pôles », « Ce que la période va vous
  coûter », « Menaces », « Chantiers de fond », « Le plan, semaine par semaine ».

- Marges par famille (owner 24/08) : le geste garde **« Déclarer votre marge »** (singulier),
  même devenu par-famille — « Déclarer vos marges » écarté. Mots de couverture actés :
  **« Profit — à débloquer »** (verrouillé) et **« calculé sur X % de votre CA »** — la tuile
  Profit du bandeau v10 n'existe plus (héros v11, direction A 24/08) ; les mots suivent le
  profit là où il s'affiche. 27/08 : « **Appliquer à tous les produits ci-dessous** » (mots
  owner, ligne 1 du panneau marges) ; état déclaré : « → Déclarer votre marge — **modifiable à
  tout moment** » (fragment approuvé du formulaire événement), bouton « Modifier ».

- Pôles au tableau (owner 28/08, protos `piloter-poles-proto`/`piloter-membre-proto` validés) :
  section « **Vos pôles** » (titre repris du journal) ; volet = kicker « **Pôle** », fil
  « **Historique** » (mot owner — fusion verdicts / gestes / envois / ajustements + lecture
  hebdo « vs la semaine précédente », une lecture datée JAMAIS un verdict), « Connaissances
  de ce pôle » (titre proposé, à confirmer), CTA « Ajuster → · Documenter → » (mêmes mots
  que la carte, cibles = la fiche du pôle) ; vue membre : tuiles « CA du pôle » (en % —
  jamais le montant), « poids du CA », kicker « Pôle · <nom> ». « **Fait** » ne s'affiche
  que sur une disposition au préfixe 'fait' de la trace — jamais sur un geste inconnu.

## Le gabarit de la zone explication des cartes d'opération (owner 24/08)

Toute carte d'opération du tableau suit UNE grammaire : (1) titre + chips d'état · (2) le(s)
résultat(s) — chiffre unique (fenêtre) ou rangée de cases (série) · (3) la ligne d'EXPLICATION ·
(4) pied honnête + UN CTA. La zone (3) est un FORMAT, jamais du texte codé en dur, et elle a
**deux régimes** :

**Régime A — facteur isolé.** Les chiffres isolent UN facteur du funnel (CA = passages ×
conversion × panier) ⇒ on le NOMME. Exemple réel (Coupon café glacé, conversion tenue 45,7 %
vs 43 % pendant que le CA de la fenêtre était sous l'habituel) :

> −1 275 € vs votre résultat habituel · CA de la fenêtre : 11 521 €
> votre conversion a tenu (45,7 % · habituel 43 %) — le manque vient du passage ou du panier

**Régime B — facteurs mêlés.** Les chiffres n'isolent rien ⇒ JAMAIS de verdict fabriqué : le
fait, la part expliquée chiffrée, les facteurs candidats nommés sobrement, et le geste qui
tranche (le bilan de l'occurrence — le vécu de l'exploitant détient la donnée manquante).
**Gabarit VERBATIM owner (24/08)** :

> occ. du 08/08 : les produits « Branded » ont généré 28 €/j vs 65 €/j habituellement (−56 %) ·
> Explication : la baisse du CA jour n'explique pas tout (−13 %) · Autres facteurs : dispositif,
> produit, autre — Faire le bilan →

Contraintes du format : chaque fait contre SON référentiel, énoncé séparément — jamais deux
référentiels mélangés dans une phrase (les baselines 28 j glissantes du mart contredisent
l'habituel dow+tendance : décomposition par facteur seulement quand les attendus par facteur
existent sur LE même référentiel). Le montant montre le NIVEAU + l'ÉCART SIGNÉ, chacun avec
son référentiel, et l'objet est toujours nommé (« produits « Branded » », jamais « CA famille » nu).
La conclusion sur le DISPOSITIF (à ajuster / réutilisable) vit au niveau série, quand assez de
verdicts — jamais sur une occurrence.

**Note MOTS_BANNIS** : FAIT au build du 24/08 soir — « Compétitivité » et « Vos prochaines
occasions » sont au `MOTS_BANNIS` (surfaces renommées dans le même train) ; « Nouvel
événement » n'y entre pas (deux sens, cf. la ligne du tableau) ; « Ce que l'app a appris »
reste légitime sur le VOLET (tuile seule renommée).

## La mini du coin € et le paragraphe de faits (owner 25/08, points 3+5 ratifiés)

**Mini du coin (sous le montant)** : elle ne porte que ce que le TITRE ne dit pas — ≤ 3 mots
+ référentiel. Formes actées :
- Titre nomme le motif (cartes structurelles) → mini = « perdus » / « à gagner » SEULS, le
  motif complet reste au ⓘ.
- Titre ne nomme pas le motif (cartes datées) → mini = « perdus · <qualifiant> » (préfixe
  « jours de » retiré de la mini uniquement : « perdus · vacances scolaires ») ; le possessif
  entier « vos jours de… » vit au ⓘ.
- Coin funnel (%) → « vos ventes · ces jours-là », « vos visiteurs · … », « votre panier
  moyen · … », « votre taux de conversion · … » — le possessif porte le référent « chez
  vous » (anti-contradiction du 24/08) en un mot.

**Paragraphe de faits (2e étage, cartes structurelles)** : « Sur N jours mesurés sur M mois »
est de la MÉTADONNÉE → ⓘ seulement. Le paragraphe porte les signaux et leur impact mesuré :
« −211 € par jour sur ces journées. » (+ décomposition funnel quand mesurée ET cohérente de
signe avec l'impact € : « Le manque vient du panier (−12 %) et des ventes (−8 %) vs vos jours
comparables. » — vocabulaire du créneau, jamais de mélange de référentiels ; à contre-signe,
absence honnête). Pas de « en moyenne » : l'€/j exposé est la médiane (dayClassRegistry).

## À arbitrer (owner) — file ouverte au 24/08

- « **produits** » vs « **famille** » : l'owner a écrit « CA produits « Branded » » — renommage
  GLOBAL du mot arbitré « famille » (prod : « CA famille » jusque dans les KPI) à confirmer.
- « palier » (crans de la jauge Signaux traités) — retirés en attendant LE mot.
- **Pied des rangées Agir à DEUX gestes (owner 25/08, maquette v3.1)** : « Communiquer » quitte
  les rangées du fil (il vit sur la page Consulter) — INVERSION de l'arbitrage antérieur
  (« Communiquer associé à M'engager sur Agir ») ; « Écarter » remplacé par « **Pas pour moi** »
  (chaîne DÉJÀ en prod sur cette surface, même action `ecarte`). À ratifier au build.
- « **transports** » (marqueur mobilité du bandeau de faits, « transports −5 % ») — mot proposé
  sur la maquette v3, pas encore arbitré.
- **Les paliers « menace faible · modérée · forte · critique »** (competitor.astro `MEN_FR`,
  insight.astro « Niveau de menace », protos agir) : même verdict owner que sur le tableau
  (25/08, « dramatique pour le secteur ») mais c'est l'échelle du mart threat_profile — il
  faut LES mots de l'échelle avant de toucher ces surfaces. Le tableau, lui, dit désormais
  « concurrent direct ».
- **La note de calibrage au choix du % d'objectif** (owner 24/08 soir) : la tuile « Objectifs
  atteints » est morte (elle insistait sur un négatif qui est un problème de CALIBRAGE, pas de
  performance) — remplacée par « Prochain verdict ». Le calibrage se traite AU MOMENT où
  l'utilisateur fixe son % dans le goal-setter : une note qualifie l'ambition. Mots candidats
  owner (« or something ») : « très prudent · prudent · ambitieux · optimiste » — LES quatre
  mots à arbitrer avant le build commit-form.
- « geste » (employé par la tuile prod « 6 gestes en attente ») — pas de mot d'interface arbitré.
- « Voir → » vs « Lire → » : deux mots en prod pour « ouvrir une carte » — un seul doit rester.
- Le mot du pont rangée santé ↔ rangée pilotage (« dont +1 166 € mesurés de vos opérations »).
- « Déclarer vos marges » (pluriel, marge par famille produit) — paraphrase, pas un mot acté.
- ~~Alignement du volet « Ce que l'app a appris de vos sites » sur « Connaissances créées »~~ FAIT 25/08 : carte-volet « Connaissances créées » à part (Processus métiers), « Mes dispositifs » ouvre sur sa liste.
- ~~contextCopy « animer la clientèle locale »~~ TRANCHÉ 24/08 : « cibler les résidents
  locaux » (les deux arbitrages du jour combinés — « cibler » owner + « résidents locaux »
  global ; si « clientèle locale » devait rester dans CETTE phrase, le dire).
- **Doublons inter-pages (audit 24/08) — TRANCHÉS le 24/08 soir et appliqués** : verdicts
  (canon couleur : atteint = vert · **manqué = ambre** · non concluant = gris — tableau ET
  Pulse) ; audiences (« **résidents locaux** » / « **public mixte** » partout — registres du
  chat compris, MOTS_BANNIS mord) ; météo (« **Alerte météo** » partout) ; maps KPI fusionnées
  (formes courtes canoniques, « /j »). RESTENT à trancher : les autres types de cartes
  divergents (« Météo redevenue favorable » vs « Amélioration météo », « Calendrier favorable »
  vs « Changement d'audience », « Lancement chez un suivi » vs « Concurrent détecté »…), la
  casse des chips Pulse (« Atteint » vs « atteint »), et la phrase de `contextCopy.ts`
  « animer la clientèle locale » (copie rédigée — pas reformulée sans owner).

## Balayage de copie à faire (suite de ces décisions)

- « déclaré(e) » affiché → « en test » ; « écarté » ne s'affiche que sur un **effet négatif prouvé** (27/08 — jamais sur une simple cible manquée : ce cas dit « effet positif, objectif manqué » ou « testé, non concluant », selon l'effet).
- « fenêtre » (sens période mesurée) → « date(s) de l'opération » — carte par carte, le mot
  « fenêtre » au sens occasion est déjà banni (« vos prochaines occasions »).
- « vs habituel » nu → « vs votre résultat habituel » là où la place le permet ; les formes
  jour (« votre jeudi habituel ≈ 1 221 € ») restent.
- « Documentez la recette » → « Documentez vos résultats » (action-cards + tableau).
- « Armée · J-x » (chips) et « ◌ armée » (frise) → « Dispositif actif ».
- « vos X habituels » (pluriel) → « **votre X habituel** » — forme jour du lexique. Attrapé le
  21/08 sur `sales_surge` (« CA > vos mardis habituels ») et sur son pendant
  `sales_revenue_down_wow` (« vos vendredis »).
- Titres de cartes du jour qui sont un impératif sans objet ou un constat — le geste juste est
  déjà écrit une ligne plus bas, dans le corps. Relevés le 21/08 : `commercial_event_match`,
  `competitor_reputation_strength`, `foreign_tourism_signal`, `competitor_event_launch`,
  `top_day_approaching`, `same_bucket_saturation`, `low_competition_window`,
  `weather_hazard_onset`, `event_prepare`.
- `competitor_event_launch` : le titre ordonne « Réagissez », le corps conclut « sans réaction
  urgente ». Contradiction interne — décision produit avant réécriture.
- `event_new` : type sans entrée `reg()` — rend « event new / type non reconnu » dans l'app.

## Écriture des gestes et des motifs (owner 21/08) — NON ATTRAPÉ PAR LE GARDE-FOU

**Ces règles ne sont pas grepables.** Le tableau des mots ci-dessus est vérifié par
`evenement.fr.guard.test.ts` via `MOTS_BANNIS` ; ces règles-ci, non — aucune d'elles ne
contient de mot interdit. Elles se vérifient **à la relecture**, avant d'écrire une chaîne
visible. Motif de leur existence : le 21/08 quatre phrases générées ont été refusées par
l'owner (« llm language is not acceptable as it raises trust issues in the user ») — aucune
ne contenait de mot banni.

**8. Verbe ordinaire, sur un objet qu'on manipule.** Le verbe est celui que l'exploitant
emploierait ; l'objet est une chose qu'il tient en main — une offre, le réassort, le staffing,
l'équipe, les avis, la fiche Google, les remises, le parcours d'achat. Jamais un verbe de
conseil sur un abstrait.

| Refusé (attrapé en vrai, 21/08) | Retenu |
|---|---|
| Alignez une offre **sur** la rentrée scolaire | **Préparez** une offre **pour** la rentrée scolaire (owner) |
| **Concentrez votre visibilité** sur ce jour | Communication ciblée sur ce jour |
| **Passez en accueil multilingue** cette semaine | Adaptez votre dispositif de communication et d'accueil (owner) |
| Temps fort commercial — **activez** | (verbe sans objet : activez quoi ?) |
| **Surveillez** la réputation concurrente | (surveiller n'est pas un geste : on fait, ou on ne fait pas) |

Verbes de conseil à proscrire : *aligner, capter, concentrer, activer* (sans objet),
*surveiller, se positionner, optimiser, maximiser, adresser, **animer*** (owner 24/08 —
« animer la clientèle » → « **cibler** » ; au MOTS_BANNIS). Le corpus de référence est
`public/reco-library.js` — les entrées **écrites** (13), pas l'échafaudage commenté.

**9. Test du retournement.** Écrire le contraire de la phrase. Si le contraire est absurde,
la phrase n'affirme rien et doit sauter.
_« Une offre que l'équipe ne sait pas formuler ne se vend pas »_ → le contraire est absurde
⇒ vide. À comparer avec _« Ramener vos habitués coûte moins que conquérir de nouveaux
clients »_ (reco-library) : le contraire est discutable ⇒ la phrase affirme quelque chose.

**10. Test de la condition.** La phrase nomme-t-elle une situation précise — un créneau, un
jour, un seuil, un état ? Les phrases retenues le font toujours : « au moment où le passage
est là mais n'achète pas », « sur les jours creux », « quand tout le monde regarde ». Une
phrase vraie partout est utile nulle part.

**11. Test de la donnée.** La phrase aurait-elle pu être écrite **sans ouvrir le compte** ?
Si oui, c'est du remplissage. (Même exigence que le *Card Quality Bar* de CLAUDE.md : dire à
l'exploitant quelque chose de vrai qu'il ne pouvait pas voir seul.)

**12. Test de la maxime.** Pas de sentence au présent général, sans sujet réel, de forme
« X — donc Y ». Le tiret cadratin n'est pas en cause (le lexique l'emploie) ; la sentence
l'est. _« Le passage existe déjà — un prix d'entrée transforme le passant en client »_ :
refusé le 21/08.
**Proxy mécanique possible** (non implémenté) : une chaîne `why` / `sowhat` sans chiffre, sans
variable interpolée et sans nom propre est presque toujours une généralité — le garde-fou
pourrait en sortir la liste à relire, sans faire échouer le build.

**13. Jamais un volume absolu — un écart au résultat habituel DU LIEU.** Nîmes et Paris ne portent pas
le même trafic : une phrase qui suppose un volume est fausse sur la moitié du parc.
`pressure_ratio = 0,93` ne veut pas dire « peu de concurrence » mais « 7 % sous VOTRE résultat
habituel ».
Quand le geste lui-même doit changer selon le lieu, c'est la clé `enjeu_positif` /
`enjeu_negatif` de `reco-library.js` qui tranche (cas mesuré : `low_competition_window`,
+88 €/j ici, −49 €/j ailleurs) — pas le texte.
**Limite connue :** cette bascule est binaire (ça aide / ça coûte). Elle ne distingue pas un
petit d'un gros volume ; une variable d'échelle n'existe pas.

