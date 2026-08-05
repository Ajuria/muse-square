# Tableau de bord — spec (05/08/2026, maquettes V1→V5 + v3 finale validées owner)

Surface : `/app/insightevent/tableau` (atterrissage de l'onglet Piloter) · endpoint
`/api/insight/dashboard` · voir les lignes détaillées de `docs/module-index.md`.

## 1. Les 5 jobs (validés owner, 04/08 — après rejet de 2 architectures)

1. **Suivre l'exécution** — une ligne par objet engagé (occurrence, engagement), triée par
   échéance ; même forme à 1 ou 50. Les menaces n'existent que comme DRAPEAU sur une ligne
   (« ⚠ concurrent à proximité ce jour-là »), jamais comme section environnement — ça, c'est Agir.
2. **Rendre des comptes (Équipe)** — par personne : ses opérations NOMMÉES (jamais un compteur
   seul), tenue (verdicts tenus/rendus), € mesurés. Pas de classement explicite (périmètres non
   comparables, invite à gamer, humilie sur petit roster) — les chiffres côte à côte suffisent.
3. **Capitaliser (Dispositifs)** — l'échelle de preuve : déclaré → (rejeu) → prouvé. Un compteur
   à zéro montre son PIPELINE (« 0 · 1 en rejeu (verdict dim) · 3 déclarés »), jamais un zéro nu.
4. **Alimenter la machine (gestes)** — voir § 3.
5. **Créer** — « Nouvel événement », seul bouton plein de la page.

Rejets structurants : V2 « semaine en bande calendrier » (doublon d'Agir, ne passe pas l'échelle) ;
bloc « Objectifs » (doublait Impact/Opérations/Dispositifs — la cible vit SUR la ligne d'opération).

## 2. Garde-fous (non négociables)

- **Aucune métrique brute sans son verdict** — critère d'admission de tout futur bloc. Pas de
  courbe de CA « pour info » : ce serait entrer dans le segment disputé des dashboards de caisse.
- **Jamais extrapolé** : l'Impact € = somme des écarts mesurés des fenêtres engagées jugées.
- **Deux registres** : « jugées » = tous les verdicts mesurables du journal ; « € » = le mart
  seulement (contrat « fait par défaut », § 5). Un verdict `confounded` est NON MESURABLE :
  hors €, hors tenue, hors « cibles atteintes » — compté à part (« N non-mesurable hors € »).
- **Zéro dummy content** : tout compte affiché est calculé ; toute suggestion « À activer »
  correspond à un interrupteur réellement éteint, vérifié en base (`alerts_critical`,
  `signal_routing`). Une ligne déjà activée disparaît.
- **Période 30/90/12 m** : filtre l'affichage, jamais un recalcul (un prouvé ne se « déprouve »
  pas hors fenêtre).
- **Multi-sites par défaut** (le mono-site cachait 2 opérations sur 3) ; pastille de site par
  ligne ; `?location_id=` = filtre optionnel.

## 3. « À faire maintenant » — le moteur de gestes

- **Un seul geste toujours visible**, en LIGNE D'ACTION (`.aline`) — jamais un bouton : la
  priorité s'exprime par la position, pas par un costume. Un seul bouton plein par écran.
- **Priorité : mesure d'abord, config ensuite** — bilan en retard (« attend depuis N jours »,
  date réelle) > documenter (verdict tenu sans pratique du même type) > prouver (déclaré sans
  rejeu) > équipe (roster vide) > canaux (aucun config enabled) > alertes (préférences jamais
  posées) > marge (correction `declared_margin_pct` absente).
- Les gestes de CONFIG n'apparaissent que si le manque est réel en base — sur un compte neuf
  (tableau à zéro) ils remontent seuls en tête = onboarding guidé ; sur un compte configuré,
  aucun n'apparaît. Jamais de checklist générique.
- **Le pli s'annonce par les OBJECTIFS** (« À débloquer : 1 dispositif prouvable · vos
  prévisions (2 bilans) · le KPI profit »), chaque ligne but → geste. Jamais « + N autres
  gestes » (process).
- CTAs : bilan → dossier `?mode=bilan` ; documenter/suivre → Agir ; marge → Explorer
  `?q=` pré-rempli (ie-prompt v32 — pré-remplit, n'envoie JAMAIS seul) ; équipe/canaux →
  `/profile?tab=comm` ; alertes → `/notifications`.

## 4. Forme (leçon UX du 05/08)

Design system RÉEL obligatoire (police héritée, eyebrows `.tb-eb` 11px muted, cartes ombrées,
chips 20px) — un style inventé a fait rejeter la V1 (« focusing on parts of UI and forgetting the
user »). `global.css` plafonne `<strong>` à 500 → graisses en styles inline (règle HTML injecté).
Trois étages : Impact + geste · Cette semaine (≤ 7 j, colonnes [J-x | quoi | ›], signaux
compressés « ⚠ N signaux » infobulés, séries repliées « N occurrences suivantes ») · trois volets
fermés dont le TITRE est la réponse : **Dispositifs · Équipe · Automatisation** (dans cet ordre —
on fait avant de consulter). Labels tranchés owner : « Tableau de bord », « Opérations en
cours », « Équipe », « Dispositifs prouvés » (pas « gagnants »), « Automatisation » (JAMAIS
« Fait pour vous », rejeté 2×), onglets « Piloter · Agir · Explorer » (dans cet ordre).

## 5. Contrats de données adossés

- **« Fait par défaut » (owner 05/08)** : la date de fin CLÔT l'opération, l'action compte menée.
  Gestes d'exception sur la carte Pulse : « Fait » (exécution finie en avance — n'écourte JAMAIS
  la fenêtre de mesure, garde anti p-hacking) et « Pas menée » (valeur legacy `pas_encore`,
  exclue des €). Mart `fct_client_commitment_outcomes` :
  `coalesce(action_done_status,'') != 'pas_encore'` (appliqué dbt Cloud IDE, CTE
  `resolved_not_optout`).
- **Tiebreak canonique du dernier-état** (10 sites app + 2 modèles dbt) :
  `updated_at DESC, terminal (resolved/cancelled) DESC, verdict non-null DESC, created_at DESC` —
  deux transitions au même timestamp rendaient un engagement « open » côté app et « resolved »
  côté mart (c'était le « double comptage track record »).
- **Fiches dispositifs : « Prouver · Automatiser »** — Prouver = un rejeu mesuré (POST
  /api/commitments 7 j +10 % puis PATCH /api/best-practices `replay_commitment_id` — endpoints
  existants) ; Automatiser = série récurrente via formulaire pré-rempli (`?titre=&dispositif=`,
  event-form v7). Le déclenchement CONDITIONNEL (ex. « quand la canicule est annoncée ») n'est
  PAS construit — ne jamais le promettre.
- **« Retour »** (dossier, dispositif) = point de départ : `history.back()` si référent app,
  repli `/tableau`.

## 6. Perf

UN lot `Promise.all` de 10 lectures légères (~1,6–1,9 s réel multi-sites) — budget 3 s.
Toute lecture ajoutée entre DANS le lot, jamais en séquence.
