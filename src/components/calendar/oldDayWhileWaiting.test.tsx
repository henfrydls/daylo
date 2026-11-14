import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Fragment, type ReactElement } from 'react'
import { act, render, renderHook } from '@testing-library/react'
import { useToday } from '../../lib/today'
import { useCalendarStore } from '../../store'
import type { ActivityLog, HeatmapLevel } from '../../types'
import { YearView } from './YearView'
import { YearByActivity } from './YearByActivity'
import { YearProgressBar } from './YearProgressBar'
import { YearHeatmap } from './YearHeatmap'
import { MonthHeatmapDetail } from './MonthHeatmapDetail'
import { StatsPanel } from '../stats'

/**
 * Every part of the year that draws today, while a new day waits for somebody to finish.
 *
 * The clock has moved on and the app has not. Built again from nothing in that moment,
 * which is the hardest case (every useMemo worked out afresh, every hook read again),
 * each one has to draw exactly what it drew on the old day. A part that read the clock
 * would draw the new day beside a calendar still on the old one.
 *
 * The night chosen is the last of October, so the new day is also a new month: the year's
 * progress, the month that counts as begun and today's cell all move with it. The run
 * moved to the header in 1.6 and is not drawn by any of these; App reads it against the
 * day on screen.
 */

const T = '2026-10-01T00:00:00.000Z'
const READ = { id: 'a1', name: 'Read', color: '#10B981', createdAt: T, updatedAt: T }
// Done the two days before, and not yet on the 31st: a run of two that the evening still
// keeps alive, and that the morning after, with the 31st missed, has broken.
const DAYS = ['2026-10-29', '2026-10-30']
const LOGS: ActivityLog[] = DAYS.map((date) => ({
  id: `log-${date}`,
  activityId: 'a1',
  date,
  completed: true,
  createdAt: T,
}))
const DAY_DATA = new Map(
  DAYS.map((date) => [date, { completedCount: 1, level: 4 as HeatmapLevel }] as const)
)
const LOGS_BY_DATE = new Map(DAYS.map((date) => [date, 1] as const))
const nothing = () => {}

const evening = () => new Date(2026, 9, 31, 21, 0)
const morning = () => new Date(2026, 10, 1, 8, 30)

const PARTS: [string, () => ReactElement][] = [
  ['YearView', () => <YearView />],
  [
    'YearByActivity',
    () => (
      <YearByActivity
        year={2026}
        activities={[READ]}
        logs={LOGS}
        dayData={DAY_DATA}
        activeDays={DAYS.length}
        selectedDate={null}
        onSelectDate={nothing}
      />
    ),
  ],
  [
    'YearProgressBar',
    () => <YearProgressBar year={2026} logsByDate={LOGS_BY_DATE} totalActivities={1} />,
  ],
  [
    'YearHeatmap',
    () => (
      <YearHeatmap
        year={2026}
        dayData={DAY_DATA}
        habitsOn={() => 1}
        selectedDate={null}
        onSelectDate={nothing}
      />
    ),
  ],
  [
    'MonthHeatmapDetail',
    () => (
      <MonthHeatmapDetail
        year={2026}
        month={9}
        activities={[READ]}
        logsByDate={LOGS_BY_DATE}
        onDateSelect={nothing}
        onMonthChange={nothing}
      />
    ),
  ],
  ['StatsPanel', () => <StatsPanel />],
]

/** What the part drew, without the ids React hands out afresh to every new tree. */
function drawn(draw: () => ReactElement): string {
  const { container, unmount } = render(draw())
  const html = container.innerHTML.replace(/[:«]r[0-9a-z]+[:»]/g, 'id')
  unmount()
  return html
}

/** Words written and not saved in a part the new day builds again: they hold it. */
function holdTheDay() {
  const scope = document.createElement('div')
  scope.setAttribute('data-day-scope', '')
  const field = document.createElement('textarea')
  scope.appendChild(field)
  document.body.appendChild(scope)
  act(() => {
    field.focus()
    field.value = 'a note not yet saved'
    field.blur()
  })
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  useCalendarStore.setState({
    _hasHydrated: true,
    activities: [READ],
    logs: LOGS,
    selectedYear: 2026,
    selectedMonth: 9,
    selectedDate: null,
  })
})

afterEach(() => {
  vi.useRealTimers()
  document.body.innerHTML = ''
})

describe('the year, while a new day waits', () => {
  it.each(PARTS)('%s stays on the old day, built again from nothing', (_, draw) => {
    vi.setSystemTime(evening())
    const onTheOldDay = drawn(draw)
    // The new day does change what this part draws, or the test below would prove nothing.
    vi.setSystemTime(morning())
    expect(drawn(draw)).not.toBe(onTheOldDay)

    vi.setSystemTime(evening())
    const app = renderHook(() => useToday())
    const { container, rerender } = render(<Fragment key="before">{draw()}</Fragment>)
    holdTheDay()
    vi.setSystemTime(morning())
    act(() => {
      window.dispatchEvent(new Event('focus'))
    })
    expect(app.result.current).toBe('2026-10-31')

    rerender(<Fragment key="again">{draw()}</Fragment>)

    expect(container.innerHTML.replace(/[:«]r[0-9a-z]+[:»]/g, 'id')).toBe(onTheOldDay)
  })
})
