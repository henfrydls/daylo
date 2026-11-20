import { useMemo, useCallback, memo, useEffect, useRef } from 'react'
import { YearHeatmap } from './YearHeatmap'
import { YearByActivity } from './YearByActivity'
import { MonthCard } from './MonthCard'
import { YearProgressBar } from './YearProgressBar'
import { HeatmapLegend } from './HeatmapLegend'
import { ActivityWeekStrip } from './ActivityWeekStrip'
import { useCalendarStore } from '../../store'
import { useTravel } from '../../lib/travel'
import { getYearDays, formatDate } from '../../lib/dates'
import { calculateHeatmapLevel } from '../../lib/colors'
import { habitsThatExistedOn, summariseActivities } from '../../lib/activityYear'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { useTodayDate } from '../../lib/today'
import { useShallow } from 'zustand/react/shallow'
import { plural } from '../../lib/plural'
import { monthCompletion as completionOfMonth } from '../../lib/monthCompletion'
import { FirstDayDoor } from './FirstDayDoor'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
interface YearViewProps {
  /** Opens Import from the line under the first day's door. See MonthView. */
  onImport?: (opener: HTMLElement) => void
}

export const YearView = memo(function YearView({ onImport }: YearViewProps) {
  // Use individual selectors to prevent over-subscription
  const selectedYear = useCalendarStore((state) => state.selectedYear)
  const activities = useCalendarStore(useShallow((state) => state.activities))
  const logs = useCalendarStore(useShallow((state) => state.logs))
  const selectedDate = useCalendarStore((state) => state.selectedDate)
  const setSelectedDate = useCalendarStore((state) => state.setSelectedDate)
  // The app's day, not the clock's: see useTodayDate.
  const today = useTodayDate()
  const setSelectedYear = useCalendarStore((state) => state.setSelectedYear)
  const navigateToMonth = useCalendarStore((state) => state.navigateToMonth)
  // On the phone a month card walks the same rail the finger would, so the three ways into
  // Month are one movement rather than three different ones.
  const travel = useTravel()
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

  const habitsOn = useMemo(() => habitsThatExistedOn(activities), [activities])

  // Build day data map using the pre-computed index - O(365) with O(1) lookups
  const dayDataMap = useMemo(() => {
    const map = new Map<string, { completedCount: number; level: 0 | 1 | 2 | 3 | 4 }>()
    // The habits that existed on each day, not the ones that exist now: adding one used to
    // repaint the whole year paler.
    const existedOn = habitsThatExistedOn(activities)

    yearDays.forEach((date) => {
      const dateStr = formatDate(date)
      const completedCount = logsByDate.get(dateStr) || 0
      const level = calculateHeatmapLevel(completedCount, existedOn(dateStr, completedCount))
      map.set(dateStr, { completedCount, level })
    })

    return map
  }, [yearDays, activities, logsByDate])

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
   * A percentage per month, by the rule every month figure follows: see monthCompletion.
   * A month that has not begun gets null rather than a zero, because nothing was missed
   * yet and 0% reads as a failure.
   */
  const monthCompletion = useMemo(() => {
    const isDone = (date: string) => (logsByDate.get(date) ?? 0) > 0
    return Array.from({ length: 12 }, (_, month) => ({
      month,
      percentage: completionOfMonth(selectedYear, month, isDone, today)?.percentage ?? null,
    }))
  }, [logsByDate, selectedYear, today])

  /**
   * The phone's strips end on the week we are in, or on the last week of a year already
   * over: "the last 26 weeks" of 2024 means the ones it ended with, not the ones before
   * today.
   */
  const stripEnd = useMemo(() => {
    const endOfSelected = new Date(selectedYear, 11, 31)
    return today < endOfSelected ? today : endOfSelected
  }, [selectedYear, today])

  const activityRows = useMemo(
    () => summariseActivities(activities, logs, stripEnd),
    [activities, logs, stripEnd]
  )

  const handlePrevYear = useCallback(
    () => setSelectedYear(selectedYear - 1),
    [setSelectedYear, selectedYear]
  )
  const handleNextYear = useCallback(
    () => setSelectedYear(selectedYear + 1),
    [setSelectedYear, selectedYear]
  )
  // Today goes to today: Month, on the month that holds it, where today is ringed and the
  // Today bar is there to log it. It used to set the year to this one, which on this year,
  // the case almost everybody is in, did nothing at all (2026-11-13 review, A-05). Always
  // to Month, this year or not. On the phone it walks the same rail as a month card.
  const handleToday = useCallback(() => {
    const pick = { year: today.getFullYear(), month: today.getMonth() }
    if (travel) travel.toMonth(pick)
    else navigateToMonth(pick.year, pick.month)
  }, [today, travel, navigateToMonth])

  /**
   * The wait for Month, on the phone, while one is going on: how to call it off. One at a
   * time, so a second tap during the journey is the same journey and leaves nothing
   * behind to open the sheet on some later visit to Month; and called off if the door
   * leaves the page first.
   */
  const waiting = useRef<(() => void) | null>(null)
  useEffect(() => () => waiting.current?.(), [])

  const openToday = () => {
    const day = formatDate(today)
    if (travel === null) {
      handleToday()
      setSelectedDate(day)
      return
    }
    if (waiting.current !== null) return
    // On the phone the rail is still sliding to Month when handleToday returns, and a sheet
    // coming up over it looked like two things fighting. So the sheet waits for the
    // arrival: the first change of view, which from Year can only be to Month. A journey
    // that has not landed in a second and a half (a resize, frames that stopped in the
    // background) opens it anyway, rather than leave a door that did nothing.
    // Only while the door is still there. On the phone Year stays mounted beside Month,
    // so an import during the journey does not unmount anything: it takes the door away,
    // and the sheet the door promised is no longer owed.
    const open = () => {
      stop()
      const now = useCalendarStore.getState()
      if (now.activities.length === 0) now.setSelectedDate(day)
    }
    const stop = () => {
      unsubscribe()
      window.clearTimeout(giveUp)
      waiting.current = null
    }
    const unsubscribe = useCalendarStore.subscribe((state, before) => {
      if (state.currentView !== before.currentView) open()
    })
    const giveUp = window.setTimeout(open, 1500)
    waiting.current = stop
    handleToday()
  }

  // With no activities the year has the same door as the month: to today, in Month, with
  // its sheet open on the form.
  const door =
    activities.length === 0 ? <FirstDayDoor onOpenToday={openToday} onImport={onImport} /> : null

  /**
   * Both layouts show the same control, so it is written once. Rendering it twice with
   * two copies of the markup is how a phone and a desktop end up disagreeing about what
   * a button is called.
   */
  const yearModeToggle = (
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
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-1 focus:outline-none ${
            yearMode === mode
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  )

  // --- Mobile Layout: Year Summary Cards ---
  if (isMobile) {
    return (
      <div className="p-4 w-full">
        {/* Year Navigation */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            {/* Focusable by script only: where the focus goes after an import from the
                first day's door, which takes the door and its line away. */}
            <h1
              tabIndex={-1}
              data-testid="year-title"
              className="text-2xl font-bold text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-1 rounded-lg px-1 -mx-1"
            >
              {selectedYear}
            </h1>
            <div className="flex items-center gap-1">
              <button
                onClick={handlePrevYear}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-1"
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
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-1"
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
            onClick={handleToday}
            className="min-h-[44px] px-4 text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-800 rounded-lg transition-colors border border-gray-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-1"
            aria-label="Go to today"
          >
            Today
          </button>
        </div>

        {door}

        {/* Year Progress Bar */}
        <div className="mb-5">
          <YearProgressBar
            year={selectedYear}
            logsByDate={logsByDate}
            totalActivities={activities.length}
          />
        </div>

        <div className="mb-4 flex items-center justify-between gap-2">
          {yearModeToggle}
          {yearMode === 'byActivity' ? (
            <span className="text-xs text-gray-500">Last 26 weeks</span>
          ) : null}
        </div>

        {yearMode === 'all' ? (
          <>
            {/* Month Cards Grid (3 columns x 4 rows) */}
            <div className="grid grid-cols-3 gap-2" data-testid="month-cards-grid">
              {Array.from({ length: 12 }, (_, month) => (
                <MonthCard
                  key={month}
                  year={selectedYear}
                  month={month}
                  habitsOn={habitsOn}
                  logsByDate={logsByDate}
                  onSelect={(m) =>
                    travel
                      ? travel.toMonth({ year: selectedYear, month: m })
                      : navigateToMonth(selectedYear, m)
                  }
                />
              ))}
            </div>

            {/* Heatmap Legend */}
            <div className="mt-4 flex justify-center">
              <HeatmapLegend />
            </div>
          </>
        ) : activityRows.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-500">
            No activities yet. Add one to see its weeks.
          </p>
        ) : (
          <div>
            {activityRows.map(({ activity, done, days, streak }) => (
              <ActivityWeekStrip
                key={activity.id}
                name={activity.name}
                color={activity.color}
                done={done}
                end={stripEnd}
                days={days}
                streak={streak}
              />
            ))}
          </div>
        )}
      </div>
    )
  }

  // --- Desktop Layout (unchanged) ---
  return (
    <div className="p-4 sm:p-6 lg:p-8 w-full">
      {/* Year Navigation */}
      <div
        className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
        data-testid="year-header"
      >
        <div className="flex items-center gap-4">
          {/* See the phone's heading above. */}
          <h1
            tabIndex={-1}
            data-testid="year-title"
            className="text-2xl font-bold text-gray-900 sm:text-3xl focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-1 rounded-lg px-1 -mx-1"
          >
            {selectedYear}
          </h1>
          <div className="flex items-center gap-1">
            <button
              onClick={handlePrevYear}
              className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-1 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 flex items-center justify-center"
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
              className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-1 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 flex items-center justify-center"
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
              onClick={handleToday}
              className="ml-2 px-4 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-800 rounded-lg transition-colors border border-gray-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-1 min-h-[44px] sm:min-h-0"
              aria-label="Go to today"
            >
              Today
            </button>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Which way the year reads. A segmented control rather than a switch: both
              options are views of the same year, neither is on or off. */}
          {yearModeToggle}

          {/* The legend names the five shades of the combined heatmap. A row per activity
              is one colour or grey, so in that mode it moves down to the only row it
              still describes. */}
          {yearMode === 'all' ? <HeatmapLegend /> : null}
        </div>
      </div>

      {door}

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
              habitsOn={habitsOn}
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
            />

            {/* Bottom Summary */}
            <div className="mt-6 flex flex-wrap justify-between gap-6 border-t border-gray-100 pt-4 text-sm text-gray-500">
              <div className="flex flex-wrap gap-6">
                <div>
                  <span className="font-medium text-gray-700">{activeDays}</span>{' '}
                  {plural(activeDays, 'active day', 'active days')}
                </div>
                <div>
                  <span className="font-medium text-gray-700">{completedLogsCount}</span>{' '}
                  {plural(completedLogsCount, 'completion', 'completions')} this year
                </div>
              </div>
              <div>
                <span className="font-medium text-gray-700">{activities.length}</span>{' '}
                {plural(activities.length, 'activity', 'activities')} tracked
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
                    onClick={() =>
                      travel
                        ? travel.toMonth({ year: selectedYear, month })
                        : navigateToMonth(selectedYear, month)
                    }
                    className="rounded-lg px-1 py-1 text-center hover:bg-gray-50 focus-visible:ring-2 focus-visible:ring-emerald-500 focus:outline-none"
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
