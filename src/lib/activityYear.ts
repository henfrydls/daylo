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

/**
 * Every day with at least one thing done, across every year there is.
 *
 * One definition of "a day that counts", so the sidebar, the progress bar and the year
 * rows cannot drift apart about what a completed day is. Unticked logs are days somebody
 * left a note on and are not among them.
 */
export function completedDates(logs: ActivityLog[]): Set<string> {
  const done = new Set<string>()
  for (const entry of logs) {
    if (entry.completed) done.add(entry.date)
  }
  return done
}
