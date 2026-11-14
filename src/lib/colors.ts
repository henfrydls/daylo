export const HEATMAP_COLORS = {
  0: 'bg-gray-100', // --level-0: #F3F4F6
  1: 'bg-emerald-100', // --level-1: #D1FAE5
  2: 'bg-emerald-300', // --level-2: #6EE7B7
  3: 'bg-emerald-400', // --level-3: #34D399
  4: 'bg-emerald-500', // --level-4: #10B981
} as const

export const ACTIVITY_COLORS = [
  // Primary 8 — most visually distinct (shown collapsed)
  { name: 'Green', value: '#10B981' },
  { name: 'Blue', value: '#3B82F6' },
  { name: 'Purple', value: '#8B5CF6' },
  { name: 'Pink', value: '#EC4899' },
  { name: 'Orange', value: '#F59E0B' },
  { name: 'Red', value: '#EF4444' },
  { name: 'Teal', value: '#14B8A6' },
  { name: 'Slate', value: '#64748B' },
  // Extended palette
  { name: 'Indigo', value: '#6366F1' },
  { name: 'Cyan', value: '#06B6D4' },
  { name: 'Lime', value: '#84CC16' },
  { name: 'Amber', value: '#D97706' },
  { name: 'Rose', value: '#F43F5E' },
  { name: 'Sky', value: '#0EA5E9' },
  { name: 'Fuchsia', value: '#D946EF' },
  { name: 'Emerald', value: '#059669' },
] as const

/**
 * A hex color in one spelling: uppercase, six digits. A backup can carry "#10b981" or
 * "#1B9", which an import accepts, and read as written the first is not the #10B981 the
 * palette calls green.
 */
function canonicalHex(color: string): string {
  const hex = color.trim().toUpperCase()
  return /^#[0-9A-F]{3}$/.test(hex)
    ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
    : hex
}

/** Whether two hex colors are the same color, however each is written. */
export function sameColor(a: string, b: string): boolean {
  return canonicalHex(a) === canonicalHex(b)
}

/**
 * The color a new activity starts on: the first in the palette that no activity wears
 * yet. Starting every one on the first color made two or three activities created
 * without touching the picker all the same green, and their dots in the month could not
 * be told apart.
 *
 * Compared with sameColor, the way the picker decides which colors to dim, so what is
 * offered is never one the picker shows as taken. When every color is taken the first
 * one is offered, as before: repeating a color is allowed, just unhelpful.
 */
export function firstFreeColor(colorsInUse: readonly string[]): string {
  const free = ACTIVITY_COLORS.find((c) => !colorsInUse.some((used) => sameColor(used, c.value)))
  return (free ?? ACTIVITY_COLORS[0]).value
}

export function getHeatmapColor(level: 0 | 1 | 2 | 3 | 4): string {
  return HEATMAP_COLORS[level]
}

export function calculateHeatmapLevel(
  completedCount: number,
  totalActivities: number
): 0 | 1 | 2 | 3 | 4 {
  if (totalActivities === 0 || completedCount === 0) return 0
  const percentage = (completedCount / totalActivities) * 100
  if (percentage <= 25) return 1
  if (percentage <= 50) return 2
  if (percentage <= 75) return 3
  return 4
}
