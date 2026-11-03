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

/**
 * How many habits existed on a given day, as a function over the dates you ask about.
 *
 * The heatmap reads a day as `completed / total`, and `total` used to be the number of
 * habits there are now. So creating a fourth habit repainted the whole year paler: a day
 * in March where two of two were done became two of four, and half a year went grey
 * without anybody having done anything differently in March. The past is finished and
 * should stay the colour it earned.
 *
 * `completedThatDay` is not a detail. An imported file can carry logs older than the habit
 * they belong to, because the export keeps the logs and the habit is created fresh on the
 * way in; counting strictly by `createdAt` would then report fewer habits than the day has
 * work in it, and a day with two things done would come out grey. A day never has more
 * done than there was to do.
 *
 * Built once over the sorted creation dates, so asking about 365 days is 365 lookups and
 * not 365 passes over every habit.
 */
export function habitsThatExistedOn(
  activities: Activity[]
): (dateStr: string, completedThatDay: number) => number {
  const born = activities.map((activity) => activity.createdAt.slice(0, 10)).sort()

  return (dateStr, completedThatDay) => {
    let count = 0
    while (count < born.length && born[count] <= dateStr) count += 1
    return Math.max(count, completedThatDay)
  }
}
