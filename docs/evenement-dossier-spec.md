# Événement → dossier mesuré — spec (03/08/2026, protos v1/v2.1 validés)

Chantier : remplacer l'usage « daté et limité » de monitor (un événement = un titre + des dates)
par **l'événement-dispositif mesuré** : créé avec un objectif (KPI dominant) et une description
de dispositif, récurrent si besoin, évalué occurrence par occurrence par la boucle d'engagement
existante, servi par un provider de famille (page à deux états + chat + rapport + cartes).
Protos validés : `public/evenement-dossier-proto.html` (v1) et `-v2.html` (v2.1 — le contrat UI).

## Décisions owner (03/08, toutes tranchées)

1. **KPI dominant + panneau complet.** L'utilisateur choisit UN objectif (le verdict ne juge que
   lui) ; tout le panneau reste mesuré (CA vs attendu, tickets, panier, familles produits).
   Chaque KPI porte son référentiel — le CA a un modèle d'attendu (résiduel + gardes), le reste
   une base « habituel » (verdict plus faible, dit). « Profit » n'existe qu'en estimation via
   marge déclarée, sinon absent du menu.
2. **Cible à deux lignes (v2.1)** : l'objectif porte sur l'APPORT PROPRE de l'événement
   (famille Producteurs 96 € → viser 210 €, apport +114 €) ; le total du jour est affiché comme
   conséquence (1 099 € + apport → ≈ 1 215 €), jamais jugé. Même doctrine que le coin des cartes.
3. **Récurrence à la création, façon G Calendar** : Aucune / hebdo (jour) / mensuel, « Du X au
   Y ». Récurrent = PAS d'étape de choix de jour ; occurrences générées ; un engagement de
   mesure par occurrence ; la série cumule les verdicts (track record, somme mesurée jamais
   extrapolée). Ponctuel = parcours candidats → comparaison → choix, inchangé.
4. **Formulaire fusionné M'engager** : mêmes briques (attendu affiché, %⇄€, plancher de bruit,
   raccourcis, responsable roster) + champs propres : nom, type PAR MÉTIER du lieu, nature
   (extérieur/intérieur/les deux + plage horaire), description du dispositif (versée aux bonnes
   pratiques avec son auteur), échéance de choix en CASE À COCHER (jamais par défaut).
5. **Dossier à deux états** — avant : les 5 questions sourcées (clients cibles / mobilité
   clients ET fournisseurs / événements voisins synergie-conflit / météo × nature /
   concurrence) + score du jour ; après : verdict sur l'objectif, panneau complet, agir
   (menu standard 3 entrées), série. La page appartient à la famille cartes + pages insight.
6. **Cartes de cycle de vie** (famille événement, feed Pulse) : Menace pré-événement
   (signal × nature), Échéance de décision (seulement si case cochée), J-1 Préparer,
   J+1 Mesurer-documenter.
7. **Legacy** : nouvelle page à part (`/app/insightevent/evenement`), monitor.astro INTOUCHÉ
   jusqu'à la bascule ; `api/insight/monitor.ts` (partagé avec pulse) : additif uniquement.

## 1. Modèle de données

### 1.1 `raw.saved_items` — colonnes ADDITIVES (ALTER idempotent, patron bestPractices.ensure)
- `author_person_name STRING` — le créateur (roster), affiché partout (« créé par X »).
- `event_nature STRING` — 'outdoor' | 'indoor' | 'both' (conditionne l'état Avant).
- `hour_start INT64`, `hour_end INT64` — plage horaire (remplace l'usage de `launch_hour`,
  conservé lu en repli pour l'existant).
- `kpi STRING` — 'revenue_residual' (défaut) | 'family_revenue' | 'tickets' | 'basket' |
  'visitors' | 'profit_estimated' (vocabulaire kpiRegistry, comme best_practices).
- `kpi_family STRING NULL` — la famille produit si kpi='family_revenue' (item_category exact).
- `kpi_target_pct FLOAT64 NULL` / `kpi_target_eur FLOAT64 NULL` — la cible (apport propre) ;
  pour un récurrent la cible % fait foi, l'€ se calcule par occurrence.
- `recurrence STRING` — 'none' (défaut) | 'weekly' | 'monthly' ; `recurrence_dow INT64 NULL` ;
  `recurrence_start DATE NULL` / `recurrence_end DATE NULL` (le « Du X au Y »).
- `decision_date` existe — devient OPTIONNELLE (checkbox) ; null = pas de carte échéance.
- `description` existant = LE DISPOSITIF (le texte comparé au mesuré, versé aux bonnes pratiques).
- `stage` : inchangé (vestigial, on ne s'appuie plus dessus) ; le cycle de vie réel =
  `selected_date`/occurrences + verdicts d'engagements.

### 1.2 Occurrences
`raw.saved_item_dates` devient le magasin d'occurrences pour un récurrent : générées à la
création (de `recurrence_start` à `recurrence_end`, plafond 52), clé `(saved_item_id, date)`.
Pour un ponctuel : sens actuel (candidats) conservé — le discriminant est `recurrence != 'none'`.

### 1.3 Ancrage de la mesure — `analytics.action_commitments`
- Colonne additive `saved_item_id STRING NULL` (ALTER idempotent dans le ensure du module
  commitments) + `origin_action_type = 'event_<event_type>'` (passe `isCommitmentOrigin` par
  ajout du préfixe `event_` à la liste).
- **Un engagement par occurrence** : ponctuel → créé au « Choisir » (fenêtre = selected_date →
  event_end_date, `window_kind` jour/multi-jours existants) ; récurrent → créé par le cron à
  J-7 de chaque occurrence (jamais 52 d'un coup), fenêtre = le jour de l'occurrence.
- KPI : `measured_metric` porte le kpi ; pour 'family_revenue', la résolution mesure
  `SUM(revenue) famille du jour − sa moyenne journalière` (extension de commitmentResolve —
  même requête que les movers, référentiel dit) ; les gardes de confusion existantes (`ctx_*`)
  s'appliquent telles quelles.
- La série lit ses verdicts par `saved_item_id` (GET commitments filtré — additif).

## 2. Provider `evenementFamily` (src/lib/insightFamilies/evenement.ts)

Signature : `evenementFamily(bq, location_id, saved_item_id)` → `{ facts, data }` (patron
dispositif). `data` :
- `item` : titre, type, nature, horaires, dispositif, auteur, kpi + cible (2 lignes calculées),
  recurrence, dates/occurrences, decision_date.
- `stage` : 'avant' | 'apres' (calculé : date(s) vs aujourd'hui — multi-occurrences : 'apres'
  dès la 1re occurrence passée, l'état Avant reste accessible pour la prochaine).
- `avant` — les 5 questions, chacune `{ fact_fr, tone: 'threat'|'opp'|'neutral', action_fr? }` :
  1. clients cibles : audiences 1&2 du profil × profil du jour (vacances, delta_att —
     `vw_insight_event_day_surface`, champs du snapshot existant) ;
  2. mobilité DEUX POPULATIONS : perturbations (`…_mobility_disruptions`) classées route
     (→ fournisseurs : « prévenez vos producteurs ») vs transit (→ clients) par
     `mobility_disruption_category` ;
  3. événements voisins au rayon du périmètre client (règle catchment existante),
     conflit vs synergie par `conflict_score`/`audience_overlap` (signaux concurrents) ;
  4. météo × nature : niveaux (`lvl_*`) croisés `event_nature` + plage horaire ;
  5. concurrence : pression/fenêtre calme + l'impact mesuré du motif classe si disponible
     (`getDayClassImpacts` — LE chemin de politique).
  + `score` du jour (surface existante).
- `apres` — panneau : dominant (apport propre vs son référentiel) + CA total vs attendu
  (residual) + tickets/panier vs base + verdict de l'engagement lié (commitments) +
  confondants (`ctx_*`).
- `serie` (si récurrent) : occurrences passées `{date, verdict, gap_eur, kpi_value}` +
  médiane + somme mesurée (jamais extrapolée) + prochaine occurrence.
- `facts` : liste blanche chiffrée (chaque nombre verbatim) — le chat Consulter y gagne les
  événements (« comment s'est passé mon lancement ? » → réponse déterministe ou groundée,
  même patron que « vos dispositifs »).

Wrapper : `GET /api/insight/evenement?location_id&saved_item_id` (patron dispositif.ts,
requireLocationOwnership). PERF : lot parallèle unique, budget 3 s.

## 3. Page `/app/insightevent/evenement.astro`

Coquille + rendu client (patron dispositif.astro) ; scripts partagés : `commit-form.js`,
`bp-form.js`, `draft-workspace.js`, `action-cards.js` (versions courantes). En-tête = proto
v2.1 (chips + coin apport propre objectif/mesuré). États Avant/Après selon `data.stage`
(bascule visible si les deux ont du contenu). Gestes : menu standard 3 entrées ;
« Documenter en dispositif » = POST best-practices pré-rempli (dispositif + auteur + occurrences
mesurées en evidence_refs, origin `event_<type>`), PATCH replay sur l'engagement de l'occurrence.
PILOTER reste surligné (Nav : la règle du 03/08 couvre déjà toute nouvelle page).

## 4. Création — formulaire fusionné

Où : le modal de days.astro est REMPLACÉ par le nouveau formulaire (même point d'entrée), qui
réutilise les briques MSCommitForm (fetch attendu — par jour de semaine pour un récurrent —,
%⇄€, plancher de bruit, raccourcis, roster). Champs → colonnes du § 1.1. Types par métier :
`src/lib/eventTypes.ts` — registre `location_type/industrie → liste FR` + repli générique,
consommé par le formulaire ET par le rendu (tue la liste dupliquée EVT_TYPE_LABELS).
À la création d'un récurrent : occurrences matérialisées + engagement de la 1re occurrence.

## 5. Cartes de cycle de vie (famille événement)

Générateur serveur ADDITIF dans `api/insight/monitor.ts` (consommé par pulse — zéro
modification des chemins existants, cartes ajoutées au même contrat que les candidates) :
- `event_threat` : occurrence à ≤7 j × signal du jour incompatible avec la nature
  (météo × outdoor ; route × fournisseurs) — tone menace, geste ;
- `event_decision_due` : `decision_date` posée, ≤3 j, pas de selected_date ;
- `event_prepare` (J-1) : dispositif + météo de demain + Communiquer pré-rempli ;
- `event_measure` (J+1) : résultat de l'occurrence + « documentez » (30 s).
Suppression par clé existante (`suppression_key event_<id>:<date>`). Menu Agir : le standard.

## 6. Legacy monitor — plan de bascule

1. Construction complète de `/evenement` + E2E owner (compte réel).
2. Commit de bascule des liens entrants : redirect days « Choisir », CTAs crons
   (`daily.ts`, `bilan.ts`, `alerts.ts`), PiloterBottomBar, liste d'événements.
3. `monitor.astro` = legacy (intouché, accessible par URL directe) ; suppression sur GO owner
   explicite, jamais avant ; `events.astro` (orpheline, zéro lien entrant) supprimée au même GO.
4. `api/insight/monitor.ts` : jamais modifié autrement qu'additivement (pulse en dépend) ;
   E2E pulse obligatoire à chaque ajout.
Divergences documentées à corriger au passage : delete.ts est un HARD delete (la doc disait
soft) ; `status_label`/`capacity`/`stage='planifier'` = code mort, non repris.

## 7. Séquencement (un incrément = un commit vérifié)

1. Modèle : ALTER saved_items + commitments (idempotents) + eventTypes.ts. Vérif : bq-verify.
2. Création : nouveau formulaire (briques MSCommitForm) + génération d'occurrences +
   engagement à la création/choix. Vérif : E2E création réelle sur compte café.
3. Provider + wrapper + page (états Avant/Après). Vérif : harnais tsx sur données réelles +
   node --check ; budget 3 s mesuré.
4. Résolution KPI famille dans commitmentResolve (+ gardes). Vérif : rejeu sur jour mesuré réel.
5. Cartes de cycle de vie (monitor.ts additif). Vérif : E2E pulse AVANT merge (non-régression).
6. Chat : facts événement dans la branche « vos dispositifs »/grounded (patron existant).
7. Bascule des liens (commit dédié, GO owner).
Portes standing : lie-bait à toute modification de grounding ; localisation FR partout
(JJ/MM/AAAA, frInt) ; droit français dans toute copy d'action.

## Décisions owner — TRANCHÉES (03/08, « validées telles que proposées »)

- Plafond d'occurrences générées : **52** ; à l'échéance de série, **proposer la prolongation**.
- Graduation série → dispositif « prouvé » : **mêmes portes que l'atelier (n≥5 verdicts tenus)**.
- Bilan déclaratif (event_outcomes) : **conservé en complément du mesuré, 3 questions**.

## Avancement

- **Incrément 1 FAIT (03/08)** : ALTER additifs exécutés et vérifiés en base (12 colonnes sur
  `raw.saved_items`, `saved_item_id` sur `analytics.action_commitments` — `ADD COLUMN IF NOT
  EXISTS`, DDL dans le commit) + `src/lib/eventTypes.ts` (registre types par métier, 12 valeurs
  historiques préservées, `eventTypesFor(industryCode)` + `eventTypeLabelFr(value)`).
