import { useMemo } from 'react'
import { useCalendarStore } from '../../store'
import { formatDate, getYearDays } from '../../lib/dates'

export function StatsPanel() {
  const { selectedYear, activities, logs } = useCalendarStore()

  const stats = useMemo(() => {
    if (activities.length === 0) {
      return {
        totalDays: 0,
        activeDays: 0,
        currentStreak: 0,
        longestStreak: 0,
        completionRate: 0,
      }
    }

    const yearDays = getYearDays(selectedYear)
    const today = new Date()

    // Count days with at least one activity completed
    const daysWithActivity = new Set<string>()
    logs.forEach((log) => {
      if (log.completed && log.date.startsWith(String(selectedYear))) {
        daysWithActivity.add(log.date)
      }
    })

    // Calculate streaks
    let currentStreak = 0
    let longestStreak = 0
    let tempStreak = 0

    // Sort days for streak calculation
    const sortedDays = yearDays
      .filter((d) => d <= today)
      .map((d) => formatDate(d))
      .reverse()

    for (const dateStr of sortedDays) {
      if (daysWithActivity.has(dateStr)) {
        tempStreak++
        if (currentStreak === 0 || sortedDays.indexOf(dateStr) === tempStreak - 1) {
          currentStreak = tempStreak
        }
        longestStreak = Math.max(longestStreak, tempStreak)
      } else {
        if (tempStreak > 0 && sortedDays.indexOf(dateStr) !== 0) {
          currentStreak = tempStreak
        }
        tempStreak = 0
      }
    }

    // Recalculate current streak properly
    currentStreak = 0
    for (let i = 0; i < sortedDays.length; i++) {
      if (daysWithActivity.has(sortedDays[i])) {
        currentStreak++
      } else {
        break
      }
    }

    // Calculate completion rate for current month
    const currentMonth = today.getMonth()
    const currentMonthDays = yearDays.filter((d) => d.getMonth() === currentMonth && d <= today)
    const currentMonthCompleted = currentMonthDays.filter((d) =>
      daysWithActivity.has(formatDate(d))
    ).length
    const completionRate =
      currentMonthDays.length > 0
        ? Math.round((currentMonthCompleted / currentMonthDays.length) * 100)
        : 0

    return {
      totalDays: yearDays.filter((d) => d <= today).length,
      activeDays: daysWithActivity.size,
      currentStreak,
      longestStreak,
      completionRate,
    }
  }, [selectedYear, activities, logs])

  if (activities.length === 0) {
    return null
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-3 sm:p-4">
      <h2 className="text-base sm:text-lg font-semibold text-gray-900 mb-3 sm:mb-4">Statistics</h2>
      <div className="grid grid-cols-2 gap-2 sm:gap-4">
        <StatCard label="Active Days" value={stats.activeDays} subtitle="this year" />
        <StatCard label="Current Streak" value={stats.currentStreak} subtitle="days" />
        <StatCard label="Longest Streak" value={stats.longestStreak} subtitle="days" />
        <StatCard label="This Month" value={`${stats.completionRate}%`} subtitle="completion" />
      </div>
    </div>
  )
}

function StatCard({
  label,
  value,
  subtitle,
}: {
  label: string
  value: number | string
  subtitle: string
}) {
  return (
    <div className="p-2 sm:p-3 rounded-lg bg-gray-50">
      <div className="text-xl sm:text-2xl font-bold text-gray-900">{value}</div>
      <div className="text-xs sm:text-sm text-gray-600">{label}</div>
      <div className="text-xs text-gray-400">{subtitle}</div>
    </div>
  )
}
