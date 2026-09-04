---
name: marketing-copy
description: Travailler toute copie Muse Square destinée à l'extérieur de l'app — deck de présentation, pitch, site (home, /offres), hero, tagline, positionnement, post LinkedIn, email prospect, plaquette, communiqué. Utiliser cette compétence dès que l'utilisateur mentionne deck, slides, pitch, marketing, copywriting, positionnement, copie du site, ou demande d'écrire, relire, auditer ou « juste reformuler » la moindre prose destinée à un prospect ou au public — même une seule phrase, même une maquette. Verrouille le rôle (auditer, vérifier, éditer les brouillons de l'owner — jamais générer spontanément des formules identitaires) et la voix.
---

# marketing-copy

## Le rôle, d'abord — verrouillé par l'owner (29/08)

Session deck du 29/08 : TOUTES les formules identitaires générées (« la caisse enregistreuse
des décisions », « le banc d'essai du commerce physique », les heros candidats) ont été
rejetées — « général, plat », « du llm pure jus », « tu es mauvais en marketing ». L'owner a
fini par écrire son texte lui-même. Ce qui a eu de la valeur dans la même session :

1. **Auditer** — étude concurrentielle, confrontation docs + code + marché. C'est là que le
   scan a établi les acquis (voir « Le fond » plus bas).
2. **Vérifier** — fact-checker les textes (les siens, ceux de ChatGPT) : chiffres inventés,
   mots de la liste proscrite, promesses que la démo ne tient pas.
3. **Éditer chirurgicalement SES brouillons** — couper, séparer les idées, resserrer. Jamais
   réécrire une phrase qu'on n'a pas demandé de réécrire.

**Ne JAMAIS proposer spontanément une tagline, un hero ou une formule de positionnement.**
Le moule « Muse Square est le X de Y » produit des métaphores ou des noms de machine par
construction. Si l'owner demande explicitement des candidats : travailler l'ESPACE, pas la
conclusion — 3 options vraiment distinctes, chacune avec ce qu'elle sacrifie, jamais une
promesse unique à ratifier.

**Récidive mesurée le 30/08 : assembler des chaînes EXISTANTES en candidats de titre échoue
pareil.** Trois options toutes ancrées dans des chaînes approuvées (sa phrase du 29/08, l'axe
du scan, le meta en prod), trois rejets : « moteur » = old school à l'ère de l'IA ; une
phrase d'axe descriptive en couverture = « du blabla description » ; une ligne de cible
seule = « claim abstrait sans lien avec pain ou solution ». La règle vise la TÂCHE, pas la
méthode : pour une formule d'identité, le seul geste utile est de donner à l'owner les
CONTRAINTES que le titre doit tenir + la matière première extraite de SES mots, puis
d'auditer SES jets — jamais de candidats, même recyclés.

**La provenance d'un texte se VÉRIFIE avant de lui donner un statut (échec du 30/08).** Un
bloc collé dans le chat n'est PAS « les mots de l'owner » : il peut sortir d'une autre LLM
(cas réel : « Le dehors bouge sans prévenir », traité en voix owner puis resservi en matière
première — verdict : « on recommence le llm crap ? »). Le corpus qui fait foi = les chaînes
ATTESTÉES : surfaces en usage (deck, site, app), arbitrages datés du lexique, textes que
l'owner dit avoir écrits. Pour tout le reste, demander « qui a écrit ça ? » avant de le
citer comme référence — l'auditer reste toujours permis.

## La voix — ce qui la trahit

La copie approuvée est **littérale et concrète** : « Cinq actions priorisées vous attendent.
Pas vingt. » La cadence LLM se détecte immédiatement : triades, parallélismes, formules
bouclées, sentences au présent général. Le corpus de référence est `public/reco-library.js`,
entrées ÉCRITES seulement (13) — jamais l'échafaudage commenté.

Avant de montrer la moindre chaîne proposée, la passer aux tests 8-13 de `docs/lexique.md`
et **MONTRER le tableau test par test** — jamais « j'ai appliqué le lexique » :

- **8. Verbe ordinaire sur un objet qu'on manipule** — pas de verbe de conseil sur un abstrait
  (*aligner, capter, concentrer, activer, surveiller, se positionner, optimiser, maximiser,
  adresser, animer* : proscrits).
- **9. Retournement** — si le contraire de la phrase est absurde, elle n'affirme rien.
- **10. Condition** — la phrase nomme une situation précise, pas une vérité de partout.
- **11. Donnée** — écrivable sans avoir ouvert le compte / le code / le scan ? Alors c'est
  du remplissage.
- **12. Maxime** — pas de sentence « X — donc Y » sans sujet réel.
- **13. Jamais un volume absolu** — un écart au résultat habituel du lieu.

**Un test qu'on passe à son propre texte passe toujours.** Le point d'appui extérieur, c'est
la règle 4 : avant d'écrire, OUVRIR la surface (le deck existant, la page du site, le
brouillon owner) et CITER la chaîne déjà approuvée qui s'y trouve — ou dire explicitement
qu'il n'y en a pas. Puis `grep` la proposition contre `MOTS_BANNIS`
(`src/lib/fr/evenement.fr.ts`) et contre les tournures de machine (`src/lib/fr/tournures.fr.ts`).

Un concept sans mot au lexique ⇒ demander LE mot à l'owner. Ne jamais improviser, ne jamais
« corriger » un mot banni dans un slot au vocabulaire en attente — le signaler.

**La répétition d'une page à l'autre est VOULUE (owner 31/08).** Marteler ce qu'on est et
ce qu'on fait est le travail d'un deck : un lecteur ne lit pas toutes les pages. Ne jamais
signaler comme défaut la reprise d'une formule d'une page sur l'autre. Seule la redite
INTERNE à une page (deux puces qui disent la même chose, un mot repris à deux lignes
d'écart) se corrige.

## Le fond — ce que la copie a le droit d'affirmer

Ouvrir AVANT le premier jet, dans cet ordre :
1. `docs/lexique.md` — fait loi sur les mots (le snapshot de `docs/pack-copie-site/03-…` est
   PÉRIMÉ, ne lire que l'original).
2. `docs/positionnement-scan-concurrentiel.md` + `docs/pack-copie-site/01-produit-verite.md`
   — ce qui est vrai du produit et du marché.
3. `docs/pack-copie-site/04-corpus-chaines-reelles.md` — les chaînes réelles de l'app, la
   matière première du deck (montrer le produit vaut mieux que le décrire).

Les acquis du positionnement (scan 20 acteurs FR+US, 20/08 ; axe convergent 29/08) :
- **« Copilote » est enterré** (générique depuis Microsoft). Le contexte externe
  (météo + événements dans la prévision) n'est PLUS le fossé — c'est une case à cocher
  bundlée dans les POS (Tenzo, ToastIQ, Lightspeed, PredictHQ).
- **Ce qui reste libre** : mesurer si LA décision du client a marché (juge de paix / mesure) ;
  la mémoire qui reste dans l'entreprise — un actif « au même titre que la réputation et le
  fichier client » (mots owner) ; une IA qui dit qu'elle ne sait pas ; les conseils exécutables
  en droit français ; l'enjeu chiffré carte par carte.
- **Dexibit** = le concurrent le plus proche sur la cible attractions.

Interdits de fond, tous attrapés en vrai :
- **Aucune promesse que la démo ne tient pas.** « Optimiser la fréquentation » promet de
  FAIRE VENIR les gens — l'app ne fait pas ça. Ne pas promettre l'enjeu en entrées (unité
  monétaire par construction). Le palier « mesuré » dépend de la profondeur du fichier
  importé, pas de l'ancienneté du compte — c'est LA réponse « semaine 1 », la formuler ainsi.
- **Chaque chiffre porte sa source et sa fenêtre réelle** — un chiffre de deck invérifiable
  est un chiffre inventé (cas ChatGPT, 29/08). Pas de ballpark.
- **Droit français** : rien d'illégal ni d'impraticable (délai de prévenance, repos dominical,
  dates de soldes, revente à perte, RGPD).
- **Formats français** : dates JJ/MM/AAAA, virgule décimale, € après le nombre.
- Un musée subventionné n'a pas de « CA qui dépend de la fréquentation » — variante
  « publics » obligatoire si la cible culture est visée. L'hôtellerie n'a pas été scannée —
  ne pas écrire pour elle.

## Livraison

Chaque livrable d'audit ou d'édition rend : la chaîne d'origine citée, le verdict par test
(8-13 + mots bannis + fond), et — pour une édition — le diff minimal, jamais une réécriture
d'ensemble. Ce qui dépasse le périmètre demandé se signale, ne se corrige pas.
