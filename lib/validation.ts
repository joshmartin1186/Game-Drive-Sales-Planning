import { Sale, Platform, ValidationResult } from './types'
import { parseISO, addDays, isBefore, isAfter, isSameDay } from 'date-fns'

export function validateSale(
  newSale: {
    product_id: string
    platform_id: string
    start_date: string
    end_date: string
    sale_type?: 'custom' | 'seasonal' | 'festival' | 'special'
  },
  existingSales: Sale[],
  platform: Platform,
  excludeSaleId?: string // For editing existing sales
): ValidationResult {
  const newStart = parseISO(newSale.start_date)
  const newEnd = parseISO(newSale.end_date)
  
  // Filter to same product + platform, excluding the sale being edited
  const relevantSales = existingSales.filter(sale => 
    sale.product_id === newSale.product_id &&
    sale.platform_id === newSale.platform_id &&
    sale.id !== excludeSaleId
  )
  
  const conflicts: Sale[] = []
  
  for (const existingSale of relevantSales) {
    const existingStart = parseISO(existingSale.start_date)
    const existingEnd = parseISO(existingSale.end_date)
    
    // Check for direct overlap (sales can't run at the same time)
    if (doPeriodsOverlap(newStart, newEnd, existingStart, existingEnd)) {
      conflicts.push(existingSale)
      continue
    }
    
    // Check cooldown violations
    // Cooldown is from END of sale
    const cooldownDays = platform.cooldown_days
    
    // If seasonal/special sale and platform allows no cooldown for special sales, skip cooldown check
    if ((newSale.sale_type === 'seasonal' || newSale.sale_type === 'special') && platform.special_sales_no_cooldown) {
      continue
    }
    
    // Calculate cooldown end for existing sale
    // Rule: Last day of cooldown CAN be the first day of new sale (10 AM overlap rule)
    const cooldownEnd = addDays(existingEnd, cooldownDays - 1) // -1 because last cooldown day = valid start
    
    // New sale starts during cooldown period?
    if (isBefore(newStart, existingEnd) || 
        (isAfter(newStart, existingEnd) && isBefore(newStart, cooldownEnd))) {
      // Check if it's exactly on the last cooldown day (which is allowed)
      if (!isSameDay(newStart, cooldownEnd) && !isAfter(newStart, cooldownEnd)) {
        conflicts.push(existingSale)
        continue
      }
    }
    
    // Also check reverse: does existing sale start during new sale's cooldown?
    const newCooldownEnd = addDays(newEnd, cooldownDays - 1)
    if (isAfter(existingStart, newEnd) && isBefore(existingStart, newCooldownEnd)) {
      if (!isSameDay(existingStart, newCooldownEnd)) {
        conflicts.push(existingSale)
      }
    }
  }
  
  const cooldownEnd = addDays(newEnd, platform.cooldown_days)
  
  return {
    valid: conflicts.length === 0,
    conflicts,
    cooldownEnd: cooldownEnd.toISOString(),
    message: conflicts.length > 0 
      ? `Sale conflicts with ${conflicts.length} existing sale(s) or cooldown period(s)`
      : undefined
  }
}

function doPeriodsOverlap(start1: Date, end1: Date, start2: Date, end2: Date): boolean {
  return !(isAfter(start1, end2) || isAfter(start2, end1))
}

export function calculateCooldownPeriod(
  saleEndDate: string,
  cooldownDays: number
): { start: string; end: string } {
  const endDate = parseISO(saleEndDate)
  const cooldownStart = addDays(endDate, 1)
  const cooldownEnd = addDays(endDate, cooldownDays)
  
  return {
    start: cooldownStart.toISOString().split('T')[0],
    end: cooldownEnd.toISOString().split('T')[0]
  }
}
