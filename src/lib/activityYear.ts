import { currentStreak } from './streaks'
import type { Activity, ActivityLog } from '../types'

export interface ActivitySummary {
  activity: Activity
  /** The days it was actually done, as yyyy-MM-dd. */
  done: Set<string>
  days: number
  streak: number
}

/**
 * What each activity did with the year: the days, the count, and the run it is on.
 *
 * Only completed logs count. An unticked log is a day somebody left a note on, which
 * toggleLog keeps on purpose, and treating it as done would inflate every figure that
 * reads this.
 */
export function summariseActivities(
  activities: Activity[],
  logs: ActivityLog[],
  today: Date
): ActivitySummary[] {
  const doneByActivity = new Map<string, Set<string>>()
  for (const entry of logs) {
    if (!entry.completed) continue
    const done = doneByActivity.get(entry.activityId) ?? new Set<string>()
    done.add(entry.date)
    doneByActivity.set(entry.activityId, done)
  }

  return activities.map((activity) => {
    const done = doneByActivity.get(activity.id) ?? new Set<string>()
    return { activity, done, days: done.size, streak: currentStreak(done, today) }
  })
}
