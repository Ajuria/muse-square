# Le modèle lit-il juste une étagère ? — verdict du 15/09/2026

C'est l'étape 2a de `docs/chantiers-ouverts-spec.md` § 1 : la sonde du 13/09
(`data/shots/mesure-lecture-etageres-2026-09-13.md`) a rendu 171 positions sur 30 photos réelles
d'Épices et Tout ; RIEN n'y était vérifié. Ici, cinq photos sont OUVERTES et confrontées une à une.
Ce verdict décide si une chaîne a le droit de parler de hauteur.

**Ce qui est jugé** : la position annoncée par le modèle contre ce que la photo montre. Cinq photos
choisies pour couvrir les trois natures de meuble du magasin, plus une vue large en témoin.

| Photo | Meuble | Étagères annoncées | Positions justes | Ce que la photo dit |
|---|---|---|---|---|
| `Cave/Vin & Spiritueux/IMG_0114` | rayonnage droit | 5 | **6 / 6** | Fontagard 2, Bellevoye 2, Glenfiddich 3, Thompson's 3, Hyde 4, Lindores 4 — toutes justes, rangée du bas coupée COMPTÉE. |
| `Epicerie sèche/Concerves/IMG_0104` | rayonnage droit | 5 | **5 / 5** | Confitures 1, flageolets 2, « à emporter » 3, sauces 4, soupes 5 — justes, rangée du bas coupée COMPTÉE. |
| `Cave/Vin & Spiritueux/IMG_0121` | rayonnage droit | 4 | **4 / 6** | Chablis 1, Javernand 1, Pouilly Fumé 2, Saint-Romain 4 justes. Deux DÉSIGNATIONS fausses : « La Pucelle Puligny » est *La Pucelle Rully 1er cru* ; « Hautes-Côtes de Beaune » (2) est *Hautes-Côtes de Nuits* — le Beaune est à l'étagère 4. |
| `Petit déjeuner/Petit déjeuner/IMG_0075` | meuble à CASIERS | 7 | **0 / 6 en absolu, 6 / 6 en ordre** | Huit rangées se comptent ; le modèle en annonce 7 et place tout une rangée trop bas. L'ordre relatif est parfait, le numéro est décalé de 1. |
| `Cuisine/Cuisson/IMG_0171` | table + niche | 3 | **4 / 6 défendables** | La TABLE d'exposition est comptée comme étagère 1. Convention défendable, jamais écrite. |
| `Cave/Vin & Spiritueux/IMG_0128` | vue large de la salle | — | témoin | Le modèle ne compte pas (juste) mais positionne quand même six « articles » répartis sur quatre meubles différents. La porte du 13/09 les met à `null` : elle fait son travail. |

## Verdict

**La position RELATIVE est fiable sur un rayonnage droit : 11 positions sur 11.** Ce n'est pas le
problème.

**Le NUMÉRO ABSOLU ne l'est pas, et c'est lui que le produit veut comparer.** Deux causes, dont la
première est une faute de CONTRAT et pas une faute du modèle :

1. **La consigne indexe depuis le CADRE, pas depuis le MEUBLE.** Elle dit « 1 = la plus basse
   VISIBLE » (`src/lib/ai/photoExtraction.ts`, règle 2). La même étagère photographiée un peu plus
   haut le mois suivant change donc de numéro, sans que rien n'ait bougé dans le magasin. Or tout
   l'intérêt de la mesure est de comparer une position d'une version à l'autre : telle quelle, elle
   fabriquerait des déplacements qui n'ont pas eu lieu.
2. **Même sous sa propre règle, le modèle dérive d'une unité quand la rangée du bas est coupée.**
   Comptée sur IMG_0114 et IMG_0104, ignorée sur IMG_0075. Rien dans la photo ne distingue les
   deux cas.

Et un troisième constat, qui ne porte pas sur la hauteur mais qui tombe avec : **deux désignations
sur douze sont fausses sur une photo de vins** (Rully donné pour Puligny, Nuits pour Beaune). Sur des
étiquettes qui se ressemblent, le modèle nomme à peu près. Pour la position c'est sans conséquence ;
pour l'accrochage à un `item_code`, c'est exactement le risque.

## Ce que ce verdict autorise, et ce qu'il interdit

- **INTERDIT** : écrire la moindre chaîne qui parle de hauteur, de rangée ou de « à hauteur d'œil »,
  et faire naître une version de pôle sur un changement d'étagère. Le numéro n'est pas comparable
  d'une photo à l'autre.
- **AUTORISÉ, et c'est le travail suivant** : corriger le contrat — indexer depuis le BAS DU MEUBLE,
  exiger que le bas du meuble soit dans le cadre pour qu'une position soit rendue (sinon `null`), et
  dire la règle des rangées partielles et des tables d'exposition. Puis re-mesurer sur ces mêmes
  photos : le décalage de IMG_0075 doit tomber, les 11 justes doivent le rester.
- **TOUJOURS BLOQUÉ hors code** : l'étape 2b (une position accrochée à un article VENDU) attend les
  ventes d'Épices et Tout, comme les prix d'achat.
