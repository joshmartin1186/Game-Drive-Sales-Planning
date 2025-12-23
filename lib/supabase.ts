import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

if (!supabaseUrl) {
  throw new Error('Missing env.NEXT_PUBLIC_SUPABASE_URL')
}

if (!supabaseKey) {
  throw new Error('Missing env.NEXT_PUBLIC_SUPABASE_ANON_KEY')
}

export const supabase = createClient(supabaseUrl, supabaseKey)

// Database types based on our schema
export interface Client {
  id: string
  name: string
  email?: string
  steam_api_key?: string
  created_at: string
}

export interface Platform {
  id: string
  name: string
  cooldown_days: number
  approval_required: boolean
  color_hex: string
  max_sale_days: number
  special_sales_no_cooldown: boolean
}

export interface Game {
  id: string
  client_id: string
  name: string
  steam_app_id?: string
  created_at: string
  client?: Client
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

export interface Sale {
  id: string
  product_id: string
  platform_id: string
  start_date: string
  end_date: string
  discount_percentage?: number
  sale_name?: string
  sale_type: 'regular' | 'special'
  status: 'draft' | 'client_review' | 'gamedrive_submitted' | 'platform_submitted' | 'confirmed' | 'rejected' | 'live' | 'ended'
  goal_type?: 'acquisition' | 'visibility' | 'event' | 'revenue'
  notes?: string
  created_at: string
  product?: Product
  platform?: Platform
}

export interface PerformanceMetric {
  id: string
  sale_id: string
  date: string
  units_sold: number
  gross_revenue_usd: number
  net_revenue_usd: number
  daily_active_users?: number
  country_code?: string
  platform: string
  created_at: string
}
