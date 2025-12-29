// Extended types for the Gantt chart

export interface Platform {
  id: string
  name: string
  cooldown_days: number
  approval_required: boolean
  color_hex: string
  max_sale_days: number
  special_sales_no_cooldown: boolean
}

export interface Product {
  id: string
  game_id: string
  name: string
  product_type: 'base' | 'edition' | 'dlc' | 'soundtrack' | 'bundle'
  base_price_usd?: number
  steam_product_id?: string
  created_at: string
  game?: Game
}

export interface Game {
  id: string
  client_id: string
  name: string
  steam_app_id?: string
  created_at: string
  client?: Client
}

export interface Client {
  id: string
  name: string
  email?: string
  steam_api_key?: string
  created_at: string
}

export interface Sale {
  id: string
  product_id: string
  platform_id: string
  start_date: string
  end_date: string
  discount_percentage?: number
  sale_name?: string
  sale_type: 'regular' | 'seasonal'
  status: 'draft' | 'planned' | 'submitted' | 'confirmed' | 'live' | 'ended'
  goal_type?: 'acquisition' | 'visibility' | 'event' | 'revenue'
  notes?: string
  created_at: string
  product?: Product
  platform?: Platform
}

export interface SaleWithDetails extends Sale {
  product: Product & { game: Game & { client: Client } }
  platform: Platform
}

export interface TimelineEvent {
  id: string
  name: string
  start_date: string
  end_date: string
  color: string
}

export interface ValidationResult {
  valid: boolean
  conflicts: Sale[]
  cooldownEnd: string
  message?: string
}

export interface DayCell {
  date: Date
  dayOfMonth: number
  isWeekend: boolean
  month: number
  year: number
}
