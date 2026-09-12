# Explorer, un outil — les capacités comme outils, la réponse comme blocs, une seule boucle — SPEC DE TRAVAIL

**Sert : intent § Le métier et § Le test de valeur** — la mémoire opérationnelle d'un lieu répond à ce
qu'on lui demande, lit ce qu'elle sait, et propose ce qu'elle a mesuré. Arbitrage owner du 12/09 : les
capacités nouvelles d'Explorer (rapport à la demande, pont de marge, proposition d'opération, plan du
magasin) **entrent comme des outils que la chaîne générale choisit et combine, jamais comme des couches
posées devant elle**. Ce document dit l'état au présent (§ 1) et ce qu'il faut construire à l'impératif
(§ 3 à § 9).

---

## 1. Le constat (mesuré le 12/09)

- `src/pages/api/insight/prompt.ts` fait **7 251 lignes** et porte **28 sorties anticipées** sous **20
  producteurs déterministes** (`deterministic_missing_dates_v1`, `_report_nav_v1`, `_engagements_elicit_v1`,
  `_declared_margin_v1`, `_declared_capture_v1`, `_top_familles_v1`, `_offering_elicit_v1`,
  `_missing_dimension_elicit_v1`, `_hors_perimetre_v1`, `_evenements_v1`, `_entity_period_elicit_v1`,
  `_dispositifs_v1`, `_dispositif_famille_v1`, `_window_patterns_v1`, `_window_filter_days_v1`,
  `_plan_why_v1`, `_plan_period_v1`, `_objection_v1`, `_mobility_v1`, `_measured_margin_v1` — ce dernier
  ajouté le 11/09 par le lot marge). Chacune reconnaît sa question par des motifs de mots, lit, répond et
  **sort** avant la chaîne générale (classifieur → lecteurs par famille `FAMILIES` → faits cités →
  validateur `validate_packager_output_grounded_day` → blocs).
- Conséquence mesurable : une question qui mélange deux sujets n'a aucune couche, donc aucune réponse
  composée (« rapport de la semaine avec les pôles et le panier moyen »). L'ordre des couches est un
  comportement : deux d'entre elles se disputent une même question et la première écrite gagne.
- **L'agent Explorer existe** (`docs/explorer-agentique-spec.md`, `POST /api/explorer/agent`,
  `src/lib/explorer/agentTools.ts`) : un modèle qui converse, **cinq outils de lecture** (`lire_poles`,
  `lire_familles`, `lire_photos`, `lire_memoire`) et un d'écriture (`ecrire_memoire`), sans état, avec
  trace des tours, prompt système stable mis en cache, SSE au contrat de `prompt.ts`. Hors périmètre de
  son incrément 1 : aucune question chiffrée sur les ventes, aucune écriture hors mémoire, aucune surface.
- **Les lecteurs existent déjà comme fonctions pures** : le registre `FAMILIES`
  (`src/lib/insightFamilies/index.ts`, 17 providers dont `marge`, `espace`, `signaux` du 11/09), chacun
  rendant `{ found, data, facts, sources }` — `data` pour un rendu du kit (`renderMarge`, `renderEspace`,
  `renderSignauxFamille`…), `facts` typés pour le validateur. Le rapport de ventes (`insight/sales-report.ts`)
  calcule déjà volume, panier moyen, mix ; le rapport de famille (`insight/family-report.ts`) compose déjà
  une section par provider avec un résumé passé au même validateur.
- **Les blocs de réponse existent** : `renderAnswerBlocks` (`public/js/card-kit.js`) rend une liste de
  blocs typés avec un registre de confiance obligatoire (`register`), et ignore bruyamment un type inconnu.

Autrement dit : les briques d'un outil général sont là ; ce qui manque est une seule boucle qui les
choisit, et la décision de ne plus rien ajouter devant elle.

---

## 2. Les trois principes (owner 12/09)

1. **Une capacité est un outil déclaré** : un nom, ce qu'il lit (vues `semantic` seulement), ce qu'il
   rend (des faits typés + un bloc), ses bornes. Il est pur, testé sans réseau, et enregistré dans un
   registre unique. Il n'a pas de motif de mots : c'est la boucle qui le choisit.
2. **Une réponse est une suite de blocs typés** : texte vérifié, tableau, carte, rapport, proposition
   d'opération, plan, absence. Chaque bloc porte ses faits et son registre ; le validateur reste l'unique
   porte, sur l'union des faits rendus par les outils du tour.
3. **Rien n'est ajouté dans la chaîne sans être accessible à une question qui ne l'a pas nommé** : une
   capacité n'est livrée que si une question composée (« … et … ») la mobilise avec une autre, et le
   test de la batterie le prouve.
4. **Des modules que l'exploitant édite, et ses choix deviennent du contexte (owner 12/09, trois niveaux).**
   n1 — une surface est faite de blocs de contenu que l'utilisateur déplace, retire, duplique, complète, pour
   répondre au plus près à SON besoin ; ce principe se généralise aux pages d'engagement, puis au tableau de
   bord. n2 — les choix qu'il fait (sections gardées, ordre, notes, questions posées) sont des éléments de
   contexte — préférences, intérêts, priorités — que le modèle reçoit pour servir ses besoins réels, pas
   inférés. n3 — le Rapport vit dans une page dédiée, reliée au tableau de bord (accès rapide pour un usage
   récurrent).

---

## 3. L'architecture cible : une boucle, un registre, des blocs

```
question (+ fichiers, + fil)
   │
   ▼
Boucle Explorer (agent : SDK tool runner, prompt système STABLE, ≤ 8 itérations)
   │  choisit et enchaîne des OUTILS du registre ; ne calcule jamais ; ne cite que leurs faits
   ▼
Outils (purs, semantic seulement, testés) ──► faits typés + bloc(s)
   │
   ▼
Validateur (le même qu'aujourd'hui) : chaque nombre de la réponse ∈ faits des outils du tour
   │
   ▼
Réponse = blocs[] (texte_verifie · tableau · carte · rapport · proposition_operation · plan · absence)
   │
   ▼
Rendu : renderAnswerBlocks (kit) — un type de bloc = un rendu, jamais un rendu par question
```

- **La boucle** est celle de l'agent existant (`/api/explorer/agent`). `prompt.ts` n'accueille **aucune
  couche nouvelle** à partir de ce jour ; il continue de servir ses 28 sorties tant qu'elles ne sont pas
  rentrées dans le registre (§ 7).
- **Le modèle choisit, il ne calcule pas.** Toute arithmétique vit dans un outil (les providers, le
  composeur, le pont de marge). Le prompt système le dit ; le validateur le vérifie — un nombre absent
  des faits du tour fait échouer la réponse, comme aujourd'hui (porte lie-bait, `npm run gate`).
- **Parallélisme** : la boucle demande les outils indépendants en un tour (le SDK exécute les appels
  d'un même tour ensemble) ; le budget de 3 s par page vaut pour la première réponse utile (le premier
  bloc arrive en SSE, comme aujourd'hui les événements `tool`).

---

## 4. Le registre des outils

Un fichier, `src/lib/explorer/agentTools.ts` (il existe), une entrée par outil ; chaque entrée déclare
`name`, `description` (au modèle), `inputSchema` (zod v4, § 1 « Le piège zod » de la spec agent), `run`,
et — nouveau — `blocs` (ce qu'elle rend à l'exploitant) et `facts` (ce qu'elle rend au validateur).

| Outil | Entrée | Source (semantic / lib) | Rend | Bloc |
|---|---|---|---|---|
| `lire_poles`, `lire_familles`, `lire_photos`, `lire_memoire`, `ecrire_memoire` | existants | — | — | texte_verifie |
| `lire_ventes` — **livré 12/09** | `periode` (`30_derniers_jours` défaut, `semaine_derniere`, `mois_dernier`) ou `du`/`au` (AAAA-MM-JJ) ; `grain` (jour de semaine) reste à faire | `lib/rapport/ventes.ts` `computeSalesReport` = le cœur de `insight/sales-report.ts`, déplacé (la route est un habillage, sortie identique à l'octet) : CA, ventes, panier moyen, `layers` (volume, panier, mix), meilleure et plus faible journée, profil par jour de semaine, répartition par famille, période précédente et an dernier | faits (`composeVentesFacts`, les phrases de `rapport.astro` et du chat ; la période lue est un fait) | deux `tableau` (les trois couches ; le mix par famille) + `sources` ; `absence` sur une période sans vente |
| `lire_marge` | `période`, `jours` (week-end, un jour de semaine) | `readMeasuredMargin30d` généralisé à une période (`lib/kpi/margin.ts`) | marge brute, taux, couverture, familles, lignes sous prix d'achat | carte `renderMarge` |
| `lire_resultat` — **livré 12/09** | `mois` (AAAA-MM ; défaut = le dernier mois complet) | `lib/kpi/resultat.ts` `readResultat` : `vw_insight_event_monthly_result` (6 mois), `vw_insight_event_daily_margin` (dernier jour) — les mêmes lectures que Piloter | résultat net du mois et des deux mois complets précédents (marge brute sur CA net HT, charges fixes, masse salariale, couverture), part de la masse salariale, seuil de rentabilité du jour et heure atteinte ; le mois en cours se dit en cours ; absences typées (charges, couverture) avec le geste de Piloter | `tableau` (les mois) + `faits` (le seuil) + `sources` ; `absence` |
| `lire_espace` | — | `listPoleSpace` (`vw_insight_event_pole_space` + `vw_insight_event_space_30d`) | linéaire, surface de vente, CA, CA net HT et marge brute par mètre et par m², part de marge contre Part de linéaire | carte `renderEspace` |
| `lire_familles_face_aux_jours` | `famille?`, `classe?` | `composeSignauxFamille` | CA/jour famille vs vos jours comparables, panier, part | carte `renderSignauxFamille` |
| `lire_poles_classement` — **livré 12/09** | `indicateur` (`ca`, `ventes`, `marge_brute`, `ca_par_metre`, `ca_par_m2`, `marge_par_metre`), période comme `lire_ventes` | `lib/dispositifs/poleClassement.ts` : `vw_insight_event_pole_daily` sommée sur la période (« Non rattaché » compris) ; par mètre et par m² : le foyer `listPoleSpace` (30 jours des mesures, dit) | du plus au moins performant, un fait par pôle : indicateur, part du CA ou de la marge, écart au résultat habituel, jours vendus | `tableau` + `sources` ; `absence` (aucun pôle vendu, aucune mesure, aucune marge) |
| `composer_rapport` | `période`, `sections[]` (clés du registre § 6), `indicateur?` | appelle les outils de lecture ci-dessus, assemble, puis le résumé passe au validateur | un rapport | rapport |
| `proposer_operation` | `familles`, `objectif` (KPI), `dates`, `levier`, `pourquoi` (les faits qui la motivent) | aucune écriture : rend le corps prêt pour le formulaire existant (`event-form.js`) | une proposition | proposition_operation |
| `pont_de_marge` | `période A`, `période B` | `fct_client_family_margin_daily` → effets volume, panier, mix, remises, prix d'achat (méthode de conseil : pont prix-volume-mix) — **après les premiers prix d'achat réels** | faits chiffrés | tableau |
| `lire_plan` | — | contours des pôles (à stocker : § 9) + `lire_espace` | le plan coloré | plan |

Règles :
- **Aucun outil n'écrit** hors `ecrire_memoire` : une opération se prépare, l'exploitant la crée
  (`agentic-use-case-pepper` : l'agent exécute la lecture, l'exploitant décide). Aucun outil ne parle de
  commandes, d'achats, de stock, de réassort.
- **Un outil = un provider déjà pur quand il existe** (`FAMILIES.*`) : l'outil est un adaptateur d'une
  ligne, jamais une copie. Le rapport de famille et le rapport de ventes appellent les mêmes fonctions.
- **L'absence est un résultat** : `found: false` rend un bloc `absence` qui dit ce qui manque et le
  geste qui le débloque (le mot de Piloter : « Importer vos prix d'achat », « Déclarer votre surface de
  vente »), jamais une section vide ni un chiffre estimé.

---

## 5. Les blocs de réponse

`blocks[]` de `renderAnswerBlocks` gagne ces types ; un type = une fonction de rendu du kit, réutilisée
par la page Explorer, le rapport de famille et le rapport de ventes.

| Type | Contenu | Rendu | Registre |
|---|---|---|---|
| `texte_verifie` | `text`, `facts_cited[]` | existant (`register`) | celui du validateur |
| `tableau` | `colonnes[]`, `lignes[]`, `titre`, `tri` | `msSortTable` | vérifié (données d'outil) |
| `carte` | `render` (nom du kit), `data` | `MSCardKit[render](data)` — comme le rapport de famille | vérifié |
| `rapport` | `sections[]` = `{ cle, titre, blocs[] }`, `synthese` (texte vérifié) | une zone par section, comme `family-report.astro` | vérifié |
| `proposition_operation` | `corps` (le body de POST /api/commitments prêt), `pourquoi[]` (faits) | carte « Proposition d'opération » + CTA « Préparer l'opération → » qui ouvre le formulaire pré-rempli | vérifié |
| `plan` | `zones[]` (contours en points du plan, valeur, libellé), `mesure` | SVG en ligne, une teinte par valeur | vérifié |
| `absence` | `manque`, `geste` | phrase courte + lien vers le geste Piloter | — |
| `barres` · `barres_h` · `parts` (12/09, owner : « add tables and graphs ») | `items[]` = valeurs d'outil avec leurs libellés formatés | SVG / div du kit, grammaire de rapport.astro | vérifié (données d'outil) |
| `note` (12/09) | `text`, `auteur`, `date` | pastille « Votre note » | Votre note (jamais vérifié) |

Le formulaire d'opération (`event-form.js`) apprend à **recevoir un corps pré-rempli** (familles,
objectif, dates, levier) — la seule modification d'une surface existante que cette spec demande ; le
CTA final reste celui du formulaire (« Créer l'opération — … »).

---

## 6. Le rapport : un document de blocs, persistant

Arbitrage owner du 12/09 : le rapport généré par Explorer n'est pas une page rendue à la volée mais **un
document** que l'exploitant garde, réordonne, complète, réutilise et envoie. Les mots sont actés
(lexique, 12/09) : **Rapport** (le document), **Modèle de rapport** (le document sans ses chiffres),
**Enregistrer comme modèle**, **Synthèse** (la section de tête), **Approfondir** (creuser un bloc avec
l'agent), **Votre note** (un texte écrit par l'exploitant, non vérifié), **Envoyer chaque …** (la cadence).

### 6.1 Le document

- Un Rapport = `{ titre, periode { du, au, relative? }, blocs[] (§ 5), modele_id?, version }`, par site,
  avec l'auteur. Table app-write `analytics.report_documents` (grain : `document_id × version`,
  append-only : chaque enregistrement est une version, la dernière fait foi, comme les journaux existants),
  lue par le producteur seul (comme `declared_parameters`) ; une vue dbt naît le jour où un lecteur autre
  que la page en a besoin.
- Chaque bloc garde sa **provenance** : l'outil, ses paramètres, la période, la date de calcul. Un bloc est
  donc **recalculable** (« Actualiser ») et un document déplacé reste vrai.
- « Enregistrer en PDF » reste ; « Enregistrer » garde le document ; les deux rapports existants (ventes,
  famille) deviennent des documents composés par les mêmes outils, sans changer leurs chaînes approuvées.

### 6.2 Les gestes sur le document

| Geste | Ce que ça fait | Règle |
|---|---|---|
| Déplacer un bloc | réordonne `blocs[]` (glisser-déposer, ou flèches) et enregistre une version | aucun recalcul |
| Retirer · Dupliquer une section | idem | idem |
| **Approfondir** | l'exploitant désigne un bloc et pose sa question ; la boucle relance les outils **avec la période et le périmètre de ce bloc** ; le résultat s'insère après lui, comme un bloc vérifié | le modèle ne réécrit jamais un bloc vérifié |
| **Votre note** | l'exploitant écrit lui-même sous un bloc | registre « Votre note » (pastille distincte, non vérifiée) ; jamais mêlée à un texte vérifié |
| Actualiser | recalcule les blocs à provenance sur la période relative | les blocs « Votre note » restent ; la Synthèse tombe (owner 12/09 : c'est bien, l'exploitant la reprend) |
| Modifier la Synthèse (12/09) | l'exploitant reprend la Synthèse dans ses mots | registre « Votre note » (jamais vérifié, jamais mêlé) |
| Historique | chaque geste écrit une version ; l'historique se montre et chaque version se rouvre (owner 12/09 : oui) | append-only, rien ne s'efface |

Sur la surface : les mots des actions sont ceux du lexique (jamais « geste », mot de cuisine) ; Déplacer se fait
par des flèches, pas des mots (owner 12/09) ; l'organisation et la hiérarchie des actions sur la page restent
à faire avec la surface définitive.

### 6.3 Le Modèle de rapport

- **Enregistrer comme modèle** retire les chiffres et garde la liste des sections, leurs paramètres et la
  période **relative** (« la semaine dernière », « les 30 derniers jours », « le mois dernier »). Table
  app-write `analytics.report_templates` (grain `template_id × version`, par site, avec l'auteur, `nom`).
- Un modèle est une entrée de la bibliothèque du site (le patron d'interface de l'atelier Communiquer :
  liste, choisir, appliquer) ; « génère mon rapport hebdomadaire » en Explorer nomme le modèle par son
  nom et `composer_rapport` le remplit sur la période courante.
- Les rapports de ventes et de famille d'aujourd'hui sont les deux premiers modèles, livrés par défaut.

### 6.4 L'envoi à cadence (incrément 5, livré le 12/09)

- Un envoi programmé = `{ modele_id (« ventes » ou un Modèle du site), cadence (quotidien · hebdomadaire jour ·
  mensuel jour · trimestriel · annuel), heure (Paris), canal (email · slack), destinataires }` — table app-write
  `analytics.report_schedules`, grain schedule_id × version, append-only ; « Arrêter » écrit la version suivante
  avec `actif = false`. Chaque envoi effectué — ou RETENU faute de matière — laisse une trace dans
  `analytics.report_sends` (schedule_id × période, `document_id` null quand rien n'est parti) qui interdit le
  double envoi ; le rejeu de l'heure n'envoie rien (mesuré 12/09 : « déjà tracé hier, le 11/09/2026 »).
- La période est celle de la CADENCE, décalée : chaque jour → hier ; chaque semaine → la semaine civile dernière ;
  chaque mois → le mois civil dernier ; chaque trimestre / chaque année → le trimestre / l'année civils derniers.
  La période relative du Modèle ne s'applique pas à l'envoi (ce qui part le lundi couvre la semaine finie).
- Le cron `GET /api/cron/report-sends` (Bearer `CRON_SECRET`, `?dry=1` liste sans envoyer) est appelé CHAQUE
  HEURE par cron-job.org (aucun cron dans `vercel.json`, le patron des autres crons) — **le job reste à créer par
  l'owner sur la prod**. Il compose le document depuis le Modèle SANS la boucle (`lib/rapport/gestes.ts
  composerSurPeriode` : les mêmes lectures que composer_rapport, déterministes, donc pas de Synthèse et rien
  d'inventé), l'enregistre comme Rapport (`report_documents`, `modele_id` posé), le rend en HTML côté serveur PAR
  LE MÊME KIT (`card-kit.js` importé comme chaîne : ses primitives sont des chaînes à styles inline, aucun DOM ni
  happy-dom requis — les graphiques SVG sont retirés du courriel, chacun a son tableau à côté) et l'envoie par les
  rails existants (`lib/channels/internalSend.ts` : email Resend avec `html` + `text`, Slack en texte). Le courriel
  porte « Ouvrir le Rapport » vers `/app/insightevent/rapports?document_id=…`.
- **Un rapport sans matière ne part pas** : un document dont aucune section ne porte un bloc à chiffres (tableau,
  faits, carte, graphique) n'est pas envoyé — la trace le dit, le cron n'insiste pas le même jour.
- **Destinataires** : l'utilisateur (son email Clerk, « Moi ») et les membres de l'équipe qui ont un email
  (`analytics.team_members.channels_contact`, le même annuaire que les consignes) ; Slack : un canal, sinon le
  canal par défaut de la configuration. Une lettre aux clients finaux suppose une liste avec consentement que l'app
  ne détient pas : hors périmètre tant que l'owner n'en décide pas autrement.
- « Envoyer maintenant » (route, `maintenant: true`) : le même chemin, tout de suite, tracé sans schedule_id — c'est
  aussi l'essai réel. **Reste** : le PDF (owner 12/09 : « envoyer le PDF une fois ») demande un Chromium sans tête —
  second temps ; l'organisation des envois sur la page (tout est sous « Vos envois », un formulaire par Modèle).

### 6.5 Le registre des sections

`src/lib/fr/rapport.fr.ts` (patron : `rapportCanaux.fr.ts`, un fichier de mots par surface, éditable par
l'owner). Une entrée par section : `cle`, `titre`, `definition` (une ligne), `referentiel`, `unite`,
`alias[]` (les formulations par lesquelles un exploitant la demande — tirées des questions réelles de
`analytics.consulter_telemetry` et des cas d'usage). `composer_rapport` choisit par alias ; une demande
sans section ne s'invente pas : elle rend un bloc `absence`.

| Clé | Titre (actés 12/09) | Source du mot |
|---|---|---|
| `synthese` | Synthèse | owner 12/09 (remplace « Résumé exécutif » du rapport de famille) |
| `chiffre_affaires` | Chiffre d'affaires | rapport de ventes |
| `volume` · `panier` · `mix` | Nombre de ventes (owner 12/09) · Panier moyen · Mix produits & services | lexique l.83, `couches-dans-leur-unite` |
| `marge_brute` · `resultat_net` · `seuil_rentabilite` | Marge brute · Résultat net · Seuil de rentabilité | lexique (owner 11/09, 12/09) |
| `poles` | Vos pôles · du plus au moins performant (indicateur nommé) | Piloter « Vos pôles » |
| `familles` | Vos familles · du plus au moins performant (indicateur nommé) | lexique « famille » |
| `espace` | Espace · linéaire, surface de vente, CA par mètre | titre du provider |
| `jours` | CA moyen par jour de la semaine (proposé 12/09, à ratifier — « Profil par jour de semaine » jugé peu clair) | rapport de ventes |
| `contexte` | Contexte externe | rapport de ventes |
| `actions` | Actions recommandées | rapport de ventes |
| `sources` | Sources et fiabilité | rapport de famille |

Comparaisons : « par rapport à la période précédente », « par rapport à la même période l'an dernier ».
Toute chaîne nouvelle passe les tests 8-13 avec son tableau avant d'entrer dans le registre.

---

## 7. La migration des couches existantes

Aucun grand soir. Chaque couche de `prompt.ts` rentre dans le registre **une à une**, dans cet ordre,
avec pour chacune : (a) sa question de référence dans la batterie (`tools/battery`), (b) une réponse de
l'agent jugée équivalente ou meilleure sur cette question, (c) le retrait de la couche dans le même
commit. Tant qu'une couche n'est pas rentrée, `prompt.ts` la sert ; l'aiguillage vers l'agent se fait
par capacité, jamais par site.

1. `_measured_margin_v1` et `_declared_margin_v1` → `lire_marge` (la plus récente, la mieux connue).
2. `_top_familles_v1`, `_offering_elicit_v1` → `lire_ventes`.
3. `_dispositifs_v1`, `_dispositif_famille_v1` → `lire_poles` (existe) + `lire_familles_face_aux_jours`.
4. `_report_nav_v1`, `_plan_period_v1`, `_plan_why_v1` → `composer_rapport`.
5. `_declared_capture_v1` → `ecrire_declaration` (le seul outil d'écriture de plus : les paramètres à
   date d'effet et les marges déclarées, par les foyers existants).
6. Les couches d'élicitation (`_missing_dates_v1`, `_entity_period_elicit_v1`,
   `_missing_dimension_elicit_v1`, `_engagements_elicit_v1`) rentrent en dernier : elles deviennent des
   blocs `clarification` que la boucle rend quand un outil manque d'une entrée.

Ce qui ne rentre pas : `_hors_perimetre_v1` et `_objection_v1` restent des règles du prompt système.

---

## 8. Preuves exigées avant de dire « livré »

- Chaque outil : une fonction de composition pure et son test (patron `composeMargeFamily`,
  `composeEspaceFamily`), une mutation vue rouge.
- La batterie de l'agent (`tools/battery/explorer-agent-battery.ts`, `npm run battery:agent` — 12/09) rejoue les
  questions composées du § 2.3 et celles de l'owner sur la vraie boucle et le compte de test : outils attendus,
  fait attendu, durée, registre ; 6/6 verts le 12/09, 8,5-16,7 s. La porte lie-bait (`npm run gate`) reste verte
  à chaque commit.
- Un harnais par type de bloc : `tools/harness/explorer-blocks-render-verify.mjs` (`npm run harness:explorer-blocks`,
  12/09) rend `tableau`, `faits`, `absence`, `sources` et la pastille par le VRAI kit dans happy-dom sur les blocs des
  libs, données réelles du compte de test owner (il a attrapé le double `<table>` du kit, corrigé ?v=80) — le même
  rendu côté serveur servira l'email.
- Chaque chiffre d'une réponse porte sa requête et sa fenêtre (dans les `sources` du tour).
- Le texte du modèle passe la relecture mécanique (`lib/fr/relecture.ts`, 12/09) : mots bannis et tournures de
  machine, phrase par phrase ; une phrase fautive ne se montre pas et la batterie la compte. La nuance (règles
  8-13) reste à la relecture humaine : cette page d'arbitrage sert de page de relecture.
- Budget : première réponse utile sous 3 s sur le compte de test owner, mesuré, jamais déduit.
- Le document : une version par enregistrement, relue après écriture (sonde réelle sur le compte de test,
  puis suppression), un déplacement de bloc qui ne change aucun chiffre (test pur sur `blocs[]`).
- L'envoi : un envoi réel à l'owner, la trace en base, le rejeu qui n'envoie rien — fait le 12/09 (§ 9, 5).

---

## 9. Ordre de livraison

Chaque incrément = des commits d'une fonction, sur `dev`, index des modules à jour, chaînes visibles avec
leur tableau 8-13, preuves du § 8. Rien ne passe en production sans l'essai de l'owner.

1. **Incrément 1 — le registre et les blocs** (en cours, 12/09) : **faits** — `lire_marge`, `lire_espace`,
   `lire_familles_face_aux_jours` (commit c50d675b), `lire_ventes` (le cœur de `sales-report.ts` déplacé
   dans `lib/rapport/ventes.ts`, route inchangée à l'octet ; blocs `tableau`), la boucle rend des blocs,
   le kit rend `carte`, `tableau`, `absence`. **Mesuré sur le compte de test** : « Combien ai-je vendu sur
   mes 30 derniers jours, et qu'est-ce qui a bougé ? » → lire_ventes 0,9 s, 8 faits, deux tableaux, réponse
   en 13,1 s ; « Mon CA de la semaine dernière ? » → 9,9 s, registre vérifié. `lire_resultat` (lib/kpi/resultat.ts ; « Quel est mon résultat net du mois dernier, et mon seuil de
   rentabilité est-il atteint aujourd'hui ? » → 0,8 s d'outil, 5 faits, réponse en 10,0 s, registre vérifié).
   `lire_poles_classement` (lib/dispositifs/poleClassement.ts ; « Montre-moi comment mes pôles performent au
   m². » → 4 outils dans le tour, 24 faits, 15,7 s ; « Classe mes pôles par marge brute sur le mois dernier, et
   dis-moi lequel occupe trop de linéaire pour ce qu'il rapporte. » → 21,8 s — sur les deux, le modèle a
   additionné deux parts de son cru (« 21,8 % », « 4,3 % », « sous 1 500 € ») et la porte a rendu « Non vérifié » :
   la porte fait son travail, la consigne « tu ne calcules jamais » reste à durcir ou le modèle à changer).
   Le grain « jour » de `lire_ventes` est livré (12/09 : une ligne par jour de vente, jusqu'à 31 jours). Preuve : les cinq questions du 12/09 de l'owner (« montre-moi comment mes pôles performent
   au m² », « ordonne les familles les plus profitables vs m² vs mètres linéaires », « quelles familles sont
   sensibles à la météo ? »…) répondent en blocs, et une question composée aussi.
2. **Incrément 2 — le Rapport** (en cours, 12/09) : **faits** — le registre `src/lib/fr/rapport.fr.ts`
   (quinze sections, alias en mot entier), `composer_rapport` (une vague de lectures, un bloc `rapport` avec la
   provenance de chaque section, l'inconnu dit), le bloc `rapport` rendu par le kit (?v=81, Synthèse = le texte
   vérifié du tour posé par la route). Mesuré sur le compte de test : « Génère le rapport des ventes de la
   semaine dernière : volume, panier, mix, et les pôles les plus et les moins performants en nombre de
   ventes. » → un outil, un bloc rapport, 14,7 s, registre vérifié (batterie, porte `blocs`). **Le document
   persistant est en place** : `analytics.report_documents` (créée en base le 12/09, append-only, grain
   document_id × version), `lib/rapport/documents.ts`, route `/api/explorer/rapports` (Enregistrer = une version
   de plus, la liste, un document), le geste « Enregistrer » et « Vos rapports » sur le proto ; sonde réelle sur le
   compte de test : v1 écrite et relue identique, v2 lue comme dernière. **Le rapport de ventes se compose par
   les outils** : `composer_rapport` avec `modele` « ventes » (les sections de rapport.astro dans son ordre ;
   « Fais-moi mon rapport de ventes du mois dernier. » → 10,3 s, vérifié). **Restent** : le rapport de famille
   recomposé par les outils (ses familles météo, fréquentation, concurrents… sont des couches à migrer, § 7),
   le rapport imprimable inchangé (ses chaînes approuvées restent), les sections Contexte externe et
   Actions recommandées (aujourd'hui une absence qui renvoie au rapport imprimable), la surface définitive du
   Rapport (le proto porte le geste jusqu'à l'arbitrage owner).
3. **Incrément 3 — les gestes sur le document** (12/09) : **faits** — `lib/rapport/gestes.ts` (purs, testés :
   un déplacement ne change aucun chiffre), la route des rapports (`geste` : deplacer, retirer, dupliquer, note,
   retirer_note, actualiser → version suivante), Approfondir par la boucle (`/api/explorer/agent` avec
   `approfondir` : le message porte la section et ses dates, le résultat s'insère après elle, vérifié, version
   suivante), le bloc `note` du kit (?v=82), les gestes sur le proto. Sonde réelle sur le document du compte de
   test : v3 déplacer, v4 note, v5 actualiser (1,8 s, note gardée, Synthèse retirée), v6 approfondir (14,4 s ;
   le modèle a dit honnêtement que le détail par jour manquait — d'où le grain « jour » de `lire_ventes`, livré
   dans la foulée). **Restent** : le glisser-déposer (les flèches Monter / Descendre font le geste), la surface
   définitive.
4. **Incrément 4 — la page Rapports et le Modèle de rapport** (12/09) : **faits** — la page
   `/app/insightevent/rapports` (Nouveau rapport par la boucle, blocs vérifiés au fil des outils, Vos modèles, Vos
   rapports, le document ouvert avec ses actions et l'historique ; entrée « Rapports » sur Piloter, onglet
   Explorer), `analytics.report_templates` (`lib/rapport/modeles.ts` : un Rapport sans ses chiffres — sections à
   provenance, indicateur, période relative), la route `/api/explorer/modeles` (la liste avec le Rapport de ventes par
   défaut, « Enregistrer comme modèle » depuis un document), `composer_rapport` avec `modele` par NOM (« Hebdo
   pôles ») — sa période et son indicateur s'appliquent sauf demande explicite. Le proto ne porte plus que la
   conversation. Sonde réelle : le Modèle « Hebdo pôles » tiré du document B ; harnais `npm run harness:rapports`.
   **Reste** : le Modèle « famille » (ses couches restent à migrer, § 7) ; l'organisation des actions sur la page.
5. **Incrément 5 — l'envoi à cadence — LIVRÉ le 12/09** (§ 6.4) : `lib/rapport/envois.ts` (période par cadence,
   échéance à Paris, lignes, matière, texte, HTML par le kit, `envoyerRapport`, `tourDesEnvois` — 11 tests, mutés),
   `report_schedules` + `report_sends` (nées au premier envoi ; pré-création avant de composer : une table neuve
   refuse le flux plus de 30 s, la première trace s'est perdue — mesuré), la route `/api/explorer/envois` (GET liste
   + destinataires connus ; POST programmer / arrêter / envoyer maintenant), le cron `/api/cron/report-sends`,
   `sendEmail` avec `html`, `composerSurPeriode` partagé avec Actualiser, la page : « Envoyer chaque… » sous chaque
   Modèle (cadence, heure, canal, destinataires, Enregistrer, Envoyer maintenant) et « Vos envois » (Arrêter, dernier
   envoi). Preuves réelles (compte de test, 12/09) : « Envoyer maintenant » → document `d25698cf` + courriel à
   l'owner ; envoi « chaque jour à 0 h » → cron à blanc « dû, partirait hier », cron réel « envoyé à 1
   destinataire » en 3,6 s (document `a876b08a`), rejeu « déjà tracé », 401 sans Bearer ; « Arrêter » → version 2,
   `actif = false`. Harnais `npm run harness:rapports` couvre le formulaire. Owner 12/09 : envoyer le PDF une fois,
   ou le même modèle avec les données actualisées à X (moi, ou des contacts du compte / de Communiquer) tous les Y
   (jour, semaine, trimestre, année). **Reste** : le job cron-job.org horaire sur la prod (owner) ; le PDF (Chromium
   sans tête) ; les mots de la page à ratifier (« Vos envois », « Envoyer maintenant », « Arrêter », « par email /
   sur Slack »).
6. **Incrément 6 — la proposition d'opération** : `proposer_operation`, bloc `proposition_operation`,
   pré-remplissage d'`event-form.js`.
7. **Incrément 7 — la migration** (§ 7), une couche par commit.
8. **Incrément 8 — le pont de marge**, dès les premiers prix d'achat réels ; **le plan coloré**, dès que
   les contours vivent en base (les sept zones d'Épices et Tout sont relevées :
   `zones_poles_epices_et_tout_2026-09-12.json` ; leur table `analytics.space_zones` et sa vue dbt se
   créent AVANT la lecture).

---

## 10. Décisions owner attendues

1. Le modèle de la boucle pour les questions chiffrées — **mesuré le 12/09 sur la batterie (8 questions,
   compte de test)** : `claude-opus-5` 8,5-16,7 s, 8/8 portes ; `claude-sonnet-5` 4,8-10,5 s, 8/8 portes (le même
   cas « Non vérifié » que opus, une somme de parts) ; `claude-haiku-4-5` 3,7-8,8 s mais 4 réponses sur 8 non
   vérifiées (nombres de son cru). Aucun des trois ne rend le texte complet sous 3 s : la « première réponse utile
   sous 3 s » passe par l'affichage des blocs vérifiés dès le retour de l'outil (≈ 1 s), la Synthèse arrivant
   ensuite. **Tranché par l'owner le 12/09 : sonnet-5 pour la boucle (`models.ts`, rôle `agent`) et les blocs
   vérifiés affichés dès le retour de l'outil, avant la Synthèse (proto : événement SSE `tool`).** Mesuré ensuite
   sur la batterie avec sonnet-5 : premier bloc vérifié à 2,0-3,3 s, texte complet à 4,4-9,6 s, 8/8 portes.
2. Le stockage des contours du plan (`analytics.space_zones`, grain site × pôle, polygone en points du
   plan) — à confirmer avant l'incrément 8.
3. Les destinataires d'un envoi à cadence au-delà de l'équipe et des partenaires (§ 6.4).

**Tranché le 12/09 sur la page d'arbitrage (`Le Rapport d'Explorer`)** : les mots des sections (Nombre de ventes,
CA moyen par jour de la semaine) ; la Synthèse tombe à Actualiser et l'exploitant la reprend ; Déplacer par des
flèches ; Votre note et Approfondir tels quels ; Contexte externe et Actions recommandées SONT composés (le contexte
qui pèse sur les performances est le différenciateur — un rapport opérationnel, pas un rapport financier) ;
l'historique des versions se montre ; « geste » ne s'affiche jamais ; la surface : n1 modules éditables, n2 les
choix comme contexte, n3 une page dédiée reliée au tableau de bord.

Actés le 12/09 : Synthèse ; Rapport ; Modèle de rapport ; Enregistrer comme modèle ; Approfondir ; Votre
note ; Envoyer chaque … ; Proposition d'opération ; Préparer l'opération → ; les titres de sections du § 6.5.

---

## 11. Hors périmètre

- Aucune écriture d'opération, de pôle, de photo ou de note-cause par un outil.
- Aucun calcul par le modèle ; aucune réponse sans faits d'outil.
- Aucune couche nouvelle dans `prompt.ts` à compter du 12/09.
- Aucun envoi à des clients finaux sans liste consentie (§ 6.4).
