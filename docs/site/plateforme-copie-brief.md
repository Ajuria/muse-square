# Prompt — réécriture de la page Plateforme de Muse Square

*(à coller tel quel dans Gemini)*

---

## TA MISSION

Réécris la page « Plateforme » du site de Muse Square, en reprenant la matière du deck de
présentation fournie plus bas.

Muse Square est un logiciel français qui sert aux organisations recevant du public (commerces,
lieux culturels, festivals, événementiel) à savoir ce qui va impacter leur activité, à mesurer
si ce qu'elles mettent en place a marché, et à garder ce qui a marché.

**Le problème à corriger** : la page actuelle vend un produit de *choix de date* — « comparez
jusqu'à 7 dates côte à côte », « indice de faisabilité », les étapes Planifier / Sélectionner /
Comparer. Ce produit n'existe plus sous cette forme. L'application a trois onglets : **Piloter**,
**Agir**, **Explorer**. Et la page d'accueil du site raconte désormais tout autre chose : la
mémoire opérationnelle et la mesure. Un prospect qui passe de l'accueil à Plateforme change de
produit.

Tu ne réécris donc pas des paragraphes : tu **refais le plan de la page**, puis tu écris dedans.

**Tu n'as accès ni au logiciel ni au code.** Tout ce que tu as le droit d'affirmer sur le
produit est dans ce document. S'il te manque un fait, tu poses la question — tu ne le supposes
jamais. Une page qui promet une fonction inexistante se découvre en démonstration, devant le
client.

---

## 1. LE GABARIT DE LA PAGE — slots et longueurs

Largeur de contenu : **1140 px** maximum, 24 px de marge intérieure. Les budgets de caractères
ci-dessous sont calculés depuis les largeurs de colonne et les tailles de police réelles ; ce
sont des **cibles**, pas des limites dures — mais les dépasser de beaucoup casse la mise en page.

### A. Bannière d'ouverture (texte blanc sur photo sombre)
| Slot | Contrainte |
|---|---|
| Titre `h1` | 40 px — **1 ligne, ≤ 45 caractères** |
| Sous-titre | 20 px, largeur bridée à 720 px — **2 lignes, ≤ 145 caractères** |

### B. Section « Comment ça marche ? »
| Slot | Contrainte |
|---|---|
| Titre `h2` centré, majuscules | ≤ 30 caractères |
| Corps | **4 paragraphes** pleine largeur, 17 px. Chacun ouvre sur une **amorce en gras** (2 à 4 mots, suivie d'un point) puis 2 à 4 phrases. ≤ 340 caractères par paragraphe. |

### C. En-tête de section (le motif se répète : Planifier, Piloter, Alertes, IA)
Une rangée horizontale : surtitre et titre côte à côte, puis un paragraphe dessous.
| Slot | Contrainte |
|---|---|
| Surtitre (majuscules, filet bleu à gauche) | **1 mot**, ≤ 14 caractères |
| Titre `h2` sur la même ligne | ≤ 50 caractères — impératif, verbe en tête |
| Paragraphe d'intro | pleine largeur, ≤ 230 caractères |

### D. Grille 3 colonnes numérotée (aujourd'hui : Explorer / Sélectionner / Comparer, et la section IA)
Trois cartes dans un cadre unique, séparées par des filets. Texte utile : **284 px** par colonne.
| Slot | Contrainte |
|---|---|
| Numéro | `01` `02` `03` — automatique, ne pas écrire |
| Surtitre (majuscules) | **1 mot**, ≤ 14 caractères |
| Titre `h3` | 19 px — **2 lignes, ≤ 60 caractères** |
| Corps | 16 px — **3 à 4 lignes, ≤ 140 caractères** |
| Capture d'écran | optionnelle, sous le texte |

### E. Rangée 2 colonnes texte + capture (section Piloter — 2 rangées, la 2ᵉ inversée)
Texte utile : **518 px**.
| Slot | Contrainte |
|---|---|
| Titre `h3` | 26 px — **2 lignes, ≤ 80 caractères** |
| Corps | 1 ou 2 paragraphes, ≤ 160 caractères chacun |

### F. Colonne de fiches encadrées (section Alertes — 3 fiches empilées + capture à droite)
Texte utile : **490 px**.
| Slot | Contrainte |
|---|---|
| Titre de fiche | 14 px gras — **1 ligne, ≤ 45 caractères** |
| Corps de fiche | 13 px — **2 lignes, ≤ 150 caractères** |

### G. Grille 2×2 des signaux (aujourd'hui : Concurrence / Mobilité / Calendrier / Météo)
Chaque case : une icône, un titre, un paragraphe, puis **deux pastilles d'exemple**.
| Slot | Contrainte |
|---|---|
| Titre `h3` | 17 px — **1 ligne, ≤ 40 caractères** |
| Corps | ≤ 190 caractères |
| Pastille d'exemple ×2 | 12 px, **1 ligne, ≤ 55 caractères**. Ce sont des **exemples de ce que l'app affiche vraiment** — ils doivent ressembler à une vraie sortie, pas à une promesse. Modèles en production : « 87 événements ce week-end — dans la moyenne » · « Travaux sur la ligne 4 du métro » · « Jour férié — résidents locaux peu disponibles ». |

### H. Bloc de clôture, centré
| Slot | Contrainte |
|---|---|
| Titre | ≤ 45 caractères — c'est une question aujourd'hui |
| Corps | largeur bridée à 520 px, ≤ 200 caractères |
| Mention en petit | ≤ 90 caractères |
| Bouton | **≤ 18 caractères**, libellé actuel « Nous contacter » |

### Règles de gabarit valables partout
- **Un seul bouton par page**, celui du bloc de clôture. Les cartes et les colonnes n'ont **pas**
  de bouton ni de lien — n'en propose pas.
- Les captures d'écran existantes sont : Explorer, Sélectionner, Comparer, Piloter (tableau de
  bord), carte, Alertes. Si ton plan supprime une section, **dis quelle capture devient
  orpheline** — il faudra en produire une autre.
- Aucun tableau comparatif, aucune grille tarifaire sur cette page : ça n'existe pas.
- Le gras sert aux **amorces de paragraphe** (section B) et aux **noms de gestes du produit**
  (Consulter la source, Communiquer, Faire suivre, Automatiser, M'engager). Nulle part ailleurs.

---

## 2. LE TEXTE ACTUEL DE LA PAGE

**Titre :** Détectez, agissez, automatisez.

**Comment ça marche ?**
> *Votre veille.* Chaque matin, prenez connaissance de votre contexte opérationnel — les
> concurrents que vous suivez, la météo, les événements, la mobilité, le calendrier — croisé
> avec les résultats de la journée précédente. Cinq actions priorisées vous attendent. Pas vingt.
>
> *Vos actions et leur automatisation.* Chaque carte d'action vous propose trois options :
> Consulter la source, Communiquer avec un brouillon prêt à publier sur Google Business,
> Instagram, Email ou Slack, ou Faire suivre le signal en interne avec l'action recommandée.
> Vous gardez la main sur le niveau d'automatisation, du manuel au tout-automatique. Cinq
> minutes, c'est traité.
>
> *Vos événements et vos questions.* Pour vos événements à venir, PLANIFIER compare vos dates
> candidates. Pour vos questions précises, le prompt répond sur vos données — pas sur Internet.
>
> *Vos décideurs.* Chaque semaine, deux briefs par email : le récap de ce qui a bougé sur vos
> sites, et la semaine à venir pour anticiper. Pas besoin d'ouvrir l'app.

**Planifier — Anticipez avant de vous engager.** Avant de bloquer un budget, réserver un lieu ou
envoyer des invitations, identifiez les risques contextuels qui impacteront votre activité sur
les 30 prochains jours.
- *01 Explorer — Posez votre question en langage naturel.* L'IA puise dans notre base de données
  contextuelle pour vous proposer des réponses fondées sur des données réelles, pas sur des
  hallucinations.
- *02 Sélectionner — Identifiez les bonnes fenêtres d'opportunité.* En un coup d'œil, visualisez
  les jours à risque, les vacances, les jours fériés et les événements régionaux avant de vous
  engager sur une date ou un budget.
- *03 Comparer — Comparez jusqu'à 7 dates côte à côte.* Analysez chaque date en détail — indice
  de faisabilité, signaux clés, disponibilité de votre audience — et choisissez celle qui
  concentre le moins de risques.

**Piloter — Suivez vos risques chaque jour.** Une fois votre date choisie, vous êtes informé des
nouveaux risques apparus depuis votre décision sur l'ensemble de vos sites. Soyez prêt le jour J
pour faire face aux impondérables ! Tableau de bord quotidien par site : points de vigilance,
signaux critiques, évolution de votre contexte opérationnel. Gérez plusieurs sites depuis une
interface unique. Visualisez la pression concurrentielle autour de votre site : cartographiez
les événements concurrents dans un rayon de 500m à 10km.

**Alertes — Restez informé sans ouvrir l'application.** Recevez vos alertes contextuelles par
email — à la fréquence de votre choix et jusqu'à 3 destinataires. *Résumé hebdomadaire* : un
email par semaine avec l'état de vos dates — scores, alertes, météo à 7 jours. Jour et heure
configurables. *Alerte immédiate niveau 3–4* : notification immédiate dès qu'un risque fort est
détecté. *Email quotidien J–7* : à partir de 7 jours avant votre date, un email quotidien.

**Notre approche de l'IA.** L'IA de Muse Square est connectée à sa propre base de données. Ses
réponses sont sourcées, vérifiables et limitées à ce qu'elle peut prouver.
- *01 Data-driven* — L'IA interroge notre base de données contextuelle et vous les restitue
  fidèlement. Elle ne génère pas de réponses ou de recommendations ad-hoc.
- *02 Vérifiable* — Chaque recommandation s'appuie sur des données que vous pouvez consulter
  directement. Aucune boîte noire. Vous vérifiez, vous décidez.
- *03 Rigoureuse* — La fiabilité avant l'exhaustivité. Une IA spécialisée sur un nombre limité
  de régions — Île-de-France, Occitanie, PACA — avant d'élargir sa couverture.

**Les 4 signaux de risque.** Concurrence événementielle (densité d'activations concurrentes de
500m à 50km) · Mobilité (RATP/SNCF, grèves, travaux, préavis) · Calendrier contextuel (fériés,
vacances scolaires par académie, soldes) · Météo (précipitations horaires, température, vent,
alertes Météo-France).

---

## 3. CE QUI DOIT SAUTER, ET POURQUOI

Ces points ont été vérifiés dans le code. Tu ne peux pas les revérifier : prends-les tels quels.

| Chaîne actuelle | Décision |
|---|---|
| Titre « Détectez, agissez, automatisez. » | **Supprimer.** Retiré de l'accueil ; c'est une triade, la cadence typique d'un texte généré. |
| Tout le parcours *Planifier → Sélectionner → Comparer 7 dates*, « indice de faisabilité » | **Supprimer.** Ne correspond plus à la structure du produit. |
| « Alerte immédiate niveau 3–4 » | **Supprimer.** Fonction inactive : la table d'alertes est vide, et le mot « niveau 3 » a été retiré des emails du produit parce qu'il ne dit au lecteur rien sur quoi il puisse agir. |
| « jusqu'à 3 destinataires », « Jour et heure configurables » | **Ne pas réécrire — poser la question.** Aucune trace de ces réglages dans le code. |
| « Cinq minutes, c'est traité. » | **Supprimer.** Promesse de durée jamais mesurée. |
| « ne génère pas de réponses ou de recommendations ad-hoc » | **Reformuler.** Faute d'orthographe (« recommendations ») et affirmation fausse : le produit rédige bel et bien des brouillons de publication et une ligne « Action conseillée : » sur chaque carte. Ce qui est vrai : les réponses sont sourcées, bornées à ce que l'app peut prouver, et l'app dit quand elle ne sait pas. |
| « pression concurrentielle » | **Remplacer par « activité dans votre périmètre ».** L'indice compte l'agenda local sans filtre de secteur : ce ne sont pas des concurrents. |
| « rayon de 500m à 10km » | **Corriger en 500 m à 50 km** (l'autre section de la page dit déjà 50 km). Espace insécable avant l'unité. |
| « Cinq actions priorisées vous attendent. Pas vingt. » | **Garder mot pour mot.** Chaîne validée. |

**Ce qui manque totalement à la page** : la mesure d'impact et la mémoire. Ce sont les deux
seuls arguments qu'aucun concurrent français ou américain ne tient (étude de 20 acteurs), et
c'est tout ce que la page d'accueil raconte désormais.

---

## 4. LA MATIÈRE DU DECK À REPRENDRE

Tout ce qui suit est écrit par le fondateur. C'est citable tel quel, et c'est la meilleure
matière dont tu disposes. **Ne le paraphrase pas** : reprends-le, place-le, coupe-le si besoin.

**Les trois difficultés du client** *(à utiliser en ouverture de page)* :
> - Un concurrent lance une offre à 800 m – vous l'apprenez trop tard
> - Vos ventes décrochent sans explication – le contexte n'est pas croisé avec vos données
> - Vos équipes changent – les bonnes pratiques et les connaissances se perdent

**Les quatre questions** *(à utiliser comme structure de « Comment ça marche ? »)* :
> Savoir ce qui s'est déjà produit chez vous permet de répondre à quatre questions : qu'est-ce
> qui impacte mon activité aujourd'hui, quel dispositif commercial y répond le mieux compte tenu
> de mon historique, qui doit s'en charger, et est-ce que ça a marché ?

**Le paragraphe de positionnement :**
> Chaque jour, des dizaines de facteurs impactent votre activité – concurrence, météo, mobilité,
> calendrier. Les collecter prend du temps. Les croiser avec vos résultats est impossible
> manuellement. S'en souvenir d'une saison à l'autre est aléatoire.

**Les trois onglets du produit :**

| Onglet | Sous-titre | Ce qu'on y fait |
|---|---|---|
| **PILOTER** | Suivez les résultats de vos opérations et de vos équipes | le suivi en € des opérations en cours · le pilotage du travail de l'équipe sur un ou plusieurs sites · l'évolution de votre environnement : concurrence, météo, mobilité, calendrier |
| **AGIR** | ⚠️ **manquant — demande-le** | vos priorités commerciales du jour : cinq actions chiffrées, pas vingt · le partage automatisé des signaux et opérations prioritaires avec vos équipes · l'amélioration de vos dispositifs de vente : suivi du KPI, évaluation du dispositif et itération jusqu'à ce qu'il soit prouvé |
| **EXPLORER** | Interrogez la mémoire de votre organisation | des réponses et des rapports tirés de vos données, sources à l'appui · la planification de vos opérations, avec des réponses contextualisées · l'historique et les effets mesurés en euros de vos dispositifs de vente |

⚠️ Le deck donne à AGIR le sous-titre « Choisissez la meilleure date pour vos temps forts ». Il
est périmé — il ne décrit aucune des trois lignes ci-dessus. **Ne le reprends pas : demande le
bon sous-titre.**

**La mission :**
> Notre mission : faire de votre expérience un actif opérationnel

**Le fondateur** *(à reprendre tel quel si tu ouvres une section signature)* :
> Ancien chercheur à l'Université de Genève et diplômé d'HEC Paris. J'ai fondé Muse Square pour
> rendre les données contextuelles fiables, accessibles et directement actionnables par les
> équipes terrain. Nous prenons en charge la technique. Vous décidez plus vite et avec plus de
> précision.

⚠️ **Un seul mot du deck est mort** : sa couverture dit « la mémoire **commerciale** de votre
organisation ». C'est désormais « la mémoire **opérationnelle** ». Motif : « mémoire
commerciale » est en France le surnom courant du CRM et désigne la mémoire du *client*
(coordonnées, échanges, pipeline), pas celle des opérations menées.

---

## 5. LE PLAN À ÉCRIRE

1. **Ouverture** — les trois difficultés (§ 4).
2. **Comment ça marche ?** — les quatre questions (§ 4) comme structure.
3. **Piloter · Agir · Explorer** — un bloc par onglet, contenus du § 4.
4. **La boucle de mesure** — voir § 6. Absente de la page aujourd'hui ; c'est l'ajout principal.
5. **Les 4 signaux de risque** — la section actuelle est bonne, corrige les points du § 3.
6. **Sécurité & données** — voir § 6. La page n'en a rien ; c'est l'ajout à plus fort rendement.
7. **Alertes** — à n'écrire qu'après réponse sur les « 3 destinataires » et le « jour et heure
   configurables ». Si ce n'est pas confirmé, la section rétrécit. Elle ne s'invente pas.

---

## 6. CE QUE TU AS LE DROIT D'AFFIRMER

**Les trois onglets** : Piloter (le tableau de bord — où j'en suis, ce qui tourne, ce que j'ai
prouvé), Agir (les actions du jour), Explorer (mes questions en langage naturel sur mes données).

**Une carte d'action** porte trois choses : le fait nommé (le nom, le chiffre, la date — jamais
« un concurrent »), l'enjeu chiffré en euros sur l'année, et une action réellement faisable. Les
gestes disponibles : Consulter la source · Communiquer (un brouillon prêt à publier sur Google
Business, Instagram, Email ou Slack) · Faire suivre (le signal en interne, avec l'action
recommandée) · Automatiser · M'engager.

**La boucle de mesure.** L'utilisateur déclare ce qu'il va faire, sur quel chiffre il sera jugé,
avec quelle cible et sur quelles dates. Chaque jour, l'application mesure ce chiffre contre son
résultat habituel. À l'échéance elle rend un verdict : **atteint · manqué · non concluant** —
« non concluant » est un résultat à part entière, l'app refuse de conclure quand le bruit ou les
vacances rendent la mesure non fiable, et la base de mesure est affichée. Ce qui a marché
devient un **dispositif prouvé**, réutilisable, qui reste dans l'entreprise. Ce qui a coûté est
**écarté** et ne sera plus proposé. Ensuite l'application recalibre l'objectif et propose trois
routes : **Poursuivre · Doubler la mise · Pivoter**. L'itération continue jusqu'à ce que le
dispositif soit prouvé.

**Les données de contexte** : concurrence (événements concurrents de 500 m à 50 km, plus une
veille des concurrents nommément suivis, relue chaque nuit — prix, offres, avis, horaires,
actualité) · météo (précipitations horaires, température, vent, alertes Météo-France) ·
mobilité (RATP/SNCF, grèves, travaux, préavis déposés) · calendrier (fériés, vacances scolaires
par académie, soldes, événements régionaux) · tourisme étranger par région · fréquentation
(footfall, temps de présence) · les ventes du client, importées depuis sa caisse.

**La discipline de mesure** : jamais deux jours comparés entre eux, toujours une référence
robuste · un montant estimé et un montant mesuré ne sont pas présentés pareil · sous certains
seuils, l'app **ne chiffre pas** · tout chiffre porte son référentiel · une absence se dit et se
chiffre (« Prix stables — 10 tarifs comparés, rien à la lecture de cette nuit ») · on nomme, ou
on se tait.

**Sécurité & données** : données hébergées en Europe (Google BigQuery EU) · données non
partagées entre clients · conformité RGPD, DPA formalisé avant toute intégration · seules les
ventes facturées portent un nom de client, repris avec l'historique de commandes, sans
coordonnées ni moyen de paiement · isolation des accès par client, chiffrement en transit et au
repos, accès restreint par rôle · l'IA passe par l'API Anthropic (Claude), pas le produit grand
public : données supprimées sous 30 jours, aucun entraînement des modèles, aucune donnée
personnelle des clients finaux transmise ; hors de ces appels, tout reste en Europe.

**Clients citables** : Les Olivades (imprimeur et éditeur de tissu, Entreprise du Patrimoine
Vivant) et Costières de l'Art (festival d'art contemporain). **Aucun client événementiel.**

---

## 7. CE QUE TU NE PEUX PAS PROMETTRE

- **Pas de marge.** Le chiffre s'appelle **profit estimé** : l'utilisateur déclare lui-même son
  taux de marge, appliqué par famille de produits — jamais par article. Sans déclaration, l'app
  n'affiche rien plutôt qu'un chiffre inventé. Jamais « marge », « marge par produit ».
- **Pas de CA par client.**
- **Pas d'encaissement, de planning RH, de paie, de CRM, de billetterie.** Muse Square ne
  remplace ni la caisse ni le logiciel métier.
- **Pas de connecteur caisse universel.** Aujourd'hui : export CSV. Formulation exacte du
  produit : « Connexion directe prévue — en attendant, export CSV… ». Jamais « bientôt disponible ».
- **Couverture limitée à trois régions** : Île-de-France, Occitanie, Provence-Alpes-Côte d'Azur.
  C'est un choix assumé (fiabilité avant exhaustivité), pas une lacune à cacher.
- **Pas de cause certaine.** L'app donne un niveau de confiance, jamais un pourcentage de cause.
  Bannis : « impact réel », « précisément », « la cause ».
- **L'app ne fait pas venir les gens.** Jamais « optimiser la fréquentation ».
- **L'hôtellerie n'a pas été étudiée** — ne pas écrire pour elle.
- Un **musée subventionné** n'a pas de « CA qui dépend de la fréquentation ».
- **Droit français** : rien d'impraticable. Le planning est encadré (délai de prévenance 7 jours,
  3 en hôtellerie-restauration) ; le dimanche travaillé est l'exception, pas la règle ; les
  soldes ont des dates légales ; la revente à perte est interdite.

---

## 8. LA VOIX

Le lecteur est un exploitant français qui gère un ou plusieurs lieux recevant du public. Il
n'est pas analyste et n'a pas de temps. Le fondateur a refusé sept textes générés avec ce motif :

> « llm language is not acceptable as it raises trust issues in the user »

La logique : une phrase qui débite une évidence bien tournée fait douter de toutes les autres.
Sur un produit qui vend la mesure honnête, une formule creuse coûte plus qu'elle ne rapporte.

Registre approuvé, littéral et concret. Exemple en production : *« Cinq actions priorisées vous
attendent. Pas vingt. »*

**Six tests, à passer avant de montrer une phrase, et à montrer :**

1. **Verbe ordinaire sur un objet qu'on manipule** — une offre, le stock, l'équipe, les avis,
   la fiche Google, les prix. Proscrits : *aligner, capter, concentrer, activer (sans objet),
   surveiller, se positionner, optimiser, maximiser, adresser, animer*.
2. **Retournement** — écris le contraire. S'il est absurde, la phrase n'affirme rien et saute.
3. **Condition** — la phrase nomme-t-elle un moment, un seuil, un état ? Vraie partout = utile
   nulle part.
4. **Donnée** — aurait-elle pu être écrite sans jamais avoir vu ce produit ? Alors c'est du
   remplissage.
5. **Maxime** — aucune sentence au présent général de forme « X — donc Y ».
6. **Volume** — jamais un volume absolu : Nîmes et Paris ne portent pas le même trafic.

**Tics rédactionnels bannis mécaniquement** : « il s'agit de… » · « permet de / permettent de… »
· « en résumé » · « à retenir : » · « notons » · « on constate » · toute phrase qui explique la
mise en page ou raconte un calcul · les parenthèses de pluriel « (s) ».

**Formats** : dates JJ/MM/AAAA · virgule décimale · € **après** le nombre (12 000 €) · espace
avant les unités (500 m, 10 km) et avant « ? », « : », « ! » · jours de semaine en toutes lettres.

---

## 9. LES MOTS — un concept, un mot

| N'écris pas | Écris |
|---|---|
| mémoire commerciale · gestion commerciale · base de connaissances | **mémoire opérationnelle** |
| copilote · assistant | (enterrés) |
| recette · méthode · playbook · plan · routine · protocole | **dispositif** |
| validé · certifié | **prouvé** |
| rejeté · invalidé | **écarté** |
| non mesurable | **non concluant** |
| l'attendu · la normale · vs habituel | **votre résultat habituel** |
| pression concurrentielle · pression locale · jours disputés | **activité dans votre périmètre** |
| tracking · crawl · couverture · lieux visités | **veille** · **vos suivis** · **lus cette nuit** |
| zone de chalandise · catchment | **votre périmètre** |
| menace | **concurrent direct** |
| fenêtre favorable · meilleure fenêtre | **occasion favorable** · **Opportunités** |
| nombre de transactions · volume d'achats | **ventes** |
| ticket moyen | **panier moyen** |
| trafic | **visiteurs** |
| marge · marge par produit | **profit estimé** |
| catégorie · rayon · produits (seuls) | **famille produits & services** |
| les plus / moins performants | **de la plus forte hausse à la plus forte baisse** |
| clientèle locale · clientèle mixte | **résidents locaux** · **public mixte** |
| potentiel · opportunité € | **enjeu annualisé** |
| Armer · Armer sur signal | **Automatiser** |
| partager · notifier | **Communiquer** |
| points de pourcentage · pp | **%** (ou €) |
| bientôt disponible | **Connexion directe prévue — en attendant, export CSV…** |
| rejouable | **réutilisable** |
| réassort | **vérifiez le stock — il ne doit pas manquer** |

**Un concept qui n'a pas son mot ici : demande-le. Ne l'invente pas.**

---

## 10. CE QUE TU RENDS

La page réécrite, section par section, dans l'ordre du § 5 (le plan). Puis, pour chaque phrase nouvelle :

1. **Le tableau des six tests**, verdict par test. Un ⚠️ honnête vaut mieux qu'un ✅ faux.
2. **Le contrôle du § 9**, fait à la main.
3. **La source de tout chiffre.** Un chiffre sans source est un chiffre inventé.
4. **La liste de tes questions** — sous-titre d'AGIR, « 3 destinataires », « jour et heure
   configurables », et tout concept sans mot.

**Trois interdits :**

- Ne réécris jamais une chaîne qu'on ne t'a pas demandé de réécrire. Ce qui dépasse le périmètre
  se **signale**.
- Ne propose pas de tagline ni de slogan spontanément. Si on t'en demande un : un titre vendeur
  **nomme la douleur ou la solution** — jamais le mécanisme, jamais l'aphorisme. Avant de le
  montrer, réponds en un mot : « quelle douleur, ou quelle solution ? » Sans réponse, il ne sort pas.
- N'affirme rien sur le produit qui ne soit pas dans ce document.
