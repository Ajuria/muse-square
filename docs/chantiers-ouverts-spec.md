# Les chantiers ouverts — ce qui est commencé et non fini — SPEC DE TRAVAIL

Sert : `docs/intent.md` § Le test de valeur — un chantier à moitié fait ne vaut rien pour l'exploitant,
et deux chantiers à moitié faits valent moins qu'un seul fini.

Écrit le 13/09/2026, à la demande de l'owner : « il faut finir ça proprement et continuer avec le plan
pour finir de coder tout ce qui a été fait à moitié depuis 2 jours ». Ce document se lit AVANT de choisir
quoi coder. **Un chantier fermé s'EFFACE d'ici** (il vit alors dans `docs/module-index.md` et dans son
propre document) ; un chantier qui s'ouvre s'y ajoute le jour où il s'ouvre.

**La règle qui gouverne ce document** : « livré » veut dire atteignable depuis la surface que l'owner
ouvre, et rendu, prouvé par une capture (CLAUDE.md § Verify Before Done). Un test vert prouve une
fonction, jamais une livraison. Chaque ligne ci-dessous dit donc séparément **ce qui existe**, **ce qui
manque**, et **la preuve exigée**.

---

## Fermés le 13/09 — il ne reste que la preuve par l'owner

Ces deux-là étaient les points 1 et 2 du plan du matin. Le code est écrit, les tests ont été vus rouges
par mutation (4/4), rien n'est réputé livré tant que l'owner n'a pas ouvert la page.

### La version suivante d'un pôle, et la question au composant

- **Existe** : le volet « La version suivante » sur la page d'un pôle (formulaire de pôle pré-rempli avec
  la version courante, ses composants, leurs clés et leurs mesures) ; le versionning AUTOMATIQUE quand la
  photo d'un composant montre un écart franc (familles, exposition, étagères — `photoChangement.ts`) ;
  la question « Qu'avez-vous changé ? » au composant, dont la réponse devient la note de la version ; la
  note rendue dans l'historique sous la ligne de sa version.
- **Preuve exigée** : ouvrir un pôle sur dev, « Documenter → » un composant avec une photo qui change ses
  familles, voir naître la version suivante avec sa phrase et sa question, puis la retrouver dans
  l'historique avec sa photo et sa note.

### Le nom d'une photo dans l'app

- **Existe** : une seule grammaire de légende (identité, version, date), trois densités (vignette, bande,
  photo ouverte), le nom court en vignette et l'identité complète au survol.
- **Reste ouvert en face** : voir « L'outil de capture » ci-dessous — tant qu'il n'écrit rien, il n'y a
  rien à aligner.

---

## 1. L'étagère par ARTICLE — le gain n'existe toujours pas

**C'est le plus gros écart entre ce qui est mesuré et ce qui sert.**

- **Existe** : le mot « étagère » (owner 13/09) ; la restriction levée (les étagères se comptent sur TOUT
  composant qui en porte, pas seulement un rayonnage) ; le nombre d'étagères du composant lu, stocké
  (`dispositif_photos.levels`) et affiché sur la photo ; depuis le 13/09, un changement de ce nombre fait
  naître une version.
- **Manque, et c'est le gain lui-même** : l'étagère de CHAQUE ARTICLE. La lecture de production
  (`photoExtraction.ts`) rend `items: [{ item_code, confidence }]` — des codes de la liste vendue du site,
  **sans leur étagère**. La sonde du 13/09 (30 photos sur 235, 30/30 lectures abouties, 25 composants avec
  étagères, 171 articles positionnés dont 102 en confiance « haute ») a bien demandé la position article
  par article, mais avec une consigne LIBRE : elle a rendu des désignations en toutes lettres
  (« Bocaux et pots de condiments sur étagère »), pas des `item_code`. Une désignation libre ne se croise
  avec aucune vente.
- **Le travail, dans cet ordre** :
  1. ~~Ajouter `etagere` à chaque article de la lecture de production~~ — **FAIT le 13/09** : schéma
     (`etagere` exigé, entier ou null), consigne (« EN PARTANT DU BAS … ne devine jamais une étagère »),
     porte (la position est bornée par le nombre d'étagères du composant ; hors bornes ou composant sans
     étagères comptées ⇒ `null` — on perd la position, jamais la photo), et la route écrit désormais les
     articles NORMALISÉS par la porte. Aucune migration : `items_matched` est du JSON.
  2. **À FAIRE — et la mesure se DÉDOUBLE, parce que deux questions différentes s'y cachaient.**
     **(2a) Le modèle lit-il juste une position ?** Cette question se tranche AUJOURD'HUI, sans donnée
     nouvelle : la sonde du matin porte 171 positions sur 30 photos réelles, avec leur photo et leur
     confiance (`data/shots/mesure-lecture-etageres-2026-09-13.md`). Ouvrir une dizaine de ces photos et
     dire si la rangée annoncée est la bonne. C'est ce verdict qui autorise la suite, et il ne coûte rien.
     **(2b) Cette position s'attache-t-elle à un article VENDU ?** Là, il faut un magasin qui ait à la fois
     les photos ET ses ventes — et aucun ne l'a. Les photos sont celles d'Épices et Tout
     (`a3b442c2-…`), dont l'audit du 11/09 relève qu'il n'a encore aucune vente ingérée ; le compte de test
     (`f10c3e58-…`) a des ventes, mais ce ne sont pas celles du magasin photographié. Lancer
     `npx tsx tools/oneoff/2026-09-13-mesure-etagere-par-article.mts --location=a3b442c2-e7e5-43e8-b969-7b78e6c24bb0`
     s'arrête net et dit pourquoi. **Ce chantier est donc bloqué par l'ingestion des ventes d'Épices et
     Tout, pas par du code** — la même attente que les prix d'achat (§ 6).
  3. Seulement ensuite, croiser la position avec la marge par article
     (`mart.fct_client_sales_lines_margin`) et décider s'il y a une carte à écrire.
- **Preuve exigée** : le taux de position juste, mesuré à l'œil sur un sous-échantillon, AVANT d'écrire la
  moindre chaîne qui parle de hauteur. Une position fausse ferait dire une bêtise à une carte, et c'est
  pire que pas de carte.

## 2. Le rail d'envoi d'un Rapport — jamais prouvé de bout en bout

- **Existe** : `report_schedules`, `report_sends`, le cron horaire, le courriel HTML rendu par le kit,
  « Envoyer chaque… » et « Vos envois » sur la page Rapports.
- **Manque** : une cadence ACTIVE. Au dernier relevé (13/09) : un seul envoi depuis toujours (l'essai du
  12/09) et la seule cadence créée a été désactivée 27 secondes après. Le cron n'a donc rien à faire, et
  le rail n'a jamais été vu tourner seul.
- **Le travail** : créer une cadence sur le compte de l'owner, attendre son heure, vérifier l'envoi et la
  trace anti-doublon. Décider ensuite si un PDF est attendu en pièce jointe (il n'en existe aucun).
- **Preuve exigée** : un envoi parti SANS clic, sa ligne dans `report_sends`, et le second passage du cron
  qui ne renvoie pas.

## 3. L'outil de capture de l'espace — un proto, rien de plus

- **Existe** : `tools/proto/releve-espace-proto.html`. Il ne nomme aucun composant et n'écrit rien en base.
- **Manque** : tout ce qui en ferait une surface — une page de l'app, l'écriture des photos, le nom composé
  (type + famille reconnue) produit à la capture.
- **À noter** : depuis le 03/09, « Documenter → » sur la page d'un pôle prend déjà une photo au téléphone et
  l'écrit. La question ouverte est donc : cet outil de parcours sert-il encore, ou le geste par composant
  suffit-il ? **Décision owner attendue avant d'écrire une ligne de code.**

## 4. Les quatre élicitations de `prompt.ts` (spec Explorer § 7, point 6)

- **Existe** : le mécanisme, livré le 13/09 — le bloc `clarification` rendu par les outils à qui il manque
  une entrée (`lire_operation_famille`, `lire_ventes`).
- **Manque** : les quatre sorties restent, parce que chacune est la fin honnête d'un chemin qui n'est pas
  rentré dans le registre. Les retirer aujourd'hui enverrait ces questions à un agent sans outil pour
  elles. Il manque trois outils : `comparer_journees` (comparaison de journées v3), `lire_entite_periode`
  (un pôle ou une famille sur une période), `lire_engagements` (le journal des engagements). Le quatrième
  cas (stock, personnel, CA par client) n'a ni donnée ni outil : il RESTE une élicitation.
- **Preuve exigée** (celle de la spec, inchangée) : pour chaque couche, sa question de référence dans la
  batterie, une réponse de l'agent jugée équivalente ou meilleure, et le retrait de la couche dans le MÊME
  commit. Écrire l'outil sans pouvoir lancer la batterie, c'est fabriquer un chantier de plus à moitié fait.

## 5. « Partager » — un mot qui n'existe pas

Le geste est cité dans les échanges, il n'est ni au lexique, ni dans une spec, ni dans le code. **Concept
sans mot ⇒ demander LE mot à l'owner, ne jamais improviser** (CLAUDE.md § copie). Rien à coder avant.

## 6. Les prix d'achat réels d'Épices et Tout — bloqué hors du code

L'export détaillé et les prix d'achat ne sont pas reçus. La chaîne marge tourne sur des prix
vraisemblables semés sur le compte de test ; elle ne dira la vérité d'Épices et Tout qu'avec les siens.

---

## L'ordre proposé

1. **La preuve par l'owner** des deux chantiers fermés aujourd'hui (versionning par la photo). C'est le
   moins cher et c'est ce qui décide si on continue ou si on corrige.
2. **La cadence d'envoi** (§ 2) — une écriture, puis l'attente du cron. Ça peut courir pendant le reste.
3. **L'étagère par article** (§ 1) — l'étape 1 est petite et sans migration ; l'étape 2 est une mesure, pas
   du code ; l'étape 3 ne s'ouvre que si la mesure tient.
4. **Les trois outils d'Explorer** (§ 4) — le plus gros, et le seul qui ferme la spec. À ne commencer que
   quand la batterie peut tourner dans la même session que le code.
5. **Décisions owner** : l'outil de capture (§ 3), le mot « Partager » (§ 5), le PDF d'un envoi (§ 2), les
   destinataires au-delà de l'équipe (spec Explorer § 10.3).
