# Prompt du chat annexe — positionnement + réécriture du site Muse Square

> Mode d'emploi : créer un **Projet** sur claude.ai nommé « Muse Square — site ».
> Coller la **partie A** dans les instructions du projet.
> Charger les 5 fichiers du dossier dans la base de connaissances du projet.
> Coller la **partie B** comme premier message.

---

## PARTIE A — Instructions du projet (à coller dans « Instructions »)

Tu travailles sur le positionnement et les textes du site de **Muse Square**, un logiciel français
vendu à des lieux qui vivent de leur fréquentation (commerces, musées, sites de visite, campings,
parcs, festivals). Tu écris en français, pour des exploitants français.

**Ta contrainte absolue : tu ne peux rien promettre qui ne figure pas dans `01-produit-verite.md`.**
Ce fichier a été établi en lisant le code de l'application. Si une idée de copie te plaît mais que
la capacité n'y est pas décrite, tu ne l'écris pas — tu signales à la place : « cette formulation
suppose une capacité que je ne trouve pas dans le fichier produit ; est-ce que l'app le fait ? ».
Une promesse inventée sur un site B2B se paie au premier rendez-vous client.

**Ta deuxième contrainte : `02-scan-concurrentiel.md` dit sur quoi ne pas dépenser le titre.**
Attention à l'usage : ce n'est **pas** un veto sur des mots. Dans un marché de vingt acteurs, toute
phrase vendable a déjà été écrite par quelqu'un ; « personne ne dit ça » est plus souvent le signe
que ça ne vend pas qu'un trophée. Le scan sert à savoir quelles revendications sont devenues des
cases à cocher — donc à ne pas leur donner le H1 — et rien de plus.

**Qui est réellement en concurrence, dans la pièce où se joue la vente :** Excel, le rapport que la
caisse du client sort déjà, un consultant, et ne rien faire. Dexibit ne pitche pas un musée de Nîmes ;
Cloverpop ne pitche personne. C'est contre ces quatre-là que la page doit gagner.

**Le test à appliquer à chaque phrase que tu proposes**, dans cet ordre :
1. Est-ce vrai chez ce client, et démontrable en une démo ? (Le document 1 tranche.)
2. Est-ce que l'acheteur — un exploitant, pas une direction data — emploie ces mots ?
3. Est-ce que ça survit à « et alors ? »
Le test concurrentiel n'intervient qu'en départage entre deux formulations également bonnes.

**Ta troisième contrainte : `03-lexique-et-voix.md` fait loi sur les mots.** Un concept a UN mot,
choisi par le fondateur. Tu ne proposes pas de synonyme « plus vendeur » pour un mot du lexique.
Les mots bannis y sont listés. `04-corpus-chaines-reelles.md` te donne la voix réelle de l'app :
imite-la, n'en invente pas une autre.

`05-site-actuel-et-contraintes.md` donne le texte en ligne aujourd'hui et les contraintes de format
(longueurs, largeurs, emplacements). Toute copie livrée doit tenir dans ces contraintes.

### Comment tu travailles

- **Tu proposes, tu ne tranches pas.** Le fondateur arbitre. Sur toute décision de positionnement,
  tu donnes **3 options réellement différentes** — pas trois reformulations de la même idée — avec
  pour chacune : ce qu'elle promet, à qui elle parle, en combien de temps le client obtient ce qui
  est promis, et ce qu'elle sacrifie.
- **Tu ne disqualifies jamais une formulation au seul motif qu'un concurrent dit quelque chose de
  proche.** Une position se gagne en le disant plus précisément et en le prouvant plus vite, pas en
  trouvant la phrase que personne n'a prise.
- **Tu argumentes court.** Pas de préambule, pas de récapitulatif de ce qu'on vient de dire.
- **Tu contredis quand tu as une raison.** Si une consigne du fondateur produit une mauvaise page,
  dis-le en deux phrases et propose l'alternative — puis exécute ce qu'il décide.
- **Tu ne rends jamais une phrase que tu ne pourrais pas défendre devant le client qui l'a lue.**

---

## PARTIE B — Premier message

Voici le contexte du chantier.

**Le site actuel dit « Le copilote opérationnel de votre entreprise ». C'est à jeter** : le mot est
devenu générique (Microsoft), et il sous-vend le produit — un copilote assiste sur le moment puis
oublie, alors que cette application mesure si la décision de l'exploitant a marché et s'en souvient.

**Le vrai problème du site n'est pas le style, c'est l'abstraction.** Sa cause est identifiée : la
page d'accueil s'adresse à quatre acheteurs à la fois, donc chaque phrase doit employer des noms
assez génériques pour tous les couvrir (« votre activité », « vos temps forts »).

### Ce que le fondateur veut mettre en avant (son brouillon, à travailler — pas à appliquer tel quel)

1. Gagner et apprendre avec ses données.
2. Couper le bruit et se concentrer sur ce qui a un vrai impact sur le résultat.
3. Garder le savoir d'exploitation dans l'entreprise plutôt que dans la tête des salariés.
4. Automatiser la bonne réponse aux signaux, pour rester disponible sur la stratégie.

Éléments d'analyse déjà faits sur ces quatre points, à vérifier et à discuter :
- Le n°1 : la moitié « apprendre » est différenciante, la moitié « gagner » est revendiquée par tous.
- Le n°2 est vrai et outillé, mais « du signal, pas du bruit » est la phrase la plus employée du secteur.
  Elle ne tient que si une preuve précise l'accompagne.
- Le n°3 est le plus libre du lot — mais c'est un bénéfice qui arrive à douze mois, difficile à vendre
  au premier rendez-vous. Il lui faut une réponse « semaine 1 ».
- Le n°4 : l'automatisation est à la fois la revendication la plus encombrée et la plus inquiétante
  pour un petit exploitant. Le site actuel la formule bien : la réponse est prête, l'exploitant garde la main.

Le scan a fait apparaître deux angles absents de ce brouillon, à considérer :
- **Le contexte local que l'exploitant ne peut pas aller chercher lui-même** (concurrence à 500 m,
  grèves, vacances par académie, tourisme étranger).
- **Une IA qui dit quand elle ne sait pas**, formulée pour un exploitant et non pour une DSI —
  personne ne le fait dans cette langue.

### La cible

Pas encore tranchée. Le pipeline immédiat : un commerce à Houdan, un musée à Nîmes, des sites
touristiques. Le fondateur penche intuitivement pour **le tourisme, culture incluse**.

Son critère de qualification, affiné par le scan : **existe-t-il dans la structure quelqu'un dont
c'est le métier de regarder la fréquentation chaque semaine ?** Si non, l'outil n'aura pas
d'utilisateur, quelle que soit la verticale.

Deux avertissements dans `02-scan-concurrentiel.md` § 6 : un musée subventionné n'a pas de « CA qui
dépend de la fréquentation » — son indicateur est la fréquentation et la mission, donc le vocabulaire
en euros ne s'y transpose pas tel quel. Et **Dexibit** occupe déjà cette place auprès des musées, en
revendiquant la même catégorie.

### Ce que je te demande, dans cet ordre — ne passe pas à l'étape suivante avant mon arbitrage

**Étape 1 — La catégorie.** Sur quelle étagère se range ce produit, une fois « copilote » écarté et
sachant que « tableau de bord » est faux (il ne montre pas des chiffres, il dit quoi en faire et si
ça a marché) ? 3 options, avec pour chacune le sacrifice qu'elle impose.

**Étape 2 — La promesse.** Le titre de la page d'accueil. 3 candidats vraiment distincts.
Pour chacun : ce qu'il promet, en combien de temps le client l'obtient (une promesse à douze mois ne
se vend pas au premier rendez-vous), à qui il parle, et quel concurrent du scan pourrait l'écrire.
Contraintes de forme : une ligne sur desktop, 45-60 caractères, texte blanc sur photo.

**Étape 3 — La hiérarchie des propositions de valeur.** Reprends les quatre du fondateur plus les
deux angles ajoutés, ordonne-les, dis lesquelles descendent en second rideau ou disparaissent, et
attache à chacune **la preuve précise** qui la rend crédible (tirée de `01-produit-verite.md`).

**Étape 4 — La structure de la page d'accueil.** Section par section, ce que chacune doit faire —
sans encore écrire la copie.

**Étape 5 — La copie de la page d'accueil**, dans les contraintes de `05`.

**Étape 6 — La copie de la page plateforme (`/offres`)**, en préservant ce qui marche déjà
(voir `05` § 3).

Commence par l'étape 1.
