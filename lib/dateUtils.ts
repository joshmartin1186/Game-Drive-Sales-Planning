import { addDays, differenceInDays, format, parseISO, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isWithinInterval, isBefore, isAfter } from 'date-fns'

/**
 * CRITICAL: Normalizes a date string to a local Date object.
 * 
 * This fixes timezone issues where parseISO('2026-01-16') returns UTC midnight,
 * but our timeline uses local dates. In timezones behind UTC, this causes
 * dates to appear offset by 1 day (or more depending on the time).
 * 
 * This function extracts the year, month, day from the string and creates
 * a local Date object, ensuring consistent positioning on the timeline.
 */
export function normalizeToLocalDate(date: Date | string): Date {
  if (typeof date === 'string') {
    // Extract date parts from string to avoid timezone issues
    // Handles both 'yyyy-MM-dd' and ISO formats
    const dateStr = date.split('T')[0] // Get just the date part
    const [year, month, day] = dateStr.split('-').map(Number)
    return new Date(year, month - 1, day) // month is 0-indexed
  }
  // If already a Date, normalize to midnight local time
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

/**
 * Safe version of parseISO that normalizes to local timezone.
 * Use this instead of parseISO() for timeline positioning.
 */
export function parseLocalDate(dateStr: string): Date {
  return normalizeToLocalDate(dateStr)
}

export function generateTimelineMonths(startDate: Date, monthCount: number = 12): Date[] {
  const months: Date[] = []
  for (let i = 0; i < monthCount; i++) {
    const month = new Date(startDate.getFullYear(), startDate.getMonth() + i, 1)
    months.push(month)
  }
  return months
}

export function generateDaysForMonth(month: Date): Date[] {
  const start = startOfMonth(month)
  const end = endOfMonth(month)
  return eachDayOfInterval({ start, end })
}

export function generateAllDays(startDate: Date, monthCount: number = 12): Date[] {
  const months = generateTimelineMonths(startDate, monthCount)
  return months.flatMap(month => generateDaysForMonth(month))
}

export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? normalizeToLocalDate(date) : date
  return format(d, 'yyyy-MM-dd')
}

export function formatDisplayDate(date: Date | string): string {
  const d = typeof date === 'string' ? normalizeToLocalDate(date) : date
  return format(d, 'dd/MM/yyyy')
}

export function getDaysBetween(start: Date | string, end: Date | string): number {
  const startDate = typeof start === 'string' ? normalizeToLocalDate(start) : start
  const endDate = typeof end === 'string' ? normalizeToLocalDate(end) : end
  return differenceInDays(endDate, startDate) + 1 // Include both start and end days
}

export function calculateCooldownEnd(saleEndDate: Date | string, cooldownDays: number): Date {
  const endDate = typeof saleEndDate === 'string' ? normalizeToLocalDate(saleEndDate) : saleEndDate
  return addDays(endDate, cooldownDays)
}

export function isDateInRange(date: Date, start: Date | string, end: Date | string): boolean {
  const startDate = typeof start === 'string' ? normalizeToLocalDate(start) : start
  const endDate = typeof end === 'string' ? normalizeToLocalDate(end) : end
  return isWithinInterval(date, { start: startDate, end: endDate })
}

export function doRangesOverlap(
  start1: Date | string, 
  end1: Date | string, 
  start2: Date | string, 
  end2: Date | string
): boolean {
  const s1 = typeof start1 === 'string' ? normalizeToLocalDate(start1) : start1
  const e1 = typeof end1 === 'string' ? normalizeToLocalDate(end1) : end1
  const s2 = typeof start2 === 'string' ? normalizeToLocalDate(start2) : start2
  const e2 = typeof end2 === 'string' ? normalizeToLocalDate(end2) : end2
  
  return !(isAfter(s1, e2) || isAfter(s2, e1))
}

export function getPositionForDate(date: Date | string, timelineStart: Date, dayWidth: number): number {
  const d = typeof date === 'string' ? normalizeToLocalDate(date) : date
  const daysDiff = differenceInDays(d, timelineStart)
  return daysDiff * dayWidth
}

export function getDateFromPosition(position: number, timelineStart: Date, dayWidth: number): Date {
  const daysDiff = Math.round(position / dayWidth)
  return addDays(timelineStart, daysDiff)
}

export function isWeekend(date: Date): boolean {
  const day = date.getDay()
  return day === 0 || day === 6
}
