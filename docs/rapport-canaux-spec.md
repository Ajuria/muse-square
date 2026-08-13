# Rapport par canal — spec finale (étape 4, 08/08/2026)

Process owner respecté : livrables spécifiés → concepts validés → prototype itéré
(5 versions, `public/rapport-canaux-proto.html` = v5 validée) → cette spec → code.
Chantier 100 % app (AUCUN travail dbt : les marts du chantier grain suffisent).

## 0. Décisions verrouillées (owner, 07-08/08)

1. **Extension du rapport ventes existant** (`rapport.astro` + `insight/sales-report.ts`),
   jamais un document parallèle. ADD, don't REPLACE.
2. **Hiérarchie Groupe → Site → Canal.** Rapport d'un site = ses canaux ; compte
   multi-sites = vue groupe (sous-totaux par site + total groupe). Flux réels :
   site Les Olivades = Boutique (caisse) + Professionnels (comptes) ; site
   Studio Paris = facturation directe, un seul flux.
3. **Escalade des grains dans l'affichage** : Boutique → semaines (mart hebdo),
   Professionnels → mois + comptes (mart mensuel + staging), épisodique → factures
   par compte, jamais de verdict. Cohérence carte ↔ rapport : un « remarquable »
   du rapport EST celui du détecteur des cartes (mêmes marts, mêmes seuils).
4. **Clients nommés** — document interne, mention en pied. Jamais d'IDs bruts.
5. **Rapports spécifiques** : sélecteur en tête — groupe · site · canal seul.
   Un canal seul = ses blocs en document autonome (même provider).
6. **Consulter** : les faits du provider entrent dans le Q&A groundé
   (« comment va la boutique ? », « où en est PORTHAULTNE ? »).
7. **Voix : les 4 questions** — D'où vient l'argent / Ce qui marche / Ce qui ne
   marche pas / À faire. Registre exploitant (rejets owner : « compensé par »,
   « s'explique par l'absence de », jargon d'app « M'engager y assigne »).
   Gabarits dans UN fichier fr éditable par l'owner.
8. **Libellés de canaux par compte** : slug technique en base (`comptoir`,
   `direct`, `__site__`), libellé affiché configurable par compte. Défauts
   Olivades : `Boutique` / `Professionnels` / le nom du site pour `__site__`.
9. **Forme** : une couleur par graphique + mise en avant sélective (sélecteur
   Meilleure et pire / 3 meilleures / 3 pires / Semaines remarquables) ; mini-
   camemberts de part ; listes de comptes COMPLÈTES (« Autres » agrégé au print,
   dépliable à l'écran) ; ligne Total partout ; JAMAIS de signe `~` ; pas de
   colonne objectif tant qu'aucun engagement n'en déclare (jamais inventé).
10. **Chaque agrégat sort d'une requête** — trois fautes attrapées au proto
    (« ~45 » factures fausses, « +3 % » faux, « samedi de marché » inventé) ;
    le code ne calcule JAMAIS un agrégat de tête ni n'orne un chiffre.
11. Déclencheurs v1 : on-demand + à l'upload (comme aujourd'hui). Envoi mensuel
    automatisé (rail consigne) = v2.
12. La section canaux n'apparaît que si le compte a ≥ 2 flux réels (canaux
    mappés ou multi-sites) — jamais de section à un seul flux « site ».

## 1. Architecture — un cœur, un provider, trois consommateurs

**`src/lib/insightFamilies/channels.ts`** (nouveau) :

- **`channelsData(bq, all_location_ids, date_start, date_end)`** — le CŒUR.
  Assemble (requêtes parallèles, amorcées puis attendues — règle perf) :
  - agrégats par (site, canal) sur la période + la période précédente de même
    durée : CA, factures, jours actifs, part, évolution, état (▼ à traiter si
    évolution ≤ −15 % ; ▲ ; ● stable — seuils dans le fr file) — depuis
    `staging.stg_client_transactions` (is_invoiced, canal, site routé) ;
  - sous-totaux par site + total groupe (CALCULÉS EN SQL, décision 10) ;
  - série hebdo des canaux hebdo-jugeables dans la période
    (`mart.fct_location_channel_weekly` : ca, week_state, baseline) ;
  - mois + top_parties des canaux mensuels-jugeables
    (`mart.fct_location_channel_monthly`) ;
  - comptes de la période par canal à comptes : top 6 nommés (libellé annuaire)
    + « Autres — N comptes, X € » + total ; liste COMPLÈTE pour les canaux
    épisodiques ≤ 15 comptes ;
  - clients en décrochage courants (`mart.fct_location_client_patterns`,
    state='dormant' + rôle éligible — les mêmes que les cartes) ;
  - nouveaux comptes de la période (first_order dans la période, state='new') ;
  - libellés : `sales_channel_labels` (§ 3) avec repli fr file.
- **`channelsFamily: FamilyProvider`** — l'enveloppe au contrat existant
  (`run(bq, location_id, date)`) : période canonique = les 90 derniers jours de
  DONNÉES du site (ancrage data_end, jamais current_date). Produit
  `{found, data, facts, sources}` ; `render: "renderChannels"` ;
  `match`: /\b(canal|canaux|boutique|comptoir|grossiste|revendeur|studio)\b.../ +
  /\b(client|compte)s? (pro|professionnel|regulier|dormant|en retrait)/ +
  question portant un NOM de compte connu (résolu au run : la question contient
  un party_label du site → route ici). Enregistrée dans `FAMILIES` APRÈS les
  familles existantes (l'ordre est un comportement — ne rien voler).
- **`facts`** (whitelist Consulter + exec summary) : une entrée par vérité
  affichée — « Boutique : 60 815 € sur la période 01/05-27/07, +16 % » ;
  « PORTHAULTNE : premier compte pro, 20 027 € en 2 commandes » ;
  « PARISIENNESOILAIN : sans commande depuis le 20/05, rythme habituel 9 j » —
  claim_type mesuré, JAMAIS de tier par défaut.

## 2. La couche de copie — `src/lib/fr/rapportCanaux.fr.ts` (nouveau, owner-editable)

Un seul fichier, exporte :
- `CHANNEL_DEFAULT_LABELS` : comptoir→Boutique, direct→Professionnels,
  `__site__`→(nom du site) ;
- `ETAT` : seuils (−15 %/+15 %) + libellés (▼ à traiter / ▲ en forme /
  ▲ exceptionnel ≥ +100 % / ● stable) ;
- `QUATRE_QUESTIONS` : gabarits de phrases à trous, une fonction par question,
  alimentées par les données du cœur — règles déterministes :
  - *D'où vient l'argent* : parts en mots (« plus de la moitié », « un tiers »,
    « le reste ») + € ;
  - *Ce qui marche* : canaux en hausse + gros signataires nommés de la période ;
  - *Ce qui ne marche pas* : canal en écart + top compte manquant (le plus gros
    CA de la période précédente absent de celle-ci) + dormants comptés ;
  - *À faire* : rappels nommés (dormants) + question au compte manquant.
  Les phrases du proto v5 sont la référence de ton. AUCUNE cause non mesurée,
  aucun ornement (décision 10).
- Le résumé LLM (exec summary de `family-report`, gaté par le validateur) est
  un AJOUT optionnel v2 — jamais un remplacement du bloc déterministe (un
  rapport ne porte jamais de prose non gatée, doctrine D3 existante).

## 3. Libellés par compte — `analytics.sales_channel_labels`

Table app-write minuscule (load job initial, DML ensuite) :
`(clerk_user_id, channel_key, label, updated_at)`. Lecture « compte, sinon
défaut fr file ». Je la crée et j'y insère les libellés Olivades validés.
UI d'édition : différée (DML à la demande) — notée en queue.

## 4. Endpoint + rendu

- **`insight/sales-report.ts`** : accepte `scope` (`group` | `site` | un
  channel_key) ; appelle `channelsData` avec la période demandée ; la réponse
  gagne `channels: {…}` (section absente si < 2 flux — décision 12). Le reste
  du rapport INCHANGÉ.
- **`public/card-kit.js`** : `MSCardKit.renderChannels(data)` — le rendu v5 :
  tableau hiérarchique (sites en gras + canaux indentés + Total), bloc
  4 questions, série hebdo monochrome (barres + sélecteur de mise en avant,
  états du détecteur), mois pros + tableau des comptes + totaux, liste
  épisodique complète, mini-camemberts (conic-gradient), pied « Document
  interne ». Partagé rapport ↔ family-report. Dates JJ/MM, fr-FR partout.
- **`rapport.astro`** : le sélecteur de scope (chips, formes existantes) ;
  bump cache-buster card-kit sur les surfaces consommatrices.
- **`family-report.ts`** : rien à changer — la famille enregistrée y est
  automatiquement éligible (`{families:['channels']}` = rapport spécifique).

## 5. Vérification (avant « fait »)

1. Harnais tsx : `channelsData` sur f10c3e58 (attendu : section ABSENTE —
   un seul flux) et sur le compte Olivades (groupe : totaux = les chiffres v5
   au centime : 211 698 € / +1 % / 84-16 ; site ; canal seul).
2. Rendu : payload réel dans `card-harness.html` (le harnais EST la page),
   captures des 3 scopes.
3. Q&A : harnais sur `familyForQuestion` — « comment va la boutique ? »,
   « où en est PORTHAULTNE ? » routent vers channels ; les questions des
   familles existantes n'y routent PAS (non-régression sur l'ordre).
4. Lie-bait : les facts passent le validateur existant (aucune relaxation —
   sinon suite lie-bait obligatoire).
5. node --check / eslint no-undef / tsc / vitest existants.

## 6. Incréments de build (dans l'ordre)

- **R1** : cœur `channelsData` + table labels + provider (facts inclus) +
  `renderChannels` + section dans le rapport enrichi (scope group/site).
- **R2** : rapports spécifiques (scope canal + chips rapport.astro).
- **R3** : routage Consulter (match + résolution nom de compte) + harnais Q&A.
- **v2 (queue)** : exec summary LLM gaté ; envoi mensuel automatisé (rail
  consigne) ; UI d'édition des libellés ; option « déplier Autres » à l'écran ;
  colonne objectif quand un engagement par canal existera.

## 7. Hors périmètre

- Aucun nouveau modèle dbt. Aucune modification des marts du chantier grain.
- Le rapport familles multi-cartes (family-report multi) reste tel quel.
- Pas de baseline saisonnière avant ~09/2026 (un an de données).
