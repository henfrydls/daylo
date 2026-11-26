import { useMemo, type ReactNode } from 'react'
import { useCalendarStore } from '../../store'
import { formatDate } from '../../lib/dates'
import { longestStreak } from '../../lib/streaks'
import { completedDates } from '../../lib/activityYear'
import { useTodayDate } from '../../lib/today'
import { monthCompletion } from '../../lib/monthCompletion'
import { monthStart } from '../../lib/firstDay'

export function StatsPanel() {
  const { selectedYear, activities, logs, firstOpenedAt } = useCalendarStore()
  // The app's day, not the clock's: see useTodayDate.
  const today = useTodayDate()

  const stats = useMemo(() => {
    // Two sets, because the panel answers two kinds of question. Active days and this
    // month are about the year on screen. The longest streak is about the person: it is
    // read over every log there is, so a run through the new year is not cut in half by
    // the calendar and the best one is still the best whatever year is being looked at.
    const everyDayWithActivity = completedDates(logs)
    // Days gone by, in the year on screen. A day still to come is not an active day: an
    // imported file can carry next year in it, and the days elapsed underneath stop at
    // today, so counting them said more days active than there have been.
    const limit = formatDate(today)
    const daysWithActivity = new Set(
      [...everyDayWithActivity].filter(
        (date) => date.startsWith(String(selectedYear)) && date <= limit
      )
    )

    // The current month of the year on screen, by the rule every month figure follows (see
    // monthCompletion): its days up to today, which in an older year is all of them. In a
    // year still to come the month has not begun and there is no figure, as on the year's
    // row of months. In the month the person started it counts from their first day.
    const completionRate =
      monthCompletion(
        selectedYear,
        today.getMonth(),
        (date) => everyDayWithActivity.has(date),
        today,
        monthStart(firstOpenedAt, logs)
      )?.percentage ?? null

    return {
      activeDays: daysWithActivity.size,
      longestStreak: longestStreak(everyDayWithActivity, today),
      completionRate,
    }
  }, [selectedYear, logs, today, firstOpenedAt])

  if (activities.length === 0) {
    return null
  }

  return (
    <div
      className="bg-white rounded-xl border border-gray-200 p-3 sm:p-4"
      data-testid="stats-panel"
    >
      <h2 className="text-base sm:text-lg font-semibold text-gray-900 mb-3 sm:mb-4">Statistics</h2>
      <div className="grid grid-cols-2 gap-2 sm:gap-4">
        {/* Each card says what period it covers, and now the layout says it too: the two
            that follow the year on screen sit together on the first row, and the one about
            the person takes the width below them. The current run left for the header in
            1.6, where it is on every screen and at every width rather than in the corner of
            a panel the month view does not show on a phone. */}
        <StatCard label="Active Days" value={stats.activeDays} subtitle="this year" />
        <StatCard
          label="This Month"
          value={
            stats.completionRate === null ? (
              // The dash is for the eye, the words for a screen reader, which would read
              // a lone dash as nothing or as "en dash".
              <>
                <span aria-hidden="true">–</span>
                <span className="sr-only">Not started yet</span>
              </>
            ) : (
              `${stats.completionRate}%`
            )
          }
          subtitle="completion"
        />
        <StatCard
          label="Longest Streak"
          value={stats.longestStreak}
          subtitle="all time"
          className="col-span-2"
        />
      </div>
    </div>
  )
}

function StatCard({
  label,
  value,
  subtitle,
  className = '',
}: {
  label: string
  value: ReactNode
  subtitle: string
  className?: string
}) {
  return (
    <div className={`p-2 sm:p-3 rounded-lg bg-gray-50 ${className}`}>
      <div className="text-xl sm:text-2xl font-bold text-gray-900">{value}</div>
      <div className="text-xs sm:text-sm text-gray-600" data-testid="stat-label">
        {label}
      </div>
      <div className="text-xs text-gray-400">{subtitle}</div>
    </div>
  )
}
