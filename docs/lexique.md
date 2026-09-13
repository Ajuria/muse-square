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
| Le motif d'une carte de calendrier (rentrée, soldes, férié) quand aucune classe n'est mesurée sur sa date | **saisonnalité** (owner 06/09 — « Motif du jour : saisonnalité — rentrée scolaire. » ; le nom du temps fort vient du mart, jamais du titre ; une classe mesurée sur la date garde la main) | aucun motif, ligne vide |
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
| Ce qu'un geste NE PEUT PAS demander | **les commandes, les achats, le stock, le réassort** (owner 09/09 : « on a dit 500 fois que l'on ne se mêle pas des commandes » — ABROGE le « les achats = le levier à 2-3 jours » du 28/07 ; garde `tournures.fr.ts`) — nous n'avons aucune donnée de réserve, le mart ne connaît que ce qui s'est VENDU, et ce que l'exploitant commande est SON affaire ; **l'heure d'ouverture / l'amplitude horaire** — le planning est encadré en France (délai de prévenance 7 j, 3 en HCR) et les horaires déclarés ont été jugés non fiables le 22/08 (owner 25/08). Ce que l'exploitant maîtrise à 2-3 jours : ses **achats**, **ne pas appeler d'extra**, et **ce qu'il fait faire** à l'équipe déjà planifiée (mise en avant, place, prix, communication). Contrat permanent dans le harnais. | vérifiez le stock, il ne doit pas manquer, stock vérifié, assurez l'ouverture à l'heure, amplitude horaire, ajuster l'effectif |
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
| La longueur d'étagère ou d'alignement de composants dédiée à une catégorie de produits | **linéaire** (owner 03/09) | rayonnage comme nom de TYPE de dispositif (03/09) — « Rayonnage » est depuis le 11/09 une EXPOSITION d'un composant, pas un type, voir § À arbitrer |
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
| Ce qu'Explorer répond à une question qui ne porte sur rien du site (« qui est Jésus ? », « bonjour », l'heure, une blague) | **Aucune donnée pour cette question** (titre) — corps : « Je réponds sur vos ventes par jour, vos familles de produits (Coffee, Tea, Bakery…), vos pôles, vos opérations et vos suivis. Rien ici ne répond à « <la question, verbatim> ». Par exemple : « Pourquoi le JJ/MM ? » » (option A, owner 03/09 — miroir de l'élicitation « Je ne trouve ni pôle ni famille de ce nom sur ce site » ; familles réelles du compte, dernier jour mesuré ; foyer `src/lib/ai/horsPerimetre.ts`). Ne se rend QUE si aucun signal métier ne tire (garde déterministe) | Je ne comprends pas, Question hors sujet, Désolé, toute phrase de chatbot générique |
| Reprendre un dispositif prouvé (le refaire sur une prochaine journée, une prochaine occurrence) | **reconduire** / **à reconduire** (owner 07/09 : « stop saying rejouer → Reconduire » ; déjà en prod : « c'est l'association à reconduire ») | rejouer, rejoué, à rejouer (et déjà : rejouable, rejeu) |
| La part de chaque famille dans le CA du jour, lue pendant une opération (Explorer, lecture dispositif × famille) | **mix produits & services** (owner 04/09) ; lignes de la table : **Ventes/jour avec <famille>** (tickets contenant la famille) · **Panier moyen avec <famille>** (le ticket entier de ces tickets — owner 04/09) · **CA/jour <famille>** · **Part de <famille> dans le CA** ; l'écart d'une part s'écrit en RELATIF « +1,6 % » (owner 04/09) ; foyer `src/lib/dispositifs/dispositifFamille.ts`, doc `explorer-dispositif-famille-spec.md` | mix produit (au singulier, hors matcher), points de part, pp |
| Le nombre moyen d'articles d'un ticket (indice de vente) et son mouvement | **articles par ticket** — « Moins / Plus d'articles par ticket que d'habitude » (owner 07/09 : « Moins d'articles par facture, or equivalent » ; « facture » = le même objet côté Crisalid) | paniers à plusieurs articles, lignes par ticket, UPT |
| Un produit vendu presque tous les jours et absent un jour d'ouverture | **aucune vente** — « <produit> : aucune vente », « Aucune vente de <produit> le 30/08. Il se vend 58 jours sur 60, 18 € par jour. » (owner 07/09) | absent de vos ventes, rupture (jamais déduite de la caisse), « ces deux mois » |
| Le compte de ventes d'un jour, dans la note-cause vue par un MEMBRE (jamais un niveau de CA — vue équipe) | **ventes** (owner 08/09 : « x, y and z "ventes" ») — le gabarit owner de la note, l'unité échangée : « Mardi 01/09 : 350 ventes, +77 % vs vos ventes habituelles » (`explorerSlotsCopy.fr.ts` `note_titre_ventes`). Le jour est inexpliqué dans SA couche : \|z ventes\| ≥ 2. Même mot dans la synthèse des cartes ventes : « Coffee 43 % du CA (686 €, 228 ventes) » — « articles » (07/09) se lisait comme des références produit (owner 08/09). Les ventes « d'habitude » se lisent dans `expected_units` (CA attendu de la famille ÷ son prix unitaire, même référent que l'€ attendu — 65bcbd5a, ms_database#129), jamais dans `baseline_units_per_day` (moyenne brute 30 j, tous jours confondus : 214 contre 120 pour Coffee le 03/09 sur f10c3e58). |
| Le compte de ventes d'une famille vendue AU POIDS (une ligne pesée en caisse) | **une pesée = une vente** (owner 10/09) — la convention de la caisse elle-même : le ticket Crisalid d'Épices et Tout du 09/09 imprime « TOTAL ( 6) » pour six pesées (3,255 kg). Le poids reste une QUANTITÉ, jamais un compte de ventes ; le prix au poids se dit en % tant que l'unité n'est pas connue (§ À arbitrer, carte `family_price_move`) | des kilos comptés comme des ventes ; l'entier arrondi de l'import (0,740 kg → 1, 0,170 kg → 0 : six pesées font « 4 ventes ») |
| La taille d'une action de vente sur une carte ventes, en nombre de ventes par famille ou produit (owner 08/09 : « Sell + w, x and y (total of z) », « total number of sales of family or product ») | **Objectif · estimé** — pas « Enjeu » (« it is not enjeu because it is not in € », owner 08/09) : « Objectif · estimé — Coffee +109 ventes · Tea +68 · Drinking Chocolate +28 · total +205 ventes » ; carte produit : « Objectif · estimé — Our Old Time Diner Blend Lg +16 ventes ». Une source : le champ `objectif_ventes` posé par monitor (`lib/insightFamilies/objectifVentes.ts`, `delta_units` du mart dès que la décomposition le porte — label « Objectif » seul ; sinon écart € ÷ prix unitaire réalisé, label « Objectif · estimé »), un formateur (`action-cards.js` `msObjectifVentesHtml`), rendu sous le titre de la rangée Agir ET du héros de la page Consulter. EMPLOYÉS seulement (owner 08/09 : « not for managers (admin view) but for employees ») : le gérant lit l'écart en €, l'employé lit les ventes. |
| Le CA divisé par les articles vendus, sur une famille et un jour | **prix moyen**, en **€ par article** — « Prix moyen en baisse / en hausse sur <famille> » (owner 07/09) | prix réalisé, l'unité, unités vendues |
| La part remisée du CA d'une famille sur un jour | **remises** — « Plus / Moins de remises que d'habitude sur <famille> », « 5,9 % de remise le 09/08, contre 2,5 % d'habitude » (owner 07/09) | remisé plus que d'habitude, taux de remise, « % du CA » dans le titre |
| La mesure du mix par famille | **part de CA ET ventes** — « Coffee 43 % du CA (686 €, 228 ventes) contre 39 % d'habitude (365 €, 120 ventes) » (owner 07/09 : « We need both » ; le mot « ventes », owner 08/09 ; rendu réel f10c3e58, 03/09) | des € de volume, une part sans son ordre de grandeur, articles (se lit comme des références produit, owner 08/09) |
| Une alerte chaleur de niveau 3 et plus (32 °C) | **forte chaleur** — « Alerte forte chaleur (niveau critique) » ; en dessous du niveau 3, « Alerte météo » (owner 07/09 ; même mot que la classe structurelle) | canicule (critère officiel IBM, jamais déduit de lvl_heat), chaleur seule |
| Demander à l'exploitant le bilan d'un engagement résolu (carte « bilan », état vide d'Explorer ; retour owner 12/09 : « Votre bilan ajoute ce que la mesure ne voit pas — 2 minutes. » ne voulait rien dire et était la même sous deux actions) | proposé 13/09, à ratifier — la sous-ligne dit l'état, ce que la mesure ne sait pas de CETTE action (les trois questions du bilan) et à quoi ça sert : **Atteint — ce qui a porté le résultat, la mesure ne le dit pas : votre bilan le garde pour le prochain « Corner de vente producteur ».** · **Manqué — ce qui n'a pas marché et ce que vous changeriez, la mesure ne le dit pas : …** · **Non menée — pourquoi, et si c'est à reproduire, la mesure ne le dit pas : …** · **Non concluant — ce que vous avez vu ce jour-là, la mesure ne le dit pas : …** (« la prochaine fois » quand le titre est long) ; le titre, quand l'objectif porte sur une famille, dit le référentiel de l'écart : **objectif de +11 % de CA de la famille « Branded » manqué · votre lieu +39 € sur 1 jour** | ajoute ce que la mesure ne voit pas, 2 minutes, feedback |
| Demander à l'exploitant ce que la mesure ne voit pas sur un jour (carte « jour inexpliqué », état vide d'Explorer, E3 07/09) | **Un souvenir ? Notez-le · sinon, laissez** (forme owner relevée en prod le 22/08, CLAUDE.md règle 4 ; bouton **Enregistrer**, mot de la page de l'engagement) | Qu'est-ce qui se passait chez vous ce jour-là ? (refusé 22/08 : « is not a phrase for a human ») ; toute prose qui étale les vérifications |
| Ce que l'exploitant dit de son espace à Explorer et que l'assistant enregistre — le titre du bloc et du geste (mémoire de travail du site, `semantic.vw_insight_event_site_memory`, spec `explorer-agentique-spec.md` § 2.1) | **Documentez l'espace** (owner 11/09) | notes sur l'espace (mon brouillon du 11/09) |
| La marche dans le lieu, le téléphone à la main, une photo par composant (spec `marche-guidee-spec.md`) | **Relevé de l'espace** (owner 11/09, ratifié 12/09) ; gestes : **Commencer le relevé** · **Fin du relevé** · **Reprendre le relevé** | Relevé vidéo (aucune vidéo n'est produite), marche guidée (nom de chantier, jamais à l'écran) |
| L'arrêt devant un composant pendant le relevé | **Point focal** (owner 11/09, ratifié 12/09) | arrêt, pause, station |
| La page qui clôt le relevé — UNE page, une section par pôle | **Fin du relevé** (owner 11/09, ratifié 12/09) | fin de pôle (le relevé traverse les pôles) |
| La part d'une famille sur un composant, en % du linéaire de façade (comptoirs et caisses au sol compris) | **Part de linéaire** (owner 11/09, ratifié 12/09) | Share of Shelf (règle 7 bis), part d'assortiment (« assortiment » = largeur de l'offre), allocation (la décision, pas la mesure) |
| Le côté d'un meuble où le client prend le produit ; leur nombre (1 ou 2) convertit la longueur du meuble en mètres linéaires de façade (`espace-et-pole-spec.md` E3) | **face de préhension** (owner 11/09) — « faces de préhension : 1 ou 2 » | face accessible, face exposée, côté client, face ouverte |
| L'aire au sol en m² d'un magasin (déclarée une fois, le chiffre du bail) ou d'un pôle (mesurée sur le plan) — le grain « par m² » de la marge (KPI 12, `espace-et-pole-spec.md` E4) | **surface de vente** (owner 11/09) ; jamais la somme des pôles (allées, caisse, réserve) | surface (nu), superficie, m² (nu comme concept), footprint |
| L'état d'un pôle dont les familles ne sont pas encore celles de la caisse — UN état, sa raison écrite dessous | **Pôle en projet** (owner 11/09) ; raisons : **Aucune vente importée** puis **À rapprocher de la caisse** | à documenter (« Documenter » = la photo), déclaré (statut retiré le 17/08), En attente de la caisse (un pôle n'attend pas) |
| Ce que mesure un dispositif — ses familles, son pôle ou les articles de sa photo (question du formulaire « M'engager » / « Créer opération ») | **Ce que le dispositif vend** (owner 07/09) ; réponses **des familles** · **les familles du pôle** · **les articles de la photo** ; option **Ajouter famille de produits** (famille nouvelle, pas encore dans les tickets) | périmètre (mot pris : la zone autour du site), scope |
| Le nom du CA d'un périmètre dans la phrase du verdict | **CA de la famille « Branded »** (27/08) · **CA des familles « A » et « B »** (jusqu'à trois) · **CA des 4 familles du dispositif** · **CA du pôle « Épicerie fine »** · **CA de « <titre du dispositif> »** (articles d'une photo) — toujours suivi de « vs votre résultat habituel » (owner 07/09) | « de ventes » pour du CA (retiré de l'en-tête de la page de l'engagement le 07/09) |
| La largeur de l'offre d'un commerce — un seul type de produit, ou plusieurs pôles très différents — déclarée pour le site ET pour chaque concurrent, lue par le calcul de menace (`type-et-gamme-de-commerce-spec.md`) ; champ affiché SEULEMENT si le secteur est Commerce & Retail ou Marchés & Halles, vidé si le secteur change | champ **Type de commerce** · valeurs **Spécialiste** (un seul type de produit : primeur, fromager, caviste) · **Généraliste** (plusieurs pôles très différents) — owner 10/09 | Format (dit la taille), Positionnement (marketing), Assortiment (centrale d'achat) ; enseigne, grande surface ; toute valeur déduite par l'app ou tirée d'un seed |
| Le niveau de prix et de qualité d'un commerce, déclaré pour le site ET pour chaque concurrent, lu par le calcul de menace ; mêmes secteurs et même règle d'affichage que le Type de commerce | valeurs **Entrée de gamme** · **Milieu de gamme** · **Haut de gamme** · **Luxe** (owner 10/09) ; libellé du champ **Gamme** PROPOSÉ (§ À arbitrer) | Premium, Mass market (anglais, règle 7 bis) ; Grand public (mot pris : le convertisseur de public le range dans « Public mixte ») ; bas de gamme, discount ; toute valeur déduite par l'app |
| L'attention portée au commerce — AVANT l'arrivée (recherches, itinéraires, appels ; `attractivite-spec.md`) comme SUR PLACE (le geste sur un composant interactif ; `dispositifs-typologie-spec.md` § 10) | **attractivité** (owner 09/09) — nomme la RUBRIQUE, **jamais un nombre** : chaque mesure garde son unité (« 40 scans, 3 ventes », « 38 itinéraires demandés »), règle des couches dans leur unité (owner 06/09) | **engagement** (mot PRIS l. 18 : ce que l'utilisateur promet de faire et mesurer) ; intérêt, notoriété, visibilité, affinité, désirabilité ; « attractivité : 40 » — un nombre sans unité |
| Les familles réelles qu'aucun pôle ne porte, montrées dans « Vos pôles » pour qu'aucune ne reste hors mapping (owner 09/09 : « pour qu'il n'y ait pas de trou dans le mapping des dispositifs ») | **Non rattaché** (owner 09/09) — le mot que la caisse du commerçant imprime déjà : le relevé Crisalid porte `NON RATTACHE (CA)` pour le CA sans famille ; nous le reprenons un cran au-dessus, pour les familles sans pôle. **Libellé INVARIABLE** (c'est un intitulé de ligne, pas un accord avec « familles ») | Divers (se lit comme un pôle de plus dans une liste de pôles) ; Sans pôle (constate un état durable, quand la règle veut qu'il se vide) ; le reste du magasin (c'est le reste du rangement, pas du magasin) |
| Un composant que le client peut actionner — il fait un geste délibéré qui compte dans l'attractivité, sans acheter (spec `dispositifs-typologie-spec.md` § 10) | **composant interactif** ; le premier type est le **QR code** (mot owner 09/09) ; la rubrique de sa mesure est l'**attractivité** (ligne au-dessus) | borne, totem, tag ; « scan » employé seul comme nom de la mesure ; toute formule qui compte des visiteurs plutôt que des gestes |
| Le lieu entier sous la décomposition restreinte au périmètre (page de l'engagement, une ligne de contexte) | **Votre lieu, ce jour-là : +38,8 % vs vos jours comparables.** (composé le 08/09 de « votre lieu » (copie de l'engagement), « ce jour-là » (page Opération) et « vs vos jours comparables » (lexique) — owner okay 08/09) | le magasin (pas le mot du produit : cafés, musées), tout le lieu |
| Le chiffre d'affaires net des remises et hors TVA — la base de tous les ratios de marge (`catalogue-de-couts-et-marge-spec.md`) | **CA net HT** (owner 10/09 et 11/09 ; Crisalid imprime « Net HT ») — jamais mêlé au CA brut dans une même phrase : le CA des surfaces existantes reste « CA » | chiffre d'affaires réel, revenu, CA net (sans HT quand la base est fiscale) |
| Ce qui reste du CA net HT après le coût d'achat HT des articles vendus | **marge brute** (owner 11/09) ; son taux se dit **taux de marge brute** ; ne se montre qu'avec sa couverture (« calculée sur X % de votre CA · prix d'achat manquants sur Y % », owner 11/09) | profit brut, marge commerciale, gross margin, marge (nu, quand elle est mesurée : « marge » nu reste le mot de la marge DÉCLARÉE en %) |
| La marge brute du mois moins les charges fixes et la masse salariale du mois | **résultat net** (owner 11/09) ; mois complets seulement | profit net, bénéfice, résultat (nu), EBITDA |
| Le CA net HT qu'une journée doit générer pour couvrir sa part de charges fixes et de masse salariale | **seuil de rentabilité** (owner 12/09, qui remplace « point mort » du 11/09) ; « seuil de rentabilité du jour », « seuil de rentabilité atteint à N h » | point mort (owner 12/09 : « pas point mort »), break-even, chiffre à faire |
| Les salaires et charges sociales du mois, déclarés comme UN montant mensuel | **masse salariale** (owner 11/09) ; jamais par personne ni par heure | coût du personnel, frais de personnel, payroll |
| Les charges du mois qui ne dépendent pas des ventes (loyer, énergie, abonnements…), déclarées comme UN montant mensuel à date d'effet | **charges fixes** (mot owner § 12.12, 11/09) ; avec la masse salariale, elles donnent le résultat net et le seuil de rentabilité | frais fixes, frais généraux, overhead, coûts de structure |
| Le prix d'achat HT d'un article, à une date d'effet, dans le fichier que l'exploitant dépose | **prix d'achat** (mot owner § 12.12) ; le fichier = « vos prix d'achat » ; « catalogue de coûts » reste un mot de conception, jamais d'interface | coût unitaire, PA, COGS, coût de revient (il inclurait d'autres charges) |
| La part du CA dont le prix d'achat est renseigné, dite à côté de toute marge mesurée (M7 de `catalogue-de-couts-et-marge-spec.md`) | **« calculée sur 70 % de votre CA · prix d'achat manquants sur 30 % »** (owner 11/09 ; la première moitié actée le 24/08 pour la marge déclarée). Le mot qui précède porte le registre : **marge déclarée** = estimation, **marge brute** = mesure | coût connu, couverture (mot de conception, jamais à l'écran), fiabilité |
| Une vente dont le prix de vente est inférieur au prix d'achat (KPI 8 § 12.12) | **vente à perte** — le concept, terme légal (revente à perte, art. L442-5 du Code de commerce, seuil = prix d'achat effectif) ; le FAIT mesuré se dit **« vendu sous son prix d'achat »** (notre catalogue porte le prix d'achat déclaré, l'infobulle le dit) ; près du coût : **« marge brute inférieure à N % »**, N à fixer (owner 11/09) | vendu sous le coût, sous le coût, coût (nu), à perte (nu, sans « vente »), pricing |
| Le document que produit Explorer à la demande (liste ordonnée de blocs : texte vérifié, tableau, carte, section), gardé par site avec l'auteur, réordonnable, recalculable | **Rapport** (owner 12/09) ; « Enregistrer » le garde, « Enregistrer en PDF » l'imprime | compte rendu, dashboard, export, document (nu) |
| Un Rapport sans ses chiffres : la liste des sections, leurs paramètres et une période relative, réutilisable | **Modèle de rapport** (owner 12/09) ; le geste : **Enregistrer comme modèle** | template, gabarit, canevas |
| La section de tête d'un Rapport | **Synthèse** (owner 12/09 ; remplace « Résumé exécutif » du rapport de famille) | résumé exécutif (calque), executive summary, résumé (nu) |
| Creuser un bloc d'un Rapport avec l'agent : la question relance les outils sur la période et le périmètre du bloc, le résultat s'insère après lui, vérifié | **Approfondir** (owner 12/09) | explorer (collision avec la page), détailler, drill-down, zoomer |
| Un texte écrit par l'exploitant sous un bloc, jamais vérifié par le validateur, dit par sa pastille | **Votre note** (owner 12/09) | commentaire, annotation, texte libre |
| Ce que l'exploitant fait sur un Rapport enregistré — garder, déplacer, retirer, dupliquer une section, écrire sous elle, creuser, recalculer (owner 12/09) | **Enregistrer** · **Enregistrer une nouvelle version** · **Vos rapports** · les flèches ↑ ↓ pour Déplacer (aria : **Monter**, **Descendre**) · **Dupliquer** · **Retirer** · **Votre note** · **Approfondir** · **Actualiser** · **Modifier la Synthèse** (la Synthèse reprise par l'exploitant devient une Votre note) ; l'historique des versions se montre (« Versions : v1 · v2… ») | **geste** (mot de cuisine, jamais affiché — owner 12/09 : « llm crap »), action (nu), éditer, sauvegarder, template |
| La page dédiée des Rapports (owner 12/09, n3 : reliée au tableau de bord — entrée « Rapports » sur Piloter, onglet Explorer) | **Rapports** (titre de page) · **Nouveau rapport** (sur le patron de « Nouvelle opération ») · **Composer** (le bouton ; la spec dit « composer_rapport ») · **Vos modèles** · **Composer depuis ce modèle** · l'invite du champ : « Les sections que vous voulez voir : ventes, panier, mix, pôles, résultat net… » (proposés 12/09, à ratifier) | Générer (nu), Créer un rapport, Templates, Bibliothèque |
| La cadence d'un envoi programmé d'un Modèle de rapport (email, Slack, à l'équipe et aux partenaires connus) | **Envoyer chaque lundi / chaque jour / chaque 1er du mois** (owner 12/09) ; sur la page Rapports (incrément 5, livré 12/09, ratifiés par l'owner le 13/09) : le bouton **Envoyer chaque…** sous un Modèle ; la cadence en mots (chaque jour · chaque lundi … dimanche · chaque 1er du mois · chaque 15 du mois · chaque trimestre · chaque année) · **à 8 h** · **par email** / **sur Slack** · **Moi (email)** puis les membres de l'équipe · **Enregistrer** · **Envoyer maintenant** ; la zone **Vos envois** (« Rapport de ventes · chaque lundi à 8 h · par email à … », « Dernier envoi : JJ/MM/AAAA · 1 destinataire » ou « retenu, sans matière du … au … ») · **Arrêter** ; le courriel : le Rapport rendu par le kit + **Ouvrir le Rapport** | newsletter, digest, planifier, scheduler, programmer (nu), désactiver, supprimer l'envoi |
| Le plan du magasin, les contours des pôles teintés par une mesure de l'espace sur 30 jours (CA par m², marge brute par m², CA, Part du CA) | **plan coloré** (owner 13/09 — le bloc d'Explorer, `docs/explorer-outil-spec.md` § 5) ; l'outil pendant qu'il tourne : **Lecture de votre plan** (owner 13/09) ; sous le plan : la mesure, la fenêtre, **sol de vente N m²**, la légende par pôle, **aucune vente** pour un pôle sans CA | carte de chaleur, heatmap, cartographie |
| L'écart de marge brute entre deux périodes, décomposé en quatre effets — volume, mix, prix de vente, prix d'achat — par famille, sur les familles avec prix d'achat sur les deux périodes | **pont de marge** (owner 13/09 — la méthode prix-volume-mix, `docs/explorer-outil-spec.md` § 4) ; l'outil : **Composition de votre pont de marge** (owner 13/09) ; les effets : **Volume (unités vendues, à mix constant)** · **Mix (répartition entre familles)** · **Prix de vente (net HT par unité)** · **Prix d'achat (coût HT par unité)** ; le reste : **hors pont** | bridge, waterfall, analyse d'écart, variance |
| L'opération que l'agent prépare à partir de faits mesurés, sans la créer — l'exploitant ouvre le formulaire pré-rempli et décide | **Proposition d'opération** (owner 12/09) ; le geste : **Préparer l'opération →** ; le formulaire garde son « Créer l'opération — … » ; la carte (livrée 12/09, incrément 6) : **Dispositif** · **Dates** · **Familles** · **Objectif** (les libellés du formulaire : « CA du jour vs votre résultat habituel », « CA de ce que le dispositif vend vs votre résultat habituel », « Nombre de ventes vs… », « Panier moyen vs… ») et sa cible (« +15 % vs votre résultat habituel », « 600 € visés sur la journée ») · **Pourquoi — ce qui a été lu** (les phrases des outils, telles quelles) | suggestion, recommandation d'action, créer pour vous |
| Les sections d'un Rapport | **Synthèse** · **Chiffre d'affaires** · **Nombre de ventes** (owner 12/09 : « Volume de ventes » est trop vague) · **Panier moyen** · **Mix produits & services** · **Marge brute** · **Résultat net** · **Seuil de rentabilité** · **Vos pôles · du plus au moins performant** · **Vos familles · du plus au moins performant** · **Espace · linéaire, surface de vente, CA par mètre** · **CA moyen par jour de la semaine** (ratifié owner 12/09, à la place de « Profil par jour de semaine », jugé peu clair) · **Contexte externe** · **Actions recommandées** · **Sources et fiabilité** (owner 12/09 ; comparaisons : « par rapport à la période précédente », « par rapport à la même période l'an dernier ») | Volume de ventes, Profil par jour de semaine, Répartition par catégorie (le mot est famille), KPI (nu comme titre), performance (nu) |

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
| « Ce vendredi, il a fait 0 € » (06/09, en prod depuis le 24/08, cité comme « voisin approuvé ») | « X a fait N € » n'est pas du français ; « il » pour un créneau | « Ce vendredi, ce créneau a généré 0 € » — formes owner : « vous avez généré … », « le CA de ce vendredi est … » ; `action-cards.js` entre dans le garde |

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
7 bis. **LE FRANGLAIS EST INTERDIT** (owner 09/09 : « please write in French not in frenglish — it
   drives me mad »). Un calque de l'anglais n'est pas du français, même quand chaque mot existe :
   on n'écrit pas ce qu'on traduit, on écrit ce que dirait le commerçant à son comptable.
   Refusés le 09/09 : « tracez la cause » (trace) → **identifiez la cause** ; « notez votre prix
   sur X » (note) → **comparez vos prix à ceux de Y** / **faites le benchmark** ; « adressez votre
   public » (address) → **parlez à vos clients**. Les verbes anglais francisés (booster, monitorer,
   checker, impacter, supporter, délivrer, performer, updater…) n'entrent jamais dans une chaîne
   visible. Attrapé mécaniquement par `tournures.fr.ts` (calques listés) ; le reste se vérifie à la
   relecture, comme les règles 8-13 : la question n'est pas « est-ce du français ? » mais « est-ce
   ce qu'un commerçant français DIRAIT ? ».

## Arbitrages tranchés (owner 17/08)

**07/09 — les quatre cartes du grain facture, la chaleur, le Fil, le mix.** Premier registre refusé
(« NOT HUMAN LANGUAGE ») ; le registre courant est acté tel qu'il rend (compte owner) :
- `tickets_lines_move` : « Moins d'articles par ticket que d'habitude » ; « 1,0 article par ticket le 30/08
  contre 1,8 d'habitude : 97 % des tickets à un seul article contre 54 %, sur 322 tickets. » ; geste
  « notez ce qui était à côté du produit ce jour-là. » (hausse : « — c'est l'association à reconduire »).
- `item_absent_regular` : « Scottish Cream Scone : aucune vente » / « 2 produits sans vente » ; « Aucune
  vente de Scottish Cream Scone le 30/08. Il se vend 58 jours sur 60, 18 € par jour. » ; geste « vérifiez
  le stock de <produit> et sa place sur le linéaire. »
- `family_price_move` : « Prix moyen en baisse / en hausse sur <famille> » ; « Drinking Chocolate : 3,87 €
  par article le 30/08, contre 4,13 € d'habitude (−6 %). 43 articles vendus. » ; gestes « vérifiez les
  tickets du 30/08 sur <famille> : remises, poids ou produits moins chers. » / « notez ce qui s'est vendu
  dans <famille> le 09/08. »
- `family_discount_move` : « Plus / Moins de remises que d'habitude sur <famille> » ; « Drinking Chocolate :
  5,9 % de remise le 09/08, contre 2,5 % d'habitude (12 € sur 211 € de ventes). 51 articles vendus. » ;
  gestes « vérifiez les tickets remisés du 09/08 sur <famille> : qui a remisé, sur quoi, et si c'était
  prévu. » / « notez ce qui s'est vendu sans remise dans <famille> le 09/08. »
- Cartes concurrent (owner 07/09 : « make changes yourself ») — titres « Prix en hausse chez <concurrent> »,
  « Plusieurs prix modifiés chez <concurrent> », « Offre retirée chez <concurrent> » ; lignes : « comparez votre
  prix de <article> au sien ; si le vôtre est plus bas, affichez-le. » · « notez votre prix et votre marge sur
  <article>, puis regardez vos ventes pendant deux semaines avant de changer quoi que ce soit. » · « relevez ses
  nouveaux prix sur les produits que vous vendez aussi et notez les écarts. » · « si vous vendez un produit
  équivalent à <article>, mettez-le en avant cette semaine. » · « comparez vos horaires aux siens ; indiquez sur
  votre fiche Google et en vitrine les heures où vous êtes le seul ouvert. » · « si vous vendez <article>,
  mettez-le en avant : ses clients cherchent maintenant où l'acheter. » La porte « fait seul » du 06/09 est levée.
  Titre de competitor_price_drop (owner 07/09) : « Réagissez à la baisse de prix de vos concurrents » — ce n'est pas
  le prix qui est concurrent ; « baisse de prix concurrente » refusé.
- P8 (même consigne) : 21 plans chargés dans `reco-library.js` (heure, produit, famille, articles par ticket,
  produit sans vente, prix moyen, remises) en français courant — un verbe ordinaire, un objet qu'on tient.
- Cartes sans terme (owner 07/09, « all four ») : `competitor_reputation_strength` rejoint la classe 14 jours
  (date stable = lundi de la semaine, dbt #124). Les trois autres proposées ne sont PAS déplacées, à la
  lecture des modèles : `competitor_threat_direct` est lié à un événement daté (event_date) ;
  `high_competition_density` est un état ré-émis chaque jour (J..J+3) — le garder 14 jours le rendrait en
  quatre exemplaires ; `medal_change` est le changement de VOTRE médaille d'opportunité (change feed), une
  transition, pas un état. Ma description du 07/09 (« un concurrent a gagné une distinction ») était fausse.
- **Le fil comme un teaser (proto agir-fil, arbitré 07/09, LIVRÉ dev)** : chaque carte = pastilles
  « Opportunité » / « Menace » / « Résultat » (singulier des filtres « Menaces » / « Opportunités » du 25/08 ;
  « Résultat » pour la carte « Résultat d'hier », dont la couleur menace venait de sa catégorie) + « Aujourd'hui » /
  « Cette semaine » ; le titre arbitré ; le corps SANS la ligne Familles (elle vit sur la page insight) ; un média
  (photo du suivi, graphique « votre CA habituel / ce jour-là », tuile de dates, tuile du dispositif) ; le geste
  sans « Action conseillée : » (le bouton M'engager le dit), capitale initiale ; pied « Faire suivre · Pas pour moi ·
  M'engager ». Les hausses de CA d'un même site en UNE carte : « 5 jours au-dessus de votre CA habituel cette
  semaine » (owner 07/09 : « à votre habituel » refusé, l'adjectif garde son nom), corps « +708 € dimanche 06/09,
  +752 € vendredi 04/09. La hausse vient du volume les 2 fois. », coin « +3 361 € sur 5 jours » (les € du jour,
  jamais l'€/an d'une population — owner : « how is CA supérieur à mercredi habituel → +5 704 €/an ? »).
  « À noter » (kit, priorité 2, nature info) = une ligne, mot du kit non arbitré.
- Photos Google Places des suivis (07/09) : la légende porte « Photo : <auteur> » avec le lien Google (conditions
  Places) ; sans attribution en base, pas de photo (monitor). Colonne dbt #125, 18 fiches rétro-remplies.
- Chaleur : « forte chaleur » dès le niveau 3 (voir la table). `day_opportunity` va au Fil (décision 1 du
  04/09). `foreign_tourism_signal` : sites de destination seulement (décision 2). Mix : part de CA ET
  articles (« We need both »). Planchers : à tester le 11/09 (file À arbitrer).

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

- **Réponse aux signaux par famille (lot A dbt, 11/09)** : les métriques du mart `fct_client_family_day_class_response`
  reprennent les mots DÉJÀ actés — **Ventes/jour avec <famille>** · **Panier moyen avec <famille>** · **CA/jour <famille>** ·
  **Part de <famille> dans le CA** (owner 04/09, l. 83) · **prix moyen** en € par article (owner 07/09, l. 89 ; « prix réalisé »
  reste interdit, c'est un nom de colonne) · **vs vos jours comparables** (l. 107). Aucune surface n'affiche encore ces
  lectures : la phrase d'une réponse (« quand il pleut, … ») se soumet AVEC son tableau 8-13 au lot app, jamais avant.

- « **produits** » vs « **famille** » : l'owner a écrit « CA produits « Branded » » — renommage
  GLOBAL du mot arbitré « famille » (prod : « CA famille » jusque dans les KPI) à confirmer.
- **Ce que toute photo dit du composant (owner 11/09, lecture des photos v2 —
  `dispositifs-typologie-spec.md` § 5.3)** : mots owner, TRANCHÉS le 11/09.
  L'exposition, cinq valeurs : **Comptoir** · **Vitrine** · **Rayonnage** · **Caisses au sol** ·
  **Îlot** (clés `comptoir`, `vitrine`, `rayonnage`, `caisses_au_sol`, `ilot` — registre
  `EXPOSITION_KINDS`), à la question « Quelle exposition ? » ; les **niveaux** (« Combien de niveaux ? »,
  rayonnage seulement — jamais « rayons », qui dit aussi le rayon du magasin) ; **« N° sur le plan »**
  (le numéro du composant sur le plan du magasin, saisi par l'exploitant, jamais lu sur l'image). Motif
  owner : chez Épices et Tout, la plupart des composants sont des comptoirs, des vitrines réfrigérées,
  des caisses en bois au sol — compter des « étagères » n'y veut rien dire. « Rayonnage » a remplacé
  « Meuble à niveaux » le 11/09 (« meuble » banni depuis le 03/09 : aucune exception). « Mobilier »
  reste le mot générique d'un module précis dans une phrase (owner 11/09 : « un mobilier » se dit en
  agencement) ; l'objet dans l'app reste « composant ». Rendus : `commitmentCopy.ts`
  (`pole_photo_fixture_no`, `pole_photo_levels`, `pole_photo_families` = « Familles reconnues : »,
  miroir de « Articles reconnus : » — ratifié avec le lexique le 12/09).
- « palier » (crans de la jauge Signaux traités) — retirés en attendant LE mot.
- **La marche guidée** : les mots du 11/09 sont RATIFIÉS le 12/09 (owner : « lexique is done ») et vivent dans le tableau (Relevé de l'espace · Point focal · Fin du relevé · Part de linéaire · Pôle en projet). Rien ne reste à arbitrer ici.
- **Le libellé du champ « Gamme »** : proposé, non validé. Ses quatre valeurs (Entrée de gamme ·
  Milieu de gamme · Haut de gamme · Luxe) et la définition du Type de commerce sont tranchées
  (owner 10/09). `type-et-gamme-de-commerce-spec.md` § 2.
- **Ce que le QR code montre** (le choix, côté exploitant, de la page publique) : forme PROPOSÉE,
  calquée sur « Ce que le dispositif vend » (owner 07/09, rendu `scope-form.js` l. 38) — une
  question, puis des réponses au lieu d'un nom abstrait. Réponses à arbitrer avec le CONTENU
  (`dispositifs-typologie-spec.md` § 10.8, décision 2) : le choix de ce que le client voit décide
  de ce que la mesure veut dire. Écartés en l'état : « Preview » (anglais, règle 7 bis) ;
  « fiche » seule (mot pris — la fiche est ce que l'EXPLOITANT ouvre : fiche membre, fiche du
  dispositif) ; « Destination », « Ressource » (mots de système, pas de commerçant).
- **La copie de la page publique elle-même** (ce que le client lit après avoir scanné) :
  entièrement à écrire, lexique avant premier jet.
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
- **Planchers des cartes facture (20 tickets par jour pour les articles par ticket, 10 articles par jour
  pour le prix moyen et les remises)** : NON arbitrés — l'owner les teste jeudi 11/09/2026 (« The floor
  wasn't tested yet. Will be next Thursday »). Ce qu'ils font : rien sur un site à 300 tickets ; ils
  éteignent les sites à 1-6 factures par jour (grossiste), où une moyenne par ticket décrit une commande.
- **Le prix moyen d'une famille vendue au poids** (carte `family_price_move`, 10/09) : « par article » y
  est faux — `realized_price` y est un prix au kilo et `units` une somme de kilos. Forme PROVISOIRE livrée
  sur `dev`, faite de chaînes déjà rendues : « <famille> : prix moyen −6 % le 30/08 par rapport à votre prix
  habituel, sur 954 € de ventes. » (« votre prix habituel » = la référence de cette carte au day-detail de
  Pulse ; « sur N € de ventes » = `family_discount_move`). À arbitrer : (1) nommer l'unité — « le kilo » —
  quand l'export de détail Crisalid la donnera : elle n'est pas dans la caisse importée ; (2) garder ou
  couper « sur N € de ventes », qui est un niveau et non un écart (test 13). Passation
  `docs/dbt-handoff/HANDOFF-prix-moyen-unite-2026-09-10.md`.
- ~~Les six lignes d'action et trois titres des cartes concurrent (N3)~~ et ~~P8, les plans des cartes de
  fait~~ : CHARGÉS le 07/09 sur consigne owner (« make changes yourself ») — voir Arbitrages tranchés 07/09.
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
| **Calez le réassort** sur l'heure de pointe (07/09 : « mean NOTHING ») | **Remplissez les rayons** avant le créneau fort — « caler » n'a pas ce sens (Larousse) ; un rayon se remplit, une commande se passe |

Verbes de conseil à proscrire : *aligner, capter, concentrer, activer* (sans objet),
*surveiller, se positionner, optimiser, maximiser, adresser, **animer*** (owner 24/08 —
« animer la clientèle » → « **cibler** » ; au MOTS_BANNIS). Le corpus de référence est
`public/js/reco-library.js` — les entrées **écrites** (13), pas l'échafaudage commenté.

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

