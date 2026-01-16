// Chart configuration types for dynamic analytics builder

export type ChartType = 'bar' | 'line' | 'pie' | 'table' | 'metric_card'

export type DataSource = 'steam_performance_data' | 'period_comparison' | 'regional_breakdown'

export type AggregationType = 'sum' | 'avg' | 'count' | 'max' | 'min'

export type AxisField =
  | 'date'
  | 'region'
  | 'product_name'
  | 'platform'
  | 'country'
  | 'country_code'
  | 'net_steam_sales_usd'
  | 'net_units_sold'
  | 'gross_units_sold'
  | 'gross_steam_sales_usd'
  | 'base_price_usd'
  | 'sale_price_usd'

export interface ChartPosition {
  x: number
  y: number
  w: number
  h: number
}

export interface ChartFilters {
  dateRange?: {
    start: string | null
    end: string | null
  }
  client_id?: string
  product_name?: string
  region?: string
  platform?: string
  country_code?: string
}

export interface ChartConfig {
  id: string
  type: ChartType
  title: string
  dataSource: DataSource
  xAxis?: AxisField
  yAxis?: AxisField
  aggregation: AggregationType
  filters: ChartFilters
  position: ChartPosition
  style?: {
    color?: string
    backgroundColor?: string
    showLegend?: boolean
    showGrid?: boolean
  }
}

export interface DashboardConfig {
  id: string
  client_id: string | null
  name: string
  layout: ChartPosition[]
  charts: ChartConfig[]
  is_default: boolean
  created_at: string
  updated_at?: string
}

// Predefined chart templates for quick setup
export const CHART_TEMPLATES: Partial<ChartConfig>[] = [
  {
    type: 'metric_card',
    title: 'Total Revenue',
    dataSource: 'steam_performance_data',
    yAxis: 'net_steam_sales_usd',
    aggregation: 'sum',
  },
  {
    type: 'metric_card',
    title: 'Total Units Sold',
    dataSource: 'steam_performance_data',
    yAxis: 'net_units_sold',
    aggregation: 'sum',
  },
  {
    type: 'bar',
    title: 'Revenue Over Time',
    dataSource: 'steam_performance_data',
    xAxis: 'date',
    yAxis: 'net_steam_sales_usd',
    aggregation: 'sum',
  },
  {
    type: 'bar',
    title: 'Revenue by Region',
    dataSource: 'steam_performance_data',
    xAxis: 'region',
    yAxis: 'net_steam_sales_usd',
    aggregation: 'sum',
  },
  {
    type: 'line',
    title: 'Daily Sales Trend',
    dataSource: 'steam_performance_data',
    xAxis: 'date',
    yAxis: 'net_units_sold',
    aggregation: 'sum',
  },
  {
    type: 'pie',
    title: 'Revenue Distribution by Platform',
    dataSource: 'steam_performance_data',
    xAxis: 'platform',
    yAxis: 'net_steam_sales_usd',
    aggregation: 'sum',
  },
  {
    type: 'table',
    title: 'Period Comparison',
    dataSource: 'period_comparison',
    aggregation: 'sum',
  },
]

// Helper to create a new chart with default position
export function createChartConfig(
  template: Partial<ChartConfig>,
  position?: Partial<ChartPosition>
): ChartConfig {
  return {
    id: `chart_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    type: template.type || 'bar',
    title: template.title || 'New Chart',
    dataSource: template.dataSource || 'steam_performance_data',
    xAxis: template.xAxis,
    yAxis: template.yAxis,
    aggregation: template.aggregation || 'sum',
    filters: template.filters || {},
    position: {
      x: position?.x ?? 0,
      y: position?.y ?? 0,
      w: position?.w ?? 4,
      h: position?.h ?? 4,
    },
    style: template.style,
  }
}

// Field labels for UI display
export const FIELD_LABELS: Record<AxisField, string> = {
  date: 'Date',
  region: 'Region',
  product_name: 'Product Name',
  platform: 'Platform',
  country: 'Country',
  country_code: 'Country Code',
  net_steam_sales_usd: 'Net Sales (USD)',
  net_units_sold: 'Net Units Sold',
  gross_units_sold: 'Gross Units Sold',
  gross_steam_sales_usd: 'Gross Sales (USD)',
  base_price_usd: 'Base Price (USD)',
  sale_price_usd: 'Sale Price (USD)',
}

// Aggregation labels for UI display
export const AGGREGATION_LABELS: Record<AggregationType, string> = {
  sum: 'Sum',
  avg: 'Average',
  count: 'Count',
  max: 'Maximum',
  min: 'Minimum',
}

// Data source labels for UI display
export const DATA_SOURCE_LABELS: Record<DataSource, string> = {
  steam_performance_data: 'Performance Data',
  period_comparison: 'Period Comparison',
  regional_breakdown: 'Regional Breakdown',
}
