# Événement → dossier mesuré — spec (03/08/2026, protos v1/v2.1 validés) — DÉFINITIF

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
5. **Dossier à TROIS états pour un ponctuel, deux pour un récurrent** (v3 validée sur le
   chaînon manquant, owner 03/08) :
   - **Décider** (ponctuel seulement) : la table candidats CÔTE À CÔTE du legacy (« CHOIX »
     de days.astro:2940, jusqu'à 7 colonnes) recadrée par l'événement — lignes = les 5
     questions + l'objectif PAR candidat (l'attendu varie par jour de semaine → total visé
     par candidat ; l'apport visé est le même) ; recommandation conservée et ARGUMENTÉE par
     l'événement (nature, clients, fournisseurs — plus jamais un score sec) ; « hors horizon
     de prévision » DIT honnêtement (revérifié par la carte J-1) ; « Choisir » = engagement
     ancré (`window_start_date`) + passage à l'état Avant. Même calcul provider que l'état
     Avant, par date — zéro moteur nouveau.
   - **Avant** : les 5 questions sourcées (clients cibles / mobilité clients ET fournisseurs /
     événements voisins synergie-conflit / météo × nature / concurrence) + score du jour ;
   - **Après** : verdict sur l'objectif, panneau complet, agir (menu standard 3 entrées), série.
   La page appartient à la famille cartes + pages insight. Proto : `-v3.html` (Décider).
   **Récurrent — le choix du JOUR de série** (formulaire) : mini-comparateur à deux registres
   jamais mélangés — le MESURÉ par jour de semaine (CA habituel, fréquentation — référentiel
   dow existant) + les menaces des SEULES premières occurrences dans l'horizon de prévision
   (on ne prédit pas 52 samedis ; la carte J-1 revérifie chaque occurrence) ; le dimanche
   n'apparaît que si les jours d'ouverture le portent (repos dominical). Le choix fixe
   `recurrence_dow` + départ.
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
   **`days.astro` aussi = legacy** pour sa fonction événement (l'onglet « CHOIX » est remplacé
   par l'état Décider du dossier) — la page reste vivante comme surface de planification
   générale (month → days, Nav Planifier) ; on n'opère pas dedans.
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

- **Incréments 2a/2b/3/4 FAITS (03/08)** : capacités API (ancrage + fenêtre datée + occurrences) ;
  formulaire MSEventForm + page /evenement (?dates= pré-remplies) ; provider evenementFamily +
  dossier 3 états (harnais réel 3,5 s, colonne piège opportunity_score_final_local attrapée) ;
  **K8 family_revenue** au registre KPI (mesure paramétrée par famille, baseline 30 j, résolution
  rejointe par saved_item_id) + cible du KPI dominant jugée en DÉTERMINISTE au dossier
  (`target_met`) — le verdict STATISTIQUE reste K1 (décision étape 3 respectée : bande de bruit
  par KPI en attente de variances). Fix au passage : crash jour-0 de renderEvolution (card-kit
  v=43 partout). Incrément 5 FAIT (04/08) : lib/eventLifecycleCards (4 types, additif,
  échec soft) + 4 specs client action-cards (v=43 sur les 4 surfaces) + Consulter des cartes
  event_* route vers le dossier. Non-régression PROUVÉE par diff harnais : muse byte-identique,
  café +2 cartes / 0 retrait ; menace absente = prévision réelle retombée (niveau 1) — la branche
  se validera sur la première vraie alerte. Incréments 6 et 7 FAITS (04/08) : chat — branche
  déterministe POSSESSIVE « mes/mon événements » (deterministic_evenements_v1, liste via
  listUserEvenements avec dernière mesure residual — prouvé sur les 5 événements réels owner,
  legacy inclus) + buildEventFacts dans la liste blanche jour ; bascule — création (openSaveModal
  non-édition) → formulaire /evenement ?dates= pré-remplies, « Choisir » de days → dossier,
  CTAs crons daily/alerts → dossier. BASCULE COMPLÈTE (04/08, GO owner) : page LISTE
  « Mes événements » = /evenement sans paramètre (premier consommateur de
  vw_insight_event_user_events — quand/série/prochaine date/track record ; lieu résolu via
  profile/locations pour la BottomBar, via saved-items/get pour les liens Nav/emails sans
  location_id) ; bilan déclaratif reconstruit à 3 QUESTIONS au dossier (météo vécue /
  accessibilité / fréquentation vs attentes — la concurrence saute : seule dimension déjà
  entièrement mesurée ; event_outcomes et l'endpoint bilan inchangés, competition_felt NULL ;
  ?mode=bilan y défile) ; cron bilan.ts élargi aux occurrences (terminé =
  COALESCE(event_end_date, MAX(saved_item_dates.date)) — sans quoi les récurrents n'auraient
  jamais eu de bilan) et repointé sur le dossier, daily-briefing/PiloterBottomBar/Nav aussi ;
  monitor.astro + events.astro SUPPRIMÉES (zéro lien entrant vérifié ; l'API insight/monitor.ts
  reste, pulse en dépend). harness-evt-0001 purgé des 4 tables (12 lignes, GO owner).
  Cron J-7 event-occurrences LIVRÉ le même jour (voir module-index).
- **Suites du 05/08 (voir docs/piloter-redesign-spec.md (tableau-de-bord-spec retiré le 26/08) pour le détail)** : refonte nav 3 onglets
  « Piloter · Agir · Explorer » (listes fermées, Agir = catch-all des vues de détail,
  month/days/map démises du menu) ; Tableau de bord = atterrissage Piloter ; contrat « fait par
  défaut » + tiebreak canonique du journal (10 sites app + 2 modèles dbt) ; grille de dates v7
  (modèle de sélection explicite « clic = jour de LANCEMENT », couverture de durée teintée,
  souligné vacances retiré, chip « Meilleur jour de CA » = fait calculé nommé) ; « Prouver ·
  Automatiser » sur les fiches dispositifs (Automatiser = série récurrente pré-remplie
  ?titre=&dispositif=) ; « Retour » = point de départ (history.back, repli tableau). TOUT EN PROD
  (main 6b9ce09, 05/08).
- **Grille de dates au formulaire + durée multi-jours + dépose days/month (04/08, protos v1→v4
  validés)** : le shopping de dates vit DANS MSEventForm (grille mensuelle ‹ › sur
  /api/insight/month — teinte = CA attendu par dow, pastilles météo, ★ férié, souligné vacances,
  ligne vacances/périodes commerciales, infobulles, chips factuelles — jamais un classement sur
  score plat ; candidates ≤ 7 conservées entre mois) ; « Durée : N jours » → `duration_days`
  (ALTER additif) et, au Choisir, fenêtre de mesure [lancement, lancement+durée−1] via
  `window_days` (additif sur /api/commitments) + `event_end_date` écrit (les crons bilan/J-7 le
  lisent déjà). Dépose : days perd « Mes dates » (→ liste /evenement) et l'onglet CHOIX (→
  dossier Décider), son résolveur ?saved_item_id= redirige au dossier ; month sort du flux de
  création (« Créer l'événement avec ces jours → » → formulaire ?dates=) et reste une surface
  d'exploration. days reste la surface de détail jour par jour. Vérifs : vm 10/10 sur le vrai
  event-form avec payloads réels, tsc + node --check sur les 4 scripts inline, validation
  window_days 400 prouvée.
- **Incrément 1 FAIT (03/08)** : ALTER additifs exécutés et vérifiés en base (12 colonnes sur
  `raw.saved_items`, `saved_item_id` sur `analytics.action_commitments` — `ADD COLUMN IF NOT
  EXISTS`, DDL dans le commit) + `src/lib/eventTypes.ts` (registre types par métier, 12 valeurs
  historiques préservées, `eventTypesFor(industryCode)` + `eventTypeLabelFr(value)`).


## Annexe — vue sémantique `vw_insight_event_user_events` (PRÊTE, volontairement NON créée)

Décision 04/08 : ne pas créer de modèle sans consommateur (la leçon d'`int_client_commitment_latest`,
né orphelin le 13/07). Cette vue se crée AVEC son premier consommateur (page LISTE d'événements,
rapport, ou BI). SQL prêt à coller dans l'IDE dbt Cloud (`semantic/insight_event/`) :

```sql
{{ config( materialized = 'view', schema = 'semantic' ) }}

with events as ( select * from {{ ref('stg_saved_items') }} ),
dates as (
    select saved_item_id, location_id, count(*) as n_occurrences,
           min(date) as first_date, max(date) as last_date
    from {{ ref('stg_saved_item_dates') }} group by 1, 2
),
outcomes as (
    select saved_item_id, count(*) as n_resolved, countif(beat) as n_beat,
           countif(is_confounded) as n_confounded,
           avg(effect_residual_pct) as avg_effect_residual_pct,
           sum(window_actual_revenue - window_expected_revenue) as sum_gap_eur,
           avg(kpi_delta_pct) as avg_kpi_delta_pct
    from {{ ref('fct_client_commitment_outcomes') }}
    where saved_item_id is not null group by 1
)
select e.*, d.n_occurrences, d.first_date, d.last_date,
       o.n_resolved, o.n_beat, o.n_confounded, o.avg_effect_residual_pct,
       o.sum_gap_eur, o.avg_kpi_delta_pct
from events e
left join dates d using (saved_item_id, location_id)
left join outcomes o using (saved_item_id)
```

## Retours owner 10/08 — les 4 Fs (dossier)

- **F1/F3 — tête par ÉTAT, jamais le modèle de données** : titre = le job (« Choisir la date — <titre> » ·
  « Préparer — <titre> » · « Évaluer — <titre> »), sous-titre = ce que l'écran livre ; suivent le
  changement d'onglet. Le texte « un événement porte son dispositif… » est supprimé. Promettre
  seulement ce que le pipeline fait (pas de « enrichit vos prévisions » tant que `event_outcomes`
  n'a pas de consommateur aval).
- **F2 — le mesuré arrive vraiment** : bug de stage réparé (non-récurrent sans `selected_date`,
  dates toutes passées → `apres`, plus jamais « decider » à vie). Sans cible posée : chip grise
  « Sans objectif chiffré · CA suivi vs attendu » (plus de chip « Objectif : » sans nombre) et le
  panneau Après le DIT (« aucun objectif n'était posé — posez une cible à la prochaine occasion »).
- **F4 — le bilan demande AUSSI ce que vous avez fait** : question 1 « Le dispositif prévu
  a-t-il été appliqué ? » (oui / en partie / non) quand l'événement porte un dispositif —
  sans elle, une cible manquée est inattribuable. Colonne `action_carried` (raw.event_outcomes),
  numérotation dynamique 3/4 questions. Le principe « ne demander que ce que la mesure ne voit
  pas » est conservé (la concurrence reste exclue : entièrement mesurée).
- **Hors périmètre, à trancher** : incohérence `event_end_date` (25/07) vs seule occurrence
  (19/06) sur les événements legacy — deux surfaces, deux ancres de retard ; et le branchement
  dbt de `stg_event_outcomes` (modèle feuille).
- **10/08 (2) — un seul acte de capitalisation** : « Documenter en dispositif » n'est plus un
  bouton frère du bilan (owner : « semantically too close ») — l'output découle de l'input. La
  chaîne : bilan envoyé → « En faire un dispositif ? » (recette OBLIGATOIRE si l'événement n'a
  pas de dispositif — l'ancien bouton écrivait une pratique vide ; evidence = mesuré réel ;
  succès → lien « Voir dans vos Dispositifs → »). Idempotente (`apres.documented`, clé serveur =
  suffixe « (événement « titre ») ») ; bilan déjà envoyé → l'état est dit, la chaîne reste.
- **10/08 (3) — les nombres de l'Après sont FONCTIONNELS** (owner : « tickets puis on me
  demande les visiteurs ? labels imprecise ») : (a) chaque box porte sa source et son
  référentiel en infobulle, et son registre en libellé (« · mesuré » / « · déclaré ») ;
  (b) l'« habituel » tickets/panier est au MÊME référentiel que le CA attendu — vos mêmes
  jours de semaine (90 j), repli 28 j toutes-journées DIT tel quel si n < 4 (réel : le 28 j
  disait −11 %, vos vendredis disent −3 %) ; (c) tickets = ACHETEURS (reçus distincts de vos
  ventes importées) ≠ visiteurs = VENUS — la question du bilan le dit, paye en direct
  (« ≈ X % des visiteurs ont acheté ») avec garde-fou visiteurs < tickets, et SAUTE si un
  flux de comptage mesure déjà les visiteurs ; (d) `attendance_approx` est relu par le
  provider → box « Transformation · déclaré » — premier consommateur réel d'event_outcomes.
- **10/08 (4) — « Pour mémoire »** (owner : « je ne me souviens plus de quoi parlait
  l'événement ; avec 5 comme ça, comment les distinguer ? ») : l'état Après ouvre sur un bloc
  mémoire — dispositif + consigne s'ils existent, l'ABSENCE dite sinon (« aucune description
  enregistrée — la recette en tiendra lieu »), et le BILAN RELU EN MOTS (« Votre bilan : météo
  conforme · accès difficile » + commentaire). La boucle se ferme : une recette écrite sur un
  événement SANS description est aussi enregistrée comme sa description (update `description` —
  c'est la colonne derrière `dispositif`) — au prochain passage, le rappel existe. Chip de type
  vide supprimée quand le type est inconnu.
- **10/08 (5) — la recette au CONTRAT du dispositif** (owner : « how is this a dispositif ?
  everything starts upon clicking ? ») : DEUX champs au lieu d'une ligne libre — « Le geste,
  concrètement ? » + « À quelle occasion ? » (placeholders qui enseignent la grammaire ; le KPI
  n'a pas de champ, CA vs attendu est le défaut de la chaîne). Les deux sont requis : la
  structure convertit l'intention en recette rejouable. Microcopie sous le CTA : « Classé
  “déclaré” — rien ne démarre encore. » Au succès, le VRAI démarrage se PROPOSE (« Le tester
  maintenant ? » = chaîne Prouver existante : POST commitments 7 j +10 % puis PATCH
  replay_commitment_id) — jamais lancé seul (une fenêtre de mesure est un choix, anti
  p-hacking). La description backfillée devient « geste — occasion ».
- **10/08 (6) — L'OCCASION décide la fenêtre** (owner : « if no kpi is measured, the dispositif
  can't be tested and played again ! ») : le test « 7 j à partir du clic » mesurait une semaine
  où l'occasion du dispositif n'a PAS lieu — verdict mécaniquement produit, sémantiquement vide
  (cas réel annulé : « mails les 3 jours avant le jour J », fenêtre 10→16/08 sans jour J).
  Deux branches HONNÊTES — la 3e (armement sur signal) n'existe pas pour une origine événement,
  le dispatch est gated `HEAT_DETECTABLE = {structural_traffic_high}` : (a) occurrence à venir →
  fenêtre ANCRÉE dessus (`window_kind: day_of`, `window_start_date`, `window_days` = durée) et
  `saved_item_id` LIÉ (l'engagement cesse d'être orphelin : visible dans Cette semaine, compté
  dans la série) ; (b) aucune → aucun test proposé, on le DIT (« attend son occasion ») + lien
  « Ajouter la prochaine date ».
- **10/08 (7) — fenêtre et seuil ÉDITABLES** : `/api/commitments/edit` n'acceptait que le texte
  et le porteur — une fenêtre fausse ne se corrigeait que par suppression + recréation. Ajout de
  `window_start` / `window_end` / `threshold_value` (gardes : Y-m-d, fin ≥ début, ≤ 90 j, seuil
  1-200 %, et toujours l'interdit après résolution — le gel du verdict reste la garde anti
  p-hacking). Champs exposés dans l'éditeur de la carte engagement (Agir).
- **10/08 (8) — un rejeu ANNULÉ ne bloque plus** : `canProuver` exigeait `!replay_commitment_id`,
  donc une pratique dont le test avait été annulé n'était plus jamais testable. `replay_status`
  exposé ; un replay `cancelled` ne compte pas comme rejeu (pratique re-prouvable, comptée dans
  `declared_no_replay`).
- **10/08 (9) — audit du dossier (owner : « it's a mess »)** : (a) **cloisonnement des
  horizons** — `renderConsigne` et `maybeRenderBilan` faisaient `body.appendChild` : les deux
  blocs restaient visibles quel que soit l'onglet, donc l'écran mélangeait le résultat du 08/08,
  la consigne du 15/08 et le bilan du 08/08. Points de montage `[data-ev-mount]` : consigne →
  panneau AVANT, bilan → panneau APRÈS (repli page si le panneau n'existe pas) ; (b) « Pour
  mémoire » ne redit plus le dispositif (déjà en tête) ; (c) **la série suit le KPI DÉCLARÉ**
  (le formulaire en offre 4 : CA vs attendu / famille / tickets / panier — voir mémoire
  `kpi-declare-suit-partout`) : `serie.kpi_*` (cible, unité, n à la cible, médiane, valeurs par
  date, `trend_readable` ≥ 3) — avant, « 1/1 au-dessus de l'attendu » (CA) s'affichait sous
  « Cible manquée » (famille) ; (d) **Lecture** réconciliant KPI et journée quand ils divergent
  (« la famille sous son ordinaire alors que la journée dépassait l'attendu ⇒ la hausse ne vient
  pas de cette opération ») ; (e) **cible hors d'échelle** dite au verdict (150 € = 4,4×
  l'ordinaire de la famille) ; (f) **« En cours »** : l'engagement de la prochaine occurrence
  (armé / s'armera à J-7) — état invisible jusqu'ici ; (g) verdict en UN vocabulaire (plus
  d'énum brute `missed`) ; (h) aperçu de l'email REPLIÉ (il écrasait le dossier).
- **10/08 (10) — AUDIT : la boucle de décision EXISTE, le dossier l'ignorait** (owner : « we had
  this in place.. are you working from scratch ? » — oui, et la règle du dépôt est de grepper
  `docs/module-index.md` d'abord). Ce qui existait déjà et que je réimplémentais en moins bien :
  `adjustment_move` (`poursuivre|doubler|pivoter|stop`, libellés FR dans `lib/commitmentCopy.ts`),
  la page **`/app/insightevent/engagement?id=`** (« Évolution de l'engagement »), le **moteur de
  recommandation** de `public/card-kit.js` (au-dessus → doubler ; en dessous + exécution complète
  + pas de facteur externe → pivoter ; en dessous + incomplète → poursuivre), le **track record
  par move** (`move_stats` : « ici : 2/3 fois → objectif atteint »), le **diagnostic** (météo,
  événements, vacances, qualité d'exécution) et le re-commit (enfant sur fenêtre fraîche +
  soft-cancel du parent). **Décision owner : LINK OUT** — le dossier renvoie vers la page
  Évolution, il ne duplique jamais le moteur.
  Appliqué : (a) **le bilan ne se demande QUE sur une occurrence close** — il était gated sur
  « date passée + non soumis » sans regarder l'engagement (sur une fenêtre longue, on demandait
  le vécu en plein vol) ; (b) **test en cours → une seule action** : « Poursuivre, doubler,
  pivoter ou arrêter → » vers `engagement?id=` (les rows et `next_commitment` portent désormais
  `commitment_id`) ; (c) **la série au titre LITTÉRAL** (« Vos 3 derniers samedis testés »,
  jamais « Sur la série » / « 0/3 à la cible »), valeur du KPI par ligne avec son objectif, et
  **la décision AU BOUT** — plus un cul-de-sac ; (d) **« attendu » banni** de toutes les chaînes
  visibles (dossier, provider, formulaire) au profit du mot maison **« habituel »** (standard
  copy 27/07 : « CA réalisé / CA habituel ») ; « sans cible chiffrée » → « Objectif non fixé ».
- **10/08 (11) — l'étape PARTAGE, dans Évaluer** (owner : « the share step in Evaluer page ») :
  le résultat d'une opération ne quittait jamais l'écran — `adjustment_note` était journalisé
  sans jamais atteindre personne. Geste « **Prévenir l'équipe →** » dans le panneau Résultat,
  à côté de la décision, qui ouvre le workspace **PARTAGÉ** `MSDraftWorkspace` (même module que
  Pulse et insight, `draft-workspace.js?v=5` — canaux réels, roster, envoi réel : aucun envoi
  maison réécrit). Amorce = le résultat MESURÉ (« Corner de vente producteur — samedi 08/08 :
  famille Branded 28 € (objectif 150 €) — objectif manqué ») + la Lecture en `card_sowhat` +
  la date d'occurrence + le contexte événement (`saved_item_id`, dispositif) + `detail_url`
  vers le dossier. `signal_type = event_result` (inconnu du ROUTING_MAP → aucune suggestion de
  destinataire imposée, le roster reste choisi à la main : jamais un envoi mal routé).
- **10/08 (12) — le LEXIQUE, avec son garde-fou** : `src/lib/fr/evenement.fr.ts` (convention
  maison `*.fr.ts`, un fichier par surface, éditable par l'owner) porte `MOTS_BANNIS`
  (attendu→habituel · « sur la série »→libellé littéral · « à la cible »→« à votre objectif » ·
  « cible chiffrée »→objectif · rejeu→test · non-mesurable→non mesurable) et `EVT_FR` (onglets,
  verdicts, série, en-cours, décision, partage, bilan). **Le livrable, c'est le garde-fou** :
  `evenement.fr.guard.test.ts` scanne les chaînes VISIBLES (littéraux hors commentaires, hors
  identifiants techniques) du provider, du dossier et du formulaire — il a attrapé **9
  occurrences d'« attendu » que la correction à la main avait ratées** (dont le formulaire de
  création : « % au-dessus de l'attendu du jour », « CA vs attendu ») et il MORD (réintroduction
  volontaire → échec, vérifié). Ajouter une entrée à `MOTS_BANNIS` suffit à interdire un mot.
  `npx vitest run src/lib/fr/`
