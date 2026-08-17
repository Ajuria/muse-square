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
| Une pratique qui marche, réutilisable | **dispositif** | recette (en nom de section), méthode, playbook |
| Statuts d'un dispositif | **déclaré · en test · prouvé** | validé, certifié |
| Ce que l'utilisateur promet de faire et mesurer | **engagement** | commitment, pari |
| Une date d'une série mesurée | **occurrence** | instance, itération |
| Événement récurrent | **série** | campagne |
| Le jugement automatique d'une fenêtre | **verdict** (atteint · manqué · non concluant) | score, résultat final |
| L'objectif chiffré | **cible** / **objectif** | target, seuil (réservé aux réglages) |
| La période mesurée | **fenêtre** (de mesure) | période de test |
| La référence de comparaison | **votre habituel** | l'attendu, la normale (sauf « CA vs normale » legacy K1) |
| Ce que vaut un motif à l'année | **enjeu** (infobulle seulement) | potentiel, opportunité € |
| Surveillance des concurrents | **veille** / **vos suivis** | couverture, tracking, crawl |
| Fraîcheur de la veille | **lus cette nuit** | dernier passage, visités, crawlés |
| Un concurrent surveillé | **suivi** | tracké, monitored |
| Zone autour d'un site | **votre périmètre** | catchment, zone de chalandise (à confirmer) |
| Jour favorable détecté | **occasion** (Prochaine occasion · Vos prochaines occasions) | fenêtre de la semaine, momentum |
| Jour non couvert par une action | **couvert / sans action** | joué, manqué (réservé au verdict) |
| Déclenchement automatique | **Automatiser** (série OU signal — la condition se choisit dans le flux) | Armer, Armer sur signal |
| Message à l'équipe | **Communiquer** | partager, notifier (notification = réglage) |
| Geste sur un engagement ouvert | **Ajuster** | Modifier (mort 15/08), Évolution (mort 17/08) |
| Ouvrir le dossier d'une série/événement | **Dossier →** | Voir, Ouvrir |
| Préparer une occurrence à venir | **Préparer →** | — |
| Rendre le vécu d'une occurrence passée | **Bilan →** | feedback, débrief |

## Règles de rédaction (héritées des décisions owner)

1. **CTA = un verbe + flèche (≤ 14 caractères)** — l'objet vit dans le titre de la rangée.
2. **Un montant porte toujours son référentiel** (gagnés · à prendre · cible · vs habituel) —
   jamais un € nu à côté d'un verbe qui n'en est pas la cause.
3. **Couleur = verdict** : vert = mesuré positif ; rouge/orange = verdict négatif ou alerte ;
   bleu = prospectif/possession ; encre = tout le reste. Un seul vert par écran : celui qui est gagné.
4. **On NOMME ou on se tait** : jamais « un concurrent », « un écart » — le nom du concurrent,
   le chiffre, le fait. Un teaser vers une autre page n'est pas une information.
5. **Le technique ne s'affiche que cassé** (« échappe à votre veille ») — jamais en inventaire sain.
6. **Jours de semaine en toutes lettres** (« votre jeudi habituel »), dates `JJ/MM`.
7. **Absence dite et chiffrée** (« Prix stables — 10 tarifs comparés, rien à la lecture de cette
   nuit ») — jamais un zéro nu ni une section vide.

## Arbitrages ouverts (owner)

- « Documentez la **recette** » (copie validée en prod) vs « dispositif » partout : garder
  « recette » comme verbe familier de CE CTA, ou aligner ?
- « **armée** » (état d'une occurrence dont la mesure est programmée — frise, chips) : garder,
  ou « programmée » ?
