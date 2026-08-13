# Chantier C2 — verdicts HEBDO par canal (« semaine remarquable ») — spec, 07/08/2026

GO owner 07/08 (« go c2 »). Deuxième étage du chantier C : la porte de régime a
supprimé les faux verdicts quotidiens d'Olivades ; C2 sert le grain SEMAINE au
canal qui le porte (le comptoir), avec un détecteur calibré sur la série réelle.

## 0. Ce que la série réelle a imposé (mesuré 07/08 — le chemin des rejets compte)

Série hebdo comptoir Olivades : 49 semaines (2 entamées exclues), médiane
3 492 €/sem, p25 1 882 / p75 4 554 (dispersion 2,42). Canal direct : dispersion
**4,98** — les 60 factures ≥ 2 k€ rendent la semaine injugeable, son grain est
le CLIENT (C1). Voilà le critère d'éligibilité, mesuré, pas décrété.

Trois détecteurs REJETÉS sur simulation complète (44 semaines jugées) :
1. Médiane glissante 12 sem, bande ±25-30 % → **25-38 % de semaines « anormales »**
   — la baseline est en retard sur la SAISON (oct→déc : 6 « baisses » consécutives
   = l'hiver d'une boutique de tissus, pas des anomalies).
2. Médiane 4 sem, bande 0,7/1,3, tir en début de série → **18 tirs/an** — la
   distribution hebdo hérite de la queue épaisse quotidienne (une vente à 12 k€
   fait un « pic », puis gonfle la baseline et fabrique un faux « trou »).
3. Bandes intermédiaires (0,65/1,35 ; 0,6/1,4) → 12-13 tirs/an, toujours dense.

**RETENU — la bande EXTRÊME, seule honnête sur 11 mois de données** (pas
d'année pleine → pas de baseline saisonnière possible avant ~09/2026) :
- baseline = **médiane des 6 semaines complètes précédentes** (min 4 — robuste
  à un pic isolé) ;
- **trou** : semaine < 0,5 × baseline · **pic** : semaine > 2 × baseline ;
- tir uniquement en **début de série** (état ≠ semaine précédente) ;
- **8 tirs sur 11 mois** (5 trous, 3 pics), chacun réellement remarquable :

| semaine | état | CA | baseline |
|---|---|---|---|
| 03/11/2025 | trou | 1 200 € | 3 116 € |
| 17/11/2025 | trou | 874 € | 2 526 € |
| 15/12/2025 | pic | 3 631 € | 1 318 € |
| 12/01/2026 | trou | 902 € | 3 138 € |
| 02/02/2026 | trou | 710 € | 2 400 € |
| 16/03/2026 | pic | 4 621 € | 1 964 € |
| 30/03/2026 | pic | 13 705 € | 1 964 € |
| 27/04/2026 | trou | 1 915 € | 5 216 € |

Dernière semaine complète (20-26/07) : 4 292 € vs 4 772 — NORMALE →
**zéro carte au premier run**. C'est le contrat : cette carte ne parle que
quand il y a quelque chose à dire.

Éligibilité hebdo (générique, par canal — même doctrine que la porte de
régime, un niveau plus bas) : ≥ 8 semaines complètes ET ≥ 3 jours actifs/sem
(médiane) ET dispersion hebdo p75/p25 ≤ 3 ET site en régime `weekly`.
Olivades comptoir ✓ · Olivades direct ✗ (4,98) · sites daily ✗ (ils ont leurs
cartes quotidiennes) · Paris ✗ (episodic → C3).

## 1. dbt — NOUVEAU modèle `mart/fct_location_channel_weekly.sql` (fichier complet)

```sql
/*
  MODEL
    fct_location_channel_weekly

  GOAL
    Serie hebdomadaire des ventes facturees PAR CANAL, avec verdict de semaine
    remarquable — l'etage C2 du chantier grain (docs app weekly-sales-spec.md).
    La ou la porte de regime a supprime les faux verdicts QUOTIDIENS des sites
    a faible frequence (Olivades : 3 factures/j), ce mart juge la SEMAINE du
    canal qui le porte (comptoir = caisse retail).

    DETECTEUR (calibre 07/08 sur les 49 semaines reelles du comptoir Olivades —
    le § 0 de la spec documente les 3 detecteurs REJETES et pourquoi) :
      baseline    = mediane des 6 semaines completes precedentes (min 4).
      week_state  = 'hole'  si ca < 0.5 x baseline   (5 fois en 11 mois)
                    'spike' si ca > 2.0 x baseline   (3 fois en 11 mois)
                    'low' / 'high' a ±30 % (INFORMATIF — jamais une carte :
                    mesure, 18 tirs/an = bruit saisonnier + queue epaisse)
                    'normal' sinon ; 'insufficient_baseline' sous 4 semaines.
      is_run_start = l'etat differe de la semaine precedente — la carte ne tire
                    qu'en DEBUT de serie (6 semaines d'hiver = 1 tir, pas 6).

    ELIGIBILITE (is_weekly_judgeable, par location x canal — mesuree, jamais
    decretee) : >= 8 semaines completes ET mediane des jours actifs/sem >= 3
    ET dispersion hebdo p75/p25 <= 3 ET site en regime 'weekly'
    (fct_location_sales_regime). Le canal direct d'Olivades (dispersion 4.98,
    60 factures >= 2 kEUR) est NON jugeable a la semaine — son grain est le
    client (C1). Les sites 'daily' ont leurs cartes quotidiennes.

    Semaines COMPLETES seulement (lundi-dimanche entierement couverts par les
    donnees du site) ; ancrage sur data_end = max(transaction_date) du site,
    jamais current_date (compte fige = serie stable, pas de fausse semaine vide).

  SOURCES
    stg_client_transactions      -- lignes facturees + canal (etape B)
    fct_location_sales_regime    -- grain de verite du site

  GRAIN
    location_id x channel_key x week_start
    (channel_key = canal, ou '__site__' pour un tenant sans rattachement canal)
*/

{{ config(
    materialized = 'table',
    schema       = 'mart'
) }}

with lignes as (
    select
        location_id,
        coalesce(channel, '__site__') as channel_key,
        transaction_date,
        revenue
    from {{ ref('stg_client_transactions') }}
    where is_invoiced
),

anchored as (
    select
        *,
        max(transaction_date) over (partition by location_id) as data_end
    from lignes
),

hebdo as (
    select
        location_id,
        channel_key,
        date_trunc(transaction_date, week(monday))            as week_start,
        any_value(data_end)                                   as data_end,
        round(sum(revenue), 2)                                as ca,
        count(distinct transaction_date)                      as active_days
    from anchored
    group by location_id, channel_key, week_start
),

-- Semaines COMPLETES : le dimanche de la semaine est couvert par les donnees.
completes as (
    select
        *,
        date_add(week_start, interval 6 day) as week_end
    from hebdo
    where date_add(week_start, interval 6 day) <= data_end
),

stats as (
    select
        location_id,
        channel_key,
        count(*)                                        as weeks_observed,
        approx_quantiles(active_days, 2)[offset(1)]     as med_active_days,
        round(safe_divide(
            approx_quantiles(ca, 4)[offset(3)],
            nullif(approx_quantiles(ca, 4)[offset(1)], 0)
        ), 2)                                           as iqr_ratio
    from completes
    group by location_id, channel_key
),

baselined as (
    select
        c.*,
        array_agg(c.ca) over (
            partition by c.location_id, c.channel_key
            order by unix_date(c.week_start)
            range between 42 preceding and 1 preceding
        ) as prev_cas
    from completes c
),

judged as (
    select
        b.* except (prev_cas),
        array_length(b.prev_cas) as baseline_weeks,
        (select round(approx_quantiles(v, 2)[offset(1)], 2) from unnest(b.prev_cas) v) as baseline_median
    from baselined b
),

stated as (
    select
        j.*,
        round(safe_divide(j.ca, nullif(j.baseline_median, 0)), 2) as week_ratio,
        case
            when j.baseline_weeks < 4 or j.baseline_median is null or j.baseline_median = 0
                then 'insufficient_baseline'
            when j.ca < 0.5 * j.baseline_median then 'hole'
            when j.ca > 2.0 * j.baseline_median then 'spike'
            when j.ca < 0.7 * j.baseline_median then 'low'
            when j.ca > 1.3 * j.baseline_median then 'high'
            else 'normal'
        end as week_state
    from judged j
)

select
    s.location_id,
    s.channel_key,
    s.week_start,
    s.week_end,
    s.ca,
    s.active_days,
    s.data_end,
    st.weeks_observed,
    st.med_active_days,
    st.iqr_ratio,
    r.sales_grain,
    (
        st.weeks_observed >= 8
        and st.med_active_days >= 3
        and coalesce(st.iqr_ratio, 99) <= 3
        and r.sales_grain = 'weekly'
    ) as is_weekly_judgeable,
    s.baseline_median,
    s.baseline_weeks,
    s.week_ratio,
    s.week_state,
    coalesce(
        s.week_state != lag(s.week_state) over (
            partition by s.location_id, s.channel_key order by s.week_start
        ),
        true
    ) as is_run_start
from stated s
join stats st using (location_id, channel_key)
left join {{ ref('fct_location_sales_regime') }} r using (location_id)
```

## 2. dbt — `mart/fct_location_daily_action_candidates.sql` : les 2 cartes (2 edits)

**Edit 1** — juste après le CTE `client_dormant` (chantier C1), c'est-à-dire
remplacer :

```sql
    from {{ ref('fct_location_client_patterns') }} cp
    where cp.client_state = 'dormant'
      -- Rôle du compte (owner 07/08) : la cadence par commande n'a de sens que
      -- pour un compte qui REcommande. pro_project (rafales intra-chantier),
      -- channel (canal de vente) et consumer (achat ponctuel) sont épargnés ;
      -- unknown TIRE — le geste « Préciser ce client » qualifie (R.3).
      and cp.party_role in ('pro_recurring', 'consumer_recurring', 'unknown')
),
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
),

-- Grain SEMAINE par canal (chantier C2, docs app weekly-sales-spec.md) : la
-- DERNIERE semaine complete d'un canal jugeable, si et seulement si elle est
-- extreme (hole/spike) et debut de serie. Detecteur calibre § 0 : 8 tirs en
-- 11 mois sur le comptoir Olivades, zero au premier run (semaine normale).
weekly_channel_latest as (
    select *
    from {{ ref('fct_location_channel_weekly') }}
    where is_weekly_judgeable
    qualify week_start = max(week_start) over (partition by location_id, channel_key)
),

weekly_sales_hole as (
    select
        current_date()                          as date,
        w.location_id,
        'weekly_sales_hole'                     as action_type,
        4                                       as action_priority,
        'performance'                           as action_category,
        'note_interne'                          as channel_hint,
        concat(
            'Semaine ', if(w.channel_key = 'comptoir', 'comptoir', w.channel_key),
            ' tres en retrait : ', cast(round(w.ca, 0) as string), ' EUR'
        ) as headline_fr,
        concat(
            'Semaine du ', format_date('%d/%m', w.week_start), ' au ',
            format_date('%d/%m', w.week_end), ' : ',
            cast(round(w.ca, 0) as string), ' EUR sur ',
            cast(w.active_days as string), ' jours actifs — moins de la moitie de vos ',
            cast(w.baseline_weeks as string), ' dernieres semaines (mediane ',
            cast(round(w.baseline_median, 0) as string), ' EUR).'
        ) as detail_fr,
        to_json_string(struct(
            w.channel_key,
            cast(w.week_start as string) as week_start,
            cast(w.week_end as string)   as week_end,
            w.ca,
            w.active_days,
            w.baseline_median,
            w.baseline_weeks,
            w.week_ratio,
            cast(w.data_end as string)   as data_end
        )) as data_payload,
        concat('weekly_sales_hole:', w.location_id, ':', w.channel_key, ':', cast(w.week_start as string)) as suppression_key,
        date_add(w.week_start, interval 13 day) as expires_at
    from weekly_channel_latest w
    where w.week_state = 'hole' and w.is_run_start
),

weekly_sales_spike as (
    select
        current_date()                          as date,
        w.location_id,
        'weekly_sales_spike'                    as action_type,
        3                                       as action_priority,
        'performance'                           as action_category,
        'note_interne'                          as channel_hint,
        concat(
            'Semaine ', if(w.channel_key = 'comptoir', 'comptoir', w.channel_key),
            ' exceptionnelle : ', cast(round(w.ca, 0) as string), ' EUR'
        ) as headline_fr,
        concat(
            'Semaine du ', format_date('%d/%m', w.week_start), ' au ',
            format_date('%d/%m', w.week_end), ' : ',
            cast(round(w.ca, 0) as string), ' EUR sur ',
            cast(w.active_days as string), ' jours actifs — plus du double de vos ',
            cast(w.baseline_weeks as string), ' dernieres semaines (mediane ',
            cast(round(w.baseline_median, 0) as string), ' EUR).'
        ) as detail_fr,
        to_json_string(struct(
            w.channel_key,
            cast(w.week_start as string) as week_start,
            cast(w.week_end as string)   as week_end,
            w.ca,
            w.active_days,
            w.baseline_median,
            w.baseline_weeks,
            w.week_ratio,
            cast(w.data_end as string)   as data_end
        )) as data_payload,
        concat('weekly_sales_spike:', w.location_id, ':', w.channel_key, ':', cast(w.week_start as string)) as suppression_key,
        date_add(w.week_start, interval 13 day) as expires_at
    from weekly_channel_latest w
    where w.week_state = 'spike' and w.is_run_start
),
```

**Edit 2** — dans l'union finale, remplacer :

```sql
    select * from sales_revenue_down_wow
    union all
    select * from client_dormant
```

par :

```sql
    select * from sales_revenue_down_wow
    union all
    select * from client_dormant
    union all
    select * from weekly_sales_hole
    union all
    select * from weekly_sales_spike
```

(Préfixe `weekly_` : hors du périmètre `sales_` de la porte de régime —
volontaire, ces cartes SONT le grain juste des sites weekly. L'expiry à
J+13 de la semaine borne leur pertinence ; la clé de suppression par
semaine évite tout doublon inter-runs.)

## 3. dbt — tests (mart schema.yml, à la suite de l'entrée fct_location_client_patterns)

```yaml
  - name: fct_location_channel_weekly
    description: >
      Serie hebdo des ventes facturees par canal + verdict de semaine remarquable
      (hole < 0,5x / spike > 2x la mediane des 6 semaines precedentes, min 4).
      Semaines completes seulement, ancrees sur data_end du site. Detecteur et
      eligibilite calibres le 07/08 sur les 49 semaines reelles du comptoir
      Olivades (docs app weekly-sales-spec.md § 0 — 3 detecteurs rejetes).
      Sert les cartes weekly_sales_hole / weekly_sales_spike.
    tests:
      - dbt_utils.unique_combination_of_columns:
          arguments:
            combination_of_columns: [location_id, channel_key, week_start]
    columns:
      - name: location_id
        tests: [not_null]
      - name: channel_key
        tests: [not_null]
      - name: week_start
        tests: [not_null]
      - name: ca
        tests: [not_null]
      - name: week_state
        tests:
          - not_null
          - accepted_values:
              arguments:
                values: ['hole', 'spike', 'low', 'high', 'normal', 'insufficient_baseline']
```

## 4. App (Claude, après le run dbt)

SPECS `weekly_sales_hole` (« Semaine très en retrait », priorité Aujourd'hui,
action : comprendre la semaine — contexte, achats, animation) et
`weekly_sales_spike` (« Semaine exceptionnelle », action : identifier ce qui a
porté la semaine et le capturer — même voix que sales_surge) ; thème « ventes »
(taxonomy client + recoThemeMap, parité) ; allowlist engagement AVEC leurs plans
reco-library (cliquet recoCoverage) ; cache-busters. Vérification : vm sur les
payloads du mart (les 8 semaines historiques § 0 comme jeux d'essai), node
--check + eslint + tsc + tests.

## 5. Run + VALIDATION (contrat chiffré)

1. Studio : `dbt build --select fct_location_channel_weekly fct_location_daily_action_candidates`.
2. Mart — attendu : comptoir Olivades ~47 semaines complètes, `is_weekly_judgeable`
   TRUE ; direct FALSE (dispersion ~4,98) ; sites daily FALSE (régime) ;
   les 8 semaines § 0 en `hole`/`spike` avec `is_run_start` TRUE :

```sql
select channel_key, countif(is_weekly_judgeable) judgeables, count(*) semaines,
       countif(week_state = 'hole' and is_run_start) trous,
       countif(week_state = 'spike' and is_run_start) pics
from `muse-square-open-data.mart.fct_location_channel_weekly`
where location_id = '14379e18-2060-4b50-871d-edf0818eab8c'
group by channel_key;
```

   (attendu comptoir : trous 5, pics 3 — dont un `low`→`hole` novembre compté
   deux fois si l'état intermédiaire coupe la série : la simulation § 0 fait foi.)

3. Cartes — attendu : **ZÉRO** `weekly_sales_*` aujourd'hui (dernière semaine
   complète du 20/07 : 4 292 € vs 4 772, normale). La carte existera quand une
   semaine le méritera — pas avant.
4. E2E synthétique : inchangé (site daily → non jugeable à la semaine).

## 6. Hors périmètre (queue)

- Baseline SAISONNIÈRE (même semaine année précédente) — possible à partir de
  ~09/2026 (1 an de données) : elle requalifiera `low`/`high` en verdicts.
- Bilan hebdo par canal dans le RAPPORT et le weekly_briefing (récap factuel,
  pas des alertes) — consommateur naturel du mart, à brancher au chantier rapport.
- C3 mensuel studio (grain mois, même méthode : mesurer d'abord).
- Contexte de semaine (météo/vacances/travaux agrégés hebdo) dans detail_fr —
  après le premier tir réel, sur cas concret.
