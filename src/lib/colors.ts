export const HEATMAP_COLORS = {
  0: 'bg-gray-100', // --level-0: #F3F4F6
  1: 'bg-emerald-100', // --level-1: #D1FAE5
  2: 'bg-emerald-300', // --level-2: #6EE7B7
  3: 'bg-emerald-400', // --level-3: #34D399
  4: 'bg-emerald-500', // --level-4: #10B981
} as const

export const ACTIVITY_COLORS = [
  { name: 'Green', value: '#10B981' },
  { name: 'Blue', value: '#3B82F6' },
  { name: 'Purple', value: '#8B5CF6' },
  { name: 'Pink', value: '#EC4899' },
  { name: 'Orange', value: '#F59E0B' },
  { name: 'Red', value: '#EF4444' },
  { name: 'Teal', value: '#14B8A6' },
  { name: 'Indigo', value: '#6366F1' },
] as const

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
