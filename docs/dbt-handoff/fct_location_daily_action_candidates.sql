/*
  PATH
    models/ms_open_data/mart/fct_location_daily_action_candidates.sql

  MODEL
    fct_location_daily_action_candidates

  PURPOSE
    Scan quotidien de situation qui évalue l'état courant de toutes les surfaces
    pour produire des lignes action-ready par location.

    Contrairement à fct_location_change_feed qui détecte des TRANSITIONS
    jour-sur-jour, ce modèle se déclenche sur des CONDITIONS : densité de
    compétition élevée, fenêtres météo, meilleurs jours approchants, etc.

    Inclut également un passthrough des signaux change_feed pertinents
    (via vw_insight_event_change_feed) pour unifier toutes les action cards
    dans un seul output.

    Blocs d'action évalués indépendamment puis unifiés via UNION ALL
    (score_driver_shift a été SUPPRIMÉ — démué au fil, cf. commentaire dans le corps) :
      high_competition_density          — pression concurrentielle > baseline
      weather_window                    — amélioration météo vs J-1
      top_day_approaching               — top 3 jours de la semaine dans les 3 prochains jours
      audience_shift_opportunity        — férié / vacances / commercial dans les 3 prochains jours
      competitor_threat_direct          — concurrent avec conflict_score >= 3
      regime_c_warning                  — régime C forcé ou risque majeur dans les 3 prochains jours
      change_feed_actions               — signaux change_feed avec alert_level >= 2
      competition_proximity             — saturation hyperlocale 500m / 1km
      low_competition_window            — pression < baseline dans les 3 prochains jours
      extended_bad_weather              — 2+ jours consécutifs avec alerte météo
      score_driver_shift                — changement de driver dominant aujourd'hui → demain
      weekend_opportunity               — week-end favorable dans les 5 prochains jours
      sales_competition_cannibalization — baisse CA + pression concurrentielle élevée
      sales_missed_opportunity          — score élevé + CA sous la moyenne 30j
      sales_surge                       — CA > 130% de la moyenne 30j, contexte attribué
      competitor_positioning_gap        — écart offre détecté vs concurrents enrichis (hebdo)
      client_dormant                    — client à cadence établie sans commande (grain CLIENT, C1 + rôle § R)
      weekly_sales_hole / _spike        — semaine extrême d'un canal jugeable (grain SEMAINE, C2)
      monthly_sales_hole / _spike       — mois extrême d'un canal jugeable au mois (grain MOIS, C3)

    Déduplication finale par suppression_key (highest action_priority wins).
    Filtre : action_priority >= 2 uniquement.

  AUTHORITATIVE SOURCES (truth)
    - {{ ref('fct_location_context_features_daily') }}   -- date × location_id
                                                             (score, régime, compétition,
                                                              baseline, driver)
    - {{ ref('fct_location_events_radius_daily') }}      -- date × location_id
                                                             (comptages par rayon)
    - {{ ref('fct_location_opportunity_score_daily') }}  -- date × location_id
                                                             (regime_c, realization_risk)
    - {{ ref('fct_location_weather_alerts_daily') }}     -- date × location_id
                                                             (alert_level, lvl_*)
                                                             jointé deux fois :
                                                             fenêtre 7j + J-1
    - {{ ref('fct_region_day_annotations_daily') }}      -- date × region_id
                                                             (férié, vacances, commercial)
    - {{ ref('dim_client_location') }}                   -- location_id
                                                             (filtre active_flag = TRUE)
    - {{ ref('fct_competitor_events_conflicts') }}       -- event_date × location_id
                                                             (conflict_score, threat_level)
    - {{ ref('vw_insight_event_change_feed') }}          -- feed_date × location_id
                                                             (passthrough change_feed —
                                                              seule source sémantique
                                                              consommée dans ce mart)
    - {{ ref('fct_client_daily_performance') }}          -- transaction_date × location_id
                                                             (CA, transactions, panier, lags,
                                                              moyennes 30j)
    - {{ ref('fct_competitor_threat_profile') }}          -- location_id × competitor_id
                                                             (top concurrent par threat_score)
    - {{ ref('fct_client_offering_profile') }}           -- location_id × item_category
                                                             (profil offre client)
    - {{ ref('fct_competitor_directory') }}               -- competitor_id
                                                             (auto_enriched_description)
    - {{ ref('fct_location_impact_daily_calendar') }}    -- date × location_id (delta calendrier)
    - {{ ref('fct_foreign_tourism_context_daily') }}     -- date (vacances/fériés étrangers)
    - {{ ref('int_client_weather_alerts_daily') }}       -- date × location_id (spine jours consécutifs)
    - {{ ref('fct_client_sales_signals_daily') }}        -- transaction_date × location_id (bandes robustes)
    - {{ ref('fct_client_day_residual') }}               -- date × location_id (résiduel + z)
    - {{ ref('int_competitor_offering_changes') }}       -- competitor_id × item (mouvements d'offre)
    - {{ ref('fct_location_action_learning') }}          -- location_id × action_type (apprentissage)
    - {{ ref('fct_location_sales_regime') }}             -- location_id (porte de régime —
                                                             grain de vérité des ventes)
    - {{ ref('fct_location_client_patterns') }}          -- location_id × party_code
                                                             (grain client, C1 — rôle § R)
    - {{ ref('fct_location_channel_weekly') }}           -- location_id × channel_key × week_start
                                                             (grain semaine, C2)
    - {{ ref('fct_location_channel_monthly') }}          -- location_id × channel_key × month_start
                                                             (grain mois, C3)
    - {{ source('raw_crawl', 'watched_competitors') }}   -- location_id × competitor_id (suivis)

  OUTPUT GRAIN
    date × location_id × action_type
    (dédupliqué par suppression_key)

  MATERIALIZATION
    Table, schéma mart, partitionnée sur date, clusterisée sur location_id.
    Fenêtre source : current_date .. current_date + 7j pour la plupart des sources.

  NOTES
    - data_payload est un JSON sérialisé (STRING) via to_json_string().
    - suppression_key : convention '{action_type}:{location_id}:{date}' mais PLUSIEURS CTE
      s'en écartent (high_competition_density écrit 'competition_pressure_spike:…' — collision
      volontaire ou non avec la carte de transition, à arbitrer ; low_competition_window écrit
      'low_competition:', same_bucket_saturation 'same_bucket_sat:'…).
    - Ce modèle est le seul mart à consommer directement une vue sémantique
      (vw_insight_event_change_feed) pour le passthrough change_feed_actions.
    - Porte de régime au select final : les cartes sales_* (verdicts QUOTIDIENS)
      sont supprimées sur les sites weekly/episodic ; leurs grains justes sont
      servis par client_dormant (client) et weekly_sales_* (semaine).
*/

{{ config(
    materialized = 'table',
    partition_by = {'field': 'date', 'data_type': 'date'},
    cluster_by = ['location_id'],
    schema = 'mart'
) }}

with

-- ============================================================
-- SOURCES
-- ============================================================

ctx as (
    select *
    from {{ ref('fct_location_context_features_daily') }}
    where date >= date_sub(current_date(), interval 30 day)
      and date <= date_add(current_date(), interval 7 day)
),

radius as (
    select *
    from {{ ref('fct_location_events_radius_daily') }}
    where date >= date_sub(current_date(), interval 30 day)
      and date <= date_add(current_date(), interval 7 day)
),

score as (
    select *
    from {{ ref('fct_location_opportunity_score_daily') }}
    where date >= current_date()
      and date <= date_add(current_date(), interval 7 day)
),

weather as (
    select *
    from {{ ref('fct_location_weather_alerts_daily') }}
    where date >= current_date()
      and date <= date_add(current_date(), interval 7 day)
),

weather_yesterday as (
    select *
    from {{ ref('fct_location_weather_alerts_daily') }}
    where date = date_sub(current_date(), interval 1 day)
),

-- 23/08 : la perturbation NOMMÉE du jour par site (ligne, arrêt, titre, sévérité) — ce que
-- dayContext.ts lit déjà pour le chat, jamais versé aux cartes. Une par (site, date) :
-- bloquante d'abord, puis le plus grand retard. Active seulement.
mobility_named as (
    select location_id, date, disruption_title, transit_line, transit_stop, disruption_severity, delay_minutes, is_planned, duration_days, mode
    from (
        select
            location_id,
            current_disruption_date as date,
            title_merged            as disruption_title,
            short_name              as transit_line,
            stop_name               as transit_stop,
            severity                as disruption_severity,
            delay_minutes,
            is_planned_flag         as is_planned,
            mode,
            date_diff(date(disruption_end_ts), date(disruption_begin_ts), day) as duration_days,
            -- 23/08 : la COURTE d'abord (mesuré : 392 lignes-bus en travaux pluriannuels — Bus N16
            -- depuis 01/2025, Bus 85 jusqu'en 2028 — contre un Métro 8 interrompu 9 jours), puis
            -- métro/RER/tram avant bus, puis la sévérité.
            row_number() over (
                partition by location_id, current_disruption_date
                order by case when date_diff(date(disruption_end_ts), date(disruption_begin_ts), day) <= 30 then 0 else 1 end,
                         case when mode in ('metro', 'rer', 'tram', 'train') then 0 else 1 end,
                         case when severity = 'BLOQUANTE' then 0 else 1 end,
                         delay_minutes desc nulls last
            ) as rn
        from {{ ref('fct_location_mobility_disruption_changes') }}
        where is_active_flag
          and current_disruption_date >= current_date()
          and current_disruption_date <= date_add(current_date(), interval 7 day)
    )
    where rn = 1
),

annotations as (
    select *
    from {{ ref('fct_region_day_annotations_daily') }}
    where date >= current_date()
      and date <= date_add(current_date(), interval 7 day)
),

loc as (
    select
        location_id,
        location_label,
        region_id,
        client_industry_code,
        weather_sensitivity,
        site_name,
        main_event_objective,
        location_access_pattern,
        client_catchment
    from {{ ref('dim_client_location') }}
    where active_flag = true
),

competitors as (
    select
        f.location_id,
        f.event_date,
        f.competitor_id,
        f.event_name,
        f.conflict_score,
        f.audience_overlap,
        f.audience_overlap_score,
        f.distance_from_location_m,
        f.threat_level,
        f.threat_score,
        f.event_primary_audience,
        cd.competitor_name,
        cd.google_rating,
        cd.google_rating_count,
        cd.auto_enriched_description as competitor_enriched_description,
        tp.threat_level           as entity_threat_level,
        tp.audience_overlap_pct   as entity_threat_audience_pct,
        tp.industry_match_tier    as entity_threat_industry_tier,
        tp.distance_km            as entity_threat_distance_km,
        tp.threat_score           as entity_threat_score
    from {{ ref('fct_competitor_events_conflicts') }} f
    left join {{ ref('fct_competitor_directory') }} cd
        on f.competitor_id = cd.competitor_id
    left join {{ ref('fct_competitor_threat_profile') }} tp
        on f.location_id = tp.location_id
       and f.competitor_id = tp.competitor_id
    where f.event_date >= current_date()
      and f.event_date <= date_add(current_date(), interval 7 day)
),

client_perf as (
    select *
    from {{ ref('fct_client_daily_performance') }}
    where transaction_date >= date_sub(current_date(), interval 30 day)
      and transaction_date <= current_date()
),

-- Porte de régime (docs app channel-grain-spec.md) : le grain de vérité mesuré
-- de chaque site. Consommée UNE fois, au select final.
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

-- Grain MOIS par canal (chantier C3, docs app monthly-sales-spec.md) : le
-- DERNIER mois complet d'un canal jugeable au mois (escalade des grains — un
-- canal servi a la semaine n'est jamais re-servi au mois). Detecteur § 0 :
-- 2 tirs sur 11 mois (canal pro Olivades), zero au premier run (juin normal).
monthly_channel_latest as (
    select *
    from {{ ref('fct_location_channel_monthly') }}
    where is_monthly_judgeable
    qualify month_start = max(month_start) over (partition by location_id, channel_key)
),

monthly_sales_hole as (
    select
        current_date()                          as date,
        m.location_id,
        'monthly_sales_hole'                    as action_type,
        4                                       as action_priority,
        'performance'                           as action_category,
        'note_interne'                          as channel_hint,
        concat(
            'Mois ', if(m.channel_key = 'direct', 'clients en compte', m.channel_key),
            ' tres en retrait : ', cast(round(m.ca, 0) as string), ' EUR'
        ) as headline_fr,
        concat(
            format_date('%m/%Y', m.month_start), ' : ',
            cast(round(m.ca, 0) as string), ' EUR (',
            cast(m.invoices as string), ' factures) — moins de la moitie de vos ',
            cast(m.baseline_months as string), ' derniers mois (mediane ',
            cast(round(m.baseline_median, 0) as string), ' EUR).',
            if(m.top_parties is not null,
               concat(' Principaux comptes du mois : ', m.top_parties, '.'), '')
        ) as detail_fr,
        to_json_string(struct(
            m.channel_key,
            cast(m.month_start as string) as month_start,
            m.ca,
            m.invoices,
            m.active_days,
            m.baseline_median,
            m.baseline_months,
            m.month_ratio,
            m.top_parties,
            cast(m.data_end as string)    as data_end
        )) as data_payload,
        concat('monthly_sales_hole:', m.location_id, ':', m.channel_key, ':', cast(m.month_start as string)) as suppression_key,
        date_add(last_day(m.month_start, month), interval 21 day) as expires_at
    from monthly_channel_latest m
    where m.month_state = 'hole' and m.is_run_start
),

monthly_sales_spike as (
    select
        current_date()                          as date,
        m.location_id,
        'monthly_sales_spike'                   as action_type,
        3                                       as action_priority,
        'performance'                           as action_category,
        'note_interne'                          as channel_hint,
        concat(
            'Mois ', if(m.channel_key = 'direct', 'clients en compte', m.channel_key),
            ' exceptionnel : ', cast(round(m.ca, 0) as string), ' EUR'
        ) as headline_fr,
        concat(
            format_date('%m/%Y', m.month_start), ' : ',
            cast(round(m.ca, 0) as string), ' EUR (',
            cast(m.invoices as string), ' factures) — plus du double de vos ',
            cast(m.baseline_months as string), ' derniers mois (mediane ',
            cast(round(m.baseline_median, 0) as string), ' EUR).',
            if(m.top_parties is not null,
               concat(' Porte par : ', m.top_parties, '.'), '')
        ) as detail_fr,
        to_json_string(struct(
            m.channel_key,
            cast(m.month_start as string) as month_start,
            m.ca,
            m.invoices,
            m.active_days,
            m.baseline_median,
            m.baseline_months,
            m.month_ratio,
            m.top_parties,
            cast(m.data_end as string)    as data_end
        )) as data_payload,
        concat('monthly_sales_spike:', m.location_id, ':', m.channel_key, ':', cast(m.month_start as string)) as suppression_key,
        date_add(last_day(m.month_start, month), interval 21 day) as expires_at
    from monthly_channel_latest m
    where m.month_state = 'spike' and m.is_run_start
),

top_threat as (
    select
        location_id,
        competitor_name,
        distance_km,
        audience_overlap_pct,
        threat_level,
        threat_score
    from (
        select
            tp.*,
            row_number() over (partition by tp.location_id order by tp.threat_score desc) as rn
        from {{ ref('fct_competitor_threat_profile') }} tp
    )
    where rn = 1
),

impact_calendar as (
    select
        location_id,
        date,
        delta_att_calendar_pct,
        audience_availability_label
    from {{ ref('fct_location_impact_daily_calendar') }}
    where date >= date_sub(current_date(), interval 30 day)
      and date <= date_add(current_date(), interval 7 day)
),

foreign_tourism as (
    select *
    from {{ ref('fct_foreign_tourism_context_daily') }}
    where date >= current_date()
      and date <= date_add(current_date(), interval 3 day)
),

-- Un SEUL accommodation_type par region : le denominateur de
-- country_share_of_nonresident est calcule PAR accommodation_type (cf.
-- int_region_foreign_tourism_mix), donc melanger hotels et campings melangerait
-- deux denominateurs. Preference, jamais filtre fixe : l'Ile-de-France ne publie
-- que 'hotels', l'Occitanie 'campings'+'hotels' — un filtre 'hotels_campings'
-- les viderait toutes les deux.
region_acc_choice as (
    select region_code, accommodation_type
    from (
        select
            region_code,
            accommodation_type,
            row_number() over (
                partition by region_code
                order by case accommodation_type
                            when 'hotels_campings' then 1
                            when 'hotels'          then 2
                            else 3
                         end
            ) as rn
        from (
            select distinct region_code, accommodation_type
            from {{ ref('fct_region_foreign_country_profile') }}
        )
    )
    where rn = 1
),

-- Mix pays de la region, joint PAR DATE — ce mart est deja une projection
-- saisonniere sur le calendrier (grain date x region_code x country_name_fr),
-- surtout ne pas prendre "la derniere photo".
-- Couverture au 28/07/2026 : 6 regions, annees ingerees du Flash INSEE (2025).
-- Hors couverture -> aucune ligne -> la carte garde son message sans chiffre et
-- s'enrichira d'elle-meme a l'ingestion du Flash suivant.

region_foreign_mix as (
    -- 31/07/2026 — DEUX CORRECTIFS, chacun rendait la jointure aval vide à 100 %.
    --
    -- 1. LA DATE. fct_region_foreign_country_profile ne projette que les ANNÉES publiées par
    --    l'INSEE (reference_year = 2025 à ce jour, max(date) = 2025-09-30) : le filtre
    --    « p.date >= current_date() » ne ramenait AUCUNE ligne depuis le 01/01/2026. Le profil
    --    étant saisonnier par construction (en-tête du mart : « identique pour toutes les dates
    --    d'une même saison × région × année »), on apparie le MOIS sur la dernière année de
    --    référence disponible. Le millésime ressort en clair pour que la carte le dise : c'est un
    --    profil de référence, jamais une mesure du jour.
    -- 2. LA CLÉ. Le mart porte un troisième codage régional (FR81 = Occitanie, FRC1, FRB0, FRD1,
    --    FRE1) là où les lieux portent le NUTS-2016 (FRJ = Occitanie). Seule l'Île-de-France
    --    coïncidait. Aucune règle de préfixe ne tient — FRJ → FR81 la casse — d'où une
    --    correspondance EXPLICITE. Par la clé, jamais par le libellé.
    -- 3. LE GRAIN (ajout 01/08). Le mart projette le profil sur CHAQUE JOUR (grain
    --    date × région × pays) : un mois porte ~31 lignes identiques par pays. Joindre au MOIS
    --    sans dédupliquer multiplierait share_total_pct par ~31. Mesuré : aucun
    --    (région, mois, pays) ne porte deux parts distinctes, le DISTINCT est donc exact.
    select distinct
        p.reference_year,
        extract(month from p.date)  as profile_month,
        r.region_id,
        p.country_iso_code,
        p.country_name_fr,
        p.country_share_of_nonresident
    from {{ ref('fct_region_foreign_country_profile') }} p
    inner join region_acc_choice a
        on  p.region_code        = a.region_code
        and p.accommodation_type = a.accommodation_type
    inner join (
        select * from unnest([
            struct('FR10' as mart_region_code, 'FR10' as region_id),
            ('FR81', 'FRJ'), ('FRC1', 'FRC'), ('FRB0', 'FRB'),
            ('FRD1', 'FRD'), ('FRE1', 'FRE')
        ])
    ) r
        on r.mart_region_code = p.region_code
    where p.country_iso_code is not null
      and p.reference_year = (
          select max(reference_year) from {{ ref('fct_region_foreign_country_profile') }}
      )
),

-- ============================================================
-- SCORING CONTEXT (reused across CTEs)
-- ============================================================

daily_state as (
    select
        c.date,
        c.location_id,
        c.opportunity_score_final_local,
        c.opportunity_regime,
        c.competition_index_local,
        c.baseline_comp_avg,
        -- 23/08 : un jour sans evenements recenses a competition_index_local = 0, et le ratio
        -- valait 0 -- un zero qui ressemble a une mesure (« activite inferieure de 100 % »).
        -- Mesure : 601 jours, 31 sites sur 32, tous dans la fenetre future, events_5km NULL.
        -- NULL au lieu de 0 : les 19 comparaisons de seuil (< 0.8, >= 1.3 ...) deviennent
        -- fausses d'elles-memes, aucune carte ne tire sur une absence de donnee.
        case when r.events_within_5km_count is null then null
             else safe_divide(c.competition_index_local, c.baseline_comp_avg) end as pressure_ratio,
        c.has_valid_baseline_flag,
        c.primary_score_driver_label,
        c.alert_level_max,
        c.is_public_holiday_flag,
        c.is_school_holiday_flag,
        c.is_weekend_flag,
        c.ft_peak_hour,
        c.ft_peak_busyness_pct,
        r.events_within_5km_count,
        r.events_within_500m_count,
        r.events_within_1km_count,
        r.events_within_10km_count,
        -- Périmètre déclaré (docs/perimetre-client-spec.md) : commune -> 1 km, beyond -> 20 km.
        -- Sans réponse, 500 m = le comportement actuel, inchangé. JAMAIS un rayon deviné.
        case l.client_catchment
            when 'commune' then r.events_within_1km_count
            when 'beyond'  then r.events_within_20km_count
            else                r.events_within_500m_count
        end as events_within_catchment_count,
        case l.client_catchment
            when 'commune' then '1 km'
            when 'beyond'  then '20 km'
            else                '500 m'
        end as catchment_label_fr,
        r.events_within_20km_count,
        r.pct_same_bucket_5km,
        r.events_within_5km_same_bucket_count,
        r.events_within_500m_same_bucket_count,
        r.events_within_1km_same_bucket_count,
        -- Même secteur, au périmètre DÉCLARÉ. Sert uniquement là où la phrase imprime déjà
        -- catchment_label_fr : les deux nombres d'une même phrase doivent partager leur rayon.
        case l.client_catchment
            when 'commune' then r.events_within_1km_same_bucket_count
            when 'beyond'  then r.events_within_20km_same_bucket_count
            else                r.events_within_500m_same_bucket_count
        end as events_within_catchment_same_bucket_count,
        l.location_label,
        l.region_id,
        l.client_industry_code,
        l.weather_sensitivity,
        l.main_event_objective,
        l.location_access_pattern,
        c.tourism_index_region,
        c.tourism_peak_flag_region,
        c.tourism_status_region,
        c.has_tourism_signal_region,
        c.mobility_disruption_flag_region,
        c.ft_day_rank_max,
        c.ft_day_rank_mean,
        c.opportunity_medal,
        c.best_day_rank,
        ic.delta_att_calendar_pct,
        ic.audience_availability_label,
        -- 23/08 : mobilite au grain SITE. mobility_disruption_flag_region vient d'un stub
        -- (int_mobility_region_daily__aligned : false en dur, vrai sur 0 / 4 096 site-jours).
        -- La chaine site est vivante (fct_location_impact_daily_mobility -> score) :
        -- 529 site-jours a impact negatif sur 1 229 en 30 j, 28 dans J..J+3.
        sc.delta_att_mobility_pct
    from ctx c
    left join radius r on c.date = r.date and c.location_id = r.location_id
    inner join loc l on c.location_id = l.location_id
    left join impact_calendar ic on c.date = ic.date and c.location_id = ic.location_id
    left join score sc on c.date = sc.date and c.location_id = sc.location_id
),

-- Croisement "pays en vacances scolaires" x "poids reel dans la region".
-- CTE dediee plutot qu'une sous-requete correlee avec UNNEST : plus lisible et
-- sans risque de correlation non supportee.
foreign_tourism_named as (
    select
        d.date,
        d.location_id,
        any_value(m.reference_year)                              as profile_reference_year,
        string_agg(
            concat(m.country_name_fr, ' ',
                   cast(round(m.country_share_of_nonresident * 100, 0) as string), '%'),
            ', ' order by m.country_share_of_nonresident desc
        )                                                       as countries_named,
        round(sum(m.country_share_of_nonresident) * 100, 0)      as share_total_pct,
        count(*)                                                 as n_countries
    from daily_state d
    inner join foreign_tourism ft
        on ft.date = d.date
    cross join unnest(ft.countries_on_school_holiday) c
    inner join region_foreign_mix m
        on  m.region_id        = d.region_id
        and m.profile_month    = extract(month from d.date)
        and m.country_iso_code = c.country_iso_code
    where d.date >= current_date()
      and d.date <= date_add(current_date(), interval 3 day)
    group by d.date, d.location_id
),

-- ============================================================
-- ACTION TYPE 1: HIGH COMPETITION DENSITY
-- Fires when competition pressure is elevated AND there are
-- many events nearby. State-based, not transition-based.
-- ============================================================

high_competition as (
    select
        d.date,
        d.location_id,
        'high_competition_density' as action_type,
        case
            when d.pressure_ratio >= 1.8 and d.events_within_5km_count >= 100 then 4
            when d.pressure_ratio >= 1.5 and d.events_within_5km_count >= 50 then 3
            when d.pressure_ratio >= 1.3 and d.events_within_5km_count >= 20 then 2
            else 1
        end as action_priority,
        'competition' as action_category,
        'gbp' as channel_hint,
        concat(
            cast(d.events_within_5km_count as string),
            ' evenements a 5 km - pression x',
            cast(round(d.pressure_ratio, 1) as string),
            ' vs moyenne'
        ) as headline_fr,
        concat(
            'Concentration concurrentielle superieure a la moyenne (',
            cast(d.events_within_5km_count as string),
            ' evenements dont ',
            cast(d.events_within_catchment_count as string),
            ' a ',
            d.catchment_label_fr,
            '). ',
            case
                when d.pct_same_bucket_5km >= 0.25 then concat(
                    cast(round(d.pct_same_bucket_5km * 100, 0) as string),
                    '% sont dans votre secteur - ils disputent votre public. Differenciez votre offre.')
                else concat(
                    'Seulement ',
                    cast(round(d.pct_same_bucket_5km * 100, 0) as string),
                    '% sont dans votre secteur : ce public est dans le quartier sans vous etre dispute. Allez le capter.')
            end
        ) as detail_fr,
        to_json_string(struct(
            d.events_within_5km_count as events_5km,
            d.events_within_500m_count as events_500m,
            d.events_within_catchment_count as events_catchment,
            d.catchment_label_fr as catchment_label,
            d.events_within_10km_count as events_10km,
            round(d.pressure_ratio, 2) as pressure_ratio,
            round(d.pct_same_bucket_5km * 100, 1) as pct_same_sector,
            d.events_within_5km_same_bucket_count as events_5km_same_sector,
            d.events_within_5km_count - d.events_within_5km_same_bucket_count as events_5km_other_sector,
            d.primary_score_driver_label as score_driver
        )) as data_payload,
        concat('high_competition_density:', d.location_id, ':', cast(d.date as string)) as suppression_key,
        d.date as expires_at
    from daily_state d
    where d.date >= current_date()
      and d.date <= date_add(current_date(), interval 3 day)
      and d.pressure_ratio >= 1.3
      and d.events_within_5km_count >= 10
      and d.has_valid_baseline_flag = true
),

-- ============================================================
-- ACTION TYPE 2: WEATHER WINDOW
-- Fires when today has good weather but yesterday was bad.
-- ============================================================

weather_window as (
    select
        w.date,
        w.location_id,
        'weather_window' as action_type,
        case
            when wy.alert_level_max >= 3 and w.alert_level_max = 0 then 4
            when wy.alert_level_max >= 2 and w.alert_level_max = 0 then 3
            else 2
        end as action_priority,
        'weather' as action_category,
        'gbp' as channel_hint,
        concat(
            'Fenetre meteo favorable apres ',
            case
                when wy.lvl_rain >= 3 then 'fortes pluies'
                when wy.lvl_wind >= 3 then 'vent fort'
                when wy.lvl_rain >= 2 then 'pluie'
                when wy.lvl_wind >= 2 then 'vent'
                else 'alerte meteo'
            end
        ) as headline_fr,
        concat(
            'Les conditions meteo s ameliorent nettement (niveau ',
            cast(wy.alert_level_max as string),
            ' -> ',
            cast(w.alert_level_max as string),
            '). ',
            case
                when l.weather_sensitivity >= 3 then 'Votre site est sensible a la meteo - activez vos espaces exterieurs.'
                else 'Communiquez sur les conditions favorables pour attirer du public.'
            end
        ) as detail_fr,
        to_json_string(struct(
            wy.alert_level_max as yesterday_alert,
            w.alert_level_max as today_alert,
            wy.lvl_rain as yesterday_rain,
            wy.lvl_wind as yesterday_wind,
            l.weather_sensitivity as site_sensitivity
        )) as data_payload,
        concat('weather_improved:', w.location_id, ':', cast(w.date as string)) as suppression_key,
        w.date as expires_at
    from weather w
    inner join weather_yesterday wy
        on w.location_id = wy.location_id
    inner join loc l on w.location_id = l.location_id
    where w.date = current_date()
      and w.alert_level_max <= 1
      and wy.alert_level_max >= 2
),

-- ============================================================
-- ACTION TYPE 3: TOP DAY APPROACHING
-- Fires when a day in the next 3 days is in the top 3 scores
-- of the 7-day window.
-- ============================================================

top_day_ranked as (
    select
        d.*,
        row_number() over (
            partition by d.location_id
            order by d.opportunity_score_final_local desc
        ) as rank_in_window
    from daily_state d
),

top_day_approaching as (
    select
        t.date,
        t.location_id,
        'top_day_approaching' as action_type,
        case
            when t.rank_in_window = 1 then 4
            when t.rank_in_window = 2 then 3
            else 2
        end as action_priority,
        'opportunity' as action_category,
        'email' as channel_hint,
        concat(
            'J',
            case
                when t.date = current_date() then '-0 : meilleur'
                else concat('+', cast(date_diff(t.date, current_date(), day) as string), ' : ', cast(t.rank_in_window as string), 'e meilleur')
            end,
            ' jour de la semaine (score ',
            cast(t.opportunity_score_final_local as string),
            ')'
        ) as headline_fr,
        concat(
            format_date('%A %d/%m', t.date),
            ' est le ',
            case t.rank_in_window when 1 then 'meilleur' when 2 then '2e meilleur' else '3e meilleur' end,
            ' jour des 7 prochains (score ',
            cast(t.opportunity_score_final_local as string),
            '/100, regime ',
            t.opportunity_regime,
            '). ',
            case
                when t.opportunity_regime = 'A' then 'Conditions optimales - maximisez votre presence.'
                when t.opportunity_regime = 'B' then 'Bon potentiel - preparez votre communication.'
                else 'Malgre le contexte, c est votre meilleure fenetre.'
            end
        ) as detail_fr,
        to_json_string(struct(
            t.opportunity_score_final_local as score,
            t.opportunity_regime as regime,
            t.rank_in_window as rank,
            t.primary_score_driver_label as driver,
            t.events_within_5km_count as events_5km,
            t.alert_level_max as weather_alert
        )) as data_payload,
        concat('score_up:', t.location_id, ':', cast(t.date as string)) as suppression_key,
        t.date as expires_at
    from top_day_ranked t
    where t.rank_in_window <= 3
      and t.date >= current_date()
      and t.date <= date_add(current_date(), interval 3 day)
      and t.opportunity_score_final_local >= 40
),

-- ============================================================
-- ACTION TYPE 4: AUDIENCE SHIFT OPPORTUNITY
-- Fires when a holiday, vacation, or commercial event changes
-- the audience composition - combined with competition context.
-- ============================================================

audience_shift as (
    select
        d.date,
        d.location_id,
        'audience_shift_opportunity' as action_type,
        case
            when d.is_public_holiday_flag and d.pressure_ratio >= 1.3 then 4
            when d.is_public_holiday_flag then 3
            when a.is_commercial_event_flag and d.pressure_ratio >= 1.3 then 3
            when d.is_school_holiday_flag then 2
            when a.is_commercial_event_flag then 2
            else 1
        end as action_priority,
        'calendar' as action_category,
        'gbp' as channel_hint,
        concat(
            case
                when d.is_public_holiday_flag then concat(coalesce(a.public_holiday_name_fr, 'Jour ferie'), ' - ')
                when a.is_commercial_event_flag then 'Soldes/evenement commercial - '
                when d.is_school_holiday_flag then concat(coalesce(a.school_vacation_name, 'Vacances scolaires'), ' - ')
                else ''
            end,
            'affluence specifique attendue',
            case
                when d.pressure_ratio >= 1.5 then concat(' (pression x', cast(round(d.pressure_ratio, 1) as string), ')')
                else ''
            end
        ) as headline_fr,
        concat(
            case
                when d.is_public_holiday_flag then 'Jour ferie : affluence familles et residents attendue. '
                when a.is_commercial_event_flag then 'Periode commerciale : flux consommateurs renforce. '
                when d.is_school_holiday_flag then 'Vacances scolaires : public familial et touristique. '
                else ''
            end,
            case
                when d.pressure_ratio >= 1.5 then concat('Pression concurrentielle elevee (x', cast(round(d.pressure_ratio, 1) as string), ') - differenciez votre offre pour capter ce public.')
                when d.pressure_ratio >= 1.2 then 'Adaptez votre communication au public present.'
                else 'Adaptez votre accueil et votre communication au public present.'
            end
        ) as detail_fr,
        to_json_string(struct(
            d.is_public_holiday_flag as is_holiday,
            a.public_holiday_name_fr as holiday_name,
            d.is_school_holiday_flag as is_vacation,
            a.school_vacation_name as vacation_name,
            a.is_commercial_event_flag as is_commercial,
            (select ce.event_name from unnest(a.commercial_events) ce limit 1) as commercial_event_name,
            (select ce.event_code from unnest(a.commercial_events) ce limit 1) as commercial_event_code,
            round(d.pressure_ratio, 2) as pressure_ratio,
            d.events_within_5km_count as events_5km,
            d.opportunity_score_final_local as score,
            round(d.delta_att_calendar_pct, 1) as delta_att_calendar_pct,
            d.audience_availability_label as audience_availability_label
        )) as data_payload,
        concat('calendar_audience_shift:', d.location_id, ':', cast(d.date as string)) as suppression_key,
        d.date as expires_at
    from daily_state d
    inner join annotations a
        on d.date = a.date and d.region_id = a.region_id
    -- 23/08 : is_commercial_event_flag retire — condition EXACTE de commercial_event_match
    -- (124 tirs sur 124 en commun). Le commercial reste la-bas.
    where (d.is_public_holiday_flag = true
        or d.is_school_holiday_flag = true)
      and d.date >= current_date()
      and d.date <= date_add(current_date(), interval 3 day)
),

-- ============================================================
-- ACTION TYPE 5: COMPETITOR THREAT DIRECT
-- Fires when a tracked competitor has an upcoming high-conflict
-- event.
-- ============================================================

competitor_threat as (
    select
        c.event_date as date,
        c.location_id,
        'competitor_threat_direct' as action_type,
        case
            when c.conflict_score >= 7 and c.audience_overlap = true then 4
            when c.conflict_score >= 5 then 3
            when c.conflict_score >= 3 and c.audience_overlap = true then 3
            else 2
        end as action_priority,
        'competition' as action_category,
        'slack' as channel_hint,
        concat(
            'Concurrent actif : ',
            coalesce(c.event_name, 'evenement detecte'),
            ' a ',
            cast(round(c.distance_from_location_m / 1000, 1) as string),
            ' km'
        ) as headline_fr,
        concat(
            'Conflit ',
            case when c.audience_overlap = true then 'direct (audience identique)' else 'indirect' end,
            ' - score de conflit ',
            cast(c.conflict_score as string),
            '/10. ',
            case c.threat_level
                when 'high' then 'Menace elevee - activez votre differenciation immediatement.'
                when 'medium' then 'Menace moderee - renforcez votre visibilite.'
                else 'Surveillez et preparez une reponse si necessaire.'
            end
        ) as detail_fr,
        to_json_string(struct(
            c.competitor_id,
            c.competitor_name,
            c.event_name as event_label,
            c.conflict_score,
            c.audience_overlap,
            c.audience_overlap_score,
            round(c.distance_from_location_m) as distance_m,
            c.threat_level,
            round(c.threat_score, 2) as threat_score,
            c.google_rating,
            c.google_rating_count,
            c.entity_threat_level,
            round(c.entity_threat_audience_pct, 2) as audience_overlap_pct,
            c.entity_threat_industry_tier,
            round(c.entity_threat_distance_km, 1) as threat_distance_km,
            c.competitor_enriched_description,
            c.event_primary_audience
        )) as data_payload,
        concat('competitor_event_launch:', c.location_id, ':', c.competitor_id, ':', cast(c.event_date as string)) as suppression_key,
        c.event_date as expires_at
    from competitors c
    where c.conflict_score >= 3
),

-- ============================================================
-- ACTION TYPE 6: REGIME C WARNING
-- Fires when an upcoming day is forced regime C or has
-- major realization risk.
-- ============================================================

regime_c_warning as (
    select
        s.date,
        s.location_id,
        'regime_c_warning' as action_type,
        case
            when s.is_forced_regime_c_flag = true then 4
            when s.is_major_realization_risk_flag = true then 3
            else 2
        end as action_priority,
        'opportunity' as action_category,
        'internal' as channel_hint,
        concat(
            'Alerte regime C',
            case
                when s.is_forced_regime_c_flag = true then ' force'
                when s.is_major_realization_risk_flag = true then ' - risque de realisation majeur'
                else ''
            end,
            ' le ',
            format_date('%d/%m', s.date)
        ) as headline_fr,
        concat(
            'Conditions defavorables detectees pour le ',
            format_date('%A %d/%m', s.date),
            '. ',
            case
                when s.major_realization_risk_driver is not null
                    then concat('Cause : ', s.major_realization_risk_driver, '. ')
                else ''
            end,
            'Reportez vos activites exterieures ou preparez un plan B.'
        ) as detail_fr,
        to_json_string(struct(
            s.is_forced_regime_c_flag as forced_c,
            s.is_major_realization_risk_flag as realization_risk,
            s.major_realization_risk_driver as risk_driver,
            s.opportunity_regime as regime,
            cast(s.opportunity_score_raw as int64) as score
        )) as data_payload,
        concat('score_down:', s.location_id, ':', cast(s.date as string)) as suppression_key,
        s.date as expires_at
    from score s
    where s.date >= current_date()
      and s.date <= date_add(current_date(), interval 3 day)
      and (s.is_forced_regime_c_flag = true or s.is_major_realization_risk_flag = true)
),

-- ============================================================
-- ACTION TYPE 7: CHANGE FEED ACTIONS
-- Converts relevant transition-based signals from the change
-- feed into action candidates with the same schema.
-- ============================================================

change_feed_actions as (
    select
        cf.feed_date as date,
        cf.location_id,
        cf.change_subtype as action_type,
        cf.alert_level as action_priority,
        cf.change_category as action_category,
        case
            when cf.change_subtype in ('weather_worsened', 'weather_improved', 'weather_hazard_onset') then 'gbp'
            when cf.change_subtype in ('competition_pressure_spike', 'competitor_event_launch', 'competitor_audience_conflict') then 'slack'
            when cf.change_subtype in ('score_up', 'score_down') then 'email'
            when cf.change_subtype in ('mobility_disruption', 'mobility_disruption_planned') then 'internal'
            else 'internal'
        end as channel_hint,
        cf.summary as headline_fr,
        concat(
            cf.summary,
            case
                when cf.change_subtype = 'weather_worsened' then ' Adaptez vos operations et communiquez.'
                when cf.change_subtype = 'weather_improved' then ' Profitez de cette amelioration.'
                when cf.change_subtype = 'weather_hazard_onset' then ' Prenez les mesures de protection necessaires.'
                when cf.change_subtype = 'competition_pressure_spike' then ' Differenciez votre offre.'
                when cf.change_subtype = 'competitor_event_launch' then ' Surveillez et ajustez votre communication.'
                when cf.change_subtype = 'competitor_audience_conflict' then ' Action immediate requise.'
                when cf.change_subtype = 'score_up' then ' Maximisez cette opportunite.'
                when cf.change_subtype = 'score_down' then ' Ajustez votre plan.'
                when cf.change_subtype = 'mobility_disruption' then ' Informez vos visiteurs.'
                when cf.change_subtype = 'mobility_disruption_planned' then ' Anticipez les impacts.'
                when cf.change_subtype = 'calendar_audience_shift' then ' Adaptez votre communication.'
                when cf.change_subtype = 'competitor_sold_out' then ' Captez le public residuel.'
                else ''
            end
        ) as detail_fr,
        to_json_string(struct(
            cf.change_subtype as signal_type,
            cf.old_value,
            cf.new_value,
            -- 23/08 : weather_hazard_onset ABSORBE ses compléments (mesure du 23/08 sur le mart :
            -- extended_bad_weather_3d + perfect_storm toujours ensemble 18/18, saturated_bad_weather
            -- et weather_mobility_double jamais seules sur leur alerte, weather_worsened avec
            -- hazard_onset 23/23). Une alerte = UNE carte ; la durée, la concurrence sur la même
            -- alerte et les transports sont des FAITS de cette carte, pas des cartes.
            wxh.hazard_days,
            wxd.events_within_5km_count as events_5km,
            round(wxd.pct_same_bucket_5km * 100, 1) as pct_same_sector,
            wxd.mobility_disruption_flag_region as mobility_disrupted,
            -- 23/08 : perturbation nommée pour mobility_disruption / _planned (mobility_named).
            mn.disruption_title,
            mn.transit_line,
            mn.transit_stop,
            mn.disruption_severity,
            mn.delay_minutes,
            mn.duration_days as disruption_duration_days,
            cf.score_delta,
            cf.event_label,
            cf.distance_m,
            cf.radius_bucket,
            cf.industry_code,
            cf.score_driver_label,
            cf.direction,
            cfec.competitor_id,
            -- 23/08 : nom aussi pour les sous-types SNAPSHOT (horaires, avis, offres) — entity_id = competitor_id.
            coalesce(cfd.competitor_name, cfs.competitor_name) as competitor_name,
            cfd.google_rating,
            cfd.google_rating_count,
            cfd.auto_enriched_description as competitor_enriched_description,
            cftp.threat_level as entity_threat_level,
            round(cftp.audience_overlap_pct, 2) as audience_overlap_pct,
            cftp.industry_match_tier as entity_threat_industry_tier,
            round(cftp.distance_km, 1) as entity_threat_distance_km,
            round(cftp.threat_score, 2) as entity_threat_score
        )) as data_payload,
        concat(cf.change_subtype, ':', cf.location_id, ':', cast(cf.feed_date as string)) as suppression_key,
        cf.feed_date as expires_at
    from {{ ref('vw_insight_event_change_feed') }} cf
    left join {{ ref('fct_competitor_events_conflicts') }} cfec
        on cf.entity_id = cfec.competitor_event_id
       and cf.change_type in (
           'competitor_event_launch',
           'competitor_audience_conflict',
           'competition_pressure_spike'
       )
    left join {{ ref('fct_competitor_directory') }} cfd
        on cfec.competitor_id = cfd.competitor_id
    left join {{ ref('fct_competitor_directory') }} cfs
        on cf.change_subtype in ('competitor_hours_change', 'competitor_review_surge', 'competitor_review_drop',
                                 'competitor_new_offering', 'competitor_sold_out', 'competitor_content_spike', 'competitor_content_silent')
       and cfs.competitor_id = cf.entity_id
    left join {{ ref('fct_competitor_threat_profile') }} cftp
        on cf.location_id = cftp.location_id
       and cfec.competitor_id = cftp.competitor_id
    -- Faits absorbés par weather_hazard_onset (23/08) — même (site, date) que l'alerte.
    left join daily_state wxd
        on cf.change_subtype = 'weather_hazard_onset'
       and wxd.location_id = cf.location_id
       and wxd.date = cf.feed_date
    left join (
        -- Jours consécutifs en alerte >= 2 à partir de la date, dans la fenêtre J..J+7 du CTE
        -- weather (1 = la seule journée). Série = jours >= 2 d'affilée, identifiée par
        -- date - rang ; la longueur restante depuis la date = fin de série - date + 1.
        select location_id, date,
               date_diff(max(date) over (partition by location_id, serie), date, day) + 1 as hazard_days
        from (
            select location_id, date,
                   date_sub(date, interval row_number() over (partition by location_id order by date) day) as serie
            from weather
            where alert_level_max >= 2
        )
    ) wxh
        on cf.change_subtype = 'weather_hazard_onset'
       and wxh.location_id = cf.location_id
       and wxh.date = cf.feed_date
    left join mobility_named mn
        on cf.change_subtype in ('mobility_disruption', 'mobility_disruption_planned', 'mobility_disruption_resolved')
       and mn.location_id = cf.location_id
       and mn.date = cf.feed_date
    where cf.feed_date >= current_date()
      and cf.feed_date <= date_add(current_date(), interval 7 day)
      and cf.alert_level >= 2
      -- 23/08 : porte LOCALE en plus du drapeau région — une perturbation nommée, active à
      -- (site, date) et COURTE (<= 30 j). Le drapeau région seul fermait 40 lignes / 5 sites sur
      -- 7 j dont le Métro 8 interrompu ; sans la durée il aurait ouvert 392 bus en travaux chroniques.
      and (cf.change_subtype != 'mobility_disruption'
           or cf.mobility_disruption_flag_region = true
           or (mn.location_id is not null and mn.duration_days <= 30))
      -- 23/08 : weather_worsened ne tire plus — sur le mart du 23/08 il n'apparaissait JAMAIS sans
      -- weather_hazard_onset le même jour (23 couples sur 23). L'alerte qui monte EST l'alerte.
      and cf.change_subtype != 'weather_worsened'
      -- competitor_event_launch dedup: competitor_threat_direct (conflict_score >= 3)
      -- owns these events as the richer, conflict-scored card. The feed launch
      -- survives only for sub-threshold events (conflict_score < 3). Resolves the
      -- suppression_key mismatch (threat key carries competitor_id, feed key did not)
      -- by making the two mutually exclusive at source rather than via key/priority.
      and not (cf.change_subtype = 'competitor_event_launch' and coalesce(cfec.conflict_score, 0) >= 3)
      -- competition_pressure_spike dedup (28/07) : la carte d'ETAT high_competition_density porte
      -- desormais la scission meme-secteur et le bon geste ; la transition sert encore la ligne
      -- generique « Differenciez votre offre ». Quand l'etat tire sur le meme lieu/date, l'etat
      -- gagne. Exclusion AU SOURCE — meme patron que competitor_event_launch ci-dessus, jamais
      -- via un detournement de action_priority (qui signifie l'urgence, pas le departage).
      and not (cf.change_subtype = 'competition_pressure_spike' and exists (
          select 1 from daily_state hc
          where hc.location_id = cf.location_id
            and hc.date = cf.feed_date
            and hc.pressure_ratio >= 1.3
            and hc.events_within_5km_count >= 10
            and hc.has_valid_baseline_flag = true
      ))
      -- 23/08 : competition_pressure_spike ne porte que les HAUSSES. Le flux émet aussi les
      -- franchissements à la baisse (11 tirs sur 11 le 23/08 étaient des baisses, rendus
      -- « pression en hausse ×1,2 → ×0,8 ») ; la baisse est déjà la carte low_competition_window.
      and not (cf.change_subtype = 'competition_pressure_spike'
               and safe_cast(cf.new_value as float64) <= safe_cast(cf.old_value as float64))
      and cf.change_subtype not in (
          'context_change',
          -- 23/08 : event_new = l'événement d'un concurrent SUIVI, déjà rendu par
          -- competitor_event_launch (5 doublons le 23/08, et aucune carte app pour ce type).
          'event_new',
          'ranking_up',
          'ranking_down',
          'mobility_change',
          'event_removed',
          -- feed-only: internal-metric movements are notifications, not action
          -- cards. A card must name a real-world situation AND imply an action;
          -- the actionable equivalents live in dedicated state CTEs
          -- (top_day_approaching, regime_c_warning, weekend_opportunity, ...).
          'score_up',
          'score_down',
          'score_change',
          'future_score_change',
          'regime_change',
          'medal_change',
          'baseline_validity_change',
          'score_driver_shift',
          -- blocked: no upstream enrichment pipeline yet
          'competitor_review_surge',
          'competitor_review_drop',
          -- competitor_hours_change DÉBLOQUÉE 23/08 : journal int_competitor_snapshot_deltas + periods
          -- GBP en clair dans old/new_value + competitor_name joint (cfs). La carte app rend le jour.
          'competitor_new_offering',
          'competitor_content_spike',
          'competitor_content_silent',
          'institution_campaign_detected',
          'media_mention_detected',
          'competitor_sold_out'
      )
),

-- ============================================================
-- ACTION TYPE 8: COMPETITION PROXIMITY
-- Fires when events are concentrated very close to the site.
-- Tiered by radius: 500m (immediate), 1km (neighborhood).
-- ============================================================

competition_proximity as (
    select
        d.date,
        d.location_id,
        'competition_proximity' as action_type,
        case
            when d.events_within_500m_same_bucket_count >= 10 then 4
            when d.events_within_500m_same_bucket_count >= 3 then 3
            when d.events_within_1km_same_bucket_count >= 30 then 3
            when d.events_within_1km_same_bucket_count >= 10 then 2
            else 1
        end as action_priority,
        'competition' as action_category,
        'gbp' as channel_hint,
        case
            when d.events_within_500m_same_bucket_count >= 3
                then concat(cast(d.events_within_500m_same_bucket_count as string), ' evenements de votre secteur a 500m - concurrence directe')
            else concat(cast(d.events_within_1km_same_bucket_count as string), ' evenements de votre secteur a 1km - quartier sature')
        end as headline_fr,
        case
            when d.events_within_500m_same_bucket_count >= 10
                then concat(
                    cast(d.events_within_catchment_same_bucket_count as string),
                    ' evenements de votre secteur dans un rayon de ',
                    d.catchment_label_fr,
                    ' (sur ',
                    cast(d.events_within_catchment_count as string),
                    ' au total). Saturation immediate - votre public est solicite de toutes parts. Differenciez-vous par l experience.'
                )
            when d.events_within_500m_same_bucket_count >= 3
                then concat(
                    cast(d.events_within_500m_same_bucket_count as string),
                    ' evenements de votre secteur a moins de 500m et ',
                    cast(d.events_within_1km_same_bucket_count as string),
                    ' a 1km. Renforcez votre visibilite locale.'
                )
            else concat(
                    cast(d.events_within_1km_same_bucket_count as string),
                    ' evenements de votre secteur dans votre quartier. Communiquez pour capter le flux.'
                )
        end as detail_fr,
        to_json_string(struct(
            d.events_within_500m_count as events_500m,
            d.events_within_1km_count as events_1km,
            d.events_within_catchment_count as events_catchment,
            d.catchment_label_fr as catchment_label,
            d.events_within_500m_same_bucket_count as events_500m_same_sector,
            d.events_within_1km_same_bucket_count as events_1km_same_sector,
            d.events_within_catchment_same_bucket_count as events_catchment_same_sector,
            d.events_within_5km_count as events_5km,
            tt.competitor_name as top_competitor,
            tt.threat_level as top_threat_level,
            round(tt.distance_km, 1) as top_competitor_distance_km,
            round(tt.audience_overlap_pct, 2) as top_competitor_overlap_pct,
            round(tt.threat_score, 2) as top_threat_score
        )) as data_payload,
        concat('competition_proximity:', d.location_id, ':', cast(d.date as string)) as suppression_key,
        d.date as expires_at
    from daily_state d
    left join top_threat tt on d.location_id = tt.location_id
    where d.date >= current_date()
      and d.date <= date_add(current_date(), interval 3 day)
      and (d.events_within_500m_same_bucket_count >= 3
        or d.events_within_1km_same_bucket_count >= 10)
),

-- ============================================================
-- ACTION TYPE 9: LOW COMPETITION WINDOW
-- Fires when competition pressure is below baseline.
-- Rare and valuable - push sales and visibility.
-- ============================================================

low_competition_window as (
    select
        d.date,
        d.location_id,
        'low_competition_window' as action_type,
        case
            when d.pressure_ratio < 0.7 then 4
            when d.pressure_ratio < 0.85 then 3
            else 2
        end as action_priority,
        'opportunity' as action_category,
        'gbp' as channel_hint,
        concat(
            'Fenetre concurrentielle favorable - pression x',
            cast(round(d.pressure_ratio, 1) as string),
            ' (sous la moyenne)'
        ) as headline_fr,
        concat(
            'La pression concurrentielle est inferieure a la moyenne (',
            cast(d.events_within_5km_count as string),
            ' evenements a 5km vs ',
            cast(round(d.baseline_comp_avg, 0) as string),
            ' en temps normal). ',
            'Opportunite rare - maximisez votre visibilite et vos actions commerciales.'
        ) as detail_fr,
        to_json_string(struct(
            round(d.pressure_ratio, 2) as pressure_ratio,
            d.events_within_5km_count as events_5km,
            round(d.baseline_comp_avg, 0) as baseline_avg,
            d.opportunity_score_final_local as score
        )) as data_payload,
        concat('low_competition:', d.location_id, ':', cast(d.date as string)) as suppression_key,
        d.date as expires_at
    from daily_state d
    where d.pressure_ratio < 1.0
      and d.has_valid_baseline_flag = true
      and d.date >= current_date()
      and d.date <= date_add(current_date(), interval 3 day)
),

-- ============================================================
-- ACTION TYPE 10: EXTENDED BAD WEATHER
-- Fires when 2+ consecutive days have weather alerts.
-- Different from single-day alerts: need a plan B strategy.
-- ============================================================

weather_consecutive as (
    select
        w.location_id,
        w.date,
        w.alert_level_max,
        w.lvl_rain,
        w.lvl_wind,
        count(*) over (
            partition by w.location_id
            order by w.date
            rows between current row and 1 following
        ) as window_size,
        min(w.alert_level_max) over (
            partition by w.location_id
            order by w.date
            rows between current row and 1 following
        ) as min_alert_in_window
    from weather w
    where w.date >= current_date()
      and w.date <= date_add(current_date(), interval 3 day)
),

-- ============================================================
-- ACTION TYPE 11: FOREIGN TOURISM SIGNAL
-- Signal non localise : feries/vacances scolaires etrangers
-- dans les 3 prochains jours. Priorite plus elevee pour les
-- locations a vocation touristique (destination_catchment).
-- ============================================================

foreign_tourism_signal as (
    select
        d.date,
        d.location_id,
        'foreign_tourism_signal' as action_type,
        case
            when d.location_access_pattern = 'destination_catchment'
                 and ft.has_foreign_school_holiday_signal then 3
            else 2
        end as action_priority,
        'opportunity' as action_category,
        'gbp' as channel_hint,
        concat(
            'Public etranger potentiel - ',
            coalesce(
                ftn.countries_named,
                (select string_agg(
                            case c.country_name_en
                                when 'Germany'           then 'Allemagne'
                                when 'Belgium'           then 'Belgique'
                                when 'Netherlands (the)' then 'Pays-Bas'
                                when 'Switzerland'       then 'Suisse'
                                when 'Italy'             then 'Italie'
                                when 'Spain'             then 'Espagne'
                                when 'Luxembourg'        then 'Luxembourg'
                                when 'Austria'           then 'Autriche'
                                when 'Ireland'           then 'Irlande'
                            end, ', ' order by c.country_name_en)
                 from unnest(ft.countries_on_school_holiday) c
                 where c.country_name_en in (
                   'Germany','Belgium','Netherlands (the)','Switzerland','Italy','Spain',
                   'Luxembourg','Austria','Ireland'))
            ),
            ' en vacances scolaires'
        ) as headline_fr,
        concat(
            'Pour le ', format_date('%A %d/%m', d.date), ', ces nationalites sont en vacances scolaires. ',
            case when ftn.countries_named is not null
                then concat(
                    'Les pourcentages sont leur poids dans les nuitees etrangeres de votre region ',
                    '(INSEE ', cast(ftn.profile_reference_year as string), ', parmi les pays publies ',
                    'au Flash - pas la totalite des non-residents), soit ',
                    cast(ftn.share_total_pct as string), '% cumules. ')
                else 'Le poids de ces nationalites dans votre region n est pas encore disponible. '
            end,
            'Ce n est pas une mesure de votre frequentation : adaptez langues, horaires et accueil ',
            'si vous captez du passage.'
        ) as detail_fr,
        to_json_string(struct(
            ft.countries_on_public_holiday,
            ft.countries_on_school_holiday,
            ft.has_foreign_public_holiday_signal,
            ft.has_foreign_school_holiday_signal,
            d.location_access_pattern,
            ftn.countries_named,
            ftn.share_total_pct,
            ftn.n_countries,
            ftn.profile_reference_year
        )) as data_payload,
        concat('foreign_tourism_signal:', d.location_id, ':', cast(d.date as string)) as suppression_key,
        d.date as expires_at
    from daily_state d
    inner join foreign_tourism ft
        on d.date = ft.date
    left join foreign_tourism_named ftn
        on  ftn.date        = d.date
        and ftn.location_id = d.location_id
    where d.date >= current_date()
      and d.date <= date_add(current_date(), interval 3 day)
      and (
        (ft.has_foreign_school_holiday_signal = true and exists (
           select 1 from unnest(ft.countries_on_school_holiday) c
           where c.country_name_en in (
             'Germany','Belgium','Netherlands (the)','Switzerland','Italy','Spain',
             'Luxembourg','Austria','Ireland'
           )))
        or
        (ft.has_foreign_public_holiday_signal = true and exists (
           select 1 from unnest(ft.countries_on_public_holiday) p
           where p.country_name_en in (
             'Germany','United Kingdom','Belgium','Netherlands',
             'Switzerland','Italy','Spain','Luxembourg','Ireland','Austria'
           )))
      )
),

-- ============================================================
-- CONSECUTIVE BAD-WEATHER DAYS (gaps-and-islands)
-- Backward count of consecutive bad days (alert_level_max >= 2)
-- ending on each date, off the full daily spine of
-- int_client_weather_alerts_daily. 0 on good days. Payload enrichment
-- for the bad-weather cards. (Distinct from the forward-looking
-- weather_consecutive CTE above — renamed to avoid collision.)
-- ============================================================

bad_wx_flags as (
    select
        location_id,
        date,
        case when coalesce(alert_level_max, 0) >= 2 then 1 else 0 end as is_bad_day
    from {{ ref('int_client_weather_alerts_daily') }}
    where date between date_sub(current_date(), interval 20 day)
                   and date_add(current_date(), interval 365 day)
),

bad_wx_ranked as (
    select
        location_id,
        date,
        is_bad_day,
        row_number() over (
            partition by location_id, is_bad_day order by date
        ) as rn_state
    from bad_wx_flags
),

bad_wx_islands as (
    select
        location_id,
        date,
        is_bad_day,
        date_sub(date, interval rn_state day) as island_key
    from bad_wx_ranked
),

bad_wx_streak as (
    select
        location_id,
        date,
        case
            when is_bad_day = 1 then row_number() over (
                partition by location_id, is_bad_day, island_key order by date
            )
            else 0
        end as consecutive_bad_days
    from bad_wx_islands
),

extended_bad_weather as (
    select
        wc.date,
        wc.location_id,
        'extended_bad_weather' as action_type,
        case
            when wc.alert_level_max >= 3 then 4
            else 3
        end as action_priority,
        'weather' as action_category,
        'internal' as channel_hint,
        'Meteo defavorable prolongee - prevoyez un plan B' as headline_fr,
        concat(
            'Alerte meteo sur au moins 2 jours consecutifs (niveau ',
            cast(wc.alert_level_max as string),
            '). ',
            case
                when l.weather_sensitivity >= 3 then 'Votre site est tres sensible - reportez les activites exterieures.'
                else 'Preparez des alternatives interieures et communiquez en amont.'
            end
        ) as detail_fr,
        to_json_string(struct(
            wc.alert_level_max as alert_level,
            wc.lvl_rain,
            wc.lvl_wind,
            coalesce(bs.consecutive_bad_days, 0) as consecutive_bad_days,
            l.weather_sensitivity as site_sensitivity
        )) as data_payload,
        concat('extended_bad_weather:', wc.location_id, ':', cast(wc.date as string)) as suppression_key,
        wc.date as expires_at
    from weather_consecutive wc
    inner join loc l on wc.location_id = l.location_id
    left join bad_wx_streak bs on bs.location_id = wc.location_id and bs.date = wc.date
    where wc.min_alert_in_window >= 2
      and wc.window_size = 2
      and wc.date = current_date()
      and not exists (
          select 1 from weather w3a
          inner join weather w3b on w3a.location_id = w3b.location_id
              and w3b.date = date_add(w3a.date, interval 1 day)
              and w3b.alert_level_max >= 2
          inner join weather w3c on w3a.location_id = w3c.location_id
              and w3c.date = date_add(w3a.date, interval 2 day)
              and w3c.alert_level_max >= 2
          where w3a.location_id = wc.location_id
            and w3a.date = wc.date
            and w3a.alert_level_max >= 2
      )
),

-- ============================================================
-- ACTION TYPE 11 (REMOVED): score_driver_shift was a pure
-- internal-metric movement (dominant driver changed) and is not an
-- action card by definition. The driver is carried as the "why"
-- field (primary_score_driver_label / score_driver) inside
-- actionable cards. Demoted to feed-only.
-- ============================================================

-- ============================================================
-- ACTION TYPE 12: WEEKEND OPPORTUNITY
-- Fires when an upcoming weekend day has favorable conditions.
-- ============================================================

weekend_opportunity as (
    select
        d.date,
        d.location_id,
        'weekend_opportunity' as action_type,
        case
            when d.opportunity_regime = 'A' and d.alert_level_max = 0 then 4
            when d.opportunity_regime = 'A' then 3
            when d.alert_level_max = 0 then 3
            else 2
        end as action_priority,
        'opportunity' as action_category,
        'email' as channel_hint,
        concat(
            format_date('%A', d.date),
            ' favorable (score ',
            cast(d.opportunity_score_final_local as string),
            ', ',
            case when d.alert_level_max = 0 then 'beau temps'
                 when d.alert_level_max = 1 then 'meteo correcte'
                 else concat('malgre une alerte meteo niveau ', cast(d.alert_level_max as string)) end,
            ')'
        ) as headline_fr,
        concat(
            format_date('%A %d/%m', d.date),
            ' presente de bonnes conditions (score ',
            cast(d.opportunity_score_final_local as string),
            '/100, regime ',
            d.opportunity_regime,
            case when d.alert_level_max = 0 then ', pas d alerte meteo'
                 else concat(', ALERTE METEO niveau ', cast(d.alert_level_max as string)) end,
            '). ',
            case
                when d.events_within_5km_count >= 50 then concat('Attention : ', cast(d.events_within_5km_count as string), ' evenements a 5km - differenciez-vous.')
                when d.alert_level_max >= 3 then 'Le week-end reste votre meilleure fenetre, mais l alerte meteo est forte : arbitrez entre maintenir et reporter.'
                else 'Preparez votre communication pour capter le flux du week-end.'
            end
        ) as detail_fr,
        to_json_string(struct(
            d.opportunity_score_final_local as score,
            d.opportunity_regime as regime,
            d.alert_level_max as weather_alert,
            d.events_within_5km_count as events_5km,
            d.is_public_holiday_flag as is_holiday
        )) as data_payload,
        concat('weekend_opportunity:', d.location_id, ':', cast(d.date as string)) as suppression_key,
        d.date as expires_at
    from daily_state d
    where d.is_weekend_flag = true
      and d.date >= current_date()
      and d.date <= date_add(current_date(), interval 5 day)
      and d.opportunity_score_final_local >= 40
      and d.opportunity_regime in ('A', 'B')
      -- Audit de verite 27/07 : ne pas annoncer une opportunite un jour d alerte meteo reelle.
      -- La pluie est mesuree -131 EUR/j (t = -3,5) sur f10c3e58.
      and d.alert_level_max < 2
),

-- ============================================================
-- ACTION TYPE S4: COMPETITION CANNIBALIZATION
-- Revenue drop + high competition pressure.
-- Names the competitor responsible.
-- ============================================================

sales_cannibalization as (
    select
        cp.transaction_date as date,
        cp.location_id,
        'sales_competition_cannibalization' as action_type,
        case
            when tt.audience_overlap_pct >= 0.5 then 4
            when safe_divide(ds.competition_index_local, ds.baseline_comp_avg) > 1.5 then 4
            else 3
        end as action_priority,
        'performance' as action_category,
        'slack' as channel_hint,
        concat(
            'CA ', cast(round(cp.revenue_vs_yesterday_pct * 100, 0) as string),
            '% vs hier - pression x',
            cast(round(safe_divide(ds.competition_index_local, ds.baseline_comp_avg), 1) as string)
        ) as headline_fr,
        concat(
            'Baisse de CA de ', cast(round(abs(cp.revenue_vs_yesterday_pct) * 100, 0) as string),
            '% vs hier (', cast(round(cp.daily_revenue, 0) as string),
            ' EUR vs ', cast(round(cp.revenue_yesterday, 0) as string), ' EUR). ',
            'Pression concurrentielle x',
            cast(round(safe_divide(ds.competition_index_local, ds.baseline_comp_avg), 1) as string),
            case
                when tt.competitor_name is not null
                    then concat('. Principal concurrent : ', tt.competitor_name,
                         ' a ', cast(round(tt.distance_km, 1) as string), ' km',
                         case when tt.audience_overlap_pct >= 0.5
                              then concat(' (chevauchement audience ',
                                   cast(round(tt.audience_overlap_pct * 100, 0) as string), '%)')
                              else '' end, '.')
                else '.'
            end
        ) as detail_fr,
        to_json_string(struct(
            cp.daily_revenue,
            cp.revenue_yesterday,
            round(cp.revenue_vs_yesterday_pct * 100, 1) as revenue_delta_pct,
            round(safe_divide(ds.competition_index_local, ds.baseline_comp_avg), 2) as pressure_ratio,
            tt.competitor_name as top_competitor,
            round(tt.distance_km, 1) as competitor_distance_km,
            round(tt.audience_overlap_pct, 2) as competitor_overlap_pct,
            tt.threat_level as competitor_threat_level
        )) as data_payload,
        concat('sales_cannibalization:', cp.location_id, ':', cast(cp.transaction_date as string)) as suppression_key,
        cp.transaction_date as expires_at
    from client_perf cp
    inner join daily_state ds
        on cp.location_id = ds.location_id
       and cp.transaction_date = ds.date
    left join top_threat tt
        on cp.location_id = tt.location_id
    where cp.daily_revenue < cp.revenue_yesterday * 0.85
      and safe_divide(ds.competition_index_local, ds.baseline_comp_avg) > 1.3
      and cp.revenue_yesterday is not null
      and cp.revenue_yesterday > 0
),

-- ============================================================
-- ACTION TYPE S2: REVENUE SURGE (dow noise band + confidence)
-- Fires when revenue is anomalously HIGH vs the same weekday's
-- trailing distribution (robust-z >= band), not vs a flat mean.
-- Re-sourced to fct_client_sales_signals_daily for the band;
-- daily_state supplies the coincident context (no causal claim).
-- ============================================================

sales_surge as (
    select
        s.transaction_date as date,
        s.location_id,
        'sales_surge' as action_type,
        case when res.residual_z >= 2.5 then 4 else 3 end as action_priority,
        'performance' as action_category,
        'instagram' as channel_hint,
        concat('CA au-dessus de son niveau attendu le ', format_date('%d/%m', s.transaction_date)) as headline_fr,
        concat(
            'CA ', cast(round(s.daily_revenue, 0) as string), ' EUR le ',
            format_date('%A %d/%m', s.transaction_date), ', +',
            cast(round(res.residual_pct, 0) as string), '% au-dessus de l attendu pour ce jour (attendu ',
            cast(round(res.expected_revenue, 0) as string), ' EUR compte tenu de vos conditions), soit ',
            cast(round(res.residual_z, 1) as string), ' ecarts-types. ',
            case when s.transactions_delta_pct is not null and s.basket_delta_pct is not null then
                concat(
                    case when abs(s.transactions_delta_pct) >= abs(s.basket_delta_pct)
                        then 'Porte par le volume de ventes' else 'Porte par le panier moyen' end,
                    ' (ventes ', case when s.transactions_delta_pct >= 0 then '+' else '' end, cast(round(s.transactions_delta_pct, 0) as string),
                    '%, panier ', case when s.basket_delta_pct >= 0 then '+' else '' end, cast(round(s.basket_delta_pct, 0) as string), '%). ')
            else '' end,
            case
                when safe_divide(ds.competition_index_local, ds.baseline_comp_avg) < 0.85
                    then 'Coincide avec une pression concurrentielle faible ce jour-la.'
                when ds.is_public_holiday_flag or ds.is_school_holiday_flag
                    then 'Coincide avec un contexte calendaire porteur (vacances/ferie).'
                when ds.alert_level_max = 0
                    then 'Coincide avec une meteo favorable.'
                else 'Notez les conditions du jour pour vos prochaines operations.'
            end
        ) as detail_fr,
        to_json_string(struct(
            s.daily_revenue,
            round(res.expected_revenue, 0) as expected_revenue,
            round(res.residual_pct, 1) as residual_pct,
            round(res.residual_z, 2) as residual_z,
            round(s.transactions_delta_pct, 1) as transactions_delta_pct,
            round(s.basket_delta_pct, 1) as basket_delta_pct,
            case when s.transactions_delta_pct is null or s.basket_delta_pct is null then null
                 when abs(s.transactions_delta_pct) >= abs(s.basket_delta_pct) then 'transactions'
                 else 'basket' end as dominant_factor,
            round(safe_divide(ds.competition_index_local, ds.baseline_comp_avg), 2) as pressure_ratio,
            ds.alert_level_max as weather_alert,
            ds.primary_score_driver_label as driver,
            ds.is_public_holiday_flag as is_holiday,
            ds.is_school_holiday_flag as is_vacation,
            ds.events_within_5km_count as events_5km,
            round(s.revenue_30d_avg, 0) as avg_30d,
            round(s.revenue_vs_30d_avg_pct, 1) as revenue_vs_avg_pct,
            round(s.revenue_robust_z, 2) as revenue_robust_z,
            case when res.residual_z >= 2.5 then 'probable' else 'possible' end as confidence_tier
        )) as data_payload,
        concat('sales_surge:', s.location_id, ':', cast(s.transaction_date as string)) as suppression_key,
        s.transaction_date as expires_at
    from {{ ref('fct_client_sales_signals_daily') }} s
    inner join daily_state ds
        on s.location_id = ds.location_id and s.transaction_date = ds.date
    inner join {{ ref('fct_client_day_residual') }} res
        on res.location_id = s.location_id and res.date = s.transaction_date
    where res.is_revenue_surge_residual = true
      and s.transaction_date >= date_sub(current_date(), interval 30 day)
),

-- ============================================================
-- ACTION TYPE: SALES TRAFFIC NOT CONVERTING
-- From fct_client_sales_signals_daily (mart). Demand present
-- (footfall above baseline or favorable day) but conversion lagged.
-- ============================================================

sales_traffic_not_converting as (
    select
        s.transaction_date as date,
        s.location_id,
        'sales_traffic_not_converting' as action_type,
        case when s.conversion_robust_z <= -2.5 then 4 else 3 end as action_priority,
        'performance' as action_category,
        'note_interne' as channel_hint,
        concat('Du trafic mais conversion anormalement basse le ', format_date('%d/%m', s.transaction_date)) as headline_fr,
        concat(
            'Frequentation ',
            case when s.footfall_delta_pct >= 0 then '+' else '' end,
            cast(round(s.footfall_delta_pct, 0) as string),
            '% vs habitude, mais conversion ',
            cast(round(abs(s.conversion_robust_z), 1) as string),
            ' ecarts-types sous votre norme du meme jour (',
            cast(round(s.conversion_rate * 100, 1) as string),
            '% des visiteurs achetent). Le public etait la sans passer a l achat : ',
            'verifiez le personnel en caisse, le parcours et la mise en avant produit.'
        ) as detail_fr,
        to_json_string(struct(
            round(s.footfall_delta_pct, 1) as footfall_delta_pct,
            round(s.conversion_delta_pct, 1) as conversion_delta_pct,
            round(s.conversion_robust_z, 2) as conversion_robust_z,
            round(s.conversion_rate, 4) as conversion_rate,
            s.daily_visitors,
            s.daily_transactions,
            s.opportunity_score_final_local as score,
            s.opportunity_regime as regime,
            s.primary_revenue_driver,
            case when abs(s.conversion_robust_z) >= 2.5 then 'probable' else 'possible' end as confidence_tier
        )) as data_payload,
        concat('sales_traffic_not_converting:', s.location_id, ':', cast(s.transaction_date as string)) as suppression_key,
        s.transaction_date as expires_at
    from {{ ref('fct_client_sales_signals_daily') }} s
    inner join loc l on s.location_id = l.location_id
    where s.is_traffic_not_converting = true
      and s.transaction_date >= date_sub(current_date(), interval 30 day)
),

-- ============================================================
-- ACTION TYPE: SALES DISCOUNT WITHOUT LIFT
-- Discount intensity above baseline but revenue not above its
-- 30-day baseline - promo spend without payoff.
-- ============================================================

-- ============================================================
-- ACTION TYPE: OFFERING MIX SHIFT (famille produit, en EUROS vs l'attendu du jour — v2 23/08)
-- 23/08 : la carte existait cote app (action-cards.js, recoThemeMap,
-- commitmentOrigins) SANS producteur dbt — un fantome. Lit le flag de
-- fct_client_offering_signals_daily (z sur la PART de la famille, pas l'euro :
-- un jour fort fait monter toutes les familles en euros). Un tir par site et
-- par jour : la famille au |z| le plus fort. Payload = le contrat que la carte
-- app lit deja (item_category, revenue_share, baseline_share,
-- share_delta_points, direction).
-- ============================================================

offering_mix_shift as (
    select
        date,
        location_id,
        'offering_mix_shift' as action_type,
        case when abs(delta_z) >= 3.5 then 3 else 2 end as action_priority,
        'performance' as action_category,
        'note_interne' as channel_hint,
        concat(item_category, ' : ', cast(round(revenue) as string), ' EUR contre ', cast(round(expected_family_revenue) as string),
               ' EUR attendus le ', format_date('%d/%m', date)) as headline_fr,
        concat(item_category, ' a fait ', cast(round(revenue) as string), ' EUR contre ',
               cast(round(expected_family_revenue) as string), ' EUR attendus (', case when delta_eur >= 0 then '+' else '' end,
               cast(round(delta_eur) as string), ' EUR), sur une journee a ', case when day_gap_eur >= 0 then '+' else '' end,
               cast(round(day_gap_eur) as string), ' EUR. ',
               case when direction_eur = 'collapse' then 'Famille qui a manque.' else 'Famille qui a porte la journee.' end) as detail_fr,
        to_json_string(struct(
            item_category,
            round(revenue) as family_revenue,
            round(expected_family_revenue) as expected_family_revenue,
            round(delta_eur) as delta_eur,
            delta_z,
            direction_eur as direction,
            round(expected_day_revenue) as expected_day_revenue,
            round(day_gap_eur) as day_gap_eur,
            revenue_share,
            baseline_share,
            promo_count,
            revenue_rank,
            n_occurrences_60d,
            cast(first_occurrence_date as string) as first_occurrence_date
        )) as data_payload,
        concat('offering_mix_shift:', location_id, ':', cast(date as string)) as suppression_key,
        date as expires_at
    from (
        select
            s.transaction_date as date, s.location_id, s.item_category, s.revenue, s.expected_family_revenue,
            s.delta_eur, s.delta_z, s.direction_eur, s.expected_day_revenue, s.day_gap_eur,
            s.revenue_share, s.baseline_share, s.promo_count, s.revenue_rank,
            s.n_occurrences_60d, s.first_occurrence_date,
            row_number() over (partition by s.location_id, s.transaction_date order by abs(s.delta_eur) desc) as rn
        from {{ ref('fct_client_offering_signals_daily') }} s
        inner join loc l on s.location_id = l.location_id
        where s.is_eur_move = true
          and s.transaction_date >= date_sub(current_date(), interval 30 day)
          and s.transaction_date < current_date()
    )
    where rn = 1
),


-- ============================================================
-- ACTION TYPE: ITEM SHARE MOVE (produit, en EUROS vs l'attendu du jour — v2 23/08)
-- 23/08 : le grain PRODUIT — ce que la famille ne voit pas. « Quel produit a
-- decroche hier ? » (rupture, placement) / « lequel monte ? ». Lit le flag de
-- fct_client_item_signals_daily ; items QUOTIDIENS seulement (>= 90 % des jours),
-- un tir par site et par jour : le produit au |z| le plus fort. Le mouvement de
-- PRIX propre (is_price_move) est expose par le mart mais PAS carde : sur la
-- seule donnee disponible un libelle couvre plusieurs tailles, le signal suit
-- le mix, pas un tarif.
-- ============================================================

item_share_move as (
    select
        date,
        location_id,
        'item_share_move' as action_type,
        case when abs(delta_z) >= 4 then 3 else 2 end as action_priority,
        'performance' as action_category,
        'note_interne' as channel_hint,
        concat(item_description, ' : ', cast(round(revenue) as string), ' EUR contre ', cast(round(expected_item_revenue) as string),
               ' EUR attendus le ', format_date('%d/%m', date)) as headline_fr,
        concat(item_description, ' (', item_category, ') a fait ', cast(round(revenue) as string), ' EUR contre ',
               cast(round(expected_item_revenue) as string), ' EUR attendus (', case when delta_eur >= 0 then '+' else '' end,
               cast(round(delta_eur) as string), ' EUR), sur une journee a ', case when day_gap_eur >= 0 then '+' else '' end,
               cast(round(day_gap_eur) as string), ' EUR. ',
               case when direction_eur = 'collapse' then 'Produit qui a manque.' else 'Produit qui a porte la journee.' end) as detail_fr,
        to_json_string(struct(
            item_description,
            item_category,
            round(revenue) as item_revenue,
            round(expected_item_revenue) as expected_item_revenue,
            round(delta_eur) as delta_eur,
            delta_z,
            direction_eur as direction,
            round(day_revenue) as day_revenue,
            round(expected_day_revenue) as expected_day_revenue,
            round(day_gap_eur) as day_gap_eur,
            revenue_share,
            baseline_share,
            units,
            unit_price,
            days_sold,
            n_occurrences_60d,
            cast(first_occurrence_date as string) as first_occurrence_date
        )) as data_payload,
        concat('item_share_move:', location_id, ':', cast(date as string)) as suppression_key,
        date as expires_at
    from (
        select
            s.transaction_date as date, s.location_id, s.item_description, s.item_category, s.revenue, s.expected_item_revenue,
            s.delta_eur, s.delta_z, s.direction_eur, t.day_revenue, s.expected_day_revenue, s.day_gap_eur,
            s.revenue_share, s.baseline_share, s.units, s.unit_price, s.days_sold,
            s.n_occurrences_60d, s.first_occurrence_date,
            row_number() over (partition by s.location_id, s.transaction_date order by abs(s.delta_eur) desc) as rn
        from {{ ref('fct_client_item_signals_daily') }} s
        inner join loc l on s.location_id = l.location_id
        inner join (select location_id, transaction_date, sum(revenue) as day_revenue
                    from {{ ref('fct_client_item_signals_daily') }} where is_dead_item = false group by 1, 2) t
          on t.location_id = s.location_id and t.transaction_date = s.transaction_date
        where s.is_eur_move = true
          and s.transaction_date >= date_sub(current_date(), interval 30 day)
          and s.transaction_date < current_date()
    )
    where rn = 1
),


-- ============================================================
-- ACTION TYPE: HOUR SHARE MOVE (heure, en EUROS vs l'attendu du jour)
-- 23/08 v2 (owner : bascule part -> euros). Lit fct_client_hourly_signals_daily v2 :
-- delta_eur = CA de l'heure - (part typique de l'heure ce jour de semaine x CA attendu
-- du jour par le moteur). Les ecarts horaires s'additionnent au verdict du jour ;
-- une heure sans vente compte 0 EUR (squelette du jour de semaine). Un tir par site
-- et par jour : l'heure au plus grand |delta_eur|. Dates passees seulement.
-- ============================================================

hour_share_move as (
    select
        date,
        location_id,
        'hour_share_move' as action_type,
        case when abs(delta_z) >= 3.5 then 3 else 2 end as action_priority,
        'performance' as action_category,
        'note_interne' as channel_hint,
        concat(cast(transaction_hour as string), ' h : ', cast(round(revenue) as string), ' EUR contre ',
               cast(round(expected_hour_revenue) as string), ' EUR attendus le ', format_date('%d/%m', date)) as headline_fr,
        concat('La tranche ', cast(transaction_hour as string), ' h a fait ', cast(round(revenue) as string), ' EUR contre ',
               cast(round(expected_hour_revenue) as string), ' EUR attendus (', case when delta_eur >= 0 then '+' else '' end,
               cast(round(delta_eur) as string), ' EUR), sur une journee a ', case when day_gap_eur >= 0 then '+' else '' end,
               cast(round(day_gap_eur) as string), ' EUR. ',
               case when direction = 'collapse' then 'Heure qui a manque.' else 'Heure qui a porte la journee.' end) as detail_fr,
        to_json_string(struct(
            transaction_hour,
            round(revenue) as hour_revenue,
            round(expected_hour_revenue) as expected_hour_revenue,
            round(delta_eur) as delta_eur,
            delta_z,
            direction,
            round(day_revenue) as day_revenue,
            round(expected_day_revenue) as expected_day_revenue,
            round(day_gap_eur) as day_gap_eur,
            typical_share,
            transactions as hour_transactions,
            n_occurrences_60d,
            cast(first_occurrence_date as string) as first_occurrence_date
        )) as data_payload,
        concat('hour_share_move:', location_id, ':', cast(date as string)) as suppression_key,
        date as expires_at
    from (
        select
            s.transaction_date as date, s.location_id, s.transaction_hour, s.revenue, s.expected_hour_revenue,
            s.delta_eur, s.delta_z, s.direction, s.day_revenue, s.expected_day_revenue, s.day_gap_eur, s.typical_share, s.transactions,
            s.n_occurrences_60d, s.first_occurrence_date,
            row_number() over (partition by s.location_id, s.transaction_date order by abs(s.delta_eur) desc) as rn
        from {{ ref('fct_client_hourly_signals_daily') }} s
        inner join loc l on s.location_id = l.location_id
        where s.is_hour_move = true
          and s.transaction_date >= date_sub(current_date(), interval 30 day)
          and s.transaction_date < current_date()
    )
    where rn = 1
),

sales_discount_no_lift as (
    select
        s.transaction_date as date,
        s.location_id,
        'sales_discount_no_lift' as action_type,
        case when s.discount_robust_z >= 2.5 then 4 else 3 end as action_priority,
        'performance' as action_category,
        'note_interne' as channel_hint,
        concat('Remises anormalement hautes sans effet sur le CA le ', format_date('%d/%m', s.transaction_date)) as headline_fr,
        concat(
            'Intensite de remise ',
            cast(round(s.discount_robust_z, 1) as string),
            ' ecarts-types au-dessus de l habituel (',
            cast(round(s.discount_rate * 100, 1) as string),
            '% du CA en remises) sans que le CA suive (reste dans sa moyenne). ',
            'Les remises ne tirent pas le CA : reexaminez le ciblage et le niveau de promotion.'
        ) as detail_fr,
        to_json_string(struct(
            round(s.discount_rate, 4) as discount_rate,
            round(s.discount_rate_delta_pct, 1) as discount_rate_delta_pct,
            round(s.discount_robust_z, 2) as discount_robust_z,
            round(s.revenue_vs_30d_avg_pct, 1) as revenue_vs_30d_avg_pct,
            s.daily_discount_total,
            s.daily_promo_line_count,
            s.daily_revenue,
            round(s.revenue_30d_avg, 0) as avg_30d,
            s.primary_revenue_driver,
            case when s.discount_robust_z >= 2.5 then 'probable' else 'possible' end as confidence_tier
        )) as data_payload,
        concat('sales_discount_no_lift:', s.location_id, ':', cast(s.transaction_date as string)) as suppression_key,
        s.transaction_date as expires_at
    from {{ ref('fct_client_sales_signals_daily') }} s
    inner join loc l on s.location_id = l.location_id
    where s.is_discount_without_lift = true
      and s.transaction_date >= date_sub(current_date(), interval 30 day)
),

-- ============================================================
-- ACTION TYPE: SALES REVENUE DOWN (dow noise band + driver + confidence)
-- Fires when revenue is anomalously LOW vs the same weekday's
-- trailing distribution (robust-z <= -band). Replaces the single
-- same-weekday-last-week day-pair trigger. Driver from the honest
-- transactions x basket (or footfall x conversion x basket)
-- decomposition; never 'mixed'.
-- ============================================================

sales_revenue_down_wow as (
    select
        s.transaction_date as date,
        s.location_id,
        'sales_revenue_down_wow' as action_type,
        case when res.residual_z <= -2.5 then 4 else 3 end as action_priority,
        'performance' as action_category,
        'note_interne' as channel_hint,
        concat('CA sous son niveau attendu le ', format_date('%d/%m', s.transaction_date)) as headline_fr,
        concat(
            'CA ', cast(round(s.daily_revenue, 0) as string), ' EUR le ',
            format_date('%A %d/%m', s.transaction_date), ', ',
            cast(round(abs(res.residual_pct), 0) as string), '% sous l attendu pour ce jour (attendu ',
            cast(round(res.expected_revenue, 0) as string), ' EUR compte tenu de vos conditions : jour, meteo, calendrier), soit ',
            cast(round(abs(res.residual_z), 1) as string), ' ecarts-types. ',
            case s.primary_revenue_driver
                when 'transactions' then 'Cause dominante : moins de ventes (tickets) - agissez sur la frequentation.'
                when 'footfall' then 'Cause dominante : moins de trafic - agissez sur la frequentation.'
                when 'basket' then 'Cause dominante : panier moyen plus faible - agissez sur le panier et le mix produit.'
                when 'conversion' then 'Cause dominante : conversion plus faible - agissez sur le parcours d achat.'
                else concat('Deux facteurs : ventes ',
                    case when s.transactions_delta_pct >= 0 then '+' else '' end,
                    cast(round(s.transactions_delta_pct, 0) as string), '%, panier ',
                    case when s.basket_delta_pct >= 0 then '+' else '' end,
                    cast(round(s.basket_delta_pct, 0) as string), '% vs habitude.')
            end
        ) as detail_fr,
        to_json_string(struct(
            s.daily_revenue,
            round(res.expected_revenue, 0) as expected_revenue,
            round(res.residual_pct, 1) as residual_pct,
            round(res.residual_z, 2) as residual_z,
            s.primary_revenue_driver,
            round(s.transactions_delta_pct, 1) as transactions_delta_pct,
            round(s.basket_delta_pct, 1) as basket_delta_pct,
            round(s.footfall_delta_pct, 1) as footfall_delta_pct,
            round(s.conversion_delta_pct, 1) as conversion_delta_pct,
            round(s.revenue_30d_avg, 0) as avg_30d,
            round(s.revenue_vs_30d_avg_pct, 1) as revenue_vs_avg_pct,
            round(s.revenue_robust_z, 2) as revenue_robust_z,
            round(s.revenue_vs_last_week_pct, 1) as revenue_vs_last_week_pct,
            case when res.residual_z <= -2.5 then 'probable' else 'possible' end as confidence_tier
        )) as data_payload,
        concat('sales_revenue_down_wow:', s.location_id, ':', cast(s.transaction_date as string)) as suppression_key,
        s.transaction_date as expires_at
    from {{ ref('fct_client_sales_signals_daily') }} s
    inner join loc l on s.location_id = l.location_id
    inner join {{ ref('fct_client_day_residual') }} res
        on res.location_id = s.location_id and res.date = s.transaction_date
    where res.is_revenue_down_residual = true
      and s.transaction_date >= date_sub(current_date(), interval 30 day)
),

-- ============================================================
-- ACTION TYPE S-NEW: COMPETITOR POSITIONING GAP
-- Fires when a followed competitor has enriched offering data
-- that reveals positioning/pricing the client doesn't cover.
-- Grain: fires once per location per day (suppressed by key).
-- ============================================================

competitor_positioning_gap as (
    select
        current_date() as date,
        o.location_id,
        'competitor_positioning_gap' as action_type,
        case
            when o.enriched_competitor_count >= 3 then 3
            else 2
        end as action_priority,
        'intelligence' as action_category,
        'note_interne' as channel_hint,
        concat(
            cast(o.enriched_competitor_count as string),
            ' concurrent(s) avec offre analysee - ecarts detectes'
        ) as headline_fr,
        concat(
            cast(o.enriched_competitor_count as string),
            ' concurrent(s) suivi(s) disposent d une offre enrichie. ',
            'Top produit : ', coalesce(o.top_item_description, '—'),
            ' (', cast(round(coalesce(o.top_item_revenue_share, 0) * 100, 0) as string),
            '% de votre CA). ',
            'Verifiez le positionnement concurrent et identifiez les ecarts.'
        ) as detail_fr,
        to_json_string(struct(
            o.location_id,
            o.enriched_competitor_count,
            o.watched_competitor_count,
            o.top_item_description,
            round(o.top_item_revenue_share, 2) as top_item_revenue_share,
            o.total_items as client_product_count
        )) as data_payload,
        concat('competitor_gap:', o.location_id, ':', format_date('%Y-%W', current_date())) as suppression_key,
        date_add(current_date(), interval 7 day) as expires_at
    from (
        select
            op.location_id,
            count(distinct case when cd.auto_enriched_description is not null then wc.competitor_id end) as enriched_competitor_count,
            count(distinct wc.competitor_id) as watched_competitor_count,
            count(distinct op.item_description) as total_items,
            max(case when op.revenue_rank = 1 then op.item_description end) as top_item_description,
            max(case when op.revenue_rank = 1 then op.revenue_share end) as top_item_revenue_share
        from {{ ref('fct_client_offering_profile') }} op
        left join {{ source('raw_crawl', 'watched_competitors') }} wc
            on op.location_id = wc.location_id
           and wc.deleted_at is null
        left join {{ ref('fct_competitor_directory') }} cd
            on wc.competitor_id = cd.competitor_id
           and cd.auto_enriched_description is not null
        group by op.location_id
    ) o
    where o.enriched_competitor_count >= 1
),

-- ============================================================
-- ACTION TYPE: COMPETITOR OFFERING CHANGES
-- Price moves, new offerings, and removed offerings detected
-- between a followed competitor's two most recent crawls.
-- Source: int_competitor_offering_changes (competitor x item x change).
-- Fan-out: watched_competitors maps competitor_id -> following location_id.
-- One card per (location, competitor, item) change. change_type ->
-- action_type: new_offering -> competitor_new_offering (reuses card #31),
-- price_increase/price_decrease/removed_offering -> new types.
-- ============================================================

competitor_offering_changes as (
    select
        current_date() as date,
        f.location_id,
        case oc.change_type
            when 'new_offering'     then 'competitor_new_offering'
            when 'price_increase'   then 'competitor_price_increase'
            when 'price_decrease'   then 'competitor_price_drop'
            when 'removed_offering' then 'competitor_offering_removed'
        end as action_type,
        case oc.change_type
            when 'new_offering'     then 3
            when 'price_decrease'   then 3
            when 'price_increase'   then 2
            when 'removed_offering' then 2
        end as action_priority,
        case oc.change_type
            when 'new_offering'     then 'competition'
            when 'price_decrease'   then 'competition'
            else 'intelligence'
        end as action_category,
        case oc.change_type
            when 'new_offering'     then 'slack'
            when 'price_decrease'   then 'slack'
            else 'note_interne'
        end as channel_hint,
        case oc.change_type
            when 'new_offering' then concat(
                'Nouvelle offre chez ', coalesce(cd.competitor_name, 'un concurrent'),
                ' : ', coalesce(oc.item, 'offre detectee'))
            when 'price_increase' then concat(
                coalesce(cd.competitor_name, 'Un concurrent'), ' augmente : ',
                coalesce(oc.item, 'une offre'),
                case when oc.price_pct_change is not null
                     then concat(' (+', cast(oc.price_pct_change as string), '%)') else '' end)
            when 'price_decrease' then concat(
                coalesce(cd.competitor_name, 'Un concurrent'), ' baisse : ',
                coalesce(oc.item, 'une offre'),
                case when oc.price_pct_change is not null
                     then concat(' (', cast(oc.price_pct_change as string), '%)') else '' end)
            when 'removed_offering' then concat(
                coalesce(cd.competitor_name, 'Un concurrent'), ' retire : ',
                coalesce(oc.item, 'une offre'))
        end as headline_fr,
        case oc.change_type
            when 'new_offering' then concat(
                coalesce(cd.competitor_name, 'Un concurrent suivi'),
                ' propose une nouvelle offre : ', coalesce(oc.item, '(non precise)'),
                case when oc.new_price_raw is not null then concat(' a ', oc.new_price_raw) else '' end,
                case when oc.category is not null then concat(' (categorie : ', oc.category, ')') else '' end,
                ', le ', format_date('%d/%m', oc.change_first_seen_on),
                '. Verifiez son positionnement et ajustez votre offre si pertinent.')
            when 'price_increase' then concat(
                coalesce(cd.competitor_name, 'Un concurrent suivi'),
                ' a augmente le prix de ', coalesce(oc.item, 'une offre'), ' : ',
                coalesce(oc.old_price_raw, '?'), ' -> ', coalesce(oc.new_price_raw, '?'),
                case when oc.price_pct_change is not null
                     then concat(' (+', cast(oc.price_pct_change as string), '%)') else '' end,
                ' le ', format_date('%d/%m', oc.change_first_seen_on),
                '. Vous disposez peut-etre d une marge de repositionnement tarifaire.')
            when 'price_decrease' then concat(
                coalesce(cd.competitor_name, 'Un concurrent suivi'),
                ' a baisse le prix de ', coalesce(oc.item, 'une offre'), ' : ',
                coalesce(oc.old_price_raw, '?'), ' -> ', coalesce(oc.new_price_raw, '?'),
                case when oc.price_pct_change is not null
                     then concat(' (', cast(oc.price_pct_change as string), '%)') else '' end,
                ' le ', format_date('%d/%m', oc.change_first_seen_on),
                '. Pression tarifaire : verifiez votre competitivite sur cette offre.')
            when 'removed_offering' then concat(
                coalesce(cd.competitor_name, 'Un concurrent suivi'),
                ' ne propose plus : ', coalesce(oc.item, 'une offre'),
                case when oc.old_price_raw is not null then concat(' (anciennement ', oc.old_price_raw, ')') else '' end,
                ', depuis le ', format_date('%d/%m', oc.change_first_seen_on),
                '. Opportunite de capter cette demande.')
        end as detail_fr,
        to_json_string(struct(
            oc.competitor_id,
            cd.competitor_name,
            oc.change_type,
            oc.category,
            oc.item,
            oc.old_price_raw,
            oc.new_price_raw,
            oc.old_price_numeric,
            oc.new_price_numeric,
            oc.price_difference,
            oc.price_pct_change,
            oc.currency,
            oc.unit,
            oc.source_url,
            oc.tarifs_url,
            cast(oc.change_first_seen_on as string) as detected_date,
            cd.google_rating,
            cd.google_rating_count,
            tp.threat_level as entity_threat_level,
            round(tp.audience_overlap_pct, 2) as audience_overlap_pct,
            tp.industry_match_tier as entity_threat_industry_tier,
            round(tp.distance_km, 1) as entity_threat_distance_km
        )) as data_payload,
        -- 24/08 (récit des cartes, nature 3) : clé STABLE = la date du FAIT (premier crawl ou le
        -- nouvel etat apparait, change_first_seen_on du modele intermediaire), plus current_date(). Avant : « MesRideaux a baissé Coussin… »
        -- réapparaissait 30 jours de suite comme carte du jour, avec une clé neuve chaque matin
        -- — « Action menée » ne la supprimait qu'un jour, et la pastille « nouveau » (23/08)
        -- aurait menti quotidiennement. Un NOUVEAU changement sur le même article = une
        -- nouvelle date de crawl = une nouvelle carte, à raison.
        concat(
            'competitor_offering_', oc.change_type, ':',
            f.location_id, ':', oc.competitor_id, ':', oc.item_norm, ':',
            cast(oc.change_first_seen_on as string)
        ) as suppression_key,
        current_date() as expires_at
    from {{ ref('int_competitor_offering_changes') }} oc
    inner join (
        select distinct location_id, competitor_id
        from {{ source('raw_crawl', 'watched_competitors') }}
        where deleted_at is null
    ) f
        on oc.competitor_id = f.competitor_id
    inner join loc l
        on f.location_id = l.location_id
    left join {{ ref('fct_competitor_directory') }} cd
        on oc.competitor_id = cd.competitor_id
    left join {{ ref('fct_competitor_threat_profile') }} tp
        on f.location_id = tp.location_id
       and oc.competitor_id = tp.competitor_id
    where oc.change_type in ('new_offering', 'price_increase', 'price_decrease', 'removed_offering')
),

-- ============================================================
-- COMPETITOR POSITIONING BRIEF
-- One card per followed competitor that has a cached AI
-- positioning analysis (competitive_analysis_json). Weekly.
-- Competitor-side only — does NOT read client sales data
-- (that stays with #41 competitor_positioning_gap).
-- ============================================================

competitor_positioning_brief as (
    select
        current_date() as date,
        f.location_id,
        'competitor_positioning_brief' as action_type,
        2 as action_priority,
        'intelligence' as action_category,
        'note_interne' as channel_hint,
        concat('Analyse concurrentielle : ', coalesce(cd.competitor_name, 'concurrent suivi')) as headline_fr,
        concat('Positionnement et ecarts detectes face a ', coalesce(cd.competitor_name, 'ce concurrent'), '.') as detail_fr,
        to_json_string(struct(
            cd.competitor_id,
            cd.competitor_name,
            cd.competitive_analysis_json,
            cd.auto_enriched_description as competitor_enriched_description,
            cd.google_rating,
            cd.google_rating_count,
            tp.threat_level          as entity_threat_level,
            round(tp.audience_overlap_pct, 2) as audience_overlap_pct,
            round(tp.distance_km, 1) as entity_threat_distance_km
        )) as data_payload,
        concat('competitor_positioning_brief:', f.location_id, ':', cd.competitor_id, ':', format_date('%Y-%W', current_date())) as suppression_key,
        date_add(current_date(), interval 7 day) as expires_at
    from (
        select distinct location_id, competitor_id
        from {{ source('raw_crawl', 'watched_competitors') }}
        where deleted_at is null
    ) f
    inner join loc l
        on f.location_id = l.location_id
    inner join {{ ref('fct_competitor_directory') }} cd
        on f.competitor_id = cd.competitor_id
       and cd.competitive_analysis_json is not null
    left join {{ ref('fct_competitor_threat_profile') }} tp
        on f.location_id = tp.location_id
       and f.competitor_id = cd.competitor_id
),

-- ============================================================
-- COMPETITOR REPUTATION STRENGTH
-- Standing signal: a followed competitor with a strong public
-- rating. Fires immediately (no crawl history needed). Weekly.
-- ============================================================

competitor_reputation_strength as (
    select
        current_date() as date,
        f.location_id,
        'competitor_reputation_strength' as action_type,
        2 as action_priority,
        'intelligence' as action_category,
        'note_interne' as channel_hint,
        concat('Reputation concurrente : ', coalesce(cd.competitor_name, 'concurrent suivi')) as headline_fr,
        concat(coalesce(cd.competitor_name, 'Un concurrent suivi'),
               ' affiche une reputation solide : ', cast(round(cd.google_rating, 1) as string),
               '/5 sur ', cast(cd.google_rating_count as string), ' avis.') as detail_fr,
        to_json_string(struct(
            cd.competitor_id,
            cd.competitor_name,
            cd.google_rating,
            cd.google_rating_count,
            tp.threat_level          as entity_threat_level,
            round(tp.audience_overlap_pct, 2) as audience_overlap_pct,
            round(tp.distance_km, 1) as entity_threat_distance_km,
            tp.location_primary_audience_1,
            tp.location_primary_audience_2,
            tp.competitor_primary_audience,
            tp.competitor_secondary_audience
        )) as data_payload,
        concat('competitor_reputation_strength:', f.location_id, ':', cd.competitor_id, ':', format_date('%Y-%W', current_date())) as suppression_key,
        date_add(current_date(), interval 7 day) as expires_at
    from (
        select distinct location_id, competitor_id
        from {{ source('raw_crawl', 'watched_competitors') }}
        where deleted_at is null
    ) f
    inner join loc l
        on f.location_id = l.location_id
    inner join {{ ref('fct_competitor_directory') }} cd
        on f.competitor_id = cd.competitor_id
       and cd.google_rating is not null
       and cd.google_rating >= 4.0
       and cd.google_rating_count >= 10
    inner join {{ ref('fct_competitor_threat_profile') }} tp
        on f.location_id = tp.location_id
       and f.competitor_id = tp.competitor_id
       -- 23/08 : au moins un public commun (Jaccard 0/33/50/100 — « >= 40 » separait le meme public)
       and tp.audience_overlap_pct > 0
),

-- ============================================================
-- COMPETITOR REPRICING EVENT
-- Compound: a competitor changed >= 2 prices in one crawl =
-- strategic repositioning. Fires once crawl history exists.
-- ============================================================

competitor_repricing_event as (
    select
        current_date() as date,
        agg.location_id,
        'competitor_repricing_event' as action_type,
        3 as action_priority,
        'competition' as action_category,
        'slack' as channel_hint,
        concat(coalesce(cd.competitor_name, 'Un concurrent'),
               ' repositionne ', cast(agg.price_change_count as string), ' tarifs') as headline_fr,
        concat(coalesce(cd.competitor_name, 'Un concurrent suivi'),
               ' a modifie ', cast(agg.price_change_count as string), ' prix simultanement (',
               cast(agg.increase_count as string), ' hausse(s), ',
               cast(agg.decrease_count as string), ' baisse(s)).',
               ' Mouvement tarifaire strategique a analyser.') as detail_fr,
        to_json_string(struct(
            agg.competitor_id,
            cd.competitor_name,
            agg.price_change_count,
            agg.increase_count,
            agg.decrease_count,
            agg.items_changed,
            cast(agg.detected_date as string) as detected_date,
            cd.google_rating,
            cd.google_rating_count,
            tp.threat_level          as entity_threat_level,
            round(tp.audience_overlap_pct, 2) as audience_overlap_pct,
            round(tp.distance_km, 1) as entity_threat_distance_km
        )) as data_payload,
        -- 24/08 : même clé stable que les mouvements unitaires — la date du crawl du fait.
        concat('competitor_repricing_event:', agg.location_id, ':', agg.competitor_id, ':', cast(agg.detected_date as string)) as suppression_key,
        current_date() as expires_at
    from (
        select
            f.location_id,
            oc.competitor_id,
            count(*) as price_change_count,
            countif(oc.change_type = 'price_increase') as increase_count,
            countif(oc.change_type = 'price_decrease') as decrease_count,
            string_agg(oc.item, ', ') as items_changed,
            max(oc.change_first_seen_on) as detected_date
        from {{ ref('int_competitor_offering_changes') }} oc
        inner join (
            select distinct location_id, competitor_id
            from {{ source('raw_crawl', 'watched_competitors') }}
            where deleted_at is null
        ) f
            on oc.competitor_id = f.competitor_id
        where oc.change_type in ('price_increase', 'price_decrease')
        group by f.location_id, oc.competitor_id
        having count(*) >= 2
    ) agg
    inner join loc l
        on agg.location_id = l.location_id
    left join {{ ref('fct_competitor_directory') }} cd
        on agg.competitor_id = cd.competitor_id
    left join {{ ref('fct_competitor_threat_profile') }} tp
        on agg.location_id = tp.location_id
       and agg.competitor_id = tp.competitor_id
),

-- ============================================================
-- ACTION TYPE: PROVEN ACTION REPLICATION (learning-driven advice)
-- Reads fct_location_action_learning (mart, mart-reads-mart). Once
-- per location per week, surfaces the action_type whose published
-- days were most associated with revenue above baseline. Fires only
-- when is_proven_lift = true. Association, not causation.
-- ============================================================

action_learning_advice as (
    select
        current_date() as date,
        a.location_id,
        'proven_action_replication' as action_type,
        case when a.avg_revenue_delta_vs_baseline_pct >= 15 then 3 else 2 end as action_priority,
        'intelligence' as action_category,
        'note_interne' as channel_hint,
        concat(
            'A reproduire : une action a accompagne +',
            cast(round(a.avg_revenue_delta_vs_baseline_pct, 0) as string),
            '% de CA en moyenne'
        ) as headline_fr,
        concat(
            'Sur les ', cast(a.window_days as string),
            ' derniers jours, le CA etait en moyenne +',
            cast(round(a.avg_revenue_delta_vs_baseline_pct, 0) as string),
            '% vs reference les jours ou ce type d action a ete publie (',
            cast(a.measurable_count as string), ' publication(s), ',
            cast(a.positive_count as string), ' au-dessus de la reference). ',
            'Association a reproduire et mesurer, pas une garantie.'
        ) as detail_fr,
        to_json_string(struct(
            a.action_type as learned_action_type,
            round(a.avg_revenue_delta_vs_baseline_pct, 1) as avg_revenue_delta_pct,
            round(a.median_revenue_delta_vs_baseline_pct, 1) as median_revenue_delta_pct,
            round(a.positive_rate, 2) as positive_rate,
            a.measurable_count,
            a.publish_count,
            a.window_days,
            a.proven_action_count,
            a.last_published_date,
            round(a.avg_post_views, 0) as avg_post_views,
            round(a.avg_post_clicks, 0) as avg_post_clicks
        )) as data_payload,
        concat('proven_action_replication:', a.location_id, ':', format_date('%Y-%W', current_date())) as suppression_key,
        date_add(current_date(), interval 7 day) as expires_at
    from (
        select
            al.*,
            count(*) over (partition by al.location_id) as proven_action_count,
            row_number() over (partition by al.location_id order by al.avg_revenue_delta_vs_baseline_pct desc) as rn
        from {{ ref('fct_location_action_learning') }} al
        where al.is_proven_lift = true
    ) a
    inner join loc l on a.location_id = l.location_id
    where a.rn = 1
),

-- Multi-factor conditions combining weather, competition,
-- calendar, tourism, mobility, and foot traffic signals.
-- ============================================================

-- C2: WEATHER + LOW COMP OPPORTUNITY
weather_comp_opportunity as (
    select
        d.date, d.location_id,
        'weather_comp_opportunity' as action_type,
        3 as action_priority,
        'opportunity' as action_category,
        'gbp' as channel_hint,
        'Beau temps et faible concurrence' as headline_fr,
        'Meteo favorable et pression concurrentielle faible.' as detail_fr,
        to_json_string(struct(
            d.alert_level_max as weather_alert,
            round(d.pressure_ratio, 2) as pressure_ratio,
            d.events_within_5km_count as events_5km,
            d.opportunity_score_final_local as score
        )) as data_payload,
        concat('weather_comp_opp:', d.location_id, ':', cast(d.date as string)) as suppression_key,
        d.date as expires_at
    from daily_state d
    where d.date >= current_date()
      and d.date <= date_add(current_date(), interval 3 day)
      and d.alert_level_max = 0
      and d.pressure_ratio < 0.7
      and d.has_valid_baseline_flag = true
),

-- C4: HOLIDAY + HIGH COMPETITION
holiday_high_comp as (
    select
        d.date, d.location_id,
        'holiday_high_comp' as action_type,
        3 as action_priority,
        'competition' as action_category,
        'gbp' as channel_hint,
        'Jour ferie mais concurrence elevee' as headline_fr,
        'Jour ferie avec pression concurrentielle elevee.' as detail_fr,
        to_json_string(struct(
            d.is_public_holiday_flag as is_holiday,
            round(d.pressure_ratio, 2) as pressure_ratio,
            d.events_within_5km_count as events_5km
        )) as data_payload,
        concat('holiday_high_comp:', d.location_id, ':', cast(d.date as string)) as suppression_key,
        d.date as expires_at
    from daily_state d
    where d.date >= current_date()
      and d.date <= date_add(current_date(), interval 3 day)
      and d.is_public_holiday_flag = true
      and d.pressure_ratio > 1.3
      and d.has_valid_baseline_flag = true
),

-- C5: BEST DAY OF WEEK (today only, rank 1, high score)
best_day_of_week as (
    select
        d.date, d.location_id,
        'best_day_of_week' as action_type,
        4 as action_priority,
        'opportunity' as action_category,
        'gbp' as channel_hint,
        'Meilleur jour de la semaine — agissez' as headline_fr,
        'Ce jour est le meilleur de la semaine.' as detail_fr,
        to_json_string(struct(
            d.opportunity_score_final_local as score,
            d.opportunity_regime as regime,
            d.best_day_rank as rank,
            d.alert_level_max as weather_alert,
            d.events_within_5km_count as events_5km
        )) as data_payload,
        concat('best_day_week:', d.location_id, ':', cast(d.date as string)) as suppression_key,
        d.date as expires_at
    from daily_state d
    where d.date = current_date()
      and d.best_day_rank = 1
      and d.opportunity_score_final_local >= 70
),

-- C6: DAY OPPORTUNITY (regime A + high score)
day_opportunity as (
    select
        d.date, d.location_id,
        'day_opportunity' as action_type,
        3 as action_priority,
        'opportunity' as action_category,
        'gbp' as channel_hint,
        'Journee tres favorable — regime A' as headline_fr,
        'Regime A avec score eleve.' as detail_fr,
        to_json_string(struct(
            d.opportunity_score_final_local as score,
            d.opportunity_regime as regime,
            d.alert_level_max as weather_alert,
            round(d.pressure_ratio, 2) as pressure_ratio
        )) as data_payload,
        concat('day_opportunity:', d.location_id, ':', cast(d.date as string)) as suppression_key,
        d.date as expires_at
    from daily_state d
    where d.date >= current_date()
      and d.date <= date_add(current_date(), interval 3 day)
      and d.opportunity_regime = 'A'
      and d.opportunity_score_final_local >= 70
),

-- C7: SAME BUCKET SATURATION
same_bucket_saturation as (
    select
        d.date, d.location_id,
        'same_bucket_saturation' as action_type,
        3 as action_priority,
        'competition' as action_category,
        'internal' as channel_hint,
        'Saturation sectorielle' as headline_fr,
        'Plus de 25% des evenements a 5km sont dans votre secteur.' as detail_fr,
        to_json_string(struct(
            round(d.pct_same_bucket_5km * 100, 1) as pct_same_sector,
            d.events_within_5km_count as events_5km,
            round(d.pressure_ratio, 2) as pressure_ratio
        )) as data_payload,
        concat('same_bucket_sat:', d.location_id, ':', cast(d.date as string)) as suppression_key,
        d.date as expires_at
    from daily_state d
    where d.date >= current_date()
      and d.date <= date_add(current_date(), interval 3 day)
      and d.pct_same_bucket_5km > 0.25
      and d.events_within_5km_count >= 5
),

-- C8: WEEKEND + VACATION + LOW COMPETITION
weekend_vacation_low_comp as (
    select
        d.date, d.location_id,
        'weekend_vacation_low_comp' as action_type,
        4 as action_priority,
        'opportunity' as action_category,
        'gbp' as channel_hint,
        'Week-end en vacances — faible concurrence' as headline_fr,
        'Week-end de vacances avec peu de concurrence.' as detail_fr,
        to_json_string(struct(
            d.is_weekend_flag as is_weekend,
            d.is_school_holiday_flag as is_vacation,
            round(d.pressure_ratio, 2) as pressure_ratio,
            d.events_within_5km_count as events_5km,
            d.opportunity_score_final_local as score
        )) as data_payload,
        concat('wknd_vac_low:', d.location_id, ':', cast(d.date as string)) as suppression_key,
        d.date as expires_at
    from daily_state d
    where d.date >= current_date()
      and d.date <= date_add(current_date(), interval 5 day)
      and d.is_weekend_flag = true
      and d.is_school_holiday_flag = true
      and d.pressure_ratio < 0.8
      and d.has_valid_baseline_flag = true
),

-- C9: COMMERCIAL EVENT MATCH
commercial_event_match as (
    select
        d.date, d.location_id,
        'commercial_event_match' as action_type,
        3 as action_priority,
        'calendar' as action_category,
        'gbp' as channel_hint,
        'Temps fort commercial — activez vos operations' as headline_fr,
        'Evenement commercial en cours dans votre region.' as detail_fr,
        to_json_string(struct(
            a.is_commercial_event_flag as is_commercial,
            (select ce.event_name from unnest(a.commercial_events) ce limit 1) as commercial_event_name,
            (select ce.event_code from unnest(a.commercial_events) ce limit 1) as commercial_event_code,
            d.opportunity_score_final_local as score,
            d.events_within_5km_count as events_5km,
            round(d.pressure_ratio, 2) as pressure_ratio
        )) as data_payload,
        concat('commercial_match:', d.location_id, ':', cast(d.date as string)) as suppression_key,
        d.date as expires_at
    from daily_state d
    inner join annotations a on d.date = a.date and d.region_id = a.region_id
    where d.date >= current_date()
      and d.date <= date_add(current_date(), interval 3 day)
      and a.is_commercial_event_flag = true
),

-- C10: WEATHER WINDOW AFTER BAD (uses weather_consecutive already defined)
weather_window_after_bad as (
    select
        wc.date, wc.location_id,
        'weather_window_after_bad' as action_type,
        3 as action_priority,
        'weather' as action_category,
        'gbp' as channel_hint,
        'Amelioration meteo apres periode degradee' as headline_fr,
        'Retour au beau apres 2+ jours de mauvais temps.' as detail_fr,
        to_json_string(struct(
            wc.alert_level_max as today_alert,
            coalesce(bs.consecutive_bad_days, 0) as preceding_bad_days,
            l.weather_sensitivity as site_sensitivity
        )) as data_payload,
        concat('wx_window_bad:', wc.location_id, ':', cast(wc.date as string)) as suppression_key,
        wc.date as expires_at
    from weather_consecutive wc
    inner join loc l on wc.location_id = l.location_id
    inner join weather_yesterday wy on wc.location_id = wy.location_id
    left join bad_wx_streak bs on bs.location_id = wc.location_id and bs.date = date_sub(wc.date, interval 1 day)
    where wc.alert_level_max <= 1
      and wy.alert_level_max >= 2
      and wc.date = current_date()
),

-- C20: MOBILITY + COMPETITION SQUEEZE
mobility_comp_squeeze as (
    select
        d.date, d.location_id,
        'mobility_comp_squeeze' as action_type,
        4 as action_priority,
        'competition' as action_category,
        'internal' as channel_hint,
        'Mobilite perturbee + concurrence elevee' as headline_fr,
        'Acces difficile et pression concurrentielle elevee.' as detail_fr,
        to_json_string(struct(
            (d.delta_att_mobility_pct < 0) as mobility_disrupted,
            round(d.delta_att_mobility_pct, 1) as mobility_delta_pct,
            round(d.pressure_ratio, 2) as pressure_ratio,
            d.events_within_5km_count as events_5km,
            mn.disruption_title, mn.transit_line, mn.transit_stop, mn.disruption_severity, mn.delay_minutes
        )) as data_payload,
        concat('mob_comp:', d.location_id, ':', cast(d.date as string)) as suppression_key,
        d.date as expires_at
    from daily_state d
    left join mobility_named mn on mn.location_id = d.location_id and mn.date = d.date
    where d.date >= current_date()
      and d.date <= date_add(current_date(), interval 3 day)
      and d.delta_att_mobility_pct < 0
      and d.pressure_ratio > 1.2
      and d.has_valid_baseline_flag = true
),

-- C21: FT PEAK + BAD WEATHER
ft_peak_bad_weather as (
    select
        d.date, d.location_id,
        'ft_peak_bad_weather' as action_type,
        3 as action_priority,
        'weather' as action_category,
        'internal' as channel_hint,
        'Jour de pointe mais meteo defavorable' as headline_fr,
        'Jour a forte frequentation habituelle mais conditions meteo degradees.' as detail_fr,
        to_json_string(struct(
            d.ft_day_rank_max as ft_rank,
            d.ft_peak_hour as ft_peak_hour,
            d.ft_peak_busyness_pct as ft_peak_busyness_pct,
            d.alert_level_max as weather_alert,
            d.opportunity_score_final_local as score
        )) as data_payload,
        concat('ft_peak_wx:', d.location_id, ':', cast(d.date as string)) as suppression_key,
        d.date as expires_at
    from daily_state d
    where d.date >= current_date()
      and d.date <= date_add(current_date(), interval 3 day)
      and d.ft_day_rank_max <= 2
      and d.alert_level_max >= 2
),

-- C22: FT QUIET + GOOD WEATHER + LOW COMP
ft_quiet_good_weather as (
    select
        d.date, d.location_id,
        'ft_quiet_good_weather' as action_type,
        3 as action_priority,
        'opportunity' as action_category,
        'gbp' as channel_hint,
        'Jour calme mais conditions favorables' as headline_fr,
        'Frequentation habituellement faible mais meteo et concurrence favorables.' as detail_fr,
        to_json_string(struct(
            d.ft_day_rank_max as ft_rank,
            d.ft_peak_hour as ft_peak_hour,
            d.ft_peak_busyness_pct as ft_peak_busyness_pct,
            d.alert_level_max as weather_alert,
            round(d.pressure_ratio, 2) as pressure_ratio,
            d.opportunity_score_final_local as score
        )) as data_payload,
        concat('ft_quiet_good:', d.location_id, ':', cast(d.date as string)) as suppression_key,
        d.date as expires_at
    from daily_state d
    where d.date >= current_date()
      and d.date <= date_add(current_date(), interval 3 day)
      and d.ft_day_rank_max >= 5
      and d.alert_level_max = 0
      and d.pressure_ratio < 0.8
      and d.has_valid_baseline_flag = true
),

-- C23: FT PEAK + SATURATED
ft_peak_saturated as (
    select
        d.date, d.location_id,
        'ft_peak_saturated' as action_type,
        3 as action_priority,
        'competition' as action_category,
        'internal' as channel_hint,
        'Jour de pointe sature' as headline_fr,
        'Jour a forte frequentation mais saturation sectorielle.' as detail_fr,
        to_json_string(struct(
            d.ft_day_rank_max as ft_rank,
            d.ft_peak_hour as ft_peak_hour,
            d.ft_peak_busyness_pct as ft_peak_busyness_pct,
            round(d.pressure_ratio, 2) as pressure_ratio,
            round(d.pct_same_bucket_5km * 100, 1) as pct_same_sector,
            d.events_within_5km_count as events_5km
        )) as data_payload,
        concat('ft_peak_sat:', d.location_id, ':', cast(d.date as string)) as suppression_key,
        d.date as expires_at
    from daily_state d
    where d.date >= current_date()
      and d.date <= date_add(current_date(), interval 3 day)
      and d.ft_day_rank_max <= 2
      and d.pressure_ratio > 1.3
      and d.pct_same_bucket_5km > 0.25
      and d.has_valid_baseline_flag = true
),

-- C24: FT PEAK + LOW COMP
ft_peak_low_comp as (
    select
        d.date, d.location_id,
        'ft_peak_low_comp' as action_type,
        4 as action_priority,
        'opportunity' as action_category,
        'gbp' as channel_hint,
        'Jour de pointe + faible concurrence' as headline_fr,
        'Jour a forte frequentation habituelle avec peu de concurrence.' as detail_fr,
        to_json_string(struct(
            d.ft_day_rank_max as ft_rank,
            d.ft_peak_hour as ft_peak_hour,
            d.ft_peak_busyness_pct as ft_peak_busyness_pct,
            round(d.pressure_ratio, 2) as pressure_ratio,
            d.events_within_5km_count as events_5km,
            d.opportunity_score_final_local as score
        )) as data_payload,
        concat('ft_peak_low:', d.location_id, ':', cast(d.date as string)) as suppression_key,
        d.date as expires_at
    from daily_state d
    where d.date >= current_date()
      and d.date <= date_add(current_date(), interval 3 day)
      and d.ft_day_rank_max <= 2
      and d.pressure_ratio < 0.7
      and d.has_valid_baseline_flag = true
),

-- C25: FT PEAK + TOURISM + VACATION
ft_peak_tourism_vacation as (
    select
        d.date, d.location_id,
        'ft_peak_tourism_vacation' as action_type,
        4 as action_priority,
        'opportunity' as action_category,
        'gbp' as channel_hint,
        'Jour de pointe + tourisme + vacances' as headline_fr,
        'Triple signal : frequentation habituelle elevee, tourisme et vacances.' as detail_fr,
        to_json_string(struct(
            d.ft_day_rank_max as ft_rank,
            d.ft_peak_hour as ft_peak_hour,
            d.ft_peak_busyness_pct as ft_peak_busyness_pct,
            round(d.tourism_index_region, 1) as tourism_index,
            d.is_school_holiday_flag as is_vacation,
            d.opportunity_score_final_local as score
        )) as data_payload,
        concat('ft_peak_tour_vac:', d.location_id, ':', cast(d.date as string)) as suppression_key,
        d.date as expires_at
    from daily_state d
    where d.date >= current_date()
      and d.date <= date_add(current_date(), interval 3 day)
      and d.ft_day_rank_max <= 2
      and d.tourism_index_region > 75
      and d.is_school_holiday_flag = true
),

-- C26: FT PEAK + MOBILITY DISRUPTION
ft_peak_mobility as (
    select
        d.date, d.location_id,
        'ft_peak_mobility' as action_type,
        4 as action_priority,
        'weather' as action_category,
        'internal' as channel_hint,
        'Jour de pointe mais mobilite perturbee' as headline_fr,
        'Jour a forte frequentation mais acces perturbe.' as detail_fr,
        to_json_string(struct(
            d.ft_day_rank_max as ft_rank,
            d.ft_peak_hour as ft_peak_hour,
            d.ft_peak_busyness_pct as ft_peak_busyness_pct,
            (d.delta_att_mobility_pct < 0) as mobility_disrupted,
            round(d.delta_att_mobility_pct, 1) as mobility_delta_pct,
            mn.disruption_title, mn.transit_line, mn.transit_stop, mn.disruption_severity, mn.delay_minutes
        )) as data_payload,
        concat('ft_peak_mob:', d.location_id, ':', cast(d.date as string)) as suppression_key,
        d.date as expires_at
    from daily_state d
    left join mobility_named mn on mn.location_id = d.location_id and mn.date = d.date
    where d.date >= current_date()
      and d.date <= date_add(current_date(), interval 3 day)
      and d.ft_day_rank_max <= 2
      and d.delta_att_mobility_pct < 0
),

-- C27: WEEKLY BRIEFING (aggregation over 7-day window)
weekly_briefing as (
    select
        current_date() as date,
        d.location_id,
        'weekly_briefing' as action_type,
        2 as action_priority,
        'intelligence' as action_category,
        'email' as channel_hint,
        'Bilan hebdomadaire' as headline_fr,
        'Resume de la semaine ecoulee.' as detail_fr,
        to_json_string(struct(
            round(avg(d.opportunity_score_final_local), 1) as avg_score,
            countif(d.opportunity_regime = 'A') as days_regime_a,
            countif(d.opportunity_regime = 'C') as days_regime_c,
            countif(d.alert_level_max >= 2) as days_weather_alert,
            max(d.events_within_5km_count) as max_events_5km,
            round(avg(d.pressure_ratio), 2) as avg_pressure_ratio
        )) as data_payload,
        concat('weekly_briefing:', d.location_id, ':', format_date('%Y-%W', current_date())) as suppression_key,
        date_add(current_date(), interval 7 day) as expires_at
    from daily_state d
    where d.date >= date_sub(current_date(), interval 7 day)
      and d.date < current_date()
    group by d.location_id
    having extract(dayofweek from current_date()) = 2  -- Monday only
),

-- ============================================================
-- REVIEW SOLICITATION (gesture, own-reputation)
-- Weekly nudge to ask satisfied visitors for Google reviews,
-- timed to an upcoming favourable / high-traffic window.
-- Governed by the réputation/avis reco theme (ungated, beta).
-- The review link is a client-side CTA detail (profile.review_link),
-- not a dbt dependency.
-- ============================================================

review_solicitation as (
    select
        current_date() as date,
        d.location_id,
        'review_solicitation' as action_type,
        2 as action_priority,
        'reputation' as action_category,
        'note_interne' as channel_hint,
        'Bon moment pour solliciter des avis' as headline_fr,
        concat(
            'Affluence favorable attendue dans les prochains jours',
            case when d.peak_label is not null then concat(' (', d.peak_label, ')') else '' end,
            '. Sollicitez vos visiteurs satisfaits pour des avis Google pendant que la frequentation est elevee.'
        ) as detail_fr,
        to_json_string(struct(
            d.favorable_days as favorable_days_next_5,
            d.peak_label as peak_window
        )) as data_payload,
        concat('review_solicitation:', d.location_id, ':', format_date('%Y-%W', current_date())) as suppression_key,
        date_add(current_date(), interval 7 day) as expires_at
    from (
        select
            location_id,
            count(*) as favorable_days,
            any_value(case
                when is_public_holiday_flag then 'jour ferie'
                when is_weekend_flag then 'week-end'
                when is_school_holiday_flag then 'vacances scolaires'
                else 'jour de pointe'
            end) as peak_label
        from daily_state
        where date >= current_date()
          and date <= date_add(current_date(), interval 4 day)
          and opportunity_regime in ('A', 'B')
          and (
              is_weekend_flag = true
              or is_public_holiday_flag = true
              or is_school_holiday_flag = true
              or ft_day_rank_max <= 2
          )
        group by location_id
    ) d
),

-- ============================================================
-- UNION ALL
-- ============================================================

all_candidates as (
    select * from high_competition
    union all
    select * from weather_window
    union all
    select * from top_day_approaching
    union all
    select * from audience_shift
    union all
    select * from foreign_tourism_signal          -- AJOUT
    union all
    select * from competitor_threat
    union all
    select * from regime_c_warning
    union all
    select * from change_feed_actions
    union all
    select * from competition_proximity
    union all
    select * from low_competition_window
    union all
    select * from extended_bad_weather
    union all
    select * from weekend_opportunity
    union all
    select * from sales_cannibalization
    union all
    select * from sales_surge
    union all
    select * from sales_traffic_not_converting
    union all
    select * from offering_mix_shift
    union all
    select * from item_share_move
    union all
    select * from hour_share_move
    union all
    select * from sales_discount_no_lift
    union all
    select * from sales_revenue_down_wow
    union all
    select * from client_dormant
    union all
    select * from weekly_sales_hole
    union all
    select * from weekly_sales_spike
    union all
    select * from monthly_sales_hole
    union all
    select * from monthly_sales_spike
    union all
    select * from competitor_positioning_gap
    union all
    select * from competitor_offering_changes
    union all
    select * from competitor_positioning_brief
    union all
    select * from competitor_reputation_strength
    union all
    select * from competitor_repricing_event
    union all
    select * from action_learning_advice
    union all
    select * from weather_comp_opportunity
    union all
    select * from holiday_high_comp
    union all
    select * from best_day_of_week
    union all
    select * from day_opportunity
    union all
    select * from same_bucket_saturation
    union all
    select * from weekend_vacation_low_comp
    union all
    select * from commercial_event_match
    union all
    select * from weather_window_after_bad
    union all
    select * from mobility_comp_squeeze
    union all
    select * from ft_peak_bad_weather
    union all
    select * from ft_quiet_good_weather
    union all
    select * from ft_peak_saturated
    union all
    select * from ft_peak_low_comp
    union all
    select * from ft_peak_tourism_vacation
    union all
    select * from ft_peak_mobility
    union all
    select * from weekly_briefing
    union all
    select * from review_solicitation
),

-- ============================================================
-- DEDUPLICATION
-- When a state-based and transition-based action share the
-- same suppression_key, keep the highest priority one.
-- ============================================================

deduped as (
    select
        *,
        row_number() over (
            partition by suppression_key
            order by action_priority desc
        ) as rn
    from all_candidates
    where action_priority >= 2
),

-- ============================================================
-- 24/08 (recit des cartes, nature 1) : CARTES DE FENETRE.
-- Six types tirent une ligne par date sur [J, J+3] : quatre cartes identiques
-- pour UNE condition qui dure. Ici : dates consecutives regroupees
-- (gaps-and-islands) en UNE carte par fenetre. date = debut, expires_at = fin,
-- suppression_key re-suffixee sur la FIN de fenetre (stable quand la fenetre
-- avance : le lendemain, le debut devient J et le texte se raccourcit sans que
-- la carte redevienne "nouveau" ni echappe a "Action menee"). Le payload gagne
-- window_start / window_end / window_days ; textes et payload du PREMIER jour
-- (celui ou l'exploitant agit) conserves tels quels.
-- ============================================================

kept as (
    select * except(rn) from deduped where rn = 1
),
window_islands as (
    select *,
        date_sub(date, interval row_number() over (
            partition by location_id, action_type order by date
        ) day) as win_grp
    from kept
    where action_type in (
        'low_competition_window', 'foreign_tourism_signal', 'commercial_event_match',
        'competition_proximity', 'audience_shift_opportunity', 'same_bucket_saturation')
),
window_cards as (
    select
        min(date) as date,
        location_id,
        action_type,
        max(action_priority) as action_priority,
        any_value(action_category) as action_category,
        any_value(channel_hint) as channel_hint,
        array_agg(headline_fr order by date limit 1)[offset(0)] as headline_fr,
        concat(
            array_agg(detail_fr order by date limit 1)[offset(0)],
            case when count(*) > 1 then concat(
                ' La situation dure du ', format_date('%d/%m', min(date)),
                ' au ', format_date('%d/%m', max(date)),
                ' (', cast(count(*) as string), ' jours).') else '' end
        ) as detail_fr,
        concat(
            '{"window_start":"', cast(min(date) as string),
            '","window_end":"', cast(max(date) as string),
            '","window_days":', cast(count(*) as string), ',',
            substr(array_agg(data_payload order by date limit 1)[offset(0)], 2)
        ) as data_payload,
        regexp_replace(
            array_agg(suppression_key order by date limit 1)[offset(0)],
            ':[0-9]{4}-[0-9]{2}-[0-9]{2}$',
            concat(':', cast(max(date) as string))
        ) as suppression_key,
        max(date) as expires_at
    from window_islands
    group by location_id, action_type, win_grp
),
final_candidates as (
    select date, location_id, action_type, action_priority, action_category, channel_hint,
           headline_fr, detail_fr, data_payload, suppression_key, expires_at
    from kept
    where action_type not in (
        'low_competition_window', 'foreign_tourism_signal', 'commercial_event_match',
        'competition_proximity', 'audience_shift_opportunity', 'same_bucket_saturation')
    union all
    select date, location_id, action_type, action_priority, action_category, channel_hint,
           headline_fr, detail_fr, data_payload, suppression_key, expires_at
    from window_cards
)

select
    date,
    location_id,
    action_type,
    to_hex(md5(suppression_key)) as card_instance_id,
    action_priority,
    action_category,
    channel_hint,
    headline_fr,
    detail_fr,
    data_payload,
    suppression_key,
    expires_at
from final_candidates
left join sales_regime using (location_id)
where true
  -- Porte de régime : un verdict QUOTIDIEN n'existe que là où le rythme de vente
  -- le porte. 'weekly'/'episodic' → cartes ventes jour supprimées (leurs grains
  -- arrivent au chantier C). 'insufficient' ou site absent → laissé passer
  -- (onboarding : ne jamais priver un compte neuf de ses premières cartes).
  and not (
      starts_with(action_type, 'sales_')
      and coalesce(sales_grain, 'daily') in ('weekly', 'episodic')
  )