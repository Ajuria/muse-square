# La marche guidée : documenter le magasin depuis le téléphone (onboarding D6) — SPEC DE TRAVAIL

Sert : `docs/intent.md` § Le métier (la mémoire opérationnelle du lieu : ce que l'exploitant a mis en
place) et § Les objets — le **composant** « porte la PLACE dans le magasin ; un dispositif en a
plusieurs, discontinus s'il le faut ». Prolonge `docs/dispositifs-typologie-spec.md` § 5.1 (D3 : la
marche filmée est un plus ; D6 : les premières photos se prennent à la création du compte) et § 7
(le plan du magasin = l'ordre de passage). Ce document dit COMMENT l'exploitant documente son
magasin en une marche, ce que la page fait pour lui, et ce qui reste à construire.

## 1. Le constat (owner 10/09)

Documenter les dispositifs d'Épices et Tout a coûté **235 photos** (iPhone 17, sans LiDAR — les
capteurs LiDAR sont réservés aux modèles Pro), prises en **61 minutes** (EXIF : 11:01 → 12:02 le
10/09), puis **des heures** de tri en 7 pôles et 31 dossiers de famille, plus un plan d'architecte
1:100 annoté à la main. La marche n'a pas suivi les pôles : 48 séquences contiguës pour 30 dossiers
(le Thé rangé entre deux séries de Service traiteur, Riz & Pâtes au milieu de Cuisine). **Le coût
est le tri, pas la prise de vue.** L'owner : « It will slow adoption and make the use of the app at
its full potential very difficult. »

## 2. Ce qui existe [vérifié 11/09]

- **La route des photos** `src/pages/api/dispositifs/photos.ts` (GET proxy image, POST lecture) et
  la table `analytics.dispositif_photos` (25 colonnes) portent déjà `walk_id`, `seq`, `t_offset_s`
  — les colonnes d'une marche existent, aucune ligne ne les remplit.
- **La lecture v2** (`ai/photoExtraction.ts`, `photo_extract_v2`, 11/09) rend pour toute photo :
  l'exposition (cinq mots owner), les niveaux (rayonnage seulement), les **familles présentes**
  parmi les familles vendues du site, les articles par code, la couverture, et refuse toute image où
  une personne est visible. Le **N° sur le plan** (`fixture_no`) est saisi par l'exploitant à côté de
  « Documenter » sur le document du pôle (`src/pages/app/insightevent/engagement.astro`).
- **Un composant appartient à un dispositif, un dispositif à un pôle** (typologie § 3) ; les
  familles d'un pôle sont les familles réelles de la caisse (`POST /api/commitments` refuse un pôle
  sans `pole_families` ; la liste vient de `kpiRegistry.listSiteFamilies`, donc des ventes importées).
- **L'application est une PWA** (`public/manifest.webmanifest` : `display: standalone`, portrait).
  Rien dans `src/` ni `public/js/` n'ouvre la caméra ; le dépôt de photo passe par un choix de fichier.
- **`src/pages/onboarding.astro`** est un seul écran (« Complétez votre profil » → `/profile`) ; il
  n'a ni étape pôles ni étape photos. L'étape D6 n'existe pas.
- **Le LiDAR est écarté** (typologie § 5.1 et § 7, owner 03/09) ; rien ici ne le rouvre.

## 3. Ce qui a été mesuré le 10/09

Méthode : les 235 photos réduites à 768 px, lues une par une par `callClaudeMessagesAPI` (modèle
du rôle `packager`, Sonnet 5), réponse par **code** de zone (la contrainte d'énumération sur des noms
accentués se lie mal : le modèle décrit « des boîtes de thé » puis choisit « Fruits et légumes » ;
avec des codes, la même convention que les articles au § 5.3, le défaut disparaît). Vérité = le tri
manuel de l'owner. Script et résultats : scratchpad de session, non versionnés.

| Variante | Famille exacte | Bon pôle | Vérité dans les 2 propositions | « haute » : n, dont exactes |
|---|---|---|---|---|
| Choix ouvert parmi les 31 dossiers | 159/235 (68 %) | 196/235 (83 %) | 178/235 | 111, 97 (87 %) |
| Pôle connu, choix parmi ses familles | 163/235 (69 %) | 100 % par construction | **203/235 (86 %)** | **101, 94 (93 %)** |

Les confusions restantes sont entre familles voisines d'un même pôle (Quincaillerie ↔ Îlot varié :
13 ; Vin ↔ Îlot spiritueux : 9) et sur les dossiers fourre-tout (`_Vue d'ensemble`, `Ilot varié`),
qui sont des étiquettes owner, pas des familles de caisse. Jetons par photo : ~640 en entrée,
~1 620 lus en cache (la consigne), ~105 en sortie ; ~6 s par appel. Le plan PDF rastérisé, lu en un
appel : les 7 pôles, l'entrée, la caisse et les voisinages justes ; les mètres faux (55 m lus pour
~37 m). **Un plan photographié donne la topologie, jamais une mesure.**

Limite : la mesure porte sur les 31 étiquettes de l'owner. La précision sur les familles de la
caisse (le vrai vocabulaire du pôle) reste à mesurer au premier compte importé.

## 4. Les décisions [owner 11/09]

| # | La question | Décision |
|---|---|---|
| M1 | Une passe par pôle, ou tout le magasin ? | **La première marche est une seule boucle physique du magasin, avec changement de pôle en cours de route.** Les pôles d'Épices et Tout sont discontinus (Thé et Céréales du Petit déjeuner à côté de Cuisine ; Condiments de l'Épicerie sèche du côté de la Cave) : une passe par pôle ferait traverser le magasin sept fois. Les marches suivantes, quand un pôle change, se font par pôle. |
| M2 | Toutes les images stables, ou une par arrêt ? | **Une photo par arrêt, la plus nette**, plus un déclenchement manuel. Un arrêt = la caméra immobile ~1,5 s après avoir bougé. Garder toutes les images stables produit des doublons (32 photos de Quincaillerie), multiplie les lectures et les confirmations, et n'améliore rien : la lecture est par composant. **Aucune vidéo n'est produite**, ni envoyée ni stockée : la page prend des images fixes sur le flux de la caméra. |
| M3 | Confirmer pendant ou à la fin ? | **En deux temps, selon les trois couches pôle → composant → famille.** Pendant la marche, juste après chaque photo : l'exposition et les familles du composant, un geste pour accepter, un pour prendre la seconde proposition. À la fin du pôle, sur une page récapitulative : les numéros du plan, les composants dos à dos, ce qu'on fusionne ou retire. **Amendement proposé le 11/09 avec les mots (§ 10, « Fin du relevé ») : une seule page à la fin du relevé, une section par pôle** — le relevé est une boucle qui traverse les pôles (M1), une page par pôle nommerait une fin qui n'en est pas une ; à ratifier avec le mot. |
| M4 | Comment l'exploitant sait-il « quel numéro » ? | **Il n'a pas à le savoir.** Le numéro d'un composant est son rang dans la marche. Le N° sur le plan, s'il existe (Épices et Tout : 52 composants numérotés sur le plan), se saisit une fois sur la page de fin de pôle. Pas de plan, pas de numéro, rien de perdu. Jamais de mètres. |
| M5 | D'où vient le pôle d'un composant ? | **Du geste de l'exploitant, jamais de la position.** Sur le plan d'Épices et Tout, Thé, Céréales et Couteaux se touchent et relèvent de deux pôles ; le modèle qui lit le plan met Thé dans Cuisine. La géométrie ne donne pas l'appartenance. La lecture ouverte (83 % de bon pôle) sert seulement à SIGNALER un oubli de changement de pôle, jamais à décider. |
| M6 | Un composant partagé entre deux pôles (une table Cave + Épicerie sèche) ? | **Un composant porte ses familles avec leur part** (owner 11/09 : « n° sur le plan, longueur, faces, familles avec leur part »). Une famille vit dans un seul pôle (intent) : la part est ce qui rattache le composant à chaque pôle dans la lecture. Un composant à deux faces accessibles de deux pôles différents = **deux composants**, un par face (c'est ainsi que les n° 4/5 et 14/15 d'Épices et Tout sont comptés). Le lien composant → dispositif → pôle reste un à un. Inscrit à la typologie § 3. |
| M7 | La caméra dans l'application ? | **Oui, dans la page**, sur tout téléphone récent, sans application native ni LiDAR. Flux caméra dans la PWA (Android Chrome : complet ; Safari iOS depuis 13.4 en écran d'accueil, MediaRecorder depuis 14.5 — non utilisé ici) ; **repli** : la caméra native par `<input type="file" accept="image/*" capture>`, même extraction dans la page. Bogues iOS connus (redemande de permission, flux vide : WebKit 185448, 215884) → le repli est un chemin nominal, pas un cas d'erreur. |
| M8 | Le tri automatique ouvert comme seul geste ? | **Non.** 68 % de familles exactes en choix ouvert : le pôle vient du geste (M5), la famille est proposée dans le pôle (93 % de précision en « haute »), et ce qui n'est pas « haute » se confirme en un geste (M3). |

## 5. Le déroulé, du point de vue de l'exploitant

Aucune chaîne visible n'est écrite ici : chaque libellé passe le lexique avant d'être proposé (règles
1 à 13, règle 4 : citer la surface). Les concepts sans mot sont listés au § 10.

1. L'exploitant ouvre la marche depuis l'onboarding (§ 8) ou depuis le document d'un pôle. La page
   affiche ses pôles ; il touche celui devant lequel il se trouve. Le pôle courant reste visible dans
   le viseur, avec ses familles encore sans photo.
2. Il avance et s'arrête devant chaque composant. La page garde une photo par arrêt et l'affiche en
   vignette ; il peut la reprendre ou en forcer une.
3. Sous la vignette, la lecture propose l'exposition et les familles (dans celles du pôle courant),
   avec une seconde proposition quand la première n'est pas « haute ». Un geste confirme.
4. Devant un composant d'un autre pôle, il touche ce pôle : la marche continue, la bascule est
   enregistrée. Si la lecture ouverte pense à un autre pôle que celui touché, la page le signale ;
   elle ne change rien seule.
5. Quand il a fini un pôle (toutes les familles ont une photo, ou il le décide), la page de fin de
   pôle : les photos dans l'ordre, le rang de chacune, le champ N° sur le plan (facultatif), la
   question des composants dos à dos, fusion ou retrait. Puis pôle suivant, ou fin.
6. Il peut s'interrompre à tout moment : la marche est une suite de photos déjà écrites, la reprise
   repart au dernier composant.

Consignes à l'écran, en trois lignes au plus, mots à arbitrer : le composant en entier, de face,
sans personne dans le champ ; s'arrêter deux secondes ; changer de pôle quand on change de pôle.

## 6. Ce que la page fait techniquement

- **Flux caméra** (`getUserMedia`, vidéo arrière, `<video>` + `<canvas>`). Toutes les ~150 ms : une
  image de travail réduite ; **mouvement** = différence moyenne avec l'image précédente ;
  **netteté** = variance du laplacien ; **exposition** = histogramme (image trop sombre). Un arrêt
  est déclaré quand le mouvement reste sous le seuil ~1,5 s après avoir dépassé le seuil « la caméra a
  bougé » ; la page garde l'image la plus nette de l'arrêt, la réduit à 1 600 px (comme le dépôt
  actuel) et l'envoie. Les seuils se calibrent sur téléphones réels, jamais à l'œil (§ 9).
- **Repli** : `<input type="file" accept="image/*" capture="environment">` (une photo à la fois avec
  la caméra native). Le déroulé est le même, sans détection d'arrêt.
- **Envoi** : le POST de `api/dispositifs/photos.ts`, étendu de `walk_id` (un par session de marche),
  `seq` (rang dans la marche, toutes marches confondues sur la session), `t_offset_s`, et le pôle
  touché → `dispositif_id` du dispositif par défaut du pôle (typologie § 3 : un pôle reçoit un
  dispositif créé avec lui). La clé de composant est créée à l'arrivée de la photo (un composant par
  photo gardée) ; la fusion de la page de fin de pôle regroupe deux clés.
- **Lecture** : la v2 telle quelle, avec la liste des familles RESTREINTE aux familles du pôle touché
  (mesure § 3), et une seconde proposition de famille. Une seconde lecture, ouverte (toutes les
  familles du site), ne sert qu'au signal de M5 ; elle se construit après la première, si la mesure
  sur les familles de caisse la justifie.
- **Vie privée** : inchangée (typologie § 5.1) — une personne visible = image effacée, aucune ligne.
  Sans vidéo, il n'y a rien de plus à effacer.
- **Coût de fonctionnement** : la consigne est en cache ; par photo varient l'image (~640 jetons) et
  la réponse (~105 jetons). Au tarif Sonnet 5 au 11/09 (2 $/M en entrée, 10 $/M en sortie, cache lu à
  0,20 $/M) : ≈ 0,27 c$ par photo mesurée sur la consigne courte du 10/09 ; le coût de la lecture v2
  (consigne plus longue) se mesure au premier lot. Aucune licence, aucun magasin d'applications.

## 7. Les données

- `analytics.dispositif_photos` : `walk_id`, `seq`, `t_offset_s` se remplissent ; **à créer** :
  la part des familles — `families_share` (JSON `[{family, share}]`, parts en % de la façade du
  composant, somme 100, proposée par la lecture, confirmée par l'exploitant ; `families_present`
  reste la liste brute lue). Geste du 27/08 pour toute colonne : sonde écrite, relue, effacée ;
  `data-model-index.md` dans le même commit.
- **`analytics.dispositif_walks`** (typologie § 5.2, « seulement si la marche est construite ») :
  **à créer** — une ligne par marche : site, début, fin, nombre de photos, séquence des pôles touchés
  avec l'heure, et la liste des voisinages (composant A → composant B consécutifs, y compris à travers
  une bascule de pôle : c'est ce qu'une passe par pôle aurait perdu). La discontinuité d'un pôle se
  lit dans cette séquence (photos d'un même pôle séparées par d'autres pôles) : rien n'est demandé.
- **La position d'un composant** = son rang, ses voisins, son N° sur le plan facultatif. Jamais de
  coordonnées, jamais de mètres.
- **dbt** (hors dépôt, passation) : la chaîne `stg_dispositif_photos` → `vw_insight_event_dispositif_photos`
  ne projette pas encore les quatre colonnes v2 ; elle devra projeter aussi `families_share`, et une
  vue `vw_insight_event_dispositif_walks` naîtra avec la table. L'app lit `semantic`, jamais
  `analytics` (garde `warehouseBoundary`).
- **Le document du pôle** liste ses composants **groupés par emplacement** (lu dans la séquence) :
  Petit déjeuner se lit « deux emplacements ». Le parcours idéal-type (typologie § 7) compte alors
  Gâteaux + Thé comme une traversée du magasin.

## 8. La place dans l'onboarding

La chaîne imposée par le code aujourd'hui : profil du site → import des ventes → pôles (familles de
la caisse) → marche. Épices et Tout montre le trou : les photos existent, les ventes pas encore
(0 ligne au 11/09), donc aucun pôle ne peut être créé et aucune marche rattachée.

| Option | Ce qu'elle donne | Ce qu'elle coûte |
|---|---|---|
| A. Garder la chaîne ; la marche une heure après le premier import | Aucun concept nouveau, familles toujours réelles | L'exploitant attend le fichier (Les Olivades : 9 jours) ; l'élan du premier jour est perdu |
| B. Pôles EN PROJET : familles déclarées à la création, rapprochées à l'import sur un écran de correspondance | Marche, plan et photos dès le premier jour ; c'est le point parké du 27/08 (« créer les pôles avant, site vide prêt pour ingestion ») | Un état « provisoire », une étape de correspondance, et une règle : aucune carte ne tire sur un pôle en projet |

**Décision owner 11/09 : B.** Une règle tient l'ensemble : une marche appartient toujours à une
version de pôle, en projet ou confirmée ; l'onboarding enchaîne les pôles sans photo ; la même marche
reste accessible ensuite depuis le document du pôle ; **aucune carte ne tire sur un pôle en projet**.
Deux états indépendants, à ne pas confondre : le pôle **sans photo** (ce qui manque : les photos ; ce
qui y met fin : le relevé) et le pôle **en projet** (ce qui manque : ses familles rapprochées de la
caisse ; ce qui y met fin : le premier import). Épices et Tout au 11/09 est le second cas avec 235
photos. Le mot (owner 11/09) : **« Pôle en projet »**, un état, la raison dessous — « Aucune vente
importée » (proposé) avant tout import, « À rapprocher de la caisse » après (le geste de correspondance).
À construire : `POST /api/commitments` accepte un pôle dont les familles sont DÉCLARÉES (texte) tant
que le site n'a aucune vente, avec un marqueur d'état ; à l'import, un écran de correspondance
famille déclarée → famille de la caisse ; le marqueur tombe quand toutes sont rapprochées ; les
lecteurs de cartes ignorent un pôle marqué. Colonne et sonde selon le geste du 27/08.

## 9. Ce qui reste à faire, dans cet ordre

0. **La prise de vue est LIVRÉE (14/09)** — le proto `tools/proto/releve-espace-proto.html` (v2 du 12/09,
   vérifié au harnais déterministe) est SUPPRIMÉ dans le commit qui livre la page : sa détection, son
   viseur, ses problèmes affichés dedans, sa bande des cartes et sa page de fin vivent à l'identique dans
   `public/js/releve-espace.js`, servis par `src/pages/app/insightevent/releve.astro`. Ce qui a changé en
   devenant une page : les pôles sont CEUX DU COMPTE (lus côté serveur, foyer `listPoles`, couche semantic)
   et non une liste tapée dans les réglages ; les chaînes viennent du foyer `EVOL_COPY.releve_*` ; une photo
   gardée s'ENVOIE. Les réglages de calibrage restent, invisibles (appui long sur le chrono, `?reglages=1`).
   **Vérifié le 14/09 sans téléphone** (`npx tsx tools/harness/releve-verify.mts`, qui extrait le markup et
   les styles du fichier livré, injecte les vrais pôles et espionne l'envoi sans rien écrire) : 7 pôles et
   52 composants servis sur le compte de l'owner, tous nommés et avec leur clé ; 20 pas en marchant → 0
   photo ; 30 pas immobiles → 1 photo ; « Quel composant ? » → les 7 composants du pôle touché ; un
   toucher → l'envoi porte le bon `dispositif_id`, la clé `p8` et une image JPEG ; noir → « Trop sombre »,
   0 photo, le problème enregistré seul si l'exploitant repart ; image plate → « Photo floue », un toucher
   la garde (manuelle, raison « floue ») ; bascule de pôle en route enregistrée ; « Fin du relevé » → une
   section par pôle (« 1 photo », « 2 photos », « Aucune photo »). **Mutation vue tomber** : immobilité
   portée à 5 000 ms → 0 photo (3 480 ms cumulées, état « settling »).
   **UNE VRAIE PHOTO AU POINT FOCAL (owner 14/09)** — amendement à M2, qui disait « des images fixes sur le
   flux de la caméra ». Ce que le flux donne n'est pas ce que l'appareil photo donne : pas de mode photo,
   pas de HDR, pas de stabilisation — or l'image est LUE par le modèle pour reconnaître les articles et
   les familles. Au Point focal, `ImageCapture.takePhoto()` prend donc une vraie exposition sur le flux
   déjà autorisé, sans geste (Safari 18.4+, iOS en hérite ; Chrome 60+). L'image du flux est gardée
   d'abord et remplacée à l'arrivée : si takePhoto manque ou échoue, elle reste, et le compte rendu le
   dit (`photo_echec`). **Aucune vidéo n'est produite pour autant** : M2 tient sur ce point.
   Et le plafond de réduction devient celui du MODÈLE qui lit la photo — le rôle `packager` est
   claude-sonnet-5, donc le palier haute résolution de l'API (2 576 px de grand côté, 4 784 jetons
   visuels à 28 px par carreau) — au lieu du 1 600 px du proto, qui jetait du détail sous le palier.
   Mesuré au harnais : 4 032 × 3 024 → 2 192 × 1 644 = 4 661 jetons (sous les deux bornes), 800 × 600
   laissée intacte, échec de takePhoto → l'image du flux conservée. Coût de lecture : ~4 661 jetons
   d'image par photo au lieu de ~2 500, soit ≈ 0,9 c$ au tarif Sonnet 5 en entrée contre ≈ 0,5 c$.
   **À mesurer en magasin** : ce que le modèle lit d'une étiquette sur une vraie photo contre une image
   du flux — le même meuble deux fois, une par le relevé, une par « Photo avec l'appareil ».

   **L'ÉCRAN, REFAIT LE 14/09 après le premier essai réel de l'owner.** Ses quatre remarques, et ce
   qu'elles ont changé (la détection est inchangée) : (a) « format vertical full page avec juste le
   bouton arrêter visible » → la prise de vue est un CALQUE PLEIN ÉCRAN, et il ne porte que quatre
   choses : l'image, le nom du pôle (qu'on touche pour en changer, feuille qui monte), l'état, le
   bouton ; (b) « une ligne rouge horizontale et on ne sait pas à quoi ça sert » → la bande des cartes
   ET le cadre de couleur sont RETIRÉS — deux décorations dont il fallait devenir la légende ; l'état
   se dit en MOTS sur une pastille sombre (avancez · ne bougez plus · photo gardée), lisible sur une
   image claire ; (c) « aucune instruction à l'affichage » → les trois consignes du § 5 s'affichent
   avant de commencer (mots de la spec, à ratifier) ; (d) « quand on clique sur arrêter on doit en
   background enregistrer ; si pas bonne distance ou blurry on doit être averti » → « Fin du relevé »
   lance une FILE SÉQUENTIELLE d'enregistrement qui ne bloque pas l'écran (avancement en une ligne),
   et chaque photo écrite dit ce qui cloche : floue (mesuré dans la page) ou « le composant n'est pas
   entier sur la photo » (`coverage_flag` rendu par la lecture — la distance ne se mesure pas
   autrement). La question du composant reste le seul geste qui ne peut pas partir en arrière-plan :
   la route refuse une clé hors version (point 4), et deviner le composant écrirait un faux.
   **Deux défauts trouvés au harnais avant livraison** : toucher un pôle reconstruisait la liste
   PENDANT le clic, le nœud touché devenait détaché, le garde « toucher = photo » ne le reconnaissait
   plus et une photo parasite partait à chaque changement de pôle ; et la page ne passait au module
   qu'une LISTE DE CLÉS écrite à la main, où les consignes et les états manquaient — le filtre est
   désormais par préfixe, le même que le harnais, donc les deux ne peuvent plus diverger par omission.

   **LE SITE, ET LA VERSION (owner 14/09, second essai)** — « Tu ne demandes pas pour quelle location je
   filme ». Le compte de l'owner porte TROIS sites (Maison Sèvres, Muse Square, Muse Square Occitanie)
   et un SEUL a des pôles : pris en silence, le relevé s'ouvrait vide sur les deux autres sans rien
   dire. Même défaut que la carte le 09/09, même correctif : le nom du site est affiché sous le titre,
   un compte à plusieurs sites bascule par un sélecteur (le nom du site EST son libellé — aucun mot
   nouveau, patron repris de `map.astro`), et un site sans pôle le DIT (`capture_aucun_pole`) au lieu
   d'une rangée vide, avec « Commencer le relevé » désactivé.
   **Et la page porte un MARQUEUR DE VERSION** (`VERCEL_GIT_COMMIT_SHA`, 7 caractères, à droite du nom
   du site) plus un `cache-control: no-store` : deux essais owner ont eu lieu sur un écran périmé sans
   que personne puisse le prouver. Une remarque sur l'écran se lit désormais avec sa version.

   **LES SEUILS, CALIBRÉS SUR UNE MAIN (owner 14/09, mesure au diagnostic)** — immobile devant un
   meuble, son iPhone lit un mouvement de **12 à 18**. Les seuils venaient du proto, calibré sur un
   canvas parfaitement fixe : immobile < 2,5, « ça bouge » > 6. Une main au repos était donc en
   permanence au-dessus du seuil de déplacement : la détection ne commençait JAMAIS à compter, d'où
   0 photo en 51 s et 0 problème signalé. Nouvelles valeurs : **immobile 22, bouge 28**. L'écart entre
   les deux est l'hystérésis et il doit rester COURT — à 34, une marche mesurée à 33 au harnais ne
   réarmait pas le détecteur : une photo pour toute la marche.
   **ET LE RÉARMEMENT NE DÉPEND PLUS DE DÉTECTER UNE MARCHE** (dont la valeur change d'un téléphone à
   l'autre et n'est pas mesurée chez l'owner) : ce qui autorise une photo nouvelle, c'est que LA SCÈNE
   AIT CHANGÉ depuis la dernière gardée (écart > 0,75 × le seuil d'immobilité — mesuré au harnais :
   même meuble 5 à 11, autre meuble 22 à 26). Tenir le même meuble dix secondes ne rend qu'une photo
   même si la main tremble ; se tourner vers un autre en rend une, même sans déplacement détecté. Le
   diagnostic affiche cet écart en direct, sans quoi « pourquoi une seule photo ? » n'est pas répondable.
   Vérifié au harnais avec un mode « main » (bruit calibré sur la mesure owner) et DEUX meubles :
   1 photo / même meuble 10 s → 1 / autre meuble sans marche → 2 / on y reste → 2 / retour → 3 /
   avec marche → 4.

   **M4 EST ENFIN APPLIQUÉE — LE RANG DÉCIDE, ET LA PHOTO SERT DE REPÈRE (owner 14/09 : « A et B »).**
   Demander « Quel composant ? » était inutilisable, et c'est mesurable : sur le compte de l'owner,
   **40 meubles sur 52 portent un nom que PARTAGE un autre meuble du même pôle** (la Cave en a six qui
   s'appellent « Vin & Spiritueux », l'Épicerie sèche cinq « Condiments » et cinq « Conserves »). Seul
   le numéro du plan les distingue, et il n'est lisible que sur le plan — que l'app ne peut pas pointer
   par meuble : les polygones de `analytics.space_zones` sont AU PÔLE, pas au composant.
   **A — le rang** : dans un pôle, la Nième photo va au Nième meuble non encore photographié, dans
   l'ordre du plan. Le viseur annonce le meuble ATTENDU. Corriger une photo réattribue toutes les
   suivantes du même pôle à partir de là : une correction suffit quand on a commencé par l'autre bout.
   **B — la photo précédente** : chaque meuble porte sa dernière photo en vignette (dans le viseur pour
   le meuble attendu, et dans la liste de correction). Chargée une fois par pôle, au moment où
   l'exploitant le touche, jamais bloquante ; inutile à la première marche, définitive ensuite.
   **Et la correction passe par la MÊME FILE que l'écriture** : l'enregistrement part à l'arrêt, donc
   toute correction arrive forcément après. Une photo déjà écrite est RETIRÉE de la base (rail
   « Retirer », livré le 14/09) puis renvoyée sur le bon meuble — sans quoi « une correction suffit »
   serait faux dès que l'enregistrement est parti, c'est-à-dire toujours.
   Vérifié au harnais : attribution automatique p1 → p2 → p4 (l'ordre du plan) sans rien demander ;
   une correction de la 1re en N° 7 → les trois lignes retirées (ph1, ph2, ph3) et réécrites sur
   p7, p8, p14, « 3 enregistrées. ».

   **Reste à faire sur téléphone (owner)** : iPhone 17 + un Android, une boucle complète en magasin — faux
   points focaux en marchant, problèmes affichés à tort ou manqués, netteté médiane, durée, repli iOS. Le
   compte rendu JSON (« Compte rendu », sans image) se joint à l'arbitrage.
1. **Typologie § 3** : la part des familles et la règle des deux faces (fait le 11/09, ce document).
2. **Lexique** : fait le 12/09 — les mots du § 10 sont au tableau.
3. **La page de marche — LIVRÉE le 14/09** : `src/pages/app/insightevent/releve.astro` +
   `public/js/releve-espace.js` (`module-index.md` à jour dans le même commit). Flux caméra, détection
   d'arrêt, repli fichier, viseur avec le pôle courant et son compte de photos, envoi. **L'entrée est le
   bouton « Documenter » du Tableau de bord**, qui ouvrait jusque-là la caméra native pour UNE photo d'UN
   composant — geste jamais validé, et contraire au constat du § 1 (le coût est le tri). **Ce qui n'y est
   pas** : la confirmation pendant la marche (M3 : exposition et familles proposées juste après la photo)
   — l'exploitant nomme le composant, la lecture v2 fait le reste côté route ; et le rattachement passe par
   un composant DÉJÀ déclaré, parce que la route refuse une clé hors version (point 4). Les seuils restent
   ceux du proto : leur calibrage en magasin est le point du § 9.0 resté ouvert.
4. **Le POST étendu** (`walk_id`, `seq`, `t_offset_s`, pôle → dispositif, familles restreintes,
   seconde proposition) + `families_share` + `analytics.dispositif_walks`. Lie-bait : la porte
   `photoExtractionChecks` refuse une famille hors du pôle touché et une part hors [0, 100] ou de somme
   ≠ 100 — mutation vue rouge avant de fermer.
5. **La page de fin de pôle** (rang, N° sur le plan, dos à dos, fusion/retrait) ; le document du pôle
   groupé par emplacement.
6. **Mesure** sur le premier compte importé : familles de la caisse, précision par niveau de
   confiance, part des photos passées sans geste — les chiffres du § 3 se remplacent.
7. **Onboarding** : les pôles en projet (§ 8, W1 = B : `POST /api/commitments`, marqueur, écran de
   correspondance à l'import, lecteurs de cartes qui l'ignorent), puis l'étape après les pôles (D6) ;
   les demandes de précision (typologie § 9, point 8) réutilisent la même page pour UN composant.
8. **Épices et Tout** : rejouer les 235 photos du 10/09 par le même POST (elles portent l'heure EXIF,
   donc `seq` et `t_offset_s`), avec le plan numéroté en page de fin de pôle — le tri manuel devient
   la vérité de la mesure du point 6.
9. **dbt** : passation des colonnes v2 + `families_share` + la vue des marches (une passation, ordre
   du DAG, compilée sur `origin/main`).

## 10. Les mots — proposés par l'owner le 11/09, RATIFIÉS le 12/09 (lexique, tableau des mots)

| Concept | Proposition owner | Recommandation (11/09) | État |
|---|---|---|---|
| La marche comme objet visible | « Relevé vidéo de l'espace » | **Relevé de l'espace**, sans « vidéo » : aucune vidéo n'est produite (M2) ; « relevé » n'a pas de collision au lexique | ratifié 12/09 |
| L'arrêt devant un composant | « Point focal » | **Point focal** ; aucune collision | ratifié 12/09 |
| Le changement de pôle | (même mot proposé) | pas un mot : un GESTE, le nom du pôle sur le bouton et le verbe choisi par l'owner | à écrire avec les chaînes |
| La page de fin | « Fin du relevé » | **Fin du relevé**, UNE page à la fin de la boucle, une section par pôle (amendement M3) | ratifié 12/09 |
| La part d'une famille sur un composant | « Part d'assortiment », « Share of Shelf », « Allocation par famille » | **Part de linéaire** : terme du métier, cohérent avec les mètres linéaires de façade mesurés le 11/09 ; « linéaire de façade » couvre comptoirs et caisses au sol. Refusés : Share of Shelf (anglais, règle 7 bis) ; part d'assortiment (autre mesure, et « assortiment » est déjà le mot de la largeur de l'offre, lexique l. 97) ; allocation (la décision, pas la mesure) | ratifié 12/09 |
| L'état d'un pôle dont les familles ne sont pas encore celles de la caisse | « Projet » | **Pôle en projet** (owner 11/09) : UN état, la raison écrite dessous — « Aucune vente importée » (proposé ; « En attente de la caisse » refusé : un pôle n'attend pas) puis « À rapprocher de la caisse » (ventes importées, un geste : l'écran de correspondance). « À documenter » refusé (« Documenter » = la photo) | **tranché** |

## 11. Décisions owner du 11/09 (« Okay avec recommendations »)

| # | La question | Décision |
|---|---|---|
| W1 | Pôles en projet avant l'import (§ 8, option B) ? | **Oui**, avec la règle « aucune carte sur un pôle en projet ». |
| W2 | La part des familles : proposée par la lecture puis confirmée, ou saisie à la main seulement ? | **Proposée puis confirmée** ; une part non confirmée se lit « lue », jamais « déclarée ». |
| W3 | Le signal « autre pôle ? » (M5) dès la première version, ou après mesure ? | **Après mesure** sur les familles de caisse (§ 9, point 6) : il double le coût de lecture. |

Rien ne reste ouvert sur les mots : les cinq sont au lexique (12/09).
