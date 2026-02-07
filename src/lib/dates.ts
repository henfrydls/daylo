import {
  format,
  startOfYear,
  endOfYear,
  eachDayOfInterval,
  getDay,
  startOfWeek,
  isToday,
  isSameDay,
  parseISO,
  differenceInDays,
} from 'date-fns'

export function formatDate(date: Date): string {
  return format(date, 'yyyy-MM-dd')
}

export function formatDisplayDate(date: Date): string {
  return format(date, 'MMM d, yyyy')
}

export function formatMonthYear(date: Date): string {
  return format(date, 'MMMM yyyy')
}

export function getYearDays(year: number): Date[] {
  const start = startOfYear(new Date(year, 0, 1))
  const end = endOfYear(new Date(year, 0, 1))
  return eachDayOfInterval({ start, end })
}

export function getWeekDay(date: Date): number {
  return getDay(date)
}

export function getFirstDayOffset(year: number): number {
  const firstDay = startOfYear(new Date(year, 0, 1))
  return getDay(firstDay)
}

export function getWeekStartDate(date: Date): Date {
  return startOfWeek(date, { weekStartsOn: 0 })
}

export function checkIsToday(date: Date): boolean {
  return isToday(date)
}

export function checkIsSameDay(date1: Date, date2: Date): boolean {
  return isSameDay(date1, date2)
}

export function parseDateString(dateStr: string): Date {
  return parseISO(dateStr)
}

export function getDaysDifference(date1: Date, date2: Date): number {
  return differenceInDays(date1, date2)
}

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}
