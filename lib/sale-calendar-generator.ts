import { addDays, addMonths, differenceInDays, parseISO, format, isAfter, isBefore } from 'date-fns'
import { Platform, PlatformEvent } from '@/lib/types'

export interface GeneratedSale {
  id: string // temporary ID for preview
  product_id: string
  platform_id: string
  platform_name: string
  platform_color: string
  start_date: string
  end_date: string
  discount_percentage: number
  sale_name: string
  sale_type: 'custom' | 'seasonal' | 'festival' | 'special'
  is_event: boolean // Whether this is tied to a platform event
  event_name?: string
  cooldown_days: number // The cooldown that applies AFTER this sale
}

export interface CalendarVariation {
  name: string
  description: string
  sales: GeneratedSale[]
  stats: {
    totalSales: number
    totalDaysOnSale: number
    percentageOnSale: number
    eventSales: number
    customSales: number
  }
}

export interface GenerateCalendarParams {
  productId: string
  platforms: Platform[]
  platformEvents: PlatformEvent[]
  launchDate: string // ISO date string - calendar generates 12 months from this date
  defaultDiscount?: number
}

// Get platform events for a specific platform within a date range
function getEventsForPlatform(
  platformId: string,
  platformEvents: PlatformEvent[],
  periodStart: Date,
  periodEnd: Date
): PlatformEvent[] {
  return platformEvents.filter(event => {
    if (event.platform_id !== platformId) return false
    const eventStart = parseISO(event.start_date)
    const eventEnd = parseISO(event.end_date)
    // Check if event overlaps with the period
    return eventStart <= periodEnd && eventEnd >= periodStart
  }).sort((a, b) => parseISO(a.start_date).getTime() - parseISO(b.start_date).getTime())
}

// Check if a proposed sale conflicts with existing sales
// Each existing sale has its own cooldown_days attached
function hasConflict(
  startDate: Date,
  endDate: Date,
  newSaleCooldownDays: number, // Cooldown that will apply after this new sale
  existingSales: GeneratedSale[]
): boolean {
  // Calculate when this new sale's cooldown would end
  const newSaleCooldownEnd = addDays(endDate, newSaleCooldownDays)
  
  for (const existingSale of existingSales) {
    const saleStart = parseISO(existingSale.start_date)
    const saleEnd = parseISO(existingSale.end_date)
    // Each existing sale knows its own cooldown
    const saleCooldownEnd = addDays(saleEnd, existingSale.cooldown_days)
    
    // Check 1: Direct overlap - new sale overlaps with existing sale period
    if (startDate <= saleEnd && endDate >= saleStart) {
      return true
    }
    
    // Check 2: New sale starts during existing sale's cooldown
    // (starts after sale ends, but before cooldown ends)
    if (isAfter(startDate, saleEnd) && isBefore(startDate, saleCooldownEnd)) {
      return true
    }
    
    // Check 3: Existing sale starts during new sale's cooldown
    // (existing starts after new sale ends, but before new sale's cooldown ends)
    if (isAfter(saleStart, endDate) && isBefore(saleStart, newSaleCooldownEnd)) {
      return true
    }
  }
  
  return false
}

// Find the next available date that won't cause any conflicts
function findNextAvailableDate(
  afterDate: Date,
  existingSales: GeneratedSale[],
  newSaleCooldownDays: number,
  periodEnd: Date,
  saleDuration: number
): Date | null {
  let candidate = addDays(afterDate, 1)
  let iterations = 0
  const maxIterations = 500 // Safety limit
  
  while (candidate <= periodEnd && iterations < maxIterations) {
    iterations++
    
    // Calculate potential sale end date
    const potentialEnd = addDays(candidate, saleDuration - 1)
    const actualEnd = potentialEnd > periodEnd ? periodEnd : potentialEnd
    
    // Check if this would create any conflicts
    const conflict = hasConflict(candidate, actualEnd, newSaleCooldownDays, existingSales)
    
    if (!conflict) {
      return candidate
    }
    
    // Find the next possible start date by jumping past blocking sales' cooldowns
    let nextPossible = addDays(candidate, 1)
    
    for (const sale of existingSales) {
      const saleEnd = parseISO(sale.end_date)
      const saleCooldownEnd = addDays(saleEnd, sale.cooldown_days)
      
      // If candidate is within a sale or its cooldown, jump past it
      if (candidate <= saleCooldownEnd) {
        const jumpTo = addDays(saleCooldownEnd, 1)
        if (isAfter(jumpTo, nextPossible)) {
          nextPossible = jumpTo
        }
      }
    }
    
    candidate = nextPossible
  }
  
  return null
}

// Generate sales for a single platform
function generatePlatformSales(
  productId: string,
  platform: Platform,
  platformEvents: PlatformEvent[],
  periodStart: Date,
  periodEnd: Date,
  defaultDiscount: number,
  variation: 'aggressive' | 'balanced' | 'conservative'
): GeneratedSale[] {
  const sales: GeneratedSale[] = []
  const maxSaleDays = platform.max_sale_days || 14
  const platformCooldownDays = platform.cooldown_days || 30
  
  // Get events for this platform
  const events = getEventsForPlatform(platform.id, platformEvents, periodStart, periodEnd)
  
  // First, add all seasonal/special events
  for (const event of events) {
    const eventStart = parseISO(event.start_date)
    const eventEnd = parseISO(event.end_date)
    
    // Clamp to period boundaries
    const saleStart = eventStart < periodStart ? periodStart : eventStart
    const saleEnd = eventEnd > periodEnd ? periodEnd : eventEnd
    
    // Check duration doesn't exceed max
    const duration = differenceInDays(saleEnd, saleStart) + 1
    const actualEnd = duration > maxSaleDays ? addDays(saleStart, maxSaleDays - 1) : saleEnd
    
    // Event sales may have no cooldown requirement (based on event settings)
    const eventCooldownDays = event.requires_cooldown === false ? 0 : platformCooldownDays
    
    // Check for conflicts using this event's specific cooldown
    if (!hasConflict(saleStart, actualEnd, eventCooldownDays, sales)) {
      sales.push({
        id: `gen-${productId}-${platform.id}-event-${event.id}`,
        product_id: productId,
        platform_id: platform.id,
        platform_name: platform.name,
        platform_color: platform.color_hex,
        start_date: format(saleStart, 'yyyy-MM-dd'),
        end_date: format(actualEnd, 'yyyy-MM-dd'),
        discount_percentage: defaultDiscount,
        sale_name: event.name,
        sale_type: 'seasonal',
        is_event: true,
        event_name: event.name,
        cooldown_days: eventCooldownDays
      })
    }
  }
  
  // For conservative: if no events, add at least one custom sale per platform
  if (variation === 'conservative') {
    if (sales.length === 0) {
      // Add a single custom sale at start of period (launch sale)
      const saleDuration = Math.min(maxSaleDays, 7)
      const saleEnd = addDays(periodStart, saleDuration - 1)
      
      sales.push({
        id: `gen-${productId}-${platform.id}-custom-0`,
        product_id: productId,
        platform_id: platform.id,
        platform_name: platform.name,
        platform_color: platform.color_hex,
        start_date: format(periodStart, 'yyyy-MM-dd'),
        end_date: format(saleEnd, 'yyyy-MM-dd'),
        discount_percentage: defaultDiscount,
        sale_name: `${platform.name} Launch Sale`,
        sale_type: 'custom',
        is_event: false,
        cooldown_days: platformCooldownDays
      })
    }
    return sales
  }
  
  // For balanced and aggressive, fill gaps with custom sales
  // Sort existing sales by start date
  const allSales = [...sales].sort((a, b) => 
    parseISO(a.start_date).getTime() - parseISO(b.start_date).getTime()
  )
  
  let customSaleCount = 0
  
  // Determine how many custom sales to add and duration based on variation
  const maxCustomSales = variation === 'aggressive' ? 50 : 12
  const saleDuration = variation === 'aggressive' ? maxSaleDays : Math.min(maxSaleDays, 7)
  
  // Start search from before the period start
  let searchStart = addDays(periodStart, -1)
  
  while (customSaleCount < maxCustomSales) {
    // Find next available slot that won't conflict with ANY sale
    const availableDate = findNextAvailableDate(
      searchStart,
      allSales,
      platformCooldownDays, // Custom sales use platform's full cooldown
      periodEnd,
      saleDuration
    )
    
    if (!availableDate || availableDate > periodEnd) break
    
    // Calculate actual end date
    const potentialEnd = addDays(availableDate, saleDuration - 1)
    const actualEnd = potentialEnd > periodEnd ? periodEnd : potentialEnd
    
    // Final conflict check (should be redundant but ensures no bugs)
    if (!hasConflict(availableDate, actualEnd, platformCooldownDays, allSales)) {
      const customSale: GeneratedSale = {
        id: `gen-${productId}-${platform.id}-custom-${customSaleCount}`,
        product_id: productId,
        platform_id: platform.id,
        platform_name: platform.name,
        platform_color: platform.color_hex,
        start_date: format(availableDate, 'yyyy-MM-dd'),
        end_date: format(actualEnd, 'yyyy-MM-dd'),
        discount_percentage: defaultDiscount,
        sale_name: customSaleCount === 0 && sales.length === 0 
          ? `${platform.name} Launch Sale` 
          : `Custom Sale ${customSaleCount + 1}`,
        sale_type: 'custom',
        is_event: false,
        cooldown_days: platformCooldownDays
      }
      
      allSales.push(customSale)
      allSales.sort((a, b) => 
        parseISO(a.start_date).getTime() - parseISO(b.start_date).getTime()
      )
      
      customSaleCount++
      
      // Move search start to after this sale's cooldown
      searchStart = addDays(actualEnd, platformCooldownDays)
    } else {
      // If still conflicting somehow, move forward
      searchStart = addDays(availableDate, 1)
    }
  }
  
  return allSales
}

// Calculate stats for a variation
function calculateStats(sales: GeneratedSale[], periodStart: Date, periodEnd: Date): CalendarVariation['stats'] {
  const totalDaysInPeriod = differenceInDays(periodEnd, periodStart) + 1
  let totalDaysOnSale = 0
  let eventSales = 0
  let customSales = 0
  
  for (const sale of sales) {
    const start = parseISO(sale.start_date)
    const end = parseISO(sale.end_date)
    totalDaysOnSale += differenceInDays(end, start) + 1
    
    if (sale.is_event) {
      eventSales++
    } else {
      customSales++
    }
  }
  
  return {
    totalSales: sales.length,
    totalDaysOnSale,
    percentageOnSale: Math.round((totalDaysOnSale / totalDaysInPeriod) * 100),
    eventSales,
    customSales
  }
}

// Main function to generate all three variations
export function generateSaleCalendar(params: GenerateCalendarParams): CalendarVariation[] {
  const {
    productId,
    platforms,
    platformEvents,
    launchDate,
    defaultDiscount = 50
  } = params
  
  // Parse launch date and calculate 12-month period
  const periodStart = parseISO(launchDate)
  const periodEnd = addDays(addMonths(periodStart, 12), -1) // 12 months from launch
  
  // Use ALL platforms passed in - no filtering
  const allPlatforms = platforms
  
  const variations: CalendarVariation[] = []
  
  // Generate three variations
  const variationConfigs: { key: 'aggressive' | 'balanced' | 'conservative'; name: string; description: string }[] = [
    {
      key: 'aggressive',
      name: 'Maximum Coverage',
      description: 'Maximize days on sale with full-length sales chained back-to-back after cooldowns'
    },
    {
      key: 'balanced',
      name: 'Balanced',
      description: 'All seasonal events plus monthly custom sales for steady visibility'
    },
    {
      key: 'conservative',
      name: 'Events Only',
      description: 'Participate only in platform seasonal events (plus one launch sale per platform without events)'
    }
  ]
  
  for (const config of variationConfigs) {
    const allSales: GeneratedSale[] = []
    
    for (const platform of allPlatforms) {
      const platformSales = generatePlatformSales(
        productId,
        platform,
        platformEvents,
        periodStart,
        periodEnd,
        defaultDiscount,
        config.key
      )
      allSales.push(...platformSales)
    }
    
    // Sort all sales by date
    allSales.sort((a, b) => 
      parseISO(a.start_date).getTime() - parseISO(b.start_date).getTime()
    )
    
    variations.push({
      name: config.name,
      description: config.description,
      sales: allSales,
      stats: calculateStats(allSales, periodStart, periodEnd)
    })
  }
  
  return variations
}

// Export utility to convert generated sales to actual sale creation format
export function generatedSaleToCreateFormat(sale: GeneratedSale) {
  return {
    product_id: sale.product_id,
    platform_id: sale.platform_id,
    start_date: sale.start_date,
    end_date: sale.end_date,
    discount_percentage: sale.discount_percentage,
    sale_name: sale.sale_name,
    sale_type: sale.sale_type,
    status: 'planned' as const
  }
}
