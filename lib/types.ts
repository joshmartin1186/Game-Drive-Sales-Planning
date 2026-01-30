// Extended types for the Gantt chart

export interface Platform {
  id: string
  name: string
  cooldown_days: number
  approval_required: boolean
  color_hex: string
  max_sale_days: number
  special_sales_no_cooldown: boolean
  // New fields for extended platform configuration
  typical_start_day?: string | null
  submission_lead_days?: number
  min_discount_percent?: number
  max_discount_percent?: number
  notes?: string | null
  is_active?: boolean
  created_at?: string
}

export interface PlatformEvent {
  id: string
  platform_id: string
  name: string
  start_date: string
  end_date: string
  event_type: 'seasonal' | 'thirdparty' | 'invitational' | 'festival' | 'custom'
  region?: string | null
  requires_cooldown: boolean
  is_recurring: boolean
  notes?: string | null
  created_at?: string
  updated_at?: string
  platform?: Platform
}

export interface Product {
  id: string
  game_id: string
  name: string
  product_type: 'base' | 'edition' | 'dlc' | 'soundtrack' | 'bundle'
  base_price_usd?: number
  steam_product_id?: string
  launch_date?: string | null
  launch_sale_duration?: number | null  // Duration in days for launch sale (7-14 typical)
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
  // Database constraint: 'custom' | 'seasonal' | 'festival' | 'special'
  sale_type: 'custom' | 'seasonal' | 'festival' | 'special'
  // Database constraint: 'planned' | 'submitted' | 'confirmed' | 'live' | 'ended'
  status: 'planned' | 'submitted' | 'confirmed' | 'live' | 'ended'
  goal_type?: 'acquisition' | 'visibility' | 'event' | 'revenue'
  notes?: string
  // New fields matching client's Excel workflow
  is_campaign?: boolean
  is_submitted?: boolean
  is_confirmed?: boolean
  comment?: string
  prev_sale_end_date?: string
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
  platform_id?: string
  event_type?: string
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

// Launch sale conflict information
export interface LaunchConflict {
  eventName: string
  eventStart: Date
  eventEnd: Date
  overlapStart: Date
  overlapEnd: Date
  overlapDays: number
}

// User management types
export type UserRole = 'superadmin' | 'editor' | 'viewer'
export type AccessLevel = 'none' | 'view' | 'edit'
export type FeatureKey = 'sales_timeline' | 'analytics' | 'client_management' | 'platform_settings' | 'excel_export' | 'api_settings'

export interface UserProfile {
  id: string
  email: string
  display_name: string | null
  role: UserRole
  is_active: boolean
  all_clients: boolean
  created_at: string
  updated_at: string
  client_ids?: string[]
  clients?: { id: string; name: string }[]
  permissions?: UserPermission[]
}

export interface UserPermission {
  id: string
  user_id: string
  feature: FeatureKey
  access_level: AccessLevel
}

export interface UserClient {
  id: string
  user_id: string
  client_id: string
  created_at: string
}
