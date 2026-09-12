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
| `lire_ventes` | `période` (du, au ; ou « semaine dernière », « 30 derniers jours », défaut), `grain` (jour, jour de semaine) | le cœur de `insight/sales-report.ts` extrait en lib (`lib/rapport/ventes.ts`) : CA, ventes, panier moyen, mix produits & services, meilleur et pire jour, comparaison période précédente et an dernier | faits + `layers` | tableau |
| `lire_marge` | `période`, `jours` (week-end, un jour de semaine) | `readMeasuredMargin30d` généralisé à une période (`lib/kpi/margin.ts`) | marge brute, taux, couverture, familles, lignes sous prix d'achat | carte `renderMarge` |
| `lire_resultat` | `mois` | `vw_insight_event_monthly_result`, `vw_insight_event_daily_margin` | résultat net, seuil de rentabilité du jour | carte (bloc CA de Piloter) |
| `lire_espace` | — | `listPoleSpace` (`vw_insight_event_pole_space` + `vw_insight_event_space_30d`) | linéaire, surface de vente, CA, CA net HT et marge brute par mètre et par m², part de marge contre Part de linéaire | carte `renderEspace` |
| `lire_familles_face_aux_jours` | `famille?`, `classe?` | `composeSignauxFamille` | CA/jour famille vs vos jours comparables, panier, part | carte `renderSignauxFamille` |
| `lire_poles_classement` | `indicateur` (ventes, CA, marge brute, par mètre, par m²), `période` | `listPoles` + `lire_ventes` par pôle (mapping famille → pôle de `vw_insight_event_pole_daily`) | du plus au moins performant | tableau |
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

Le formulaire d'opération (`event-form.js`) apprend à **recevoir un corps pré-rempli** (familles,
objectif, dates, levier) — la seule modification d'une surface existante que cette spec demande ; le
CTA final reste celui du formulaire (« Créer l'opération — … »).

---

## 6. Le registre des sections du rapport

`src/lib/fr/rapport.fr.ts` (patron : `rapportCanaux.fr.ts`, un fichier de mots par surface, éditable par
l'owner). Une entrée par section : `cle`, `titre`, `definition` (une ligne), `referentiel`, `unite`,
`alias[]` (les formulations par lesquelles un exploitant la demande — tirées des questions réelles de
`analytics.consulter_telemetry` et des cas d'usage). `composer_rapport` choisit par alias ; une demande
sans section ne s'invente pas : elle rend un bloc `absence`.

Sections et mots (lexique et intent ; les chaînes existantes du rapport sont gardées) :

| Clé | Titre | Source du mot |
|---|---|---|
| `synthese` | **à arbitrer** : « Synthèse » (proposé) ou « Résumé exécutif » (chaîne actuelle du rapport de famille) | aucun des deux au lexique |
| `chiffre_affaires` | Chiffre d'affaires | rapport de ventes |
| `volume` · `panier` · `mix` | Volume de ventes · Panier moyen · Mix produits & services | lexique l.83, `couches-dans-leur-unite` |
| `marge_brute` · `resultat_net` · `seuil_rentabilite` | Marge brute · Résultat net · Seuil de rentabilité | lexique (owner 11/09, 12/09) |
| `poles` | Vos pôles · du plus au moins performant (indicateur nommé) | Piloter « Vos pôles » |
| `familles` | Vos familles · du plus au moins performant (indicateur nommé) | lexique « famille » |
| `espace` | Espace · linéaire, surface de vente, CA par mètre | titre du provider |
| `jours` | Profil par jour de semaine | rapport de ventes |
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
- La batterie Explorer (`tools/battery/explorer-quality-battery.ts`) gagne les questions composées du § 2.3
  ; la porte lie-bait (`npm run gate`) reste verte à chaque commit.
- Un harnais par type de bloc (patron `tableau-pole-espace-render-verify.mjs`) : le kit rend le bloc sur
  les données réelles du compte de test owner.
- Chaque chiffre d'une réponse porte sa requête et sa fenêtre (dans les `sources` du tour).
- Budget : première réponse utile sous 3 s sur le compte de test owner, mesuré, jamais déduit.

---

## 9. Ordre de livraison

1. **Incrément 1 — le registre et les blocs** : `lire_ventes` (extraction du cœur de `sales-report.ts` en
   lib), `lire_marge`, `lire_resultat`, `lire_espace`, `lire_familles_face_aux_jours`,
   `lire_poles_classement` ; blocs `tableau`, `carte`, `absence` ; la boucle rend des blocs. Preuve : les
   cinq questions du 12/09 de l'owner (« montre-moi comment mes pôles performent au m² », « ordonne les
   familles les plus profitables vs m² vs mètres linéaires », « quelles familles sont sensibles à la
   météo ? »…) répondent en blocs, et une question composée aussi.
2. **Incrément 2 — le rapport à la demande** : `rapport.fr.ts`, `composer_rapport`, bloc `rapport` ;
   « génère le rapport des ventes de la semaine dernière, volume, panier, mix, et les pôles les plus et
   les moins performants en nombre de ventes ».
3. **Incrément 3 — la proposition d'opération** : `proposer_operation`, bloc `proposition_operation`,
   pré-remplissage d'`event-form.js`.
4. **Incrément 4 — la migration** (§ 7), une couche par commit.
5. **Incrément 5 — le pont de marge**, dès les premiers prix d'achat réels ; **le plan coloré**, dès que
   les contours vivent en base (les sept zones d'Épices et Tout sont relevées : `zones_poles_epices_et_tout_2026-09-12.json`
   ; leur table `analytics.space_zones` et sa vue dbt se créent AVANT la lecture).

---

## 10. Décisions owner attendues

1. Le titre de la section de tête du rapport : « Synthèse » ou « Résumé exécutif ».
2. Le modèle de la boucle pour les questions chiffrées : `claude-opus-5` (celui de l'agent aujourd'hui)
   ou un modèle plus rapide pour tenir 3 s — à mesurer sur l'incrément 1 avant de trancher.
3. Le stockage des contours du plan (une table app-write `analytics.space_zones`, grain site × pôle,
   polygone en points du plan) — à confirmer avant l'incrément 5.

---

## 11. Hors périmètre

- Aucune écriture d'opération, de pôle, de photo ou de note-cause par un outil.
- Aucun calcul par le modèle ; aucune réponse sans faits d'outil.
- Aucune couche nouvelle dans `prompt.ts` à compter du 12/09.
