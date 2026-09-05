# Le site actuel et les contraintes de format

## 1. Périmètre du chantier

À réécrire : **la page d'accueil** et **la page plateforme** (`/offres`, libellée « Plateforme » dans la navigation).
`/solutions` est une page de l'ère conseil, orpheline de la navigation et en HTML cassé — elle sera supprimée, pas réécrite.

## 2. Ce qui est en ligne aujourd'hui — texte exact

### Page d'accueil

- **Titre de l'onglet** : « Muse Square — Copilote opérationnel »
- **Meta description** : « Muse Square est le copilote opérationnel des entreprises dont le chiffre d'affaires dépend de la fréquentation. »
- **H1 (sur bannière pleine largeur, texte blanc sur photo assombrie)** : « Le copilote opérationnel de votre entreprise »
- **Accroche sous le H1** (max ~560 px de large, 20 px) : « Muse Square transforme vos signaux contextuels et opérationnels en leviers d'actions — et les livre à vos équipes. »
- **Deux boutons** : « Découvrir la plateforme » → /offres · « Nous contacter » → /contact

**Trois tuiles** (titre ~22-24 px + 2 lignes, chacune sous une icône ronde, CTA « Voir nos solutions ») :
1. « Pilotez votre activité » — « Voyez chaque jour ce qui impacte votre activité: vos données internes croisées avec vos signaux contextuels. »
2. « Planifiez vos temps forts » — « Trouvez la meilleure fenêtre pour vos temps forts: opération commerciale, ouverture, événement. »
3. « Exploitez vos données » — « Obtenez des réponses sourcées à vos questions opérationnelles, basées sur vos données et votre contexte régional. »

**Bloc preuve 1** — titre « Du signal à l'action, chaque matin » + 2 paragraphes (exemples concurrent/pont férié/tramway).
**Bloc preuve 2** — titre « Détectez, agissez, automatisez. » + 2 paragraphes.
**Bloc segments** — titre « Pour toutes les organisations qui accueillent des clients ou des vsiteurs » *(faute de frappe en production : « vsiteurs »)*, puis trois cartes : Retail & marques / Événementiel / Lieux culturels & festivals, chacune avec un persona, 3 étiquettes et un paragraphe de douleur.

**Témoignages** (carrousel, authentiques, à conserver) :
> « Grâce à Muse Square, nous avons enfin pu anticiper les journées à risque pour programmer nos événements. C'est devenu un outil de pilotage quotidien pour notre équipe. » — L'équipe de Costières de l'Art, Festival d'Art Contemporain

> « Muse Square Insight nous a aidé à identifier les jours porteurs pour nos ventes de fin d'année et notre braderie 2026. Un atout précieux pour notre entreprise familiale. » — Les Olivades, Imprimeur et éditeur de tissu, entreprise du patrimoine vivant

### Page plateforme (`/offres`)

- **H1 sur bannière** : « Détectez, agissez, automatisez. »
- **Accroche** (max ~720 px) : « Veille opérationnelle, réponses prêtes à exécuter et distribution aux bonnes personnes — sur chaque site, chaque jour. »
- **« Comment ça marche ? »** — 4 paragraphes en gras-puis-texte : *Votre veille* / *Vos actions et leur automatisation* / *Vos événements et vos questions* / *Vos décideurs*.
- **Section PLANIFIER** — « Anticipez avant de vous engager » + 3 étapes numérotées avec capture (Explorer / Sélectionner / Comparer).
- **Section PILOTER** — « Suivez vos risques chaque jour » + 2 blocs texte/image.
- **Section ALERTES** — « Restez informé sans ouvrir l'application » + 3 encarts.
- **Section INTELLIGENCE ARTIFICIELLE** — « Notre approche de l'IA » + 3 colonnes (Data-driven / Vérifiable / Rigoureuse).
- **Section « Les 4 signaux de risque »** — 4 cartes (Concurrence événementielle / Mobilité / Calendrier contextuel / Météo), chacune avec un paragraphe et 2 exemples de phrases produit.
- **CTA final** — « Vous avez des besoins spécifiques ? » + paragraphe + mention de couverture beta.

## 3. Ce qui va bien et ne doit pas être perdu

- La section **« Comment ça marche ? »** de `/offres` est la meilleure page du site : concrète, séquencée, sans jargon.
- **« Cinq actions priorisées vous attendent. Pas vingt. »** — exact et différenciant.
- **« Vous vérifiez, vous décidez. »** et **« La fiabilité avant l'exhaustivité »** — bonne formulation de l'argument de confiance.
- Les **exemples nommés** (« Ligne de tramway coupée ? », « Travaux sur la ligne 4 du métro », « Fashion week — pas d'impact sur clientèle professionnelle ») : c'est ce niveau de concret qu'il faut généraliser.
- Les deux témoignages.

## 4. Défauts identifiés

- **« Copilote » est mort comme différenciateur** (Microsoft l'a rendu générique ; en France la recherche renvoie Microsoft 365 et un ERP agroalimentaire installé depuis 1982).
- Les trois tuiles de la home sont des abstractions de l'ère conseil (« Pilotez votre activité »), plus faibles que le produit réel.
- La home vise **quatre acheteurs à la fois** — c'est la cause mécanique de l'abstraction : un texte qui doit couvrir quatre lecteurs ne peut employer que des noms génériques.
- Le CTA des tuiles dit « Voir nos solutions » alors que la navigation dit « Plateforme ».
- Faute en production : « vsiteurs ».
- Répétition : « Détectez, agissez, automatisez. » sert à la fois de titre de bloc en home et de H1 sur `/offres`.

## 5. Contraintes de format à respecter dans la copie livrée

| Emplacement | Contrainte |
|---|---|
| H1 de bannière | Texte blanc sur photo assombrie. Doit rester lisible court : **une ligne sur desktop**, ~45-60 caractères. |
| Accroche sous H1 | 20 px, largeur max 560 px (home) / 720 px (offres) → **1 à 2 lignes, ~140-200 caractères**. |
| Titre de tuile | 22-24 px, ~2-4 mots. |
| Corps de tuile | **2 lignes maximum.** |
| Titre de section | ~24-26 px, une ligne. |
| CTA | **Un verbe, ≤ 14 caractères** (règle du lexique). |
| Dates | Toujours **JJ/MM/AAAA**. Jamais AAAA-MM-JJ ni MM/JJ/AAAA. |
| Nombres et devise | Format français : virgule décimale, **€ après le nombre** (1 221 €). |
| Jours de semaine | En toutes lettres (« votre jeudi habituel »). |
| Emoji | **Interdits.** |
