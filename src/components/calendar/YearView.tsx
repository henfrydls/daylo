import { useMemo, useCallback, memo } from 'react'
import { YearHeatmap } from './YearHeatmap'
import { YearByActivity } from './YearByActivity'
import { MonthCard } from './MonthCard'
import { YearProgressBar } from './YearProgressBar'
import { HeatmapLegend } from './HeatmapLegend'
import { useCalendarStore } from '../../store'
import { getYearDays, formatDate } from '../../lib/dates'
import { calculateHeatmapLevel } from '../../lib/colors'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { useShallow } from 'zustand/react/shallow'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const YearView = memo(function YearView() {
  // Use individual selectors to prevent over-subscription
  const selectedYear = useCalendarStore((state) => state.selectedYear)
  const activities = useCalendarStore(useShallow((state) => state.activities))
  const logs = useCalendarStore(useShallow((state) => state.logs))
  const selectedDate = useCalendarStore((state) => state.selectedDate)
  const setSelectedDate = useCalendarStore((state) => state.setSelectedDate)
  const setSelectedYear = useCalendarStore((state) => state.setSelectedYear)
  const navigateToMonth = useCalendarStore((state) => state.navigateToMonth)
  const yearMode = useCalendarStore((state) => state.yearMode)
  const setYearMode = useCalendarStore((state) => state.setYearMode)

  const isMobile = !useMediaQuery('(min-width: 640px)')

  const yearDays = useMemo(() => getYearDays(selectedYear), [selectedYear])

  // Create an index of completed logs by date - O(n) single pass
  // This avoids O(365 * n) filtering by pre-indexing logs
  const logsByDate = useMemo(() => {
    const index = new Map<string, number>()

    logs.forEach((log) => {
      if (log.completed) {
        const currentCount = index.get(log.date) || 0
        index.set(log.date, currentCount + 1)
      }
    })

    return index
  }, [logs])

  // Build day data map using the pre-computed index - O(365) with O(1) lookups
  const dayDataMap = useMemo(() => {
    const map = new Map<string, { completedCount: number; level: 0 | 1 | 2 | 3 | 4 }>()
    const totalActivities = activities.length

    yearDays.forEach((date) => {
      const dateStr = formatDate(date)
      const completedCount = logsByDate.get(dateStr) || 0
      const level = calculateHeatmapLevel(completedCount, totalActivities)
      map.set(dateStr, { completedCount, level })
    })

    return map
  }, [yearDays, activities.length, logsByDate])

  // Memoize completed logs count to avoid filtering in render
  const completedLogsCount = useMemo(() => {
    return logs.filter((l) => l.completed).length
  }, [logs])

  /** Days with at least one thing done. "Active" is the word the year summary uses. */
  const activeDays = useMemo(
    () => [...dayDataMap.values()].filter((day) => day.completedCount > 0).length,
    [dayDataMap]
  )

  /**
   * A percentage per month, on the same footing as the phone's month cards: days with
   * something done over days in the month. A month that has not begun gets null rather
   * than a zero, because nothing was missed yet and 0% reads as a failure.
   */
  const monthCompletion = useMemo(() => {
    const now = new Date()
    return Array.from({ length: 12 }, (_, month) => {
      if (
        selectedYear > now.getFullYear() ||
        (selectedYear === now.getFullYear() && month > now.getMonth())
      ) {
        return { month, percentage: null }
      }
      const daysInMonth = new Date(selectedYear, month + 1, 0).getDate()
      let done = 0
      for (let day = 1; day <= daysInMonth; day++) {
        const key = formatDate(new Date(selectedYear, month, day))
        if ((dayDataMap.get(key)?.completedCount ?? 0) > 0) done += 1
      }
      return { month, percentage: Math.round((done / daysInMonth) * 100) }
    })
  }, [dayDataMap, selectedYear])

  const handlePrevYear = useCallback(
    () => setSelectedYear(selectedYear - 1),
    [setSelectedYear, selectedYear]
  )
  const handleNextYear = useCallback(
    () => setSelectedYear(selectedYear + 1),
    [setSelectedYear, selectedYear]
  )
  const handleCurrentYear = useCallback(
    () => setSelectedYear(new Date().getFullYear()),
    [setSelectedYear]
  )

  // --- Mobile Layout: Year Summary Cards ---
  if (isMobile) {
    return (
      <div className="p-4 w-full">
        {/* Year Navigation */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{selectedYear}</h1>
            <div className="flex items-center gap-1">
              <button
                onClick={handlePrevYear}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-1"
                aria-label="Previous year"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
              </button>
              <button
                onClick={handleNextYear}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-1"
                aria-label="Next year"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </button>
            </div>
          </div>
          <button
            onClick={handleCurrentYear}
            className="min-h-[44px] px-4 text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-800 rounded-lg transition-colors border border-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-1"
            aria-label="Go to current year"
          >
            Today
          </button>
        </div>

        {/* Year Progress Bar */}
        <div className="mb-5">
          <YearProgressBar
            year={selectedYear}
            logsByDate={logsByDate}
            totalActivities={activities.length}
          />
        </div>

        {/* Month Cards Grid (3 columns x 4 rows) */}
        <div className="grid grid-cols-3 gap-2" data-testid="month-cards-grid">
          {Array.from({ length: 12 }, (_, month) => (
            <MonthCard
              key={month}
              year={selectedYear}
              month={month}
              totalActivities={activities.length}
              logsByDate={logsByDate}
              onSelect={(m) => navigateToMonth(selectedYear, m)}
            />
          ))}
        </div>

        {/* Heatmap Legend */}
        <div className="mt-4 flex justify-center">
          <HeatmapLegend />
        </div>
      </div>
    )
  }

  // --- Desktop Layout (unchanged) ---
  return (
    <div className="p-4 sm:p-6 lg:p-8 w-full">
      {/* Year Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">{selectedYear}</h1>
          <div className="flex items-center gap-1">
            <button
              onClick={handlePrevYear}
              className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-1 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 flex items-center justify-center"
              aria-label="Previous year"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </button>
            <button
              onClick={handleNextYear}
              className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-1 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 flex items-center justify-center"
              aria-label="Next year"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </button>
            <button
              onClick={handleCurrentYear}
              className="ml-2 px-4 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-800 rounded-lg transition-colors border border-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-1 min-h-[44px] sm:min-h-0"
              aria-label="Go to current year"
            >
              Today
            </button>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Which way the year reads. A segmented control rather than a switch: both
              options are views of the same year, neither is on or off. */}
          <div
            className="inline-flex rounded-lg bg-gray-100 p-1"
            role="group"
            aria-label="How to show the year"
          >
            {(
              [
                ['all', 'All activities'],
                ['byActivity', 'By activity'],
              ] as const
            ).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                onClick={() => setYearMode(mode)}
                aria-pressed={yearMode === mode}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-150 focus:ring-2 focus:ring-emerald-500 focus:ring-offset-1 focus:outline-none ${
                  yearMode === mode
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Legend */}
          <HeatmapLegend />
        </div>
      </div>

      {/* One continuous heatmap: a column per week, Sunday at the top */}
      <div className="w-full">
        <div className="mb-3 text-xs font-medium tracking-wider text-gray-400 uppercase">
          Activity Calendar
        </div>

        {yearMode === 'all' ? (
          <>
            <YearHeatmap
              year={selectedYear}
              dayData={dayDataMap}
              totalActivities={activities.length}
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
            />

            {/* Bottom Summary */}
            <div className="mt-6 flex flex-wrap justify-between gap-6 border-t border-gray-100 pt-4 text-sm text-gray-500">
              <div className="flex flex-wrap gap-6">
                <div>
                  <span className="font-medium text-gray-700">{activeDays}</span> active days
                </div>
                <div>
                  <span className="font-medium text-gray-700">{completedLogsCount}</span>{' '}
                  completions this year
                </div>
              </div>
              <div>
                <span className="font-medium text-gray-700">{activities.length}</span> activities
                tracked
              </div>
            </div>

            {/* Month completion */}
            <div className="mt-6">
              <div className="mb-2 text-xs font-medium tracking-wider text-gray-400 uppercase">
                Month completion
              </div>
              <div className="grid grid-cols-12 gap-2" data-testid="month-completion">
                {monthCompletion.map(({ month, percentage }) => (
                  <button
                    key={month}
                    type="button"
                    onClick={() => navigateToMonth(selectedYear, month)}
                    className="rounded-lg px-1 py-1 text-center hover:bg-gray-50 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    aria-label={
                      percentage === null
                        ? `View ${MONTHS[month]} ${selectedYear}, not started yet`
                        : `View ${MONTHS[month]} ${selectedYear}, ${percentage}% complete`
                    }
                  >
                    <div className="text-xs text-gray-400">{MONTHS[month]}</div>
                    <div className="text-sm font-semibold text-gray-700">
                      {percentage === null ? '–' : `${percentage}%`}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </>
        ) : (
          <YearByActivity
            year={selectedYear}
            activities={activities}
            logs={logs}
            dayData={dayDataMap}
            activeDays={activeDays}
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
          />
        )}
      </div>
    </div>
  )
})
