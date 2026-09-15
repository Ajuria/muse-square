# Re-mesure des étagères après correction du contrat — 15/09/2026

Les SIX MÊMES photos que le verdict du matin, pour comparer deux consignes et non deux tirages.
Modèle : claude-sonnet-5. La règle de hauteur est IMPORTÉE de `src/lib/ai/photoExtraction.ts` (`ETAGERE_REGLE_FR`) :
le texte mesuré ici est celui que la production envoie.

| Photo | Meuble | Ce que l'œil a établi | Le matin | base_visible | Étagères | Articles rendus |
|---|---|---|---|---|---|---|
| IMG_0114.jpeg | rayonnage droit | Fontagard 2 · Bellevoye 2 · Glenfiddich 3 · Thompson's 3 · Hyde 4 · Lindores 4 | 5 étagères, 6/6 justes | false | null (œil : 5) | Bouteille Glenfiddich 21 ans (coffret orange) (null · haute) · Bouteilles Thompson's Camel (null · haute) · Bouteille Hyde (null · haute) · Bouteille Strathdon (null · moyenne) · Whisky français Bellevoie (null · haute) · Bouteilles noires Fontagard (null · moyenne) |
| IMG_0104.jpeg | rayonnage droit | confitures 1 · flageolets 2 · « à emporter » 3 · sauces 4 · soupes 5 | 5 étagères, 5/5 justes | false | null (œil : 5) | Bocaux de soupes variées (haut du meuble) (null · haute) · Bocaux de sauces et yassa (null · haute) · Bocaux karine & jeff (à l'ampourienne, tomates) (null · haute) · Bocaux haricots blancs et flageolets cuisinés (null · haute) · Bocaux karine & jeff divers (null · moyenne) |
| IMG_0121.jpeg | rayonnage droit | Chablis 1 · Javernand 1 · Pouilly Fumé 2 · Rully 1er cru 3 · Saint-Romain 4 · Hautes-Côtes de Nuits 2 | 4 étagères, 4/6 (2 désignations fausses) | true | 4 (œil : 4) | Bouteille Pouilly Fumé (2 · haute) · Bouteille Chablis (1 · haute) · Bouteille Château de Javernand (1 · haute) · Bouteille La Pucelle Puligny (3 · moyenne) · Bouteille Saint-Romain (4 · moyenne) · Bouteille Les Pierres Blanches Côte de Beaune (2 · moyenne) |
| IMG_0075.jpeg | meuble à casiers | 8 rangées ; les confitures ORANGE/MANGUE/ABRICOT sont à 7, CITRON/GRIOTTE/FRAMBOISE ÉPÉPINÉE à 6 | 7 annoncées — TOUT décalé de 1 | false | null (œil : 8) | Confiture orange (null · haute) · Confiture mangue (null · haute) · Confiture abricot (null · haute) · Confiture griotte (null · haute) · Confiture fruits rouges (null · haute) · Confiture citron (null · haute) |
| IMG_0171.jpeg | table + niche | la TABLE n'est pas une étagère ; la niche porte 2 rangées — planches et couvercles posés sur la table ⇒ null | 3 annoncées, table comptée comme étagère 1 | true | 2 (œil : 2) | Casseroles inox Cristel 1826 Collection (2 · haute) · Faitouts et poêles inox Cristel (1 · haute) · Planches à découper en bois Teak (null · haute) · Couvercles en verre (null · moyenne) · Casseroles inox empilées (null · moyenne) · Présentoir catalogues Cristel (null · basse) |
| IMG_0128.jpeg | vue large de la salle | aucune position : quatre meubles différents dans le cadre | 6 articles positionnés, mis à null par la porte | false | null (œil : —) | Bouteilles de bière artisanale (null · haute) · Bouteilles de vin (null · haute) · Poteries et céramiques décoratives (null · haute) · Statue de cheval en résine (null · haute) · Cartons d'emballage empilés (null · haute) · Bocaux et conserves (null · moyenne) |

## Ce que la re-mesure dit

**LE DÉFAUT EST FERMÉ.** Les deux cas qui rendaient un numéro FAUX n'en rendent plus du tout :
- IMG_0075 (casiers) annonçait 7 rangées au lieu de 8 et décalait tout d'un cran. Le bas du meuble
  n'étant pas dans le cadre, il répond maintenant `base_visible: false` et ne positionne rien.
- IMG_0171 (table + niche) comptait la TABLE comme l'étagère 1. Il répond maintenant **2 étagères** —
  la niche — et met à `null` les planches et les couvercles posés sur la table. C'est exactement la
  règle, et c'est ce que l'œil voit. Les deux positions rendues (Cristel 2, faitouts 1) sont justes.
- La vue large de la salle (IMG_0128) : `base_visible: false`, aucune position. Inchangé, correct.
- IMG_0121 garde ses quatre étagères et ses positions justes (Chablis 1, Javernand 1, Pouilly Fumé 2,
  Saint-Romain 4). La désignation fautive (« La Pucelle Puligny » pour un *Rully*) est toujours là :
  elle ne relève pas de la hauteur, elle attend l'accrochage à un `item_code`.

**ET LE PRIX EST LOURD, IL FAUT LE DIRE EN PREMIER.** IMG_0114 et IMG_0104 — les deux photos où le
modèle plaçait **11 articles sur 11 justes** — répondent aujourd'hui `base_visible: false` et ne
rendent plus aucune position. Le modèle a raison : leur rangée du bas est coupée par le bord, le bas
du meuble n'est pas dans le cadre. La lecture est honnête, et on perd onze positions qui étaient
bonnes.

Bilan : **2 photos sur 6 rendent une hauteur, contre 5 sur 6 avant** — mais les 5 d'avant
comprenaient deux jeux de numéros faux, et aucun des trois autres n'était comparable d'une photo à
la suivante. On échange du volume contre un numéro qui veut dire quelque chose.

## La conséquence, et elle ne se code pas ici

Sur une photo de magasin prise à hauteur d'homme, le bas d'un meuble est très souvent coupé. Si
rien ne change au CADRAGE, la hauteur ne sera presque jamais lue.

Le contre-coup est simple et il tombe au bon moment : **`analytics.dispositif_photos` compte 0 ligne,
sur tous les sites.** Aucune photo n'est perdue, parce qu'il n'y en a aucune. La marche du Relevé de
l'espace guide déjà l'exploitant composant par composant — c'est là, et seulement là, que se règle le
cadrage : demander le meuble ENTIER, du sol au-dessus.

C'est une CHAÎNE VISIBLE : elle ne s'improvise pas (CLAUDE.md § copie, règles 4 et 8). Elle se
soumet à l'owner avec les chaînes déjà approuvées de l'écran, elle ne s'écrit pas ici.
