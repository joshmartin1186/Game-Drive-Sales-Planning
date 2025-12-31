import { addDays, differenceInDays, parseISO, format, startOfYear, endOfYear } from 'date-fns'
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
  year: number
  defaultDiscount?: number
}

// Get platform events for a specific platform within a date range
function getEventsForPlatform(
  platformId: string,
  platformEvents: PlatformEvent[],
  yearStart: Date,
  yearEnd: Date
): PlatformEvent[] {
  return platformEvents.filter(event => {
    if (event.platform_id !== platformId) return false
    const eventStart = parseISO(event.start_date)
    const eventEnd = parseISO(event.end_date)
    // Check if event overlaps with the year
    return eventStart <= yearEnd && eventEnd >= yearStart
  }).sort((a, b) => parseISO(a.start_date).getTime() - parseISO(b.start_date).getTime())
}

// Check if a date range conflicts with existing sales or cooldowns
function hasConflict(
  startDate: Date,
  endDate: Date,
  existingSales: GeneratedSale[],
  cooldownDays: number
): boolean {
  for (const sale of existingSales) {
    const saleStart = parseISO(sale.start_date)
    const saleEnd = parseISO(sale.end_date)
    const cooldownEnd = addDays(saleEnd, cooldownDays)
    
    // Check if ranges overlap (including cooldown)
    if (startDate <= cooldownEnd && endDate >= saleStart) {
      return true
    }
  }
  return false
}

// Find the next available date after cooldown
function findNextAvailableDate(
  afterDate: Date,
  existingSales: GeneratedSale[],
  cooldownDays: number,
  yearEnd: Date
): Date | null {
  let candidate = addDays(afterDate, 1)
  
  while (candidate <= yearEnd) {
    let isBlocked = false
    
    for (const sale of existingSales) {
      const saleStart = parseISO(sale.start_date)
      const saleEnd = parseISO(sale.end_date)
      const cooldownEnd = addDays(saleEnd, cooldownDays)
      
      // If candidate is within sale or cooldown period
      if (candidate >= saleStart && candidate <= cooldownEnd) {
        // Jump to after cooldown
        candidate = addDays(cooldownEnd, 1)
        isBlocked = true
        break
      }
    }
    
    if (!isBlocked) {
      return candidate
    }
  }
  
  return null
}

// Generate sales for a single platform
function generatePlatformSales(
  productId: string,
  platform: Platform,
  platformEvents: PlatformEvent[],
  yearStart: Date,
  yearEnd: Date,
  defaultDiscount: number,
  variation: 'aggressive' | 'balanced' | 'conservative'
): GeneratedSale[] {
  const sales: GeneratedSale[] = []
  const maxSaleDays = platform.max_sale_days || 14
  const cooldownDays = platform.cooldown_days || 30
  
  // Get events for this platform
  const events = getEventsForPlatform(platform.id, platformEvents, yearStart, yearEnd)
  
  // First, add all seasonal/special events (these typically have no cooldown requirement)
  for (const event of events) {
    const eventStart = parseISO(event.start_date)
    const eventEnd = parseISO(event.end_date)
    
    // Clamp to year boundaries
    const saleStart = eventStart < yearStart ? yearStart : eventStart
    const saleEnd = eventEnd > yearEnd ? yearEnd : eventEnd
    
    // Check duration doesn't exceed max
    const duration = differenceInDays(saleEnd, saleStart) + 1
    const actualEnd = duration > maxSaleDays ? addDays(saleStart, maxSaleDays - 1) : saleEnd
    
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
      event_name: event.name
    })
  }
  
  // For conservative, only do events
  if (variation === 'conservative') {
    return sales
  }
  
  // For balanced and aggressive, fill gaps with custom sales
  // Sort existing sales by start date
  const allSales = [...sales].sort((a, b) => 
    parseISO(a.start_date).getTime() - parseISO(b.start_date).getTime()
  )
  
  let currentDate = yearStart
  let customSaleCount = 0
  
  // Determine how many custom sales to add based on variation
  const maxCustomSales = variation === 'aggressive' ? 50 : 12 // balanced = ~monthly
  
  while (currentDate <= yearEnd && customSaleCount < maxCustomSales) {
    // Find next available slot
    const availableDate = findNextAvailableDate(
      addDays(currentDate, -1), // Start checking from current date
      allSales,
      cooldownDays,
      yearEnd
    )
    
    if (!availableDate || availableDate > yearEnd) break
    
    // Calculate sale end date (max duration allowed)
    let saleDuration = maxSaleDays
    if (variation === 'balanced') {
      // For balanced, use slightly shorter sales
      saleDuration = Math.min(maxSaleDays, 7)
    }
    
    const saleEnd = addDays(availableDate, saleDuration - 1)
    const actualEnd = saleEnd > yearEnd ? yearEnd : saleEnd
    
    // Check this doesn't conflict with any existing sale
    if (!hasConflict(availableDate, actualEnd, allSales, 0)) {
      const customSale: GeneratedSale = {
        id: `gen-${productId}-${platform.id}-custom-${customSaleCount}`,
        product_id: productId,
        platform_id: platform.id,
        platform_name: platform.name,
        platform_color: platform.color_hex,
        start_date: format(availableDate, 'yyyy-MM-dd'),
        end_date: format(actualEnd, 'yyyy-MM-dd'),
        discount_percentage: defaultDiscount,
        sale_name: `Custom Sale ${customSaleCount + 1}`,
        sale_type: 'custom',
        is_event: false
      }
      
      allSales.push(customSale)
      allSales.sort((a, b) => 
        parseISO(a.start_date).getTime() - parseISO(b.start_date).getTime()
      )
      
      customSaleCount++
    }
    
    // Move to after this sale's cooldown
    currentDate = addDays(actualEnd, cooldownDays + 1)
  }
  
  return allSales
}

// Calculate stats for a variation
function calculateStats(sales: GeneratedSale[], yearStart: Date, yearEnd: Date): CalendarVariation['stats'] {
  const totalDaysInYear = differenceInDays(yearEnd, yearStart) + 1
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
    percentageOnSale: Math.round((totalDaysOnSale / totalDaysInYear) * 100),
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
    year,
    defaultDiscount = 50
  } = params
  
  const yearStart = startOfYear(new Date(year, 0, 1))
  const yearEnd = endOfYear(new Date(year, 0, 1))
  
  // Filter to main platforms (Steam Custom, PS-All, Xbox, Nintendo-All, Epic)
  const mainPlatforms = platforms.filter(p => 
    ['Steam Custom', 'Steam Seasonal', 'PS-All', 'Xbox', 'Nintendo-All', 'Epic'].includes(p.name)
  )
  
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
      description: 'Participate only in platform seasonal events and major sales'
    }
  ]
  
  for (const config of variationConfigs) {
    const allSales: GeneratedSale[] = []
    
    for (const platform of mainPlatforms) {
      const platformSales = generatePlatformSales(
        productId,
        platform,
        platformEvents,
        yearStart,
        yearEnd,
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
      stats: calculateStats(allSales, yearStart, yearEnd)
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
