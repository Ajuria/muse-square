# Le périmètre de mesure d'un dispositif : ce que le corner vend, et rien d'autre — SPEC DE TRAVAIL

Sert : `docs/intent.md` § Le test de valeur — « un chiffre porte son référentiel » — et § Les
objets (pôle → dispositifs → composants, `docs/dispositifs-typologie-spec.md`). Prolonge
`docs/explorer-dispositif-famille-spec.md` (DÉFINITIF : la lecture dispositif × famille existe) et le
chantier composants (§ 9 de la typologie : la confirmation des articles reste à livrer).

Le mot visible pour ce concept n'existe pas encore au lexique : « périmètre » y désigne déjà la ZONE
AUTOUR DU SITE (« votre périmètre », « activité dans votre périmètre ») — il ne peut pas servir ici.
Ce document dit `measured_scope` en interne et attend le mot de l'owner (§ 5, D6).

## 1. Le constat (owner 07/09, test du « Corner de vente producteur »)

« There is no corner in real life and the dispositif doesn't know what the corner sells, so it's
computing all sales while it should be more specific. » Vérifié sur la page de l'engagement du 08/08 :

| Ce que la page montre | Sur quoi c'est calculé | Source |
|---|---|---|
| Verdict « Objectif non atteint », 28,0 € réalisé, habituel 56,2 €, cible 62,4 € | UNE famille : `kpi_family` = « Branded » de l'opération (`raw.saved_items`) | `verdict_basis` = kpi, `kpi_delta_pct` −50,2 |
| En-tête « −17,4 % de ventes » | TOUT le CA du jour vs l'attendu du modèle (1 869 € vs 2 263 €) | `window_residual_pct` |
| « Décomposition des ventes » : 399 achats contre 304, +31,5 % ; « Chiffre du jour : +32,5 % vs vos jours comparables » | TOUT le magasin vs les 4 samedis précédents | `commitmentShape.ts`, bloc trois facteurs |

Trois lectures, deux périmètres, un seul objet. Le verdict est spécifique parce que l'opération
portait une famille ; la page ne l'est pas, parce que l'engagement n'a pas de périmètre à lui.

## 2. Ce qui existe [vérifié 07/09 sur f10c3e58]

| Brique | État | Mesure sur Muse Square |
|---|---|---|
| Famille cible d'une opération (`raw.saved_items.kpi_family`, page Opération « Objectif à fixer », libellé « CA famille « X » (€) ») | existe, UNE famille, choisie sur la page de l'opération, héritée par l'engagement (`measured_metric` = family_revenue) | 5 opérations, 1 avec famille |
| Familles d'un pôle (`action_commitments.pole_families`, JSON de familles RÉELLES, lu par `poleReading.ts`) | existe ; « Rattacher à un pôle » dans « M'engager » et « Créer opération » — le rattachement n'entre PAS dans la mesure (décision 03/09) | 0 engagement rattaché |
| Composants et photos (`action_commitments.components`, `analytics.dispositif_photos.items_matched` / `items_confirmed`) | existe jusqu'à la lecture ; la CONFIRMATION des articles est le point 5 restant de la typologie | 0 composant, 0 photo |
| La clé article → famille (`staging.stg_client_transactions.item_code` × `category`) | existe ; c'est ce qui permet de passer d'articles confirmés à un périmètre mesurable | 30 j : Coffee 21 articles / 20 431 €, Tea 16 / 14 872 €, Bakery 11 / 6 404 €, Branded 3 / 1 334 € |
| Lecture par famille dans « Comprendre le résultat » (`commitmentShape.ts`, bloc familles : réalisé vs référence par famille) | existe, mais TOUTES les familles, sans périmètre | — |
| Bloc trois facteurs (achats × articles par achat × € par article) | existe, magasin entier, référence = les 4 mêmes jours de semaine précédents (seul endroit où le référentiel diffère, et il le dit) | — |

Conclusion de l'audit : il ne manque ni table ni lecture ; il manque **l'objet « ce que le dispositif
vend »** porté par l'engagement, et sa propagation à la mesure, à l'en-tête et à la décomposition.

## 3. Le modèle proposé

**`measured_scope`** sur l'engagement (et sur l'opération, dont l'engagement hérite) :

```
{ kind: "familles" | "pole" | "articles",
  familles: ["Branded", "Coffee beans"],    // kind familles : plusieurs, jamais une seule imposée
  pole_id: "…",                             // kind pole : les familles du pôle AU MOMENT de l'engagement, figées
  item_codes: ["…"] }                       // kind articles : les articles confirmés depuis la photo
```

Au moment de la mesure, un périmètre se résout en un ENSEMBLE D'ARTICLES (`item_code`) : les familles
→ leurs articles ; le pôle → ses familles → leurs articles ; les articles → eux-mêmes. Puis, sur cet
ensemble, à chaque jour de la fenêtre :

1. **Le KPI mesuré** : le CA du périmètre (somme des lignes dont l'article est dans l'ensemble) vs son
   habituel — la méthode existante de `family_revenue` (`measureKpiBaseline`, bande de bruit,
   gardes vacances), étendue d'une famille à un ensemble. Le verdict se rend dessus.
2. **L'en-tête** dit le KPI du verdict, dans son unité : « −50 % de CA de <périmètre> vs votre
   résultat habituel » — jamais un autre chiffre au-dessus du verdict.
3. **La décomposition** se restreint au périmètre : achats CONTENANT un article du périmètre,
   articles du périmètre par achat, € par article du périmètre ; la référence = les 4 mêmes jours de
   semaine précédents, restreints de même. Le magasin entier reste UNE ligne de contexte, dite comme
   telle (« le magasin ce jour-là : +32,5 % vs vos jours comparables »), jamais le verdict.
4. **Le panier entier** (`ticket_revenue_avg` des tickets contenant le périmètre, mart offering
   daily 07/09) reste la lecture « ce que l'opération fait au ticket », en plus — pas à la place.

Ce qui ne change pas : un engagement sans périmètre (`measured_scope` nul) mesure le CA du lieu,
comme aujourd'hui ; une version suivante hérite du périmètre de sa version précédente ; le
rattachement à un pôle PROPOSE ses familles comme périmètre (pré-rempli, modifiable), il ne l'impose
pas — la décision du 03/09 (« le rattachement ne change pas la mesure ») reste vraie tant que
l'exploitant n'a pas confirmé.

Migration : les engagements existants avec `measured_metric` = family_revenue prennent
`measured_scope = { kind: "familles", familles: [kpi_family] }` — le Corner devient « Branded »
partout sur sa page, sans changer son verdict.

## 4. Les mots — aucun proposé ici (règles 2 et 4 de la copie)

Chaînes APPROUVÉES réutilisables : « Rattacher à un pôle », « CA famille « Branded » », « Objectif à
fixer », « Fixer l'objectif », « famille produits & services », « vos jours comparables », « vs votre
résultat habituel », « composant », « photo ». Manquent, mots owner : la QUESTION du formulaire (« ce
que le dispositif vend » — trois réponses : des familles, un pôle, les articles de la photo), et le
NOM du périmètre dans une phrase (« −50 % de CA de … »). « Périmètre » est pris (zone autour du site).

## 5. Décisions owner — toutes ACTÉES le 07/09 (1 à 5 : oui ; 6 : mots conseillés, acceptés ; 7 : ajout owner)

1. **Le périmètre est-il obligatoire ?** Conseil : obligatoire pour une opération ou un engagement
   né d'un dispositif (corner, îlot, tête de gondole — l'objet vend quelque chose de nommé) ;
   optionnel pour un engagement sur le lieu entier (horaires, communication, accueil), où le CA du
   lieu EST le bon périmètre.
2. **Plusieurs familles ?** Conseil : oui — un corner producteur vend « Coffee beans » ET « Branded » ;
   une famille unique est le cas particulier, pas la règle.
3. **Les articles confirmés depuis la photo valent périmètre ?** Conseil : oui, et c'est le débouché
   naturel du point 5 de la typologie (la confirmation des articles) — une photo confirmée = un
   périmètre sans rien saisir. Tant qu'aucun article n'est confirmé, la photo ne mesure rien.
4. **La référence de la décomposition restreinte** : les 4 mêmes jours de semaine précédents, sur le
   même ensemble d'articles. Conseil : oui, même règle que le bloc actuel, juste restreinte — le
   référentiel diffère de l'en-tête et le dit, comme aujourd'hui.
5. **Les engagements existants** : migration silencieuse de `kpi_family` vers `measured_scope`
   (conseil : oui, un seul engagement concerné sur Muse Square, aucun sur les comptes réels).
6. **Les mots** (acceptés 07/09). La question du formulaire : **« Ce que le dispositif vend »**, trois
   réponses « des familles » (multi-sélection des familles réelles du site), « les familles du pôle »
   (pré-sélectionnées quand un pôle est rattaché, modifiables), « les articles de la photo » (présente
   seulement quand une photo a des articles confirmés, jamais grisée). Le nom du périmètre dans la phrase
   du verdict, prolongement de la règle du 27/08 : une famille « CA de la famille « Branded » » ; deux ou
   trois « CA des familles « Branded » et « Coffee beans » » ; au-delà « CA des 4 familles du dispositif »
   (la liste en infobulle) ; un pôle « CA du pôle « Épicerie fine » » ; les articles d'une photo « CA de
   « Corner de vente producteur » » (le titre du dispositif). Toujours suivi de « vs votre résultat habituel ».
7. **« Ajouter famille de produits »** (ajout owner 07/09) : une famille NOUVELLE, pas encore dans les
   tickets, entre dans le périmètre par son nom. Tant qu'elle n'a pas de ventes, elle n'a pas d'habituel :
   la mesure la dit (« aucun habituel : famille nouvelle ») et le verdict se rend sur l'objectif en € de
   l'opération (« CA famille (€) », existe) — réalisé ≥ objectif ; sans objectif en €, verdict non
   concluant, jamais un % sur un habituel qui n'existe pas. Dès qu'elle se vend, le nom saisi doit être
   celui de la famille dans les tickets : le formulaire le dit, et la lecture joint sur le nom exact.

## 6. Incréments et portes (après § 5)

| # | Livraison | Porte |
|---|---|---|
| P0 — **APPLIQUÉ 07/09** (dbt : PR [ms_database#128](https://github.com/Ajuria/ms_database/pull/128) à merger) | Colonne `measured_scope` (STRING JSON) sur `analytics.action_commitments` et `raw.saved_items` ; migration des `kpi_family` ; `vw_insight_event_commitment_memory` l'expose (PR dbt depuis `main`, build déclenché après merge). Forme : `{ kind, familles?: [{ nom, nouvelle?: true }], pole_id?, item_codes? }`. | ALTER vérifié en base ; contrat de la vue ; rejeu du Corner : périmètre « Branded ». |
| P1 — **APPLIQUÉ 07/09** (rejeu du Corner : 28 € / 56,2 € / −50,2 % à l'identique) | La mesure : résolution périmètre → articles (`stg_client_transactions`), `measureKpiBaseline` sur un ensemble, verdict `kpiVerdict` inchangé dans sa méthode. | Lie-bait : un périmètre vide ne rend jamais un chiffre ; test pur avant/après sur le Corner (28 € / 56,2 € retrouvés à l'identique). |
| P2 — **APPLIQUÉ 08/09** | `public/js/scope-form.js` (module partagé, `MSScopeForm`) dans « M'engager » (familles via `goal_context.families`, pôle → `setPole`, `prefill.measured_scope` et `photo_items` depuis la page de l'engagement : la version suivante repart du périmètre du parent et des articles confirmés) et « Créer opération » (le KPI « CA de ce que le dispositif vend vs votre résultat habituel — mesuré » ouvre le bloc ; `kpi_family` = la première famille pour le libellé de la page ; un pôle rattaché bascule le KPI et pré-choisit ses familles) ; « Ajouter famille de produits » (D7). Serveur : un périmètre sur un engagement mesuré au CA du lieu bascule la mesure sur le CA du périmètre. | Harnais happy-dom sur les VRAIS fichiers : `scope-form` (5), `commit-form-scope` (4), `event-form-scope` (2) ; les suites pôle/KPI existantes restent vertes. Écriture BQ réelle : à prouver par l'owner sur Muse Square (créer une opération avec deux familles). |
| P3 — **APPLIQUÉ 08/09** | La page de l'engagement : en-tête dans l'unité du verdict (« −78 % de CA de la famille « Branded » »), explication ouvrable au clic et au toucher (`<details>` fermé, décision 28/08 gardée) ; « Comprendre le résultat » RESTREINT au périmètre (`buildWindowShape` reçoit `scope`, `scope_label_fr`, `scope_expected_eur` = kpi_baseline × jours) : achats CONTENANT un article du périmètre (facture distincte, repli transaction_count — la règle du mart offering), articles et € du périmètre, heures du périmètre (lignes de caisse par heure), familles du périmètre ; référence = les 4 mêmes jours de semaine restreints de même ; titre « Décomposition des ventes de la famille « Branded » » ; le lieu entier = UNE ligne « Votre lieu, ce jour-là : +38,8 % vs vos jours comparables. » recomposée par le même code. Sur le Corner du 22/08 : « Chiffre du jour : −60,4 % » (Branded) contre « +38,8 % » (le lieu). | Harnais `engagement-shape-harness` phase 4 (11 invariants : familles = périmètre, réalisé = somme des lignes Branded (autre requête), habituel = kpi_baseline × jours, sommes des écarts, achats = `invoice_count` de la vue offering jour par jour (2 sources), produit des facteurs, contexte = lecture non restreinte) ; page rendue par le vrai endpoint + vrai card-kit. | Harnais card-kit sur le JSON réel du Corner : les trois chiffres parlent du même périmètre. |
| P4 — **APPLIQUÉ 08/09** | `POST /api/dispositifs/photos {action: confirm}` : après l'écriture de la photo confirmée, l'union des articles confirmés des DERNIÈRES photos par composant de la version devient `measured_scope { articles }` de la version (`scopeFromConfirmedPhotos`, pur ; `readMergeWrite` transition `edited`) — sauf familles ou pôle choisis à la main (un choix explicite prime), jamais un périmètre vide ; la réponse dit `measured_scope_changed` et la page de l'engagement se relit. | Test pur (union, dernière photo par composant, choix explicite gardé, même ensemble non réécrit) ; tsc ; aucune photo n'existe encore sur un compte (0 ligne `dispositif_photos`) : le rejeu réel attend les photos d'Épices et Tout. |

## 7. Requêtes et fenêtres des chiffres cités

Toutes sur `f10c3e58-326e-4e38-947c-d59fcbe51df5`, le 07/09/2026 : engagements = dernier instantané
par `commitment_id` (fenêtre ROW_NUMBER de `commitments/index.ts`) ; familles = `staging.stg_client_transactions`,
`transaction_date` entre J−30 et J ; page du Corner = `commitment_id` `0b4018cf…` (`window_residual_pct`,
`kpi_delta_pct`, `kpi_baseline`, `kpi_window_value`, `verdict_basis`) ; jours comparables et décomposition =
`src/lib/commitments/commitmentShape.ts` (en-tête du module).
