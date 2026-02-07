export interface Activity {
  id: string
  name: string
  color: string
  createdAt: string
  updatedAt: string
}

export interface ActivityLog {
  id: string
  activityId: string
  date: string // YYYY-MM-DD format
  completed: boolean
  notes?: string
  createdAt: string
}

export interface DayData {
  date: string
  logs: ActivityLog[]
  completionLevel: HeatmapLevel
}

export type HeatmapLevel = 0 | 1 | 2 | 3 | 4

export interface Stats {
  totalDays: number
  completedDays: number
  currentStreak: number
  longestStreak: number
  monthlyPercentage: number
}
