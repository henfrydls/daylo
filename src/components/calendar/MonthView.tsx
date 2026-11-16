import { useMemo, useCallback, memo, useState } from 'react'
import { useCalendarStore } from '../../store'
import { useTravel } from '../../lib/travel'
import { formatDate, formatMonthYear } from '../../lib/dates'
import { useTodayDate } from '../../lib/today'
import { completedDates } from '../../lib/activityYear'
import { isSecondDay, yesterdayStillOpen } from '../../lib/streaks'
import { subDays } from 'date-fns'
import type { Activity, ActivityLog } from '../../types'
import { useShallow } from 'zustand/react/shallow'
import { count } from '../../lib/plural'
import { TODAY_RING, YESTERDAY_RING } from './rings'
import { YesterdayRow } from './YesterdayRow'
import { FirstDayDoor, TodayTile } from './FirstDayDoor'

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DAYS_OF_WEEK_SHORT = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

interface DayInfo {
  date: Date
  dateStr: string
  isCurrentMonth: boolean
  isToday: boolean
  logs: ActivityLog[]
}

function getMonthDays(year: number, month: number, today: string): DayInfo[] {
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  // `|| 7` and not `getDay()`, because a Sunday answers 0 and the loop below then prepends
  // nothing at all: a month that begins on a Sunday showed not one day of the month before
  // it. That is 13 months in every 96, and it is the worst case rather than a corner. The
  // 2nd of such a month puts the whole of somebody's run on the screen they are not
  // looking at, so the arrival screen of a person who has turned up four days running is
  // an empty grid with one dot in it.
  //
  // Seven is the most this can prepend, and 7 + 31 is 38, so it is still 42 cells and six
  // rows for every month. Checked from 2024 to 2031.
  const startDayOfWeek = firstDay.getDay() || 7
  const daysInMonth = lastDay.getDate()

  const days: DayInfo[] = []

  // Previous month days
  const prevMonthLastDay = new Date(year, month, 0).getDate()
  for (let i = startDayOfWeek - 1; i >= 0; i--) {
    const date = new Date(year, month - 1, prevMonthLastDay - i)
    days.push({
      date,
      dateStr: formatDate(date),
      isCurrentMonth: false,
      isToday: formatDate(date) === today,
      logs: [],
    })
  }

  // Current month days
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d)
    days.push({
      date,
      dateStr: formatDate(date),
      isCurrentMonth: true,
      isToday: formatDate(date) === today,
      logs: [],
    })
  }

  // Next month days to fill the grid (6 rows * 7 days = 42)
  const remainingDays = 42 - days.length
  for (let d = 1; d <= remainingDays; d++) {
    const date = new Date(year, month + 1, d)
    days.push({
      date,
      dateStr: formatDate(date),
      isCurrentMonth: false,
      isToday: formatDate(date) === today,
      logs: [],
    })
  }

  return days
}

/**
 * What a day's number looks like, as one decision rather than four conditions.
 *
 * Four conditions pasted one under another can match twice: a ringed yesterday on the 1st
 * of a month is in the month before, so it took `text-gray-900` from the ring and
 * `text-gray-400` from being outside the month, and which one won was the order the rules
 * happened to be written in. They could also match none: an ordinary yesterday was excluded
 * from the plain branch along with the ringed one, so it inherited whatever colour it
 * landed on.
 *
 * Returning one string from one branch makes both of those impossible to write.
 */
function tone(day: DayInfo, yesterdayStr: string, yesterdayIsOpen: boolean): string {
  if (day.isToday && day.logs.length > 0) return 'bg-emerald-700 text-white'
  if (day.isToday) return TODAY_RING
  // The same shape as today's and not the same ring, so that today stays the only green
  // ring on the screen. See rings.ts for why it differs in weight as well as colour.
  if (day.dateStr === yesterdayStr && yesterdayIsOpen) return YESTERDAY_RING

  return day.isCurrentMonth ? 'text-gray-900' : 'text-gray-400'
}

interface MonthViewProps {
  /**
   * Opens Import, given the link that asked, so focus can go back to it. Without it the
   * empty month offers no backup, because nothing could open one.
   */
  onImport?: (opener: HTMLElement) => void
}

export const MonthView = memo(function MonthView({ onImport }: MonthViewProps) {
  // Use individual selectors to prevent over-subscription
  const selectedYear = useCalendarStore((state) => state.selectedYear)
  const selectedMonth = useCalendarStore((state) => state.selectedMonth)
  const setSelectedMonth = useCalendarStore((state) => state.setSelectedMonth)
  const setSelectedYear = useCalendarStore((state) => state.setSelectedYear)
  const selectedDate = useCalendarStore((state) => state.selectedDate)
  const setSelectedDate = useCalendarStore((state) => state.setSelectedDate)
  const setCurrentView = useCalendarStore((state) => state.setCurrentView)
  // On the phone the title walks the rail back to Year, the same way the finger does.
  const travel = useTravel()
  const activities = useCalendarStore(useShallow((state) => state.activities))
  const logs = useCalendarStore(useShallow((state) => state.logs))

  const [slideDirection, setSlideDirection] = useState<'left' | 'right' | null>(null)

  // The app's day and not the clock's: while a new day waits for somebody to finish, the
  // clock has moved on and the rest of the screen has not, and the bar and the grid would
  // each say a different day was today.
  const today = useTodayDate()
  const todayStr = formatDate(today)

  const monthDays = useMemo(
    () => getMonthDays(selectedYear, selectedMonth, todayStr),
    [selectedYear, selectedMonth, todayStr]
  )

  // Create a map of date -> completed logs
  const logsMap = useMemo(() => {
    const map = new Map<string, ActivityLog[]>()
    logs
      .filter((log) => log.completed)
      .forEach((log) => {
        const existing = map.get(log.date) || []
        existing.push(log)
        map.set(log.date, existing)
      })
    return map
  }, [logs])

  // Enrich days with their logs
  const enrichedDays = useMemo(
    () =>
      monthDays.map((day) => ({
        ...day,
        logs: logsMap.get(day.dateStr) || [],
      })),
    [monthDays, logsMap]
  )

  // Create activity lookup map for colors
  const activityMap = useMemo(() => {
    const map = new Map<string, Activity>()
    activities.forEach((activity) => map.set(activity.id, activity))
    return map
  }, [activities])

  const handlePrevMonth = useCallback((): void => {
    setSlideDirection('right')
    if (selectedMonth === 0) {
      setSelectedYear(selectedYear - 1)
      setSelectedMonth(11)
    } else {
      setSelectedMonth(selectedMonth - 1)
    }
  }, [selectedMonth, selectedYear, setSelectedMonth, setSelectedYear])

  const handleNextMonth = useCallback((): void => {
    setSlideDirection('left')
    if (selectedMonth === 11) {
      setSelectedYear(selectedYear + 1)
      setSelectedMonth(0)
    } else {
      setSelectedMonth(selectedMonth + 1)
    }
  }, [selectedMonth, selectedYear, setSelectedMonth, setSelectedYear])

  const handleToday = useCallback((): void => {
    setSlideDirection(null)
    setSelectedYear(today.getFullYear())
    setSelectedMonth(today.getMonth())
  }, [today, setSelectedYear, setSelectedMonth])

  const handleDayClick = useCallback(
    (dateStr: string): void => {
      setSelectedDate(dateStr)
    },
    [setSelectedDate]
  )

  const displayDate = new Date(selectedYear, selectedMonth, 1)

  // Log Today bar data
  const isCurrentMonth = selectedYear === today.getFullYear() && selectedMonth === today.getMonth()
  const todayCompletedCount = logsMap.get(todayStr)?.length ?? 0

  /**
   * What logging yesterday would make, on a morning when yesterday is still open, and
   * `null` on every other morning. The rule and why it has two halves are in
   * `yesterdayStillOpen`. Read against the app's day, so the row and the grey ring go the
   * moment a new day comes in, with the window left open.
   */
  const rescue = useMemo(() => yesterdayStillOpen(completedDates(logs), today), [logs, today])
  const yesterdayIsOpen = rescue !== null

  const yesterdayStr = formatDate(subDays(today, 1))

  // The morning after the first day ever logged, the bar's second line says what today
  // would make rather than "0/1 activity". See `isSecondDay`: logging today ends it.
  const secondDay = useMemo(() => isSecondDay(completedDates(logs), today), [logs, today])

  return (
    <div className="p-3 sm:p-4 md:p-6">
      {/* Month Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 mb-4 sm:mb-6">
        <button
          onClick={() => (travel ? travel.toYear() : setCurrentView('year', 'drill-up'))}
          className="text-xl sm:text-2xl font-bold text-gray-900 hover:text-emerald-600 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-1 rounded-lg px-1 -mx-1"
          aria-label={`Switch to year view for ${selectedYear}`}
          data-testid="month-title-button"
        >
          {formatMonthYear(displayDate)}
        </button>
        <div className="flex items-center gap-1">
          <button
            onClick={handlePrevMonth}
            className="p-2.5 sm:p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-1 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 flex items-center justify-center"
            aria-label="Previous month"
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
            onClick={handleNextMonth}
            className="p-2.5 sm:p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-1 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 flex items-center justify-center"
            aria-label="Next month"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
          <button
            onClick={handleToday}
            className="ml-2 px-3 py-2 sm:py-1 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-1 min-h-[44px] sm:min-h-0"
            aria-label="Go to current month"
          >
            Today
          </button>
        </div>
      </div>

      {/* Log Today Bar - current month only, at every width.

          It used to be on the phone only, below 640px, and the sidebar only arrives at
          1024px, so between the two there was nothing on the screen that said where today
          is logged (#190). The desktop window opens at 800 at the least, so every desktop
          copy could land there. Above 1024 it is the same bar beside the sidebar: one way to
          log today at every width, rather than one per width.

          On a morning when yesterday is still open the bar carries a second row: under
          Today on the phone, beside it from 640px. Without a rescue it is the bar of any
          other morning. */}
      {/* With no activities the door takes the bar's place, in any month: it leads to
          today, not to the month on screen. */}
      {activities.length === 0 && (
        <FirstDayDoor
          onOpenToday={() => {
            handleToday()
            handleDayClick(todayStr)
          }}
          onImport={onImport}
        />
      )}

      {isCurrentMonth && activities.length > 0 && (
        <div
          className={
            yesterdayIsOpen
              ? 'mb-4 overflow-hidden rounded-xl border border-emerald-200 sm:flex'
              : 'contents'
          }
        >
          <button
            onClick={() => handleDayClick(todayStr)}
            // The ring for the keyboard is emerald-700, 5.36:1 on white, inset so the bar's
            // own rounded border does not cut it. On the desktop the bar is reached by Tab.
            className={`w-full flex items-center justify-between p-3 bg-emerald-50 min-h-[44px] transition-colors hover:bg-emerald-100 active:bg-emerald-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-700 ${
              yesterdayIsOpen ? 'sm:w-auto sm:flex-1' : 'mb-4 border border-emerald-200 rounded-xl'
            }`}
            data-testid="log-today-bar"
            aria-label={`Log today: ${todayCompletedCount} of ${count(activities.length, 'activity', 'activities')} completed`}
          >
            <div className="flex items-center gap-3">
              <TodayTile day={today.getDate()} done={todayCompletedCount > 0} />
              <div className="text-left">
                <div className="text-sm font-semibold text-gray-900">Today</div>
                <div
                  className={`text-xs ${secondDay ? 'text-gray-600' : 'text-gray-500'}`}
                  data-testid="today-bar-line"
                >
                  {secondDay
                    ? 'Log today to make 2 days in a row'
                    : `${todayCompletedCount}/${count(activities.length, 'activity', 'activities')}`}
                </div>
              </div>
            </div>
            <svg
              className="w-5 h-5 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
          {rescue !== null && (
            <YesterdayRow
              day={subDays(today, 1).getDate()}
              wouldBe={rescue}
              onOpen={() => handleDayClick(yesterdayStr)}
            />
          )}
        </div>
      )}

      {/* Calendar Grid */}
      <div className="rounded-xl border border-gray-200 overflow-hidden">
        <div
          key={`${selectedYear}-${selectedMonth}`}
          style={
            slideDirection
              ? {
                  animation: `${slideDirection === 'left' ? 'slide-from-right' : 'slide-from-left'} 250ms var(--ease-emphasized-decel) both`,
                }
              : undefined
          }
          className="bg-white"
        >
          {/* Day of Week Headers */}
          <div className="grid grid-cols-7 border-b border-gray-200 bg-gray-50">
            {DAYS_OF_WEEK.map((day, index) => (
              <div
                key={day}
                className="px-1 sm:px-2 py-2 sm:py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider"
              >
                {/* Show single letter on mobile, full abbreviation on larger screens */}
                <span className="sm:hidden">{DAYS_OF_WEEK_SHORT[index]}</span>
                <span className="hidden sm:inline">{day}</span>
              </div>
            ))}
          </div>

          {/* Days Grid */}
          <div className="grid grid-cols-7">
            {enrichedDays.map((day, index) => {
              const isLastRow = index >= 35
              const isLastColumn = (index + 1) % 7 === 0

              const isSelected = day.dateStr === selectedDate

              return (
                <button
                  key={day.dateStr}
                  onClick={() => handleDayClick(day.dateStr)}
                  className={`
                    ripple-container relative min-h-[60px] sm:min-h-[80px] p-1.5 sm:p-2 text-left transition-colors
                    hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500
                    ${!isLastRow ? 'border-b border-gray-200' : ''}
                    ${!isLastColumn ? 'border-r border-gray-200' : ''}
                    ${isSelected ? 'bg-emerald-50 ring-2 ring-inset ring-emerald-500' : day.isCurrentMonth ? 'bg-white' : 'bg-gray-50'}
                  `}
                  aria-label={`${day.dateStr}, ${count(day.logs.length, 'activity', 'activities')} completed${
                    day.dateStr === yesterdayStr && yesterdayIsOpen ? ', yesterday, still open' : ''
                  }`}
                >
                  {/* Day Number. Dashed is a day that exists and has not happened yet;
                      filled is a day that has. One rule, two places: today and the
                      yesterday that a run was walking into.

                      Today used to be filled emerald-500 with white whether or not
                      anything had been done, so the one strong green on the screen said
                      something untrue, and said it at 2.47:1 against a floor of 4.5.
                      Filled is emerald-700 now, which carries white at 5.36, and it is
                      only filled once there is something in the day. */}
                  <span
                    className={`
                      inline-flex items-center justify-center w-6 h-6 sm:w-7 sm:h-7 text-xs sm:text-sm font-medium rounded-full
                      ${tone(day, yesterdayStr, yesterdayIsOpen)}
                    `}
                  >
                    {day.date.getDate()}
                  </span>

                  {/* Activity Dots */}
                  {day.logs.length > 0 && (
                    <div className="flex flex-wrap gap-0.5 sm:gap-1 mt-1" aria-hidden="true">
                      {day.logs.slice(0, 3).map((log) => {
                        const activity = activityMap.get(log.activityId)
                        return (
                          <span
                            key={log.id}
                            className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full"
                            style={{
                              backgroundColor: activity?.color || '#10B981',
                            }}
                          />
                        )
                      })}
                      {day.logs.length > 3 && (
                        <span className="text-[10px] sm:text-xs text-gray-400 font-medium">
                          +{day.logs.length - 3}
                        </span>
                      )}
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
})
