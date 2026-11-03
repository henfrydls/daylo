import { currentStreak } from './streaks'
import { formatDate } from './dates'
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
 * The creation day is read in local time and not by cutting the first ten characters off
 * `createdAt`. That string is written with `toISOString()`, which is UTC, while every date
 * the heatmap asks about comes from `formatDate`, which is local, and cutting mixes the two
 * calendars. Both halves of the mistake happen to real people: in Santo Domingo a habit
 * made after 20:00 was born tomorrow, so today did not count it and came out greener than
 * it was; in India a habit made before 05:30 was born yesterday, and that day came out
 * paler. The suite is pinned to a half hour zone so neither can pass unnoticed.
 *
 * Sorted once and then bisected, so asking about 365 days is 365 bisections of the habits
 * and not 365 walks over them.
 */
export function habitsThatExistedOn(
  activities: Activity[]
): (dateStr: string, completedThatDay: number) => number {
  const born = activities.map((activity) => formatDate(new Date(activity.createdAt))).sort()

  return (dateStr, completedThatDay) => {
    let low = 0
    let high = born.length
    while (low < high) {
      const middle = (low + high) >> 1
      if (born[middle] <= dateStr) low = middle + 1
      else high = middle
    }
    return Math.max(low, completedThatDay)
  }
}
