# Chantier C1 — motifs par client (« client en décrochage ») — spec d'application, 06/08/2026

GO owner 06/08 (« go spec C1 »). Premier étage du chantier C (les grains servis,
cf. channel-grain-spec § 9) : là où la porte de régime a supprimé les faux
verdicts quotidiens, C1 crée la première carte au GRAIN CLIENT — celle qu'aucun
dashboard de caisse ne fait : **un client régulier qui a cessé de commander**.

Périmètre v1 : UNE carte (`client_dormant`). La carte « nouveau client » est
écartée (mesuré : 18 nouveaux clients/30 j chez Olivades → une carte par client
inonde, un agrégat est visible dans Sage — ne passe pas la barre de qualité).

## 0. Chiffres de référence (tous MESURÉS le 06/08 sur le staging routé)

Population (site principal Olivades, canal direct, facturé) : 212 clients à
compte, dont 144 à commande unique. **Cadence établie** (≥ 4 commandes ET
relation ≥ 90 j) : **22 clients**. Les 33 clients à ≥ 3 commandes/≥ 60 j portent
282 150 € = 68 % du CA direct — le grain client est LE levier de ce compte.

**Dormants attendus (4)** — silence ≥ max(2 × intervalle médian, 30 j) :

| client | commandes | intervalle méd. | silence | ratio | CA total | priorité |
|---|---|---|---|---|---|---|
| CHAHAN | 19 | 7 j | 46 j | 6,6 | 31 357 € | 4 |
| PARISIENNESOILAIN | 6 | 9 j | 68 j | 7,6 | 5 487 € | 3 |
| HILLARYWTAYLOR | 4 | 20 j | 119 j | 6,0 | 1 452 € | 3 |
| DELAURIERE | 4 | 15 j | 125 j | 8,3 | 874 € | 3 |

Vérifications de justesse : MAYENNETOILES (18 862 €, ratio 0,8) et EDMONDPETIT
(22 039 €, ratio 0,3) restent « actifs » ✓ ; FREYPIERRE (ratio 1,5) ne tire pas
encore ✓. Le seuil « ≥ 4 commandes / ≥ 90 j » élimine les projets ponctuels
(3 factures en 15 jours → ratios absurdes à 24× mesurés avec ≥ 3 commandes).

**Studio Paris : 0 carte attendue** (aucun client ≥ 4 commandes/≥ 90 j — clients
projet). **Sites seed/démo : 0 carte** (pas de party_code → absents du mart).
CHAHAN existe sur les DEUX sites (19 cmd au principal, 1 à Paris) — le grain
(site × client) les sépare correctement.

Silence ancré sur `data_end` = max(date de facture) DU SITE, jamais
current_date — données figées au 27/07 : les silences ne gonflent pas
artificiellement avec les jours sans import (la carte fraîcheur P1 couvre ça).

## 1. dbt — NOUVEAU modèle `mart/fct_location_client_patterns.sql` (fichier complet)

```sql
/*
  MODEL
    fct_location_client_patterns

  GOAL
    Grain CLIENT des ventes facturees sur compte (canal != comptoir) : cadence de
    commande propre a chaque client, silence courant, etat. Premier etage du
    chantier C (docs app client-patterns-spec.md) — la ou fct_location_sales_regime
    dit QUEL grain est juste par site, ce mart SERT le grain client : un commerce
    B2B / a facturation episodique se pilote par ses clients, pas par ses jours.

    Etats (seuils cales sur les donnees reelles Olivades du 06/08, § 0 de la spec) :
      new        : premiere commande dans les 30 derniers jours de donnees du site.
      dormant    : cadence etablie (>= 4 commandes ET relation >= 90 j) ET
                   silence >= max(2 x intervalle median, 30 j). Le plancher 30 j
                   empeche un client a cadence courte (7 j) de tirer au bout de 15 j ;
                   le critere >= 4 commandes / >= 90 j elimine les projets ponctuels
                   (3 factures en 15 jours -> ratios absurdes mesures).
      active     : cadence etablie, pas dormant.
      occasional : le reste (1-3 commandes ou relation < 90 j).

    Fenetre : TOUT l'historique du site ; silence ancre sur data_end =
    max(order_date) du site (jamais current_date — un compte fige ne voit pas ses
    silences gonfler avec les jours sans import).

    Consommateur : fct_location_daily_action_candidates (carte client_dormant).
    A venir : verdicts hebdo comptoir (C2), typage vagues W (party_directory).

  SOURCES
    stg_client_transactions   -- lignes facturees, party_code (facette canal etape B)
    analytics.party_directory -- nom lisible du compte (party_label)

  GRAIN
    location_id x party_code (site ROUTE ; un meme client peut exister sur 2 sites)
*/

{{ config(
    materialized = 'table',
    schema       = 'mart'
) }}

with invoices as (
    select
        location_id,
        any_value(source_location_id) as source_location_id,
        party_code,
        invoice_number,
        min(transaction_date)         as order_date,
        sum(revenue)                  as invoice_revenue
    from {{ ref('stg_client_transactions') }}
    where is_invoiced
      and party_code is not null
      and coalesce(channel, '') != 'comptoir'
    group by location_id, party_code, invoice_number
),

anchored as (
    select
        *,
        max(order_date) over (partition by location_id) as data_end
    from invoices
),

gaps as (
    select
        *,
        date_diff(
            order_date,
            lag(order_date) over (partition by location_id, party_code order by order_date),
            day
        ) as gap_days
    from anchored
),

per_client as (
    select
        location_id,
        any_value(source_location_id)           as source_location_id,
        party_code,
        any_value(data_end)                     as data_end,
        count(*)                                as orders_count,
        min(order_date)                         as first_order,
        max(order_date)                         as last_order,
        date_diff(max(order_date), min(order_date), day) as span_days,
        approx_quantiles(gap_days, 2)[offset(1)]         as median_interval_days,
        round(sum(invoice_revenue), 2)                   as total_revenue
    from gaps
    group by location_id, party_code
),

labeled as (
    select
        p.*,
        coalesce(pd.party_name, p.party_code)   as party_label,
        date_diff(p.data_end, p.last_order, day) as silence_days,
        round(safe_divide(
            date_diff(p.data_end, p.last_order, day),
            nullif(p.median_interval_days, 0)
        ), 1)                                    as lateness_ratio,
        (p.orders_count >= 4 and p.span_days >= 90) as is_cadence_established
    from per_client p
    left join {{ source('analytics', 'party_directory') }} pd
      on  pd.source_location_id = p.source_location_id
      and pd.party_code         = p.party_code
)

select
    location_id,
    party_code,
    party_label,
    source_location_id,
    data_end,
    orders_count,
    first_order,
    last_order,
    span_days,
    median_interval_days,
    silence_days,
    lateness_ratio,
    total_revenue,
    is_cadence_established,
    case
        when first_order > date_sub(data_end, interval 30 day)
            then 'new'
        when is_cadence_established
         and silence_days >= greatest(2 * median_interval_days, 30)
            then 'dormant'
        when is_cadence_established
            then 'active'
        else 'occasional'
    end as client_state
from labeled
```

## 2. dbt — `mart/fct_location_daily_action_candidates.sql` : la carte (2 edits)

**Edit 1** — juste apres le CTE `sales_regime` ajoute a l'etape B (qui suit
`client_perf`), c'est-a-dire remplacer :

```sql
sales_regime as (
    select location_id, sales_grain
    from {{ ref('fct_location_sales_regime') }}
),
```

par :

```sql
sales_regime as (
    select location_id, sales_grain
    from {{ ref('fct_location_sales_regime') }}
),

-- Grain client (chantier C1, docs app client-patterns-spec.md) : clients a
-- cadence etablie qui ont cesse de commander. Carte NON quotidienne — prefixe
-- client_, volontairement hors du perimetre sales_ de la porte de regime.
client_dormant as (
    select
        current_date()                          as date,
        cp.location_id,
        'client_dormant'                        as action_type,
        case when cp.total_revenue >= 10000 then 4 else 3 end as action_priority,
        'performance'                           as action_category,
        'note_interne'                          as channel_hint,
        concat(
            cp.party_label, ' - sans commande depuis ',
            cast(cp.silence_days as string), ' jours'
        ) as headline_fr,
        concat(
            'Client regulier : ', cast(cp.orders_count as string),
            ' commandes, une tous les ~', cast(cp.median_interval_days as string),
            ' jours, ', cast(round(cp.total_revenue, 0) as string),
            ' EUR sur la periode. Derniere commande le ',
            format_date('%d/%m', cp.last_order),
            '. Silence actuel = ', cast(cp.lateness_ratio as string),
            'x son rythme habituel (donnees jusqu au ',
            format_date('%d/%m', cp.data_end), ').'
        ) as detail_fr,
        to_json_string(struct(
            cp.party_code,
            cp.party_label,
            cp.orders_count,
            cp.median_interval_days,
            cp.silence_days,
            cp.lateness_ratio,
            cp.total_revenue,
            cast(cp.first_order as string) as first_order,
            cast(cp.last_order as string)  as last_order,
            cast(cp.data_end as string)    as data_end
        )) as data_payload,
        concat('client_dormant:', cp.location_id, ':', cp.party_code) as suppression_key,
        date_add(current_date(), interval 7 day) as expires_at
    from {{ ref('fct_location_client_patterns') }} cp
    where cp.client_state = 'dormant'
),
```

**Edit 2** — dans l'union finale (`all_candidates`), remplacer :

```sql
    select * from sales_discount_no_lift
    union all
    select * from sales_revenue_down_wow
```

par :

```sql
    select * from sales_discount_no_lift
    union all
    select * from sales_revenue_down_wow
    union all
    select * from client_dormant
```

(La suppression_key est SANS date : une seule carte par client, rejouee chaque
run tant que l'etat dure ; si l'owner s'engage dessus, la suppression par
origin_suppression_key du monitor la retire — meme mecanique que les autres.)

## 3. dbt — tests (mart schema.yml, a la suite de l'entree fct_location_sales_regime)

```yaml
  - name: fct_location_client_patterns
    description: >
      Grain client des ventes sur compte (canal != comptoir) : cadence propre,
      silence courant ancre sur data_end du site, etat new/dormant/active/occasional.
      Seuils documentes dans le header du modele, cales le 06/08 sur Olivades
      (22 clients a cadence etablie, 4 dormants attendus). Sert la carte
      client_dormant des candidates.
    tests:
      - dbt_utils.unique_combination_of_columns:
          arguments:
            combination_of_columns: [location_id, party_code]
    columns:
      - name: location_id
        tests: [not_null]
      - name: party_code
        tests: [not_null]
      - name: total_revenue
        tests: [not_null]
      - name: client_state
        tests:
          - not_null
          - accepted_values:
              arguments:
                values: ['new', 'dormant', 'active', 'occasional']
```

## 4. App (Claude, apres le run dbt) — rendu de la carte

`public/action-cards.js` : entree SPECS `client_dormant` (libelle « Client en
retrait », categorie PERFORMANCE, sowhat construit depuis data_payload :
party_label, rythme, silence, CA, date des donnees — copie accentuee cote app,
voix operateur) + ajout de `client_dormant` au theme `ventes` de la taxonomie
(gate `pos`) + bump des cache-busters (pulse ~326, monitor ~285, insight ~137).
Verification : payload REEL du mart rejoue dans `public/card-harness.html`
(le harnais EST la page), puis compteur BQ. Pas de page profonde dediee en v1
(Consulter generique) — la famille « clients » complete viendra avec C2/C3.

## 5. Run + VALIDATION (contrat chiffre)

1. Studio : `dbt build --select fct_location_client_patterns fct_location_daily_action_candidates`
   (pas de --full-refresh necessaire — nouveaux modeles/table pleine).
2. Mart clients — attendu : site principal Olivades 22 clients cadence etablie
   dont 4 dormants (§ 0, noms et ratios exacts) ; Paris 0 dormant ; aucun site
   seed present :

```sql
select location_id, client_state, count(*) n, round(sum(total_revenue)) ca
from `muse-square-open-data.mart.fct_location_client_patterns`
group by 1, 2 order by 1, 2;
```

3. Cartes — attendu : 4 cartes `client_dormant` sur le site principal Olivades
   (CHAHAN priorite 4 ; les 3 autres priorite 3), 0 partout ailleurs ; les
   compteurs des autres familles INCHANGES :

```sql
select location_id, action_priority, count(*) n
from `muse-square-open-data.mart.fct_location_daily_action_candidates`
where action_type = 'client_dormant'
group by 1, 2;
```

4. Claude fait ensuite l'increment app (§ 4) et verifie au harnais + screenshot.

## R. Incrément RÔLE DES COMPTES (GO owner 07/08 — vocabulaire verrouillé)

Contexte (owner, 07/08) : CHAHAN est un ARCHITECTE — apporteur de chantiers
(1 à 3/an). Ses « 19 commandes à cadence 7 j » sont des rafales de facturation
intra-chantier, pas un rythme de commande : la carte P4 reposait sur une
prémisse fausse. Généralisation : le RÔLE du compte change le détecteur.

**Vocabulaire (fermé, une valeur = un couple détecteur × famille d'actions)** :
`pro_recurring` (organisation qui réapprovisionne — cadence par commande) ·
`pro_project` (organisation par épisodes : architecte, chantier, scénographie —
détecteur épisodes/an À CONSTRUIRE, épargné d'ici là) · `consumer_recurring`
(particulier à achat répété — même cadence, actions B2C et cadre légal
prospection) · `consumer` (particulier ponctuel — jamais de carte cadence) ·
`channel` (vend POUR le compte : corner, commissionnaire — analyse canal, sort
du grain client) · `unknown` (défaut absolu — TIRER + QUALIFIER, décision owner
07/08). Les institutions (mairie, école, musée, association) sont des
ORGANISATIONS : `pro_recurring` ou `pro_project` selon leur comportement —
pas de valeur dédiée tant qu'aucun détecteur propre n'existe.

**R.0 — chiffres de référence (mesurés 07/08)** : les 4 dormants n'ont AUCUNE
fiche rapprochée (insertion, pas update) ; zéro W0 parmi les 22 clients à
cadence → la moisson W0→consumer n'éteint aucune carte actuelle. Attendu après
filtre : **4 cartes → 3** (CHAHAN sort par `pro_project` ; PARISIENNESOILAIN,
HILLARYWTAYLOR, DELAURIERE restent — `unknown` tire).

**R.1 — FAIT par Claude (07/08)** : `analytics.party_directory` reconstruite
(load job --replace) avec colonne `party_role` — 485 lignes : 345 `consumer`
(moisson W0 = particuliers tarif public, confirmé JF), 137 `unknown` (W3/W4 :
signification NON confirmée — jamais devinée), 2 `channel` (caisses COMPTOIR*),
1 `pro_project` (CHAHAN, provenance « owner chat 07/08 » dans source_file).
W5 Corner → `channel` s'appliquera à l'arrivée des fichiers de vagues manquants.

**R.2 — dbt (owner, Studio) — 2 edits** :

Dans `mart/fct_location_client_patterns.sql`, CTE `labeled`, remplacer :

```sql
        coalesce(pd.party_name, p.party_code)   as party_label,
```

par :

```sql
        coalesce(pd.party_name, p.party_code)   as party_label,
        coalesce(pd.party_role, 'unknown')      as party_role,
```

et dans le select final du même fichier, remplacer :

```sql
    party_label,
    source_location_id,
```

par :

```sql
    party_label,
    party_role,
    source_location_id,
```

Dans `mart/fct_location_daily_action_candidates.sql`, CTE `client_dormant`,
remplacer :

```sql
    from {{ ref('fct_location_client_patterns') }} cp
    where cp.client_state = 'dormant'
```

par :

```sql
    from {{ ref('fct_location_client_patterns') }} cp
    where cp.client_state = 'dormant'
      -- Rôle du compte (owner 07/08) : la cadence par commande n'a de sens que
      -- pour un compte qui REcommande. pro_project (rafales intra-chantier),
      -- channel (canal de vente) et consumer (achat ponctuel) sont épargnés ;
      -- unknown TIRE — le geste « Préciser ce client » qualifie (R.3).
      and cp.party_role in ('pro_recurring', 'consumer_recurring', 'unknown')
```

Tests (mart schema.yml, entrée `fct_location_client_patterns`, sous `columns:`) :

```yaml
      - name: party_role
        tests:
          - not_null
          - accepted_values:
              arguments:
                values: ['pro_recurring', 'pro_project', 'consumer_recurring', 'consumer', 'channel', 'unknown']
```

Run : `dbt build --select fct_location_client_patterns fct_location_daily_action_candidates`.
Validation : la requête § 5.3 rend **3 cartes** (toutes priorité 3 — CHAHAN
absent), et le mart porte CHAHAN `party_role='pro_project'`.

**R.3 — app (Claude, après R.2)** : geste « Préciser ce client » sur la carte
`client_dormant` — 4 choix (commandes régulières / fonctionne par projets /
canal de vente / client particulier) → POST nouveau handler
`api/analytics/party-role.ts` (même rail que `analytics/confirm.ts` : auth
locals, vocabulaire validé, UPDATE `analytics.party_directory` (table load job,
DML ok) + ligne `action_log` pour l'audit). Effet à la passe candidates
suivante (2×/j). Module-index mis à jour dans le même commit.

## 6. Hors perimetre (queue)

- Carte « nouveau client » (agregat) — ecartee v1, cf. preambule ; a reevaluer
  quand le typage vagues W arrivera (un nouveau client PRO type vaut plus).
- C2 verdicts hebdo comptoir ; C3 mensuel studio.
- Typage des 201 tiers restants (vagues W1/W2/W5-W8, JF) — enrichit party_label
  et permettra « client pro vs particulier » dans la copie.
- Relance JF : re-export avec compte tiers ligne a ligne (flux futur).
