# Intention du produit — DÉFINITIF

Une page. Ce que Muse Square est POUR, ses objets, le test que passe tout ce qu'il montre, et ce
qu'il ne fait pas. Tout chantier s'ouvre par la ligne d'ici qu'il sert (« Sert : intent § … »).
Ce qui change plus d'une fois par trimestre n'est pas ici : c'est une spec.

## Le métier

Muse Square est **la mémoire opérationnelle** d'un lieu qui reçoit du public : le système de
référence de ce que l'exploitant a mis en place pour vendre, et de ce que ça a donné [owner 30/08,
adjectif 01/09 — `strategie-entreprise.md` § 1].

> La caisse dit ce qui s'est vendu. Le CRM dit qui a acheté.
> Muse Square dit ce que vous avez fait, et si ça a marché.

Le travail qu'il fait à la place de l'exploitant : regarder la fréquentation et les ventes tous
les jours, les rapporter au résultat habituel DU lieu, et garder la trace de chaque dispositif
avec son résultat — pour que le lieu apprenne de lui-même.

## Les objets (un mot chacun — `lexique.md` fait loi)

- **site** : le lieu, unité de tout suivi et de toute sauvegarde ; jamais l'utilisateur seul.
- **dispositif** : ce que l'exploitant met en place pour vendre, à n'importe quel état
  (en test · prouvé · écarté). Trois natures : **pôle** (permanent : 1..n
  familles — celles de la caisse, jamais du texte libre — plus ses composants, un responsable, des
  ressources ; lecture continue, jamais de verdict. Une famille vit dans UN SEUL pôle, et aucune ne
  reste hors pôle : le mapping des familles est complet ou il ment), **opération** (datée : KPI déclaré, cible,
  verdict atteint · manqué · non concluant), **série** (récurrente : occurrences).
- **version** : changer l'organisation d'un dispositif est une version suivante ; la mémoire
  s'accumule par dispositif, jamais par personne.
- **engagement** : ce que l'exploitant promet de faire et de mesurer.
- **résultat habituel** : la référence de toute comparaison, propre au lieu et au jour de semaine.
- **suivi** : un lieu extérieur que la veille lit ; `competitor_tracking` est la vérité.
- **famille de produits & services** : le grain déclaré d'un pôle ; l'article est le grain en
  dessous.
- **prix d'achat** : le coût HT d'un article à une date d'effet, déposé par l'exploitant ; il fait de la
  **marge brute** (CA net HT − prix d'achat des articles vendus) une mesure, par famille, par article, par
  heure — toujours dite avec la part du CA dont le prix d'achat est renseigné. Avec les **charges fixes**
  et la **masse salariale** du mois, déclarées, elle donne le **résultat net** et le **seuil de rentabilité** du jour
  [owner 11/09, `strategie-entreprise.md` § 12.12 : le critère d'achat du premier client réel est le
  profit]. Sans prix d'achat en base, aucun chiffre de marge ne se montre.
- **composant** : l'objet physique d'un dispositif, celui qu'on photographie — vitrine, linéaire,
  comptoir, QR code. C'est lui qui porte la PLACE dans le magasin ; un dispositif en a plusieurs,
  discontinus s'il le faut. Un composant peut être **interactif** : le client y fait un geste
  délibéré — scanner un QR code — et ce geste compte dans l'**attractivité** du produit ou de la
  famille, sans achat. L'attractivité et la vente sont deux mesures distinctes ; leur écart est ce
  qu'aucune caisse ne voit.
- **rapport** : le document qu'Explorer compose à la demande — une liste ordonnée de blocs (texte vérifié,
  tableau, carte, section), chacun avec les faits, l'outil et la période qui l'ont produit ; gardé par site
  avec l'auteur, réordonnable, recalculable, jamais un texte que le modèle aurait écrit sans faits. Un
  **modèle de rapport** est ce document sans ses chiffres : il se réutilise et s'envoie à cadence à l'équipe
  et aux partenaires connus [owner 12/09, `explorer-outil-spec.md`].

## Le test de valeur

Une carte, une réponse d'Explorer, une page : chacune dit quelque chose de **vrai**, que
l'exploitant **ne pouvait pas voir seul**, et pointe quelque chose qu'il **peut bouger** — ou ne
s'affiche pas. Corollaires qui ne se négocient pas :

- un chiffre porte son référentiel (écart au résultat habituel du lieu, jamais un volume nu) et
  sa requête ; un jour isolé ne s'annualise jamais ;
- une absence se dit et se chiffre ; une cause non isolable se dit « facteurs mêlés » ;
- une inférence se libelle comme telle ; une observation vaut toujours plus qu'un modèle ;
- une pratique conseillée vient d'une source du registre, ou ne se conseille pas ;
- une phrase visible passe le lexique (mots + règles 1-13) AVANT d'être proposée ;
- un geste conseillé est légal et praticable en France, à l'horizon où l'exploitant le maîtrise.

## Ce que Muse Square n'est pas

- pas un CRM : il ne connaît pas le client, il connaît le dispositif et son résultat ;
- pas un middleware entre serveurs [owner 30/08] ;
- pas un outil de surveillance : aucune captation des clients en magasin, aucune donnée
  personnelle dans une photo ; un signal d'interaction n'existe que si le client fait le geste
  lui-même — on compte l'événement, jamais le visiteur ;
- pas un conseil générique : ce qu'on peut écrire sans ouvrir le compte ne s'écrit pas ;
- pas un verdict sur ce qui n'a pas de terme.

## Ce qui fait loi, dans l'ordre

`lexique.md` (chaînes visibles) · `module-index.md` (code) · `data-model-index.md` (données) ·
cette page (ce qui mérite d'exister). `CLAUDE.md` dit comment on travaille ; ici, pourquoi.
