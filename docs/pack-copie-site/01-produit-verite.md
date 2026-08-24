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
  discriminaient rien. Un audit interne (`docs/card-truth-audit.md`) juge les cartes.

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
