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

## 2. Le rail d'envoi d'un Rapport — AUCUN CODE À ÉCRIRE, il n'a jamais été vu tourner

**Vérifié le 13/09 en suivant le chemin entier** : la chaîne est complète et sans trou. Le formulaire
« Envoyer chaque… » de la page Rapports POSTe `/api/explorer/envois`, qui valide et écrit la cadence
(`newScheduleRow` + `writeSchedule`) ; le cron `api/cron/report-sends` tourne à l'heure (cron-job.org,
enregistré sur dev le 13/09), compose le Rapport depuis son Modèle sans la boucle, l'envoie par courriel
HTML ou Slack, et le trace dans `report_sends` — un rapport sans matière ne part pas mais se trace, pour
ne pas insister le même jour. Le rejeu de la même heure n'envoie rien de plus. Tests : `envois.test.ts`.

- **Ce qui manque n'est donc pas du code, c'est une cadence ACTIVE.** Au dernier relevé (13/09) : un seul
  envoi depuis toujours (l'essai du 12/09) et la seule cadence créée a été désactivée 27 secondes après.
  **Re-relevé le 14/09, INCHANGÉ** : 1 envoi (12/09 21:26), 1 cadence, état courant INACTIF. Piège à
  connaître : `report_schedules` est append-only VERSIONNÉE — un `COUNTIF(actif)` brut compte les versions
  périmées et rend « 1 active » alors qu'il n'y en a aucune. L'état se lit sur la DERNIÈRE version par
  `schedule_id` (ROW_NUMBER), jamais sur la table nue.
  Le cron n'a rien à faire, et le rail n'a jamais été vu partir seul.
- **Le geste** : sur la page Rapports, « Envoyer chaque… » sous un Modèle, cadence quotidienne à la
  prochaine heure ronde. `GET /api/cron/report-sends?dry=1` (en-tête `Bearer CRON_SECRET`) liste ce qui
  est dû sans rien envoyer : c'est la façon de voir l'état sans attendre.
- **Preuve exigée** : un envoi parti SANS clic, sa ligne dans `report_sends`, et le passage suivant du
  cron qui ne renvoie pas.
- **Décision owner** : un PDF en pièce jointe est-il attendu ? Il n'en existe aucun aujourd'hui.

## 3. L'outil de capture — il EXISTE et il n'a jamais écrit une ligne

- **Existe** (14/09) : « Documenter » dans Piloter ouvre l'appareil photo SANS page intermédiaire
  (`public/js/photo-capture.js` — la navigation perdait le geste utilisateur que le navigateur exige),
  pose deux questions et deux seulement (le pôle, puis le composant), et POSTe.
- **Le rail est VÉRIFIÉ, sans téléphone** : `tools/harness/capture-rail-verify.mts` — 7 pôles, 52
  composants, tous nommés et avec leur clé. Rien ne bloque l'écriture côté contexte.
- **Manque, et c'est tout ce qui manque** : QU'UNE PHOTO SOIT PRISE. `analytics.dispositif_photos` compte
  **0 ligne, sur tous les sites** (mesuré le 14/09). Aucune surface qui dépend d'une photo n'a donc jamais
  été vue rendre : ni le volet « Voir la photo précédente », ni le versionnage par la photo, ni les
  articles reconnus, ni le périmètre déduit d'une photo confirmée.
- **Filet posé AVANT le test** (14/09) : `tools/oneoff/2026-09-14-supprimer-photos-test.mts` défait une
  photo de test entièrement (ligne, image + 2 variantes, et la version née avec ses mesures recopiées).
  Blanc par défaut, refuse de toucher une version 1. Prouvé sur lignes factices : 0/93/118 → 1/94/119 →
  0/93/118. À SUPPRIMER après le nettoyage.
- **Preuve exigée** : deux photos du même composant sur le pôle Caisse (le plus petit CA, donc la version 2
  la moins gênante si elle naît) — elles prouvent le rail ET le volet des précédentes d'un coup.
- **Décision owner, toujours ouverte** : `tools/proto/releve-espace-proto.html` (l'outil de PARCOURS, qui
  n'écrit rien) sert-il encore, ou le geste par composant suffit-il ?

## 3 bis. La page d'un pôle — quatre sections sur cinq PROUVÉES, une non

Les cinq points du plan du 14/09 sont codés et poussés. Ce qui les sépare :

- **Prouvé sur f10c3e58, les 7 pôles** (`tools/harness/pole-page-verify.mts`, le vrai endpoint → le vrai
  kit) : l'espace, la comparaison aux autres pôles, la décomposition (volume, panier, mix) et le plan au
  sol avec le pôle courant contouré. 0 nombre mal formaté, 0/7 hors budget (le plus lent 1 710 ms).
- **NON prouvé** : le volet des photos précédentes (§ 3 — il n'existe aucune photo).
- **Reste ouvert, dans l'historique du dispositif, et atteignable par PERSONNE aujourd'hui** : les 7 pôles
  sont en version 1, donc « Historique du dispositif » ne s'affiche sur aucun. Les deux trous qui y vivent
  — l'historique qui ne commence qu'à la v2, et le « + N autres » qui ne mène nulle part — n'ont donc
  aucune urgence : ils s'ouvriront le jour où une version 2 existera.
- **À MESURER, non fait** : une écriture dans `analytics` invalide le cache BigQuery et fait monter la
  page suivante à **5 522 ms** (mesuré le 14/09, budget dur 3 s), avant de redescendre à 1,4-2,6 s. C'est
  exactement le moment où l'exploitant vient d'agir. Non mesuré : ce que ça coûte en conditions réelles
  (Vercel, après une photo au téléphone) et s'il faut l'amortir.

## 4. Les quatre élicitations de `prompt.ts` (spec Explorer § 7, point 6)

- **Existe** : le mécanisme, livré le 13/09 — le bloc `clarification` rendu par les outils à qui il manque
  une entrée (`lire_operation_famille`, `lire_ventes`).
- **Fait le 13/09** : `lire_engagements` — le journal entier (cartes de pôles et d'opérations datées, faits
  de prose, jours à venir, un geste où la contre-indication prime). `_engagements_v1` et
  `_engagements_elicit_v1` sont TOMBÉES avec leur couche ; `prompt.ts` perd 106 lignes.
- **Fait le 13/09 aussi** : `lire_entite_periode` — un pôle, une famille, une opération ou une personne sur
  une période, la comparaison en table pour plusieurs entités ou deux périodes, et l'entité inconnue qui
  rend les entités RÉELLES du site en puces. Trois sorties tombent d'un coup (`_entity_period_v1`,
  `_entity_compare_v1`, `_entity_period_elicit_v1`).
- **Manque** : UN outil, `comparer_journees` (comparaison de journées v3), dont dépend
  `_missing_dates_v1`. La dernière élicitation (`_missing_dimension_elicit_v1` : stock, personnel, CA par
  client) n'a ni donnée ni outil — elle RESTE une élicitation, et c'est la bonne réponse.
- **Les deux couches sont PROUVÉES le 14/09 : batterie 23 cas, 0 échec.** Le journal rend enfin ce qu'il
  doit rendre — `headline`, `datecards` (les cartes de pôles), les faits, le geste, les sources — et la
  question composée appelle bien les DEUX outils. L'entité sur une période rend sa table.
  **Trois défauts trouvés et fermés en chemin, tous les trois par la batterie et aucun deviné** :
  (a) la batterie recopiait les dépendances de la route au lieu de les réutiliser, donc les outils neufs
  n'avaient pas leurs lectures (`deps.runEntitePeriode is not a function`) — elle prend maintenant
  `agentTurn.agentDeps` et n'override que ce qui lui est propre ;
  (b) **`tsconfig.json` n'incluait pas `tools/`** : aucun `tsc` n'avait jamais regardé les batteries ni les
  harnais, et une liste de dépendances incomplète y passait sans un mot. `tools` est dans `include`, les
  sept erreurs révélées sont corrigées ;
  (c) la question du plan coloré rendait son registre en `model` : elle demande une marge par MÈTRE quand
  `lire_plan` ne teintait que par m², ce qui forçait une jointure de plus. Le plan teinte désormais par
  mètre, et sa description ne prétend plus remplacer le classement chiffré.
  **Trois gardes posés pour que ces fautes se nomment seules la prochaine fois** : une porte `rendu` (une
  réponse dont aucun outil ne rend de bloc ÉCHOUE, quelles que soient les autres portes), une colonne
  « pourquoi » (message d'échec de l'outil, phrases retirées par la relecture), et le CLASSEMENT de chaque
  nombre non fondé — rendu dans un bloc sans être déclaré en fait (défaut d'outil) ou absent des blocs
  (calculé par le modèle). Les deux fautes sont opposées et leur remède aussi.
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
2. **La cadence d'envoi** (§ 2) — un geste sur la page, puis l'attente du cron. Ça court pendant le reste.
3. **L'étagère par article** (§ 1) — l'étape 1 est FAITE (13/09) ; l'étape 2a (le modèle lit-il juste ?) se
   tranche à l'œil sur la sonde du matin et ne coûte rien ; l'étape 2b et l'étape 3 attendent les ventes
   d'Épices et Tout.
4. **Les trois outils d'Explorer** (§ 4) — le plus gros, et le seul qui ferme la spec. À ne commencer que
   quand la batterie peut tourner dans la même session que le code.
5. **Décisions owner** : l'outil de capture (§ 3), le mot « Partager » (§ 5), le PDF d'un envoi (§ 2), les
   destinataires au-delà de l'équipe (spec Explorer § 10.3).
