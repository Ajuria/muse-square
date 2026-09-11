# Espace et pôle — le pôle comme objet de l'entrepôt, les mesures d'espace par composant, la marge par mètre linéaire et par m² — SPEC DE TRAVAIL

Sert : `strategie-entreprise.md` § 12.12 (KPI 4 marge par pôle, KPI 5 marge par mètre linéaire et « part de marge
contre Part de linéaire », KPI 12 marge par m² ; « la surface par pôle et par site est une colonne déclarée à
créer ») ; `intent.md` § Les objets (pôle, composant, prix d'achat) ; `audits/profit-grains-sensibilite-audit-2026-09-11.md`
§ 5 D2, D3 ; décisions owner du 11/09 : n° 5 (les mesures se saisissent sur le composant, dans le formulaire de
pôle, jamais pendant le relevé ; la surface m² au pôle) et n° 6 (zones du plan → pôles, à confirmer sur place :
meubles 49, 3-6, 19).

Ce document dit ce qui est, puis ce qui reste à faire dans l'ordre d'exécution. Aucun bloc SQL : les modèles
partent en PR depuis le clone `ms_database` (`CLAUDE.md` § Où committer).

---

## 0. Ce que le lot débloque (état cible)

| KPI § 12.12 | Ce qu'il devient | Surface |
|---|---|---|
| 4 marge brute par pôle, € et part | Σ marge des familles du pôle (`fct_client_family_margin_daily` × mapping famille → pôle), avec couverture | Piloter (répartition sous la carte CA), document du pôle, rapport |
| 5 marge brute par mètre linéaire ; part de marge contre Part de linéaire | marge 30 j de la famille ÷ ses mètres linéaires de façade ; la phrase owner « 12 % de la façade pour 4 % de la marge » | document du pôle, Explorer, carte structurelle par composant (lot app) |
| 12 marge brute par m² | marge 30 j du pôle ÷ sa surface déclarée ; site = Σ pôles ou surface de vente déclarée | document du pôle, rapport |
| ventes, panier, part, CA, écart, prix moyen × classe de jour par PÔLE | le mart famille des classes de jour, au grain pôle | Explorer, rapport |
| « Non rattaché » | les familles hors pôle comptées comme un pseudo-pôle, jamais perdues (owner 09/09 : pas de trou dans le mapping) | Piloter « Vos pôles » (existe), marts |

---

## 1. Ce qui est [vérifié 11/09]

- **Un pôle est un engagement de nature `permanent`** dans `analytics.action_commitments` (spec
  `poles-dispositifs-permanents-spec.md`, décisions 1-7) : `dispositif_id` + `version_no` (changer l'organisation
  = version suivante), `pole_families` = JSON des familles réelles de la caisse, `committed_action_text` = son
  nom, `owner_person_name`, `components` = JSON `[{key, type, role, label}]`. Les opérations s'y rattachent par
  `attached_pole_id`. **Zéro pôle en base sur les quatre sites** (73 lignes, nature NULL ou `operation`).
- **dbt ne déplie que `components`** (`int_client_dispositif_components`, grain dispositif × version × composant,
  `is_current_version` = plus haute version) ; `pole_families` est une chaîne de passage jamais explosée ; le
  rapprochement famille → pôle vit dans l'app (`poleReading.listPoles`, `unassignedFamilies`,
  `dashboard.ts:99` pour la ligne « Non rattaché »).
- **Aucune dimension physique nulle part** : composant = quatre champs (`dispositifTypes.ts:281-286`), vue des
  composants 20 colonnes sans nombre, profil du site sans surface (56 colonnes). Les photos portent déjà
  `fixture_no` (le N° sur le plan, saisi à la Fin du relevé) : c'est la clé qui relie une mesure du plan à un
  composant photographié.
- **Le relevé de l'espace ne mesure pas** (M4 : jamais de mètres) ; la typologie § 3 dit qu'un composant « est
  décrit par son N° sur le plan, sa longueur, ses faces accessibles et ses familles avec la part de chacune
  (en % de sa façade) » ; mot acté **Part de linéaire** (lexique l. 98) ; `families_share` est une colonne « à
  créer » (`marche-guidee-spec.md` § 7).
- **Les mètres d'Épices et Tout existent** : 52 meubles mesurés sur le plan vectoriel (1:100, 28,344 pt/m),
  `~/Documents/Muse_Square/Clients/epices-et-tout/map/metres_lineaires_epices_et_tout_v2_2026-09-11.csv`
  (colonnes N° ; Pôle ; Famille ; Longueur ; Profondeur ; Faces accessibles ; Mètres linéaires de façade ; Note).
  Mètres linéaires de façade = longueur × faces de préhension (mur, autre meuble, zone non publique = face bloquée).
- **Les marts de marge existent** (`catalogue-de-couts-et-marge.md`) au grain famille, article, heure, jour ;
  **la lecture par classe de jour existe** au grain famille (`reponse-aux-signaux-par-famille.md`). Il manque le
  grain pôle des deux, et l'espace.

Ce que le plan donne aujourd'hui, avant toute saisie (les 52 meubles, 202,23 m de façade) :

| Pôle | Mètres linéaires de façade | Part de linéaire |
|---|---|---|
| Cuisine | 42,89 m | 21,2 % |
| Maison | 39,05 m | 19,3 % |
| Épicerie sèche | 37,34 m | 18,5 % |
| Produits frais | 31,09 m | 15,4 % |
| Cave | 23,62 m | 11,7 % |
| Petit déjeuner | 20,41 m | 10,1 % |
| Caisse | 7,83 m | 3,9 % |

Trois meubles restent à confirmer par l'owner sur place (n° 3 et 6 : longueur réelle du L « Récipients » ;
n° 19 : nature ; n° 49 : part Couteaux / Céréales) ; les autres notes du fichier sont des arbitrages déjà rendus
le 11/09. La colonne Famille du fichier porte les libellés du plan, pas encore les familles de la caisse
(« Concerves », « Gateaux ») : le rapprochement se fait à la déclaration des pôles, jamais par ressemblance.

---

## 2. Décisions de conception

| # | Décision | Pourquoi | Ce qu'on sacrifie |
|---|---|---|---|
| E1 | **Le mapping famille → pôle devient un modèle dbt** : `int_client_pole_family_map` (site × famille → `pole_id` = `dispositif_id` du pôle, nom, version courante), en dépliant `pole_families` de la version courante des pôles non annulés. Test d'unicité (site, famille) : une famille vit dans UN pôle (`intent.md`). Test singulier en `warn` : familles vendues sur 30 j sans pôle | le rapprochement vivait dans l'app ; les marts de marge, d'espace et de classes de jour en ont besoin dans l'entrepôt | deux foyers pendant la transition ; l'app se repointera sur la vue |
| E2 | **« Non rattaché » est un pseudo-pôle** (`pole_id = 'non_rattache'`) dans tous les marts pôle : Σ pôles = site, toujours | owner 09/09 : pas de trou dans le mapping ; le mot est acté (lexique l. 105) | — |
| E3 | **Les mesures d'espace vivent dans une table app-write à part**, `analytics.space_measures` : `measure_id, location_id, dispositif_id, version_no, component_key` (NULL = le pôle lui-même), `fixture_no`, `length_m`, `depth_m`, `faces` = **faces de préhension** (1 ou 2 — les faces où le client prend le produit ; mot owner 11/09), `linear_m_facade` (= `length_m × faces`, écrit par l'app), `surface_m2` (au pôle), `families_share` JSON `[{family, share}]` (parts 0-1 de la façade, Σ = 1), `measured_at` DATE, `source` (`plan` \| `ruban` \| `saisie`), `declarant_user_id`, `created_at`. Append-only ; la mesure en vigueur = la dernière `created_at` par (dispositif, version, composant). Pas un champ de plus dans le JSON `components` (il casserait `parseComponents` et le contrat de la vue) | décision owner 5 ; une mesure change sans re-versionner le dispositif (un ruban corrige un plan) ; `fixture_no` relie la mesure à la photo du même meuble | une table de plus ; la mesure d'une version ne se recopie pas automatiquement sur la suivante (l'app pré-remplit) |
| E4 | **Surface m² = une mesure au grain pôle** (`component_key` NULL, `surface_m2`) ; surface de vente du site = paramètre déclaré `sales_area_m2` dans `analytics.declared_parameters` (clé ajoutée à la liste fermée) | décision owner 5 ; le site n'est pas la somme de ses pôles (allées, réserve) | — |
| E5 | **Les mètres d'un composant se répartissent entre ses familles par `families_share`** ; sans part déclarée, un composant à une famille = 100 %, à plusieurs familles = parts égales, ÉTIQUETÉ `share_source = 'defaut'` | typologie § 3 (owner 11/09) ; une répartition par défaut se dit, ne se cache pas | — |
| E6 | **Les ratios d'espace se lisent sur 30 jours glissants**, jamais au jour : `fct_client_space_30d` (site × pôle × famille, date de calcul = jour du build) : CA 30 j, marge 30 j (si couverture ≥ seuil), part de CA, part de marge, mètres linéaires, **Part de linéaire** (= ML famille ÷ ML site), CA/ML, marge/ML ; au pôle : idem + m², CA/m², marge/m² | la phrase owner est une part contre une part ; un jour isolé ne s'annualise ni ne se divise par un mètre | pas de série journalière du €/ML (le mart jour reste au grain famille) |
| E7 | **Grain pôle des classes de jour** : `fct_client_pole_daily` (site × jour × pôle : CA, ventes, part, écart au résultat habituel = Σ des écarts famille, marge et couverture) puis `fct_client_pole_day_class_response`, même moteur que la famille, la clé pôle à la place de la famille | ce que le lot A a fait pour la famille, au niveau où l'exploitant organise | un mart de plus par grain, à l'identique |
| E8 | **Les mesures d'Épices et Tout se chargent par un one-off** après la déclaration de ses pôles et composants : le fichier des 52 meubles → `analytics.space_measures` (`fixture_no` = N°, `source = 'plan'`), rapprochement composant par `fixture_no` | les mètres sont déjà mesurés ; l'exploitant ne les re-saisit pas | les trois meubles à confirmer restent `à vérifier` dans la note jusqu'au passage de l'owner |

---

## 3. dbt — livré dans la PR [ms_database#148](https://github.com/Ajuria/ms_database/pull/148) (11/09, branche `feat/espace-et-pole`, à fusionner puis à builder)

Les onze étapes ci-dessous sont dans la PR (19 fichiers) ; la table `analytics.space_measures` (16 colonnes,
vide) est EN BASE. Preuves sur entrées SYNTHÉTIQUES en scratch (aucun pôle n'existe en base) : Σ pôles = site sur
162/162 jours du compte owner, 8 familles → 3 pôles avec « Non rattaché », parts de linéaire sur les mètres
mesurés, € par mètre et par m², une mesure au ruban qui remplace le plan, 151 lignes de réponse pôle × classe.
Différences avec le plan initial : `int_client_family_space` et `int_client_pole_space` sont un seul modèle
(`int_client_pole_space`, grains famille / pôle / site) ; le pôle d'un composant = `attached_pole_id` du
dispositif, sinon le dispositif lui-même.


1. **Source** (`staging/sources.yml`, bloc `analytics`) : `space_measures` (DDL côté app avant, colonnes E3).
2. **`stg_declared_parameters`** : `sales_area_m2` entre dans la liste fermée des clés (yml) ;
   `int_location_declared_parameters_daily` l'expose.
3. **`stg_space_measures`** (vue) : types ; `faces` ∈ {1, 2} ; `length_m > 0` ou `surface_m2 > 0` ; `families_share`
   JSON conservé.
4. **`int_client_pole_family_map`** (E1) : depuis `int_client_commitment_latest` (nature `permanent`, `status !=
   'cancelled'`, version courante), `unnest(json_query_array(pole_families))` → (site, famille, `pole_id`,
   `pole_label`, `version_no`) ; tests unicité (site, famille) ; test singulier warn « familles vendues 30 j sans pôle ».
5. **`int_client_component_space`** (E3, E5) : mesure en vigueur par (dispositif, version, composant) ×
   familles (part), avec `share_source` ; jointure aux composants de la version courante
   (`int_client_dispositif_components`, `is_current_version`).
6. **`int_client_family_space`** (site × famille : Σ `linear_m_facade × share`, nombre de composants) et
   **`int_client_pole_space`** (site × pôle : Σ ML, `surface_m2` de la mesure pôle, site `sales_area_m2`).
7. **`fct_client_pole_daily`** (E7, E2) : `fct_client_offering_daily` et `fct_client_day_family_decomposition` et
   `fct_client_family_margin_daily` regroupés par le mapping ; pseudo-pôle « Non rattaché ».
8. **`fct_client_space_30d`** (E6) : grain (site × pôle × famille) + lignes pôle (famille NULL) + ligne site ;
   date de calcul ; marge NULL sous le seuil `margin_coverage_min`.
9. **`fct_client_pole_day_class_response`** (E7) : copie du modèle famille avec la clé pôle (métriques
   `pole_revenue_gap`, `pole_revenue`, `pole_units`, `pole_share`, `pole_margin`).
10. **Semantic, contrat enforced, `mart_dependent`** : `vw_insight_event_pole_family_map`,
    `vw_insight_event_component_space`, `vw_insight_event_pole_daily`, `vw_insight_event_space_30d`,
    `vw_insight_event_pole_day_class_response`.
11. **Tests** : Σ pôles (Non rattaché inclus) = CA du site par jour ; Σ parts de linéaire des familles d'un site
    = 1 ; `faces` ∈ {1, 2} ; unicité des grains.

Preuve avant PR (comme les lots A et marge) : lot matérialisé dans `_audit_scratch` ; 0 écart sur les modèles
existants touchés ; mécanique prouvée sur des pôles et mesures SYNTHÉTIQUES posés sur le compte owner en
scratch (jamais en table de production).

---

## 4. App — ce qui reste à faire, dans l'ordre

1. **DDL** `analytics.space_measures` (one-off daté) ; `sales_area_m2` dans `DECLARED_METRICS`.
2. **Formulaire de pôle** (`public/js/pole-form.js`, ligne par composant) : trois champs de plus par composant —
   N° sur le plan, longueur (m, virgule), **faces de préhension** (1 ou 2) — et, quand le composant porte plusieurs
   familles, la part de chacune (%) ; au pôle : surface (m²). Écriture dans `analytics.space_measures` à côté du
   POST de l'engagement (jamais dans `components`). Mots : **Part de linéaire** (acté), **face de préhension** (owner 11/09, au lexique) ; « N° sur le plan »
   (chaîne de la Fin du relevé) ; **surface de vente** (owner 11/09, au lexique) ; « longueur » : à passer au lexique avec son tableau 8-13
   avant tout rendu.
3. **Déclaration des pôles d'Épices et Tout** : sept pôles depuis les zones du plan (Cuisine, Maison, Épicerie
   sèche, Produits frais, Cave, Petit déjeuner, Caisse), familles rattachées à la déclaration — « Pôle en projet »
   tant qu'aucune vente n'est importée (`marche-guidee-spec.md` § 8), rapprochement famille déclarée → famille
   de la caisse au premier import.
4. **One-off** : le fichier des 52 meubles → `space_measures` (E8), après 3.
5. **Piloter** : la répartition par pôle sous la carte CA lit `vw_insight_event_pole_daily` (ordre fixe, jamais
   un classement — `piloter-redesign.md`) ; « Vos pôles » et « Non rattaché » se repointent sur
   `vw_insight_event_pole_family_map` (ADD : `unassignedFamilies` reste jusqu'à parité).
6. **Document du pôle** : mètres linéaires, m², CA/ML et marge/ML de ses familles, « part de marge contre Part de
   linéaire » — la phrase est celle de l'owner (§ 12.12), à soumettre avec son tableau 8-13.
7. **Explorer** : provider `espace` (« quel composant me rapporte le moins par mètre ? », « quelle part de
   façade pour quelle part de marge ? ») ; section du rapport.
8. **Cartes** (lot à part) : carte structurelle par composant (façade forte, marge faible), avec les huit
   déclarations et trois plans en voix owner.

---

## 5. Décisions owner (11/09) — actées

1. **Faces de préhension** : le mot du nombre de faces d'un meuble (1 ou 2).
2. **Surface de vente** : le mot de l'aire au sol en m², du magasin (`sales_area_m2`, déclarée une fois) et du pôle
   (mesure au grain pôle) ; le site n'est pas la somme de ses pôles.
3. **« Non rattaché »** compte dans le CA et la marge, jamais dans le linéaire ; une ligne visible le dit.
4. **Les meubles 3-6, 19 et 49** se confirment sur place (owner, 12 ou 15/09) ; jusque-là ils portent leur note
   dans le fichier et la mesure chargée sera reprise par une nouvelle ligne (append-only).

— SPEC DE TRAVAIL ; se réécrit en définitif quand la passation est buildée et les vues vérifiées.
