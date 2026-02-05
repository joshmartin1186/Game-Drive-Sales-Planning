-- Create unified analytics view combining Steam and PlayStation data
CREATE OR REPLACE VIEW analytics_data_view AS
-- Steam data from steam_sales
SELECT
  s.id::text as id,
  s.client_id,
  s.sale_date as date,
  NULL::text as bundle_name,
  s.app_name as product_name,
  s.product_type,
  s.app_name as game,
  'Steam' as platform,
  s.country_code,
  s.country_code as country,
  get_region_from_country_code(s.country_code) as region,
  s.units_sold::integer as gross_units_sold,
  0 as chargebacks_returns,
  s.units_sold::integer as net_units_sold,
  NULL::numeric as base_price_usd,
  NULL::numeric as sale_price_usd,
  s.gross_revenue as gross_steam_sales_usd,
  0 as chargeback_returns_usd,
  0 as vat_tax_usd,
  s.net_revenue as net_steam_sales_usd
FROM steam_sales s

UNION ALL

-- PlayStation data from performance_metrics
SELECT
  pm.id::text as id,
  pm.client_id,
  pm.date,
  NULL::text as bundle_name,
  pm.product_name,
  NULL::text as product_type,
  pm.product_name as game,
  pm.platform,
  pm.country_code,
  pm.country_code as country,
  COALESCE(pm.region, get_region_from_country_code(pm.country_code)) as region,
  pm.gross_units_sold as gross_units_sold,
  0 as chargebacks_returns,
  pm.net_units_sold as net_units_sold,
  NULL::numeric as base_price_usd,
  NULL::numeric as sale_price_usd,
  pm.gross_revenue_usd as gross_steam_sales_usd,
  0 as chargeback_returns_usd,
  0 as vat_tax_usd,
  pm.net_revenue_usd as net_steam_sales_usd
FROM performance_metrics pm;
