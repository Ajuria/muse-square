-- HANDOFF for dbt Cloud IDE (repo: ms_database). Owner runs this; it is NOT executed from the app repo.
-- Model: mart.fct_client_sales_by_category_daily
-- Grain: location_id × transaction_date × item_category
-- Purpose: category-grain sales mix for the card-specific sales drill-down ("Ce qui a fait la journée").
--          fct_client_daily_performance aggregates the mix away; this preserves it.
-- Source (verified): raw.client_transactions carries item_category, revenue, quantity, discount_amount
--          at line-item grain, for 4 venues incl. the café ff2aeb35 (Coffee/Tea/Bakery/…), Apr–Sep 2026.
-- Note: sums across ALL source_type rows per (location, date, category) — mirrors the card mart's
--       "sum across source_type" convention (see memory: sales-csv-ingestion-grain-and-supersede);
--       CSV supersede already dedups seed rows upstream, so no source_type filter here.

{{ config(materialized='table') }}

SELECT
    location_id,
    transaction_date,
    item_category,
    SUM(revenue)         AS category_revenue,
    SUM(quantity)        AS category_quantity,
    SUM(discount_amount) AS category_discount
-- Direct reference as given (guaranteed correct). Swap for {{ source('raw','client_transactions') }}
-- if that source is defined in the dbt project.
FROM `muse-square-open-data.raw.client_transactions`
WHERE item_category IS NOT NULL
  AND item_category != ''
GROUP BY 1, 2, 3
