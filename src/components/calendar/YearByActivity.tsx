import { memo, useMemo } from 'react'
import { YearHeatmap } from './YearHeatmap'
import { HeatmapLegend } from './HeatmapLegend'
import { currentStreak } from '../../lib/streaks'
import type { Activity, ActivityLog, HeatmapLevel } from '../../types'

interface YearByActivityProps {
  year: number
  activities: Activity[]
  logs: ActivityLog[]
  dayData: Map<string, { completedCount: number; level: HeatmapLevel }>
  activeDays: number
  selectedDate: string | null
  onSelectDate: (date: string) => void
}

/**
 * The same year, one row per activity, each in its own colour.
 *
 * The cells stay the size they are in the combined view, so the two can be read against
 * each other and a column means the same week in both. With many activities the page
 * grows and scrolls rather than the cells shrinking: ten activities is about fourteen
 * hundred pixels, and a heatmap squeezed to fit is one nobody can read.
 */
export const YearByActivity = memo(function YearByActivity({
  year,
  activities,
  logs,
  dayData,
  activeDays,
  selectedDate,
  onSelectDate,
}: YearByActivityProps) {
  const rows = useMemo(() => {
    // Only completed logs count. An unticked log is a day somebody left a note on, and
    // treating it as done would inflate every figure on this screen.
    const doneByActivity = new Map<string, Set<string>>()
    for (const entry of logs) {
      if (!entry.completed) continue
      const done = doneByActivity.get(entry.activityId) ?? new Set<string>()
      done.add(entry.date)
      doneByActivity.set(entry.activityId, done)
    }

    const today = new Date()
    return activities.map((item) => {
      const done = doneByActivity.get(item.id) ?? new Set<string>()
      return {
        activity: item,
        done,
        days: done.size,
        streak: currentStreak(done, today),
      }
    })
  }, [activities, logs])

  if (activities.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-gray-500" data-testid="by-activity-empty">
        No activities yet. Add one to see its year.
      </p>
    )
  }

  return (
    <div className="w-full">
      {rows.map(({ activity, done, days, streak }, index) => (
        <div
          key={activity.id}
          className="border-b border-gray-100 py-4 first:pt-0"
          data-testid={`activity-row-${activity.name}`}
        >
          <div className="mb-2 flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: activity.color }}
              aria-hidden="true"
            />
            <span className="text-sm font-semibold text-gray-800">{activity.name}</span>
            <span className="text-xs text-gray-500">
              {days} {days === 1 ? 'day' : 'days'} · {streak} day streak
            </span>
          </div>

          <YearHeatmap
            year={year}
            dayData={dayData}
            totalActivities={activities.length}
            selectedDate={selectedDate}
            onSelectDate={onSelectDate}
            activity={{ name: activity.name, color: activity.color, done }}
            showMonthLabels={index === 0}
          />
        </div>
      ))}

      <div className="py-4" data-testid="activity-row-All">
        <div className="mb-2 flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-800">All activities</span>
          <span className="text-xs text-gray-500">{activeDays} active days</span>
          {/* The five shades belong to this row and to no other one here. */}
          <div className="ml-auto">
            <HeatmapLegend compact />
          </div>
        </div>

        <YearHeatmap
          year={year}
          dayData={dayData}
          totalActivities={activities.length}
          selectedDate={selectedDate}
          onSelectDate={onSelectDate}
          showMonthLabels={false}
        />
      </div>
    </div>
  )
})
