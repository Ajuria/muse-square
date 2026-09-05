# Explorer — inversion du routage : le résolveur est la porte d'entrée — DÉFINITIF

> Sert : intent § Le test de valeur — « une réponse d'Explorer dit quelque chose de vrai, que
> l'exploitant ne pouvait pas voir seul, et pointe quelque chose qu'il peut bouger — ou ne
> s'affiche pas » ; et § Ce que Muse Square n'est pas — « pas un conseil générique ».
>
> Les dix incréments I0-I9 sont appliqués (03-04/09/2026, dev, non commités au moment de la
> réécriture). Ce document dit l'état ; le § 4 garde la trace de chaque incrément et de sa porte.

## 1. Le constat (audit du 03/09/2026, endpoint réel, compte f10c3e58)

Seize questions envoyées à `/api/insight/prompt` et la fonction client `isQuestion` évaluée
byte-exact sur 22 chaînes. Les défauts, par gravité :

| # | Mesure | Cause dans le code |
|---|---|---|
| 1 | Sans « ? », < 50 caractères, premier mot hors liste : la question part en recherche concurrents, jamais à l'endpoint. 7 des 10 dialogues de la batterie ouvrent par une telle phrase (mesure I0, `tests/client/explorer-client-gate.test.ts`). | `public/js/ie-prompt.js:1176` (`isQuestion`) puis `:1199` ; la batterie frappe l'endpoint en direct et ne le voit pas. |
| 2 | « qui est Jésus ? » → événement « La sœur de Jésus-Christ » (théâtre, Figeac) ; « bonjour » → « Bonjour Quand Même - Haroun » ; « merci », « quelle heure est-il ? » → 3 meilleures dates de septembre. | `INTENT_UNKNOWN` déclaré (`prompt.ts:178`), jamais assigné. Le classifieur Haiku n'a que 4 classes, repli `WINDOW_TOP_DAYS`. Le résolveur dit `autre`, et `autre` = chaîne legacy. |
| 3 | « combien j'ai vendu hier ? » → « 1 439 € contre 1 533 € pour un jeudi, +70 % ». Vérifié BQ : 02/09 est un mercredi, 1 439 € vs 847 € attendus (+70 %) ; 1 533 € = moyenne des 10 derniers jeudis. | Le résolveur rend `periode = 2026-09-02`, `kpi = null` ; la branche KPI exige un KPI nommé (`prompt.ts:2572`) ; la période résolue n'est transmise à aucune branche legacy ; le chemin jour n'a pas de jeton « hier » (`extractDateMentions`, `resolveHorizonFromText`) → date = aujourd'hui → faits TODAY/FUTURE. Le validateur (`packagerGroundedDayValidator.ts`) vérifie qu'un nombre EXISTE dans le payload, jamais qu'un nombre et sa base viennent du MÊME fait. |
| 4 | « … panier moyen a progressé en juillet et … meilleurs jours en septembre » → panier moyen sur septembre (futur) vs juillet ; seconde question jetée sans le dire. | Le formulaire du résolveur n'a qu'un tuple. |
| 5 | « top 3 produits août » → « Aucun événement trouvé ». | `/top (produits?\|ventes?)/` (`insightFamilies/index.ts:86`) refuse le nombre. |
| 6 | « la semaine dernière » : le résolveur rend 27/08→02/09 (7 derniers jours) ; `frPeriod` rend la semaine civile précédente (lundi→dimanche). | Deux définitions du même mot ; le résolveur n'a reçu que la convention des saisons. |

Les fautes de frappe (panié/juilet, planifi/septembr, famile Cofee, engagemant) sont toutes
bien routées par le résolveur : elles n'échouent que par le défaut 1.

## 2. L'état du routage (ce qui est, 04/09/2026)

**Une décision par tour.** Le résolveur (`lib/ai/resolver.ts`, 16 intentions, formulaire généré
par `semanticRegistry.ts`) lit chaque question ; sa décision pose les variables de routage du
handler (`_rsvDecided`, `prompt.ts` § « I5 ») et les branches existantes sont appelées PAR
intention. Les regex historiques (`resolveHorizonFromText`, `resolveIntentFromText`,
`familyForQuestion`) ne décident que quand le résolveur n'a pas tourné (null, timeout) — et
`frPeriod` seul reproduit alors les périodes (§ 3.6). Le classifieur Haiku 4 classes n'est appelé
que dans ce repli : un seul appel LLM de routage par tour. Côté client, la recherche concurrents
ne prend que les questions sur les concurrents (§ 3.8). L'état du 03/09 — cinq classifieurs
votant par ordre du fichier, deux appels LLM par tour — est décrit dans l'audit (§ 1) et dans
la mémoire `explorer-audit-2026-09-03`.

## 3. L'architecture (appliquée)

**Une décision par tour.** Le résolveur est la porte d'entrée ; les composeurs existants sont
appelés PAR intention ; les regex legacy restent, comme REPLI (résolveur null ou timeout),
jamais comme décision première. Patron : classification unique puis chemin de code spécialisé
(routing workflow) — le même que Cortex Analyst / Genie pour la partie « le LLM comprend, le
code calcule », et que Rasa / Dialogflow / Lex pour l'intention de repli.

### 3.1 Le jeu d'intentions (registre `INTENTS`, 16 intentions — appliqué)

| intent | Existe | Composeur (existant) | producer |
|---|---|---|---|
| `plan` | oui | `planPeriod` + `buildPlanBlocks` | `deterministic_plan_period_v1` |
| `entity_period` | oui | `entityReading.*` (+ compare, + kpi_period) | `deterministic_entity_period_v1` … |
| `journal` | oui | branche JOURNAL_Q | `deterministic_engagements_v1` |
| `pourquoi` | oui | `buildEntityWhyBlocks` / `buildPlanWhyBlocks` | `deterministic_*_why_v1` |
| `idee` | oui | `readIdeaPlacement` | `deterministic_idee_v1` |
| `jour` | oui (I5, 04/09) | chemin jour existant (grounded day + familles) | `grounded_day_claude` … |
| `bilan_periode` | oui (I5, 04/09) | renvoi rapport + verdict chiffré (`_reportWindowEnd`) | `deterministic_report_nav_v1` |
| `dimension` | oui (I5, 04/09) | familles (`familiesForQuestion`) sur le chemin jour | `family_*` |
| `fenetre` | oui (I5, 04/09) | pipeline mois (top/pires/filtre/motifs) | `v3_claude` … |
| `entite_exterieure` | oui (I5, 04/09) | branche `isUnknownIntent` web (impact / découverte) | `web_search` |
| `evenement_lookup` | oui (I5, 04/09) | lookup événements | `deterministic_lookup_event_ir_v1` |
| `fiches` | oui (04/09 — la branche « bonnes pratiques » vit après le résolveur : regex OU intention) | branche « bonnes pratiques » (`listClassDispositifs`) | `deterministic_dispositifs_v1` |
| `mes_evenements` | oui (I5, 04/09) | branche possessive | `deterministic_evenements_v1` |
| `rapport` | oui (I5, 04/09) | renvoi rapport | `deterministic_report_nav_v1` |
| `hors_perimetre` | oui (I1, 03/09) | `ai/horsPerimetre.signalMetier` (garde) + `horsPerimetreReponse` (option A) | `deterministic_hors_perimetre_v1` |
| `autre` | oui | repli legacy complet | (inchangé) |

Chaque intention nomme le composeur qui existait déjà : aucun composeur n'a été réécrit. La
regex qui gardait chaque branche est la condition de repli. `jour` sans date lit LE DERNIER JOUR
MESURÉ (jamais aujourd'hui, non mesuré : mesuré 04/09, « ça va mes ventes ? » tombait au plancher
sur les faits du jour) — posé APRÈS la logique de suite de fil : « et le dimanche ? » après un cadre du
18/07 lit le 19/07 (régression du premier jet attrapée par la batterie qualité, corrigée le jour même). Le matcher de famille ne prime plus sur le résolveur (mesuré : « quand a
lieu la fête des vendanges ? » — résolveur `evenement_lookup`, matcher « quand » → famille).

### 3.2 Le formulaire (ajouts, `resolverSchema` + prompt généré)

- `intent` : l'enum ci-dessus.
- Un jour unique (« hier », « avant-hier ») est une `periode` dont `start = end` — PAS un champ
  `date` séparé (I2, 03/09) : un champ de moins à remplir pour Haiku, et `frPeriod` porte
  désormais la forme `kind: "day"` qui le valide. Un jour de semaine nu (« mardi ») passe par
  le chemin jour existant (`weekday_window_date`), inchangé.
- `questions_supplementaires: string[]` — les parties de la question que le tuple ne porte
  pas (défaut 4). Vide dans le cas courant.
- `confiance: "haute" | "basse"` — tracée dans le log du résolveur ; elle ne conditionne AUCUNE
  branche : la garde déterministe (§ 3.4) tranche dans tous les cas (mesuré 03/09 : Haiku posait
  « basse » sur « bonjour », et conditionner la branche renvoyait la salutation sur un théâtre).
  Tracée pour la lecture des logs.

Contraintes mesurées à respecter : Haiku 4.5 ne reçoit pas `outputSchema`
(`models.ts`, `structuredOutputs:false`) — le formulaire est ÉPELÉ dans le prompt, l'enum
étendu se teste en batterie ; la clé `intention` reste tolérée.

### 3.3 Les conventions de période — UNE définition (appliqué, I2)

Le résolveur reçoit dans son prompt (règle 3, `resolverSystemPrompt`), à côté des saisons, les
conventions de `frPeriod` : « hier » = la veille, un seul jour ; « avant-hier » ; « la semaine
dernière » = semaine civile précédente lundi→dimanche ; « le mois dernier » = mois civil
précédent ; « ce mois » = 1er→aujourd'hui ; « N derniers jours » finissant hier. **Et le code
valide** (`resolver.ts`, garde-fou 2bis) : `frPeriod` re-lit l'expression recopiée par le modèle
et, quand il la parse, ses bornes remplacent celles du modèle (`periode_validee` tracé dans le
log du résolveur). `frPeriod` connaît désormais `kind: "day"` (hier, avant-hier, aujourd'hui).
Mesuré 03/09 : « la semaine dernière » = 24/08→30/08 (le modèle disait 27/08→02/09).

### 3.4 La garde déterministe avant tout refus

`hors_perimetre` ne se rend QUE si aucun signal déterministe ne tire : aucune famille
(`familiesForQuestion`), aucun jeton de date (`extractDateMentions`, `frPeriod`), aucun
marqueur lookup (`isEventLookupQuestion`), aucune entité du site (`matchEntities`), aucun
mot du lexique KPI. Un signal qui tire ⇒ intent `autre` (repli legacy) — jamais un refus sur
une question métier mal lue. Le refus coûte plus qu'une réponse approximative.

### 3.5 Le cadre (frame) — ADD, pas REPLACE

`thread_context.resolved` (résolveur) devient le cadre premier ; `thread_context.last`
(horizon/intent legacy) reste, écho-é à l'identique, pour le repli. Le cadre ne porte
toujours aucun fait ni chiffre.

### 3.6 La transmission de la période au repli (appliqué, I2)

`_rsvPassPeriod` (`prompt.ts`) : la période résolue qu'aucune branche déterministe n'a
consommée (aucune entité, aucun KPI mesurable), seulement si elle est PASSÉE. Un jour unique
alimente `extracted_dates` du chemin jour quand la question n'en porte aucune (« hier » →
02/09, branche PAST measured : « 1 439 € vs 847 € habituels, +70 % ; +37 % vs vos 13 derniers
mercredis » — plus jamais TODAY/FUTURE) ; une période de plusieurs jours fixe
`period_for_window`, donc `selected_date`/`window_end_date`, donc `_reportWindowEnd` : la
réponse est le renvoi rapport avec son verdict chiffré (« c'était comment la semaine
dernière ? » → « 12 574 €, +0,7 % vs période précédente … du 24/08/2026 au 30/08/2026 »).
Rien n'est jeté. **Résilience (04/09)** : quand le résolveur n'a pas tourné (mesuré : un appel de
228 s sous charge, `intent=null` — la batterie, trois sondes et la suite vitest sur la même machine),
`frPeriod` seul fait le même travail sur la question : « hier » (kind `day`) devient la date du chemin
jour ; « la semaine dernière », « le mois dernier », « les N derniers jours » entièrement passés fixent
la fenêtre du renvoi rapport. Tracé `[frPeriod→legacy]`. Avant cette règle, la question tombait sur
« aujourd'hui + 29 » et le plancher.

### 3.7 Le validateur — le référentiel par phrase (appliqué, I4)

Deux règles dans `packagerGroundedDayValidator.ts`, toutes deux nées de la phrase réelle du 03/09
(« 1 439 €, contre un CA habituel d'environ 1 533 € pour un jeudi — un écart de +70 % ») :

1. **Cohérence d'une comparaison** (`groundingChecks.comparisonInconsistency`) : une phrase qui
   porte deux montants en €, un marqueur de comparaison (contre, au lieu de, vs, par rapport à,
   habituel…) et UN écart signé en % doit vérifier écart ≈ (a − b) / b, dans un sens ou l'autre,
   à 1 point près. Un % signé qui qualifie un autre sujet (panier, conversion, visiteurs, « vs
   sa base »…) n'est pas comparé aux montants — faux positif mesuré le 04/09 sur « Pourquoi le
   28/08 ? » (« 149 € contre 49 € attendus, même si le panier moyen était en repli (−10 % vs sa
   base) »), corrigé et planté dans la lie-bait. Ne dépend pas de la provenance. Le message de
   rejet CITE la phrase (160 caractères) : un rejet se juge, vrai ou faux positif.
2. **Localité des nombres** : avec `sentence_provenance`, un nombre porté par une phrase doit
   vivre dans les faits que CETTE phrase cite (ou s'en recomposer via `reproducibleSumDiff`) —
   le mécanisme des entités (Phase 1 #6) appliqué aux nombres. La date affichée et les nombres
   des signaux/moteurs restent permis partout. Sans provenance : le contrôle global d'avant.

Lie-bait `contracts/groundedReferential.test.ts` : 15 cas, la phrase réelle plantée vue ROUGE
puis verte ; suite complète `contracts/ + honestAbsence` 85/85. Trouvé au passage et corrigé :
`extractNumbersWithUnits` collait les milliers sur l'espace simple seulement (la copie de la
classe avait perdu U+00A0/U+202F) — « 1 439 » en insécable donnait 1 et 439.

**Mesuré en vrai le 04/09** (5 questions jour, puis 3 × 2 rejouées) : la règle 1 a rejeté
QUATRE reformulations successives de « 1 439 € … +70 % … habituel du jeudi (~1 533 €) » sur
« combien j'ai vendu hier ? » — toutes vraies. Après régénération, l'un des deux runs est tombé
au plancher déterministe (`v3_fallback_deterministic`), qui liste les faits sans les croiser :
« Votre CA habituel pour un jeudi : ~1 533 € · Dernier jour mesuré (02/09/2026) : 1 439 € —
+70 % ». C'est le comportement voulu : mieux vaut les faits nus qu'une comparaison fausse.
« Pourquoi le 02/09 ? » et « Pourquoi le 28/08 ? » passent en attempt 1 (4/4 après correction du
faux positif). Coût : une régénération (~15-20 s) quand la règle tire.

**Batterie qualité (`explorer-quality-battery.ts`, 19 questions, juge Sonnet), 04/09 après I5.** Premier
run : 17/19 portes, juge 3,70/5 ; 7 régénérations sur 18 réponses grounded, dont 4 par les règles I4 —
2 vrais positifs (« +82 % vs votre CA habituel de vendredi (~1 369 €) » pour 1 600 €, écart réel +17 %)
et 2 faux positifs, corrigés et plantés dans la lie-bait : (a) l'ARRONDI des montants — « 35 € contre
25 € (+38 %) » écrit depuis 35,2 et 25,5 ; la tolérance vaut désormais 1 point + l'arrondi des entiers
(0,5 € sur chaque montant) ; (b) le nombre de la QUESTION — « chuté de 40 % » repris pour être
contesté était rejeté en localité (43 s, budget 40 s) ; les nombres de `payload.question` sont
permis partout. Second run : **19/19 portes, juge 3,82/5**. Au passage, « Quelle est ma marge le
week-end ? » : la réponse marge (K9, 27/08) filtre désormais les jours nommés (week-end, un jour de
semaine) et le dit — 13 927 € de CA sur les jours de week-end des 30 derniers jours, recoupé BQ.

**Prose du packager (04/09, item ouvert par l'owner sur les notes du juge).** Règles ajoutées à
`packagerGroundedDayPrompt.ts` : 1quinquies (headline et answer disjoints — un chiffre du headline
n'apparaît nulle part dans l'answer, un chiffre d'ouverture dans aucune puce), 1sexies (répondre à
l'OBJET nommé ou dire que les faits couvrent plus large), 1ter étendu (tout couple de repères
contradictoires se réconcilie en une phrase), 3ter-1 (ce que l'exploitant sait déjà — adresse,
secteur, public déclaré, jour de semaine d'une date qu'il a écrite — n'est jamais une information,
seulement la base d'un écart), 3ter-2 (aucun quantificateur vague à la place d'un chiffre) ; l'answer
« commence par ce qui explique le verdict », plus « par le verdict ». Observabilité : le validateur
avertit (jamais ne rejette) quand un nombre est écrit dans le headline ET l'answer. **Mesure** : trois
runs de la batterie qualité — 3,82 avant les règles, 3,84 et 3,76 après (19/19 portes les deux fois) ;
R7 « pire règle » sur 5 réponses avant, 2 puis 3 après. À n = 19 et avec la variance du juge, l'effet
sur la moyenne n'est PAS démontré ; la disjonction headline/answer, elle, se voit sur chaque réponse
jour relue. Les règles restent (elles reprennent mot pour mot les notes du juge) ; la prochaine
lecture de cette moyenne se fait sur plusieurs runs, pas un.

### 3.8 Le client — la recherche prend les questions SUR LES CONCURRENTS (appliqué, I3)

L'owner a donné le 04/09 ce qu'il tape quand il veut la recherche concurrents : « qui sont
mes compétiteurs? », « qui sont mes concurrents », « cherche adversaires et rivaux », « quels
sont mes compétiteurs », « compétiteurs », « concurrents », « qui menace mon activité »,
« cherche compétiteurs ». Ce ne sont pas des NOMS courts : ce sont des questions sur les
concurrents. La porte (`isCompetitorSearch`, ie-prompt.js) ouvre donc la recherche quand la
saisie porte un de ces mots — compétiteur(s), concurrent(s), adversaire(s), rival/rivaux,
« menace mon activité » — accents et casse indifférents ; tout le reste part à l'endpoint.
« concurrence » n'en fait pas partie : « la concurrence a-t-elle pesé sur mon mois ? » est une
dimension, servie par le serveur. En mode CONCURRENCE (même bouton, icône loupe — le mode ne
change pas le gestionnaire, vérifié dans `setMode`), le comportement d'avant est conservé : un nom
court sans « ? » (« GL Events ») cherche, une question part à l'endpoint, une question sur les
concurrents cherche — `isQuestion` ne sert plus qu'à ça.

### 3.9 Les matchers

`/top (\d+ )?(produits?|ventes?)/` (index.ts:86). Aucun autre matcher ne bouge sans un cas
mesuré.

## 4. Les incréments — ordre, portes de merge, sacrifices

Chaque incrément est un commit, rejoué contre `tools/battery/prompt-conversation-battery.mjs`
(serveur frais) ET contre la lie-bait (`npx vitest run src/lib/ai/contracts/
src/lib/ai/honestAbsence.test.ts`). Un test se voit tomber avant de compter.

| # | Incrément | Fichiers | Porte de merge | Sacrifice assumé |
|---|---|---|---|---|
| I0 — **APPLIQUÉ 03/09** | Volet CLIENT : `tests/client/explorer-client-gate.test.ts` tape 22 lignes (ouvertures de la batterie, suites, probes) dans le vrai `ie-prompt.js` sous happy-dom et clique Envoyer ; les 15 lignes détournées sont en `it.fails` — le test passe parce qu'elles échouent, et il rougit le jour où I3 livre (retirer `.fails` alors). Un témoin (« Jésus » seul → recherche) prouve que la porte est armée. Volet ENDPOINT : bloc `CIBLE` en fin de `tools/battery/prompt-conversation-battery.mjs`, 16 probes un tour chacune, attendus = la cible, chacune étiquetée de l'incrément qui la livre ; tant que `now:false` elle est rapportée « RESTE ROUGE (cible In) » sans compter ; l'incrément qui livre pose `now:true` et elle devient une porte. 4 probes (fautes de frappe, anglais) sont déjà `now:true`. | `tests/client/explorer-client-gate.test.ts`, `tools/battery/prompt-conversation-battery.mjs` | 23/23 vert ; batterie verte, 11 probes rapportées rouges (cible). | aucun |
| I1 — **APPLIQUÉ 03/09** | `hors_perimetre` + `confiance` au registre et au résolveur ; garde déterministe `signalMetier` et réponse option A dans `src/lib/ai/horsPerimetre.ts` (pur, mutation vue rouge) ; branche dans `prompt.ts` avant « pourquoi », producer `deterministic_hors_perimetre_v1`, registre null, cadre écho-é = le précédent ; lexique et module-index à jour ; le lib est balayé par `evenement.fr.guard.test.ts`. | `semanticRegistry.ts`, `ai/resolver.ts`, `ai/horsPerimetre.ts` (+ test), `insight/prompt.ts`, `tools/battery/prompt-conversation-battery.mjs` (6 probes I1 en porte) | Batterie verte, 6/6 probes I1 → `deterministic_hors_perimetre_v1`, 11/16 cible ; 61 tests vitest (client gate, garde, guards copie). | une question métier sans AUCUN signal détectable serait refusée — non observé sur les 16 probes |
| I2 — **APPLIQUÉ 03/09** | `frPeriod` gagne `kind: "day"` (hier, avant-hier, aujourd'hui ; 4 tests, mutation vue rouge) ; le résolveur re-lit chaque expression avec `frPeriod` et prend ses bornes (`periode_validee`) ; conventions dans le prompt (règle 3) ; `_rsvPassPeriod` → chemin jour (jour unique) ou fenêtre du renvoi rapport (plusieurs jours). Pas de champ `date` (§ 3.2). | `dates/frPeriod.ts` (+ test), `ai/resolver.ts`, `semanticRegistry.ts`, `insight/prompt.ts`, batterie (2 probes I2 en porte, semaine civile calculée) | Batterie verte, 13/16 cible ; « hier » → `grounded_day_claude` daté 02/09 ; « la semaine dernière » → renvoi rapport 24/08→30/08 (totaux vérifiés BQ). | aucun |
| I3 — **APPLIQUÉ 04/09** | Client : la recherche concurrents ne prend que les questions sur les concurrents, aux mots owner (§ 3.8) ; `?v=52`. | `ie-prompt.js`, `prompt.astro` (cache-buster), `tests/client/explorer-client-gate.test.ts` | 37 cas côté client : 25 vers l'endpoint (dont les 15 détournées avant I3, plus « Jésus » seul et une question de dimension), 10 vers la recherche (les 8 de l'owner + 2 variantes de frappe), 2 sur le mode concurrence (nom court → recherche, question → endpoint). | un nom de concurrent tapé seul en mode PLANNING (« GL Events ») part à l'endpoint (entité extérieure, web, un tour plus lent) ; en mode concurrence il cherche comme avant |
| I4 — **APPLIQUÉ 04/09** | Validateur : cohérence d'une comparaison + localité des nombres (§ 3.7) ; message de rejet citant la phrase ; correction des milliers insécables dans `extractNumbersWithUnits`. | `contracts/groundingChecks.ts`, `contracts/packagerGroundedDayValidator.ts`, `contracts/groundedReferential.test.ts` | Lie-bait rouge puis verte (15 cas) ; suite contracts + honestAbsence 85/85 ; en vrai : 4 vrais positifs rejetés, 1 faux positif trouvé et corrigé, 02/09 et 28/08 en attempt 1. | plus de planchers déterministes quand le modèle ne sait pas écrire la comparaison juste (mesuré : 1 run sur 2 de « hier ») |
| I9 — **APPLIQUÉ 04/09** | Jour demandé PASSÉ mais non mesuré : `unmeasuredPastDayFacts` (pur, mutation vue rouge) rend UN fait, phrase owner 04/09 corrigée le même jour (« il y entre avec le traitement de nuit » refusé : pas français, pas précis) — « Le 03/09/2026 n'est pas encore dans vos ventes : il sera dans la base de données demain matin, à partir de 7 h 10. Dernier jour mesuré : mercredi 02/09/2026, 1 439 €, +70 % vs votre CA habituel. » L'heure est MESURÉE sur dbt Cloud (job `daily_fresh_data_run_general`, cron 05:00 UTC lundi-samedi, résidu construit à +7-10 min) et CALCULÉE en heure de Paris (`nextDailyRunFr` : « ce matin » / « demain matin » / « lundi matin », 7 h 10 l'été, 6 h 10 l'hiver ; 5 tests, mutation vue rouge) — jamais l'habituel du jour non mesuré (les deux faits qui invitaient le référentiel croisé). Le jour résolu par le résolveur porte aussi le fait « Date interprétée : « hier » = jeudi 03/09/2026 » (règle 1quater), sans quoi le modèle appelait « hier » le 02/09. Panier moyen de l'échelle à deux décimales (owner 04/09). | `lib/ai/facts/buildDayPerformanceFacts.ts` (+ test), `prompt.ts`, `entityReading.ts` | « combien j'ai vendu hier ? » avant le traitement de nuit : 3/3 `grounded_day_claude` en attempt 1 (télémétrie rejected_first=false), la phrase owner dans la réponse ; échelle « 4,70 € ». | aucun |
| I5 — **APPLIQUÉ 04/09** | Huit intentions ajoutées (`jour`, `bilan_periode`, `dimension`, `fenetre`, `entite_exterieure`, `evenement_lookup`, `mes_evenements`, `rapport` ; `fiches` reste regex, sa branche précède le résolveur) ; dispatch `_rsvDecided` qui pose horizon/intent legacy ; classifieur Haiku appelé seulement en repli ; matcher de famille sous le résolveur ; `jour` sans date = dernier jour mesuré ; phrase I6 sur l'assemblage final des chemins legacy. | `semanticRegistry.ts`, `ai/resolver.ts`, `prompt.ts` | Batterie verte, CIBLE 16/16 ; 8 questions de routage sondées : jour → dernier jour mesuré (1 439 € vs 847 €), fenêtre → v3, lookup → 7 événements, entité extérieure → web, dimension → famille horaire, mes événements, rapport ; suite vitest complète verte. | latence : `jour` sans date coûte un aller-retour BQ (dernier jour mesuré) |
| I6 — **APPLIQUÉ 04/09** | `questions_supplementaires` au formulaire (règle 11 : la PREMIÈRE question remplit le tuple, les autres recopiées mot pour mot) ; `sysDialogueResponse` ajoute la phrase owner « Vous m'avez aussi demandé : « … » — posez-la à part. » en section (plan_sections) ou en prose. Les chemins legacy la recevront avec I5. | `semanticRegistry.ts`, `ai/resolver.ts` (+ test), `prompt.ts` | Probe I6 : panier moyen sur JUILLET (plus septembre), −0,4 % vs la même durée précédente, la phrase présente avec la seconde question verbatim. | la seconde question n'est pas répondue dans le même tour ; les réponses legacy (jour, mois) ne portent pas encore la phrase |
| I7 — **APPLIQUÉ 04/09** | Matcher `top (\d+ )?produits` ET une lecture nouvelle : le matcher seul menait à un 400 (« août » = jeton de date non parsé du chemin jour) et la famille offering est un profil 30 j qui ne sait pas dire août. `lib/topFamilles.ts` : les familles de la période classées par CA (CA, part, CA/jour, K premières + « Autres familles »), producer `deterministic_top_familles_v1`. | `insightFamilies/index.ts`, `lib/topFamilles.ts` (+ test, mutation vue rouge), `prompt.ts` | « top 3 produits août » → table datée du 01/08 au 31/08, ≥ 3 lignes. | libellés ACTÉS owner 04/09 : titre « Vos familles de produits & services — du … au … », section « Top 3 familles de produits par CA » (mot owner 04/09 ; « Les 3 premières au CA » refusé : ne veut rien dire), colonnes « CA · Part du CA · CA/jour », ligne « Autres familles (N) », source « CA/jour = … » ; phrase de tête = la concentration (« vos 3 premières familles font 79,1 % du CA de la période »), jamais la première ligne de la table redite |
| I8 — **APPLIQUÉ 04/09** | Lecture « dispositif × famille » (ventes = tickets avec la famille, panier moyen du ticket entier, CA, part `revenue_share`) sur la base comparable PARTAGÉE (`OCC_CTE`) ; période par défaut d'une opération = sa vie ; branche avant la comparaison N entités. Doc : `docs/explorer-dispositif-famille-spec.md` (DÉFINITIF). | `dispositifFamille.ts` (+ test), `entityReading.ts`, `prompt.ts`, `semanticRegistry.ts`, batterie D11, lexique, index | D11 vert ; 5 tests purs (mutations vues rouges) ; chiffres recoupés par requête BQ indépendante ; échelle de la vente inchangée. | aucun |

Ordre suivi : I0 (03/09), I1, I2 (03/09), I8, I4, I3, I9, I6, I7, I5 (04/09).

### 3.10 Limite connue (I1, à lever en I5)

Le résolveur ne tourne que si le site a au moins une entité (`_rsvSite.entities.length`,
`prompt.ts` bloc résolveur) : un compte sans famille ni pôle ni opération n'a donc ni résolveur
ni refus hors périmètre — « qui est Jésus ? » y rend encore le théâtre. I5 fait tourner le
résolveur sur tout compte (les listes vides se disent vides dans le prompt, déjà géré par
`resolverSystemPrompt`). Observé aussi : la PREMIÈRE requête après démarrage du serveur peut
dépasser le timeout du résolveur (8 s) et retomber sur le repli regex — réponse juste, cadre
absent ; à mesurer en prod avant de toucher le timeout. **Mesure en place (04/09)** : chaque appel du
résolveur écrit une ligne `analytics.consulter_telemetry` (`event_type = "resolver"`, payload `ms`,
`intent`, `nul`, `validee`). Première lecture (04/09 13:00) : 4 appels coupés à 8 s en 20 minutes (~9 s bout en bout) après une
journée à 0 nul et 3,5 s au pire — une pointe de latence API, pas un démarrage à froid ; un tour coupé
part sur les regex et perd sa comparaison (batterie D6). Timeout porté à **12 s** (`resolver.ts`).
Un « warm-up » au déploiement ne se construit que si cette requête montre
des `nul` au premier tour :
`SELECT DATE(event_ts) d, COUNTIF(JSON_VALUE(payload,'$.nul')='true') nuls, COUNT(*) n,
 APPROX_QUANTILES(CAST(JSON_VALUE(payload,'$.ms') AS INT64), 20)[OFFSET(19)] p95_ms
 FROM \`muse-square-open-data.analytics.consulter_telemetry\` WHERE event_type='resolver' GROUP BY 1 ORDER BY 1 DESC`.

## 5. Ce qui ne bouge pas

Les composeurs (`planPeriod`, `entityReading`, `journalPlan`, familles, packagers, grounded
day) ; les regex legacy (elles deviennent repli, pas supprimées — « never delete old
functions until replacements are tested ») ; la recherche concurrents en mode concurrence ;
les assertions existantes de la batterie ; les chaînes déjà approuvées.

## 6. Arbitrages owner EN ATTENTE (aucune chaîne n'est proposée ici — règle 2 du lexique)

1. **ACTÉ 03/09 (option A)** — titre « Aucune donnée pour cette question », corps = ce que le
   compte contient (familles réelles) + la question verbatim + « Pourquoi le JJ/MM ? » ; ligne
   ajoutée au lexique ; foyer `src/lib/ai/horsPerimetre.ts`.
2. **ACTÉ 03/09** — « bonjour » / « merci » reçoivent la même réponse que 1 (owner : « Option A,
   go »). Une réponse de politesse distincte reste possible plus tard, à un mot owner près.
3. **ACTÉ 04/09** — la recherche concurrents prend les questions sur les concurrents (8 saisies
   owner, § 3.8) ; un nom seul n'est plus une recherche en mode planning.
4. **ACTÉ 04/09** — après la réponse à la première question : « Vous m'avez aussi demandé :
   « <la seconde, verbatim> » — posez-la à part. » (à appliquer en I6).
5. **ACTÉ 03/09 (go I2)** — « la semaine dernière » = semaine civile précédente, lundi→dimanche
   (convention `frPeriod`, désormais aussi celle du résolveur).
6. **Le nom du volet dans le lexique** : la Nav dit « Explorer », un commentaire dit
   « Demander » ; aucune ligne du lexique ne nomme la page.

## 7. Mesure de réussite

Les 16 probes du 03/09 rejouées : 0 réponse hors sujet (défaut 2), 0 nombre à référentiel
croisé (défaut 3), 0 question détournée côté client (défaut 1), chaque réponse porte le
producer attendu. Latence de routage : un appel LLM par tour au lieu de deux. Les 10
dialogues de la batterie et la batterie qualité restent verts.

— DÉFINITIF
