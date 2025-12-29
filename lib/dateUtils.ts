import { addDays, differenceInDays, format, parseISO, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isWithinInterval, isBefore, isAfter } from 'date-fns'

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
  const d = typeof date === 'string' ? parseISO(date) : date
  return format(d, 'yyyy-MM-dd')
}

export function formatDisplayDate(date: Date | string): string {
  const d = typeof date === 'string' ? parseISO(date) : date
  return format(d, 'dd/MM/yyyy')
}

export function getDaysBetween(start: Date | string, end: Date | string): number {
  const startDate = typeof start === 'string' ? parseISO(start) : start
  const endDate = typeof end === 'string' ? parseISO(end) : end
  return differenceInDays(endDate, startDate) + 1 // Include both start and end days
}

export function calculateCooldownEnd(saleEndDate: Date | string, cooldownDays: number): Date {
  const endDate = typeof saleEndDate === 'string' ? parseISO(saleEndDate) : saleEndDate
  return addDays(endDate, cooldownDays)
}

export function isDateInRange(date: Date, start: Date | string, end: Date | string): boolean {
  const startDate = typeof start === 'string' ? parseISO(start) : start
  const endDate = typeof end === 'string' ? parseISO(end) : end
  return isWithinInterval(date, { start: startDate, end: endDate })
}

export function doRangesOverlap(
  start1: Date | string, 
  end1: Date | string, 
  start2: Date | string, 
  end2: Date | string
): boolean {
  const s1 = typeof start1 === 'string' ? parseISO(start1) : start1
  const e1 = typeof end1 === 'string' ? parseISO(end1) : end1
  const s2 = typeof start2 === 'string' ? parseISO(start2) : start2
  const e2 = typeof end2 === 'string' ? parseISO(end2) : end2
  
  return !(isAfter(s1, e2) || isAfter(s2, e1))
}

export function getPositionForDate(date: Date | string, timelineStart: Date, dayWidth: number): number {
  const d = typeof date === 'string' ? parseISO(date) : date
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
