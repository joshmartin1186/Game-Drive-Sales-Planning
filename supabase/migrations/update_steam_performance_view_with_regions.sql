-- Drop existing view
DROP VIEW IF EXISTS steam_performance_data_view;

-- Create country to region mapping function
CREATE OR REPLACE FUNCTION get_region_from_country_code(country_code TEXT)
RETURNS TEXT AS $$
BEGIN
  CASE country_code
    -- North America
    WHEN 'US', 'CA', 'MX' THEN RETURN 'North America';
    -- Europe
    WHEN 'GB', 'DE', 'FR', 'IT', 'ES', 'NL', 'SE', 'NO', 'DK', 'FI', 'PL', 'BE', 'AT', 'CH', 'IE', 'PT', 'CZ', 'RO', 'GR', 'HU' THEN RETURN 'Europe';
    -- Asia Pacific
    WHEN 'CN', 'JP', 'KR', 'IN', 'AU', 'NZ', 'SG', 'TH', 'MY', 'ID', 'PH', 'VN', 'TW', 'HK' THEN RETURN 'Asia Pacific';
    -- South America
    WHEN 'BR', 'AR', 'CL', 'CO', 'PE', 'VE' THEN RETURN 'South America';
    -- Middle East & Africa
    WHEN 'SA', 'AE', 'IL', 'ZA', 'EG', 'TR' THEN RETURN 'Middle East & Africa';
    ELSE RETURN 'Other';
  END CASE;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Recreate view with proper region mapping
CREATE OR REPLACE VIEW steam_performance_data_view AS
SELECT
  s.id,
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
FROM steam_sales s;
