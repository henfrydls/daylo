import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MonthView } from './MonthView'
import { useCalendarStore } from '../../store'
import { formatDate } from '../../lib/dates'

// Helper to create mock matchMedia
function createMockMatchMedia(matches: boolean) {
  return vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
}

// A matchMedia that answers min-width and max-width queries against a window this wide.
function atWidth(width: number) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => {
      const min = /min-width:\s*(\d+)px/.exec(query)
      const max = /max-width:\s*(\d+)px/.exec(query)
      const matches =
        (min === null || width >= Number(min[1])) && (max === null || width <= Number(max[1]))
      return {
        matches,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }
    }),
  })
}

describe('MonthView', () => {
  const today = new Date()
  const currentYear = today.getFullYear()
  const currentMonth = today.getMonth()

  beforeEach(() => {
    // Reset store state
    useCalendarStore.setState({
      activities: [],
      logs: [],
      selectedYear: currentYear,
      selectedMonth: currentMonth,
      selectedDate: null,
      currentView: 'month',
      _hasHydrated: true,
    })

    // Default to desktop
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: createMockMatchMedia(true), // matches = true → desktop (min-width: 640px matches)
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Header drill-up navigation', () => {
    it('should render month title as a button', () => {
      render(<MonthView />)

      const titleButton = screen.getByTestId('month-title-button')
      expect(titleButton).toBeInTheDocument()
      expect(titleButton.tagName).toBe('BUTTON')
    })

    it('should switch to year view when title is clicked', () => {
      render(<MonthView />)

      const titleButton = screen.getByTestId('month-title-button')
      fireEvent.click(titleButton)

      expect(useCalendarStore.getState().currentView).toBe('year')
    })

    it('should have accessible label for year view switch', () => {
      render(<MonthView />)

      const titleButton = screen.getByTestId('month-title-button')
      expect(titleButton).toHaveAttribute('aria-label', `Switch to year view for ${currentYear}`)
    })
  })

  describe('the first day', () => {
    const habit = {
      id: '1',
      name: 'Exercise',
      color: '#10B981',
      createdAt: '2024-01-01',
      updatedAt: '2024-01-01',
    }
    const door = () => screen.getByTestId('first-day-door')

    // With nothing to log, the Today bar is the way in: the same box in the same place,
    // saying what to do instead of counting nothing.
    it('puts the door where the Today bar goes, saying what to do', () => {
      render(<MonthView onImport={vi.fn()} />)

      expect(door()).toHaveTextContent('Add your first activity')
      expect(door()).toHaveAccessibleName('Today: add your first activity')
      expect(screen.queryByTestId('log-today-bar')).not.toBeInTheDocument()
      // The sentence at the bottom that used to be the only instruction is gone.
      expect(screen.queryByText(/Tap any day/)).not.toBeInTheDocument()
    })

    it('opens today from the door, from whatever month is on screen', () => {
      const other = currentMonth === 0 ? 1 : currentMonth - 1
      useCalendarStore.setState({ selectedMonth: other })
      render(<MonthView onImport={vi.fn()} />)

      fireEvent.click(door())

      const state = useCalendarStore.getState()
      expect(state.selectedDate).toBe(formatDate(today))
      expect(state.selectedMonth).toBe(currentMonth)
      expect(state.selectedYear).toBe(currentYear)
    })

    it('draws today on the door as a day that has not happened yet', () => {
      render(<MonthView onImport={vi.fn()} />)

      const tile = screen.getByTestId('today-tile')
      expect(tile).toHaveTextContent(String(today.getDate()))
      expect(tile.className).toContain('border-dashed')
      expect(tile.className).not.toContain('bg-emerald')
    })

    // Somebody who reinstalled, changed phones or changed where they got Daylo from opens
    // an app that looks like the first day. Without this they rebuild their activities by
    // hand, and those collide with the backup the day they do find Import.
    it('offers the backup right under the door, without a full stop', () => {
      const onImport = vi.fn()
      render(<MonthView onImport={onImport} />)

      const line = screen.getByTestId('month-empty-import')
      expect(line.textContent).toBe('Used Daylo before? Import your backup')
      // Under the door, in the same block, and not under the calendar.
      expect(screen.getByTestId('month-empty-state')).toContainElement(door())
      expect(screen.getByTestId('month-empty-state')).toContainElement(line)

      fireEvent.click(screen.getByRole('button', { name: 'Import your backup' }))
      expect(onImport).toHaveBeenCalledTimes(1)
    })

    // A link that opens nothing is worse than no link.
    it('offers no backup when there is nothing to open Import with', () => {
      render(<MonthView />)

      expect(door()).toBeInTheDocument()
      expect(screen.queryByTestId('month-empty-import')).not.toBeInTheDocument()
    })

    it('goes, line and all, once there is an activity', () => {
      useCalendarStore.setState({ activities: [habit] })
      render(<MonthView onImport={vi.fn()} />)

      expect(screen.queryByTestId('first-day-door')).not.toBeInTheDocument()
      expect(screen.queryByTestId('month-empty-state')).not.toBeInTheDocument()
      expect(screen.queryByTestId('month-empty-import')).not.toBeInTheDocument()
      expect(screen.getByTestId('log-today-bar')).toBeInTheDocument()
    })

    // Decided: somebody who deletes the last activity reads "first" again. Telling them
    // apart would mean saving something new.
    it('comes back when the last activity is deleted', () => {
      useCalendarStore.setState({ activities: [habit] })
      render(<MonthView onImport={vi.fn()} />)
      expect(screen.queryByTestId('first-day-door')).not.toBeInTheDocument()

      act(() => useCalendarStore.getState().deleteActivity('1'))

      expect(door()).toBeInTheDocument()
      expect(screen.getByTestId('month-empty-import')).toBeInTheDocument()
    })
  })

  describe('the square on the Today bar', () => {
    const habit = {
      id: '1',
      name: 'Exercise',
      color: '#10B981',
      createdAt: '2024-01-01',
      updatedAt: '2024-01-01',
    }
    const logOn = (date: string) => ({
      id: `l-${date}`,
      activityId: '1',
      date,
      completed: true,
      createdAt: date,
    })

    // The same rule as the grid: dashed is a day that has not happened yet, filled is a day
    // that has. For everybody and every day, not only the first.
    it('is dashed while today is empty', () => {
      useCalendarStore.setState({ activities: [habit], logs: [] })
      render(<MonthView />)

      const tile = screen.getByTestId('today-tile')
      expect(tile.className).toContain('border-dashed')
      expect(tile.className).not.toContain('bg-emerald')
    })

    it('is filled once today has anything in it', () => {
      useCalendarStore.setState({ activities: [habit], logs: [logOn(formatDate(today))] })
      render(<MonthView />)

      const tile = screen.getByTestId('today-tile')
      expect(tile.className).not.toContain('border-dashed')
      expect(tile.className).toContain('bg-emerald-700')
      expect(tile.className).toContain('text-white')
    })

    it('does not count an unticked log as something done', () => {
      useCalendarStore.setState({
        activities: [habit],
        logs: [{ ...logOn(formatDate(today)), completed: false }],
      })
      render(<MonthView />)

      expect(screen.getByTestId('today-tile').className).toContain('border-dashed')
    })
  })

  describe('the second day', () => {
    const habit = {
      id: '1',
      name: 'Exercise',
      color: '#10B981',
      createdAt: '2024-01-01',
      updatedAt: '2024-01-01',
    }
    const daysBack = (back: number): string => {
      const day = new Date()
      day.setDate(day.getDate() - back)
      return formatDate(day)
    }
    const loggedOn = (...backs: number[]) =>
      backs.map((back) => ({
        id: `l${back}`,
        activityId: '1',
        date: daysBack(back),
        completed: true,
        createdAt: daysBack(back),
      }))
    const second = () => screen.getByTestId('today-bar-line')

    it('says what today would make, the morning after the first day', () => {
      useCalendarStore.setState({ activities: [habit], logs: loggedOn(1) })
      render(<MonthView />)

      expect(second()).toHaveTextContent(/^Log today to make 2 days in a row$/)
    })

    it('counts again once today is logged', () => {
      useCalendarStore.setState({ activities: [habit], logs: loggedOn(1, 0) })
      render(<MonthView />)

      expect(second()).toHaveTextContent(/^1\/1 activity$/)
    })

    it('counts when the one day there was is not yesterday', () => {
      useCalendarStore.setState({ activities: [habit], logs: loggedOn(2) })
      render(<MonthView />)

      expect(second()).toHaveTextContent(/^0\/1 activity$/)
    })

    // Two days in the history: somebody past their second day, or a backup that came home.
    it('counts when there is more than one day in the history', () => {
      useCalendarStore.setState({ activities: [habit], logs: loggedOn(3, 1) })
      render(<MonthView />)

      expect(second()).toHaveTextContent(/^0\/1 activity$/)
    })

    it('counts after a backup with its history comes home', () => {
      useCalendarStore.setState({ activities: [habit], logs: loggedOn(5, 4, 3, 2, 1) })
      render(<MonthView />)

      expect(second()).toHaveTextContent(/^0\/1 activity$/)
    })

    it('counts on the first day itself', () => {
      useCalendarStore.setState({ activities: [habit], logs: [] })
      render(<MonthView />)

      expect(second()).toHaveTextContent(/^0\/1 activity$/)
    })

    // Neither the first day nor the second has a run of three behind it, so the row about
    // yesterday has nothing to rescue on either.
    it.each([
      ['the first day, logged', [0]],
      ['the second day, still open', [1]],
      ['the second day, logged', [1, 0]],
    ])('has no row about yesterday on %s', (_, backs) => {
      useCalendarStore.setState({ activities: [habit], logs: loggedOn(...backs) })
      render(<MonthView />)

      expect(screen.queryByText('Yesterday is still open')).not.toBeInTheDocument()
      expect(screen.queryByTestId('log-yesterday-row')).not.toBeInTheDocument()
    })

    // The other side of the one above, so it cannot pass by looking for the wrong thing.
    it('has the row about yesterday after three days and a miss', () => {
      useCalendarStore.setState({ activities: [habit], logs: loggedOn(4, 3, 2) })
      render(<MonthView />)

      expect(screen.getByTestId('log-yesterday-row')).toHaveTextContent('Yesterday is still open')
    })
  })

  describe('Log Today bar', () => {
    const activity = {
      id: '1',
      name: 'Exercise',
      color: '#10B981',
      createdAt: '2024-01-01',
      updatedAt: '2024-01-01',
    }

    it('should render Log Today bar on mobile when viewing current month', () => {
      // Set mobile viewport
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        configurable: true,
        value: createMockMatchMedia(false), // matches = false → mobile
      })

      useCalendarStore.setState({
        activities: [activity],
        selectedYear: currentYear,
        selectedMonth: currentMonth,
      })

      render(<MonthView />)

      expect(screen.getByTestId('log-today-bar')).toBeInTheDocument()
    })

    // #190: below 640 there was the bar, from 1024 the sidebar, and between the two
    // nothing that said where today is logged. The desktop window opens at 800 at least.
    it.each([639, 640, 800, 1023, 1280])('renders the Log Today bar at %ipx wide', (width) => {
      atWidth(width)
      useCalendarStore.setState({
        activities: [activity],
        selectedYear: currentYear,
        selectedMonth: currentMonth,
      })

      render(<MonthView />)

      expect(screen.getByTestId('log-today-bar')).toBeInTheDocument()
    })

    // A permanent 2px emerald-700 edge (5.36:1 on white) on its own rounded shape, and 1px
    // less padding so the bar is exactly as large as it was with the 1px soft edge.
    it('draws its edge on its own rounded shape, the same size as before', () => {
      atWidth(390)
      useCalendarStore.setState({
        activities: [activity],
        selectedYear: currentYear,
        selectedMonth: currentMonth,
      })

      render(<MonthView />)

      const classes = screen.getByTestId('log-today-bar').className.split(' ')
      expect(classes).toEqual(
        expect.arrayContaining([
          'border-2',
          'border-emerald-700',
          'rounded-xl',
          'p-[11px]',
          'focus-visible:ring-offset-2',
        ])
      )
      expect(classes).not.toContain('border-emerald-200')
      expect(classes).not.toContain('p-3')
      expect(classes).not.toContain('focus-visible:ring-inset')
    })

    it('should not render Log Today bar when not viewing current month', () => {
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        configurable: true,
        value: createMockMatchMedia(false),
      })

      // Set to a different month
      const differentMonth = currentMonth === 0 ? 1 : currentMonth - 1
      useCalendarStore.setState({
        activities: [activity],
        selectedYear: currentYear,
        selectedMonth: differentMonth,
      })

      render(<MonthView />)

      expect(screen.queryByTestId('log-today-bar')).not.toBeInTheDocument()
    })

    it('should not render Log Today bar when no activities exist', () => {
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        configurable: true,
        value: createMockMatchMedia(false),
      })

      useCalendarStore.setState({
        activities: [],
        selectedYear: currentYear,
        selectedMonth: currentMonth,
      })

      render(<MonthView />)

      expect(screen.queryByTestId('log-today-bar')).not.toBeInTheDocument()
    })

    it('should open QuickLog (set selectedDate to today) when Log Today bar is clicked', () => {
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        configurable: true,
        value: createMockMatchMedia(false),
      })

      useCalendarStore.setState({
        activities: [activity],
        selectedYear: currentYear,
        selectedMonth: currentMonth,
        selectedDate: null,
      })

      render(<MonthView />)

      const logTodayBar = screen.getByTestId('log-today-bar')
      fireEvent.click(logTodayBar)

      // selectedDate should be set to today's date string
      const state = useCalendarStore.getState()
      expect(state.selectedDate).not.toBeNull()
      // Verify it's today's date (YYYY-MM-DD format)
      const todayStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
      expect(state.selectedDate).toBe(todayStr)
    })

    it('should show correct completed count', () => {
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        configurable: true,
        value: createMockMatchMedia(false),
      })

      const todayStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

      useCalendarStore.setState({
        activities: [
          activity,
          {
            id: '2',
            name: 'Reading',
            color: '#3B82F6',
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
          },
        ],
        logs: [
          {
            id: 'log-1',
            activityId: '1',
            date: todayStr,
            completed: true,
            createdAt: '2024-01-01',
          },
        ],
        selectedYear: currentYear,
        selectedMonth: currentMonth,
      })

      render(<MonthView />)

      const logTodayBar = screen.getByTestId('log-today-bar')
      expect(logTodayBar).toHaveTextContent('1/2 activities')
    })
  })

  describe('the week before the first', () => {
    const cells = () => screen.getAllByLabelText(/^\d{4}-\d{2}-\d{2},/)

    // A month whose 1st falls on a Sunday showed no day of the month before it at all:
    // `getDay()` is 0 for a Sunday, so the loop that prepends them never ran once. That is 13
    // months in every 96, one in seven, and it is the worst case rather than a corner: on the
    // 2nd of such a month the whole of somebody's run is in the month before, and the arrival
    // screen is an empty grid with a single dot in the corner.
    it('shows the last week of the month before when the 1st is a Sunday', () => {
      // 1 November 2026 is a Sunday.
      useCalendarStore.setState({ selectedYear: 2026, selectedMonth: 10 })
      render(<MonthView />)

      expect(screen.getByLabelText(/^2026-10-25,/)).toBeInTheDocument()
      expect(screen.getByLabelText(/^2026-10-31,/)).toBeInTheDocument()
      expect(cells()[0]).toHaveAccessibleName(/^2026-10-25,/)
    })

    // Six rows of seven, whatever the month does. A month that grew a seventh row would push
    // the grid past the bottom of a phone, which is the thing this is supposed to stop.
    it('still draws 42 cells on a month that starts on a Sunday', () => {
      useCalendarStore.setState({ selectedYear: 2026, selectedMonth: 10 })
      render(<MonthView />)

      expect(cells()).toHaveLength(42)
      expect(cells()[41]).toHaveAccessibleName(/^2026-12-05,/)
    })

    // The other six days of the week are untouched: 1 December 2026 is a Tuesday, so the grid
    // begins where it always began, on the 29th of November.
    it('leaves a month that starts on any other day alone', () => {
      useCalendarStore.setState({ selectedYear: 2026, selectedMonth: 11 })
      render(<MonthView />)

      expect(cells()).toHaveLength(42)
      expect(cells()[0]).toHaveAccessibleName(/^2026-11-29,/)
    })
  })

  describe('the ring on a day that has not happened yet', () => {
    const daysBack = (back: number): string => {
      const day = new Date()
      day.setDate(day.getDate() - back)
      return formatDate(day)
    }
    const oneHabit = [
      {
        id: 'a1',
        name: 'Exercise',
        color: '#10B981',
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
      },
    ]
    const loggedOn = (backs: number[]) =>
      backs.map((back) => ({
        id: `l${back}`,
        activityId: 'a1',
        date: daysBack(back),
        completed: true,
        createdAt: daysBack(back),
      }))

    const cellFor = (dateStr: string) =>
      screen.getByLabelText(new RegExp(`^${dateStr},`)).querySelector('span') as HTMLElement

    // The green circle on today was there whether or not anything had been done, so the one
    // strong green on the screen said something that was not true. Dashed is the day that
    // exists and has not happened yet; filled is the day that has.
    it('is dashed on today while today is empty', () => {
      useCalendarStore.setState({ activities: oneHabit, logs: [] })
      render(<MonthView />)

      expect(cellFor(daysBack(0)).className).toContain('border-dashed')
    })

    it('is filled once anything at all is logged today', () => {
      useCalendarStore.setState({ activities: oneHabit, logs: loggedOn([0]) })
      render(<MonthView />)

      const today = cellFor(daysBack(0))
      expect(today.className).not.toContain('border-dashed')
      expect(today.className).toContain('bg-emerald-700')
    })

    // White on emerald-500 is 2.47:1 and the floor is 4.5. It was published that way, and the
    // fix is not a shade: it is that a day with nothing in it is not filled at all.
    it('never puts white on the green that does not carry it', () => {
      useCalendarStore.setState({ activities: oneHabit, logs: loggedOn([0]) })
      render(<MonthView />)

      expect(cellFor(daysBack(0)).className).not.toContain('bg-emerald-500')
    })

    // Yesterday, and the trap that would have made this invisible. Asked the ordinary way the
    // streak is 0 here, because yesterday is empty, so a guard reading it would never fire.
    // The run this speaks of is the one that ended the day before yesterday.
    it('is dashed on an empty yesterday when a run was going', () => {
      useCalendarStore.setState({ activities: oneHabit, logs: loggedOn([2, 3, 4, 5]) })
      render(<MonthView />)

      expect(cellFor(daysBack(1)).className).toContain('border-dashed')
    })

    it('leaves an empty yesterday alone when there was no run behind it', () => {
      useCalendarStore.setState({ activities: oneHabit, logs: loggedOn([2]) })
      render(<MonthView />)

      expect(cellFor(daysBack(1)).className).not.toContain('border-dashed')
    })

    // A two day hole is not a yesterday worth rescuing: logging it would join nothing to
    // anything. currentStreak has a day of grace, so asking about the day before yesterday
    // without checking that it exists walks one further back and answers about a run that
    // ended three days ago.
    it('leaves yesterday alone when the day before it is empty too', () => {
      useCalendarStore.setState({ activities: oneHabit, logs: loggedOn([3, 4, 5, 6]) })
      render(<MonthView />)

      expect(cellFor(daysBack(1)).className).not.toContain('border-dashed')
    })

    // Un ayer normal no lleva anillo, pero tampoco puede quedarse sin color: la condicion
    // excluia todos los ayeres en vez de solo el que lleva anillo, asi que un ayer corriente
    // heredaba el color de donde cayera.
    it('leaves an ordinary yesterday the colour of any other day', () => {
      useCalendarStore.setState({ activities: oneHabit, logs: loggedOn([1, 2]) })
      render(<MonthView />)

      expect(cellFor(daysBack(1)).className).toContain('text-gray-900')
    })

    // El dia 1 del mes, ayer cae en el mes anterior, asi que el ayer con anillo cogia a la
    // vez text-gray-900 y text-gray-400. Gana uno por el orden de las reglas, que es una
    // forma de decir que nadie lo decidio.
    it('gives a ringed yesterday one colour even when it is in the month before', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date(2026, 11, 1, 10, 0))
      useCalendarStore.setState({
        activities: oneHabit,
        logs: loggedOn([2, 3, 4, 5]),
        selectedYear: 2026,
        selectedMonth: 11,
      })
      render(<MonthView />)

      const yesterday = cellFor('2026-11-30')
      expect(yesterday.className).toContain('border-dashed')
      expect(yesterday.className).not.toContain('text-gray-400')
      vi.useRealTimers()
    })
  })

  /**
   * R-09b. The morning after an empty day that a run of three was going into: the ring on
   * yesterday is grey and thin, and the Today bar says what it is with a second row.
   *
   * Friday 13 November 2026, with the 9th, 10th and 11th logged and the 12th empty.
   */
  describe('a yesterday that is still open', () => {
    const oneHabit = [
      {
        id: 'a1',
        name: 'Exercise',
        color: '#10B981',
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
      },
    ]
    const loggedOn = (...dates: string[]) =>
      dates.map((date) => ({
        id: `l-${date}`,
        activityId: 'a1',
        date,
        completed: true,
        createdAt: date,
      }))
    const rescue = loggedOn('2026-11-09', '2026-11-10', '2026-11-11')
    const numberIn = (dateStr: string) =>
      screen.getByLabelText(new RegExp(`^${dateStr},`)).querySelector('span') as HTMLElement
    const row = () => screen.queryByTestId('log-yesterday-row')
    const phone = () =>
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        configurable: true,
        value: createMockMatchMedia(false),
      })

    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date(2026, 10, 13, 9, 0))
      useCalendarStore.setState({
        activities: oneHabit,
        logs: rescue,
        selectedYear: 2026,
        selectedMonth: 10,
      })
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    // Grey and 1px against today's green and 2px: two differences, because gray-500 and
    // emerald-700 are almost the same lightness, and somebody who cannot tell the hue
    // apart would see two identical rings. The weight shows without colour.
    it('rings yesterday in grey, one pixel thick, and leaves today green and two', () => {
      render(<MonthView />)

      const yesterday = numberIn('2026-11-12').className
      expect(yesterday).toContain('border-dashed')
      expect(yesterday).toContain('border-gray-500')
      expect(yesterday).not.toContain('border-2')
      expect(yesterday).not.toContain('emerald')

      const today = numberIn('2026-11-13').className
      expect(today).toContain('border-2')
      expect(today).toContain('border-emerald-700')
    })

    it('tells a screen reader that yesterday is still open, and only yesterday', () => {
      render(<MonthView />)

      expect(screen.getByLabelText(/^2026-11-12,/)).toHaveAccessibleName(
        '2026-11-12, 0 activities completed, yesterday, still open'
      )
      expect(screen.getByLabelText(/^2026-11-13,/)).toHaveAccessibleName(
        '2026-11-13, 0 activities completed'
      )
    })

    it('says nothing extra to a screen reader with no run behind yesterday', () => {
      useCalendarStore.setState({ logs: loggedOn('2026-11-10', '2026-11-11') })
      render(<MonthView />)

      expect(screen.getByLabelText(/^2026-11-12,/)).toHaveAccessibleName(
        '2026-11-12, 0 activities completed'
      )
    })

    it('puts a row under Today on the phone, with the number it will make', () => {
      phone()
      render(<MonthView />)

      expect(screen.getByTestId('log-today-bar')).toBeInTheDocument()
      expect(row()).toHaveTextContent('Yesterday is still open')
      expect(row()).toHaveTextContent('Log it to make 4 days in a row')
      // The same ring as the grid, with its number: the row is the ring's legend.
      const ring = row()!.querySelector('[data-testid="yesterday-ring"]') as HTMLElement
      expect(ring).toHaveTextContent('12')
      for (const part of ['border', 'border-dashed', 'border-gray-500']) {
        expect(ring.className.split(' ')).toContain(part)
      }
      expect(ring.className).not.toContain('border-2')
    })

    it('opens the sheet of yesterday when the row is pressed', () => {
      phone()
      render(<MonthView />)

      fireEvent.click(row()!)

      expect(useCalendarStore.getState().selectedDate).toBe('2026-11-12')
    })

    // The row promises what the header will say, and with today in that is one more.
    it('stays when today is already logged, and promises today too', () => {
      phone()
      useCalendarStore.setState({ logs: [...rescue, ...loggedOn('2026-11-13')] })
      render(<MonthView />)

      expect(row()).toHaveTextContent('Log it to make 5 days in a row')
    })

    // Henfry's worry: a row that never goes away. It goes the moment yesterday is logged,
    // in the same session, with nothing reloaded.
    it('goes the moment yesterday is logged, and the ring goes with it', () => {
      phone()
      render(<MonthView />)
      expect(row()).toBeInTheDocument()

      act(() => {
        useCalendarStore.getState().toggleLog('a1', '2026-11-12')
      })

      expect(row()).not.toBeInTheDocument()
      expect(numberIn('2026-11-12').className).not.toContain('border-dashed')
      expect(screen.getByLabelText(/^2026-11-12,/)).toHaveAccessibleName(
        '2026-11-12, 1 activity completed'
      )
    })

    // Case 2. Nothing new on the screen: the bar is the bar of any morning.
    it.each([
      ['a run of two', ['2026-11-10', '2026-11-11']],
      ['two empty days', ['2026-11-07', '2026-11-08', '2026-11-09', '2026-11-10']],
    ])('says nothing after %s', (_, dates) => {
      phone()
      useCalendarStore.setState({ logs: loggedOn(...dates) })
      render(<MonthView />)

      expect(row()).not.toBeInTheDocument()
      expect(screen.queryByText(/still open/)).not.toBeInTheDocument()
      expect(screen.getByTestId('log-today-bar')).toBeInTheDocument()
    })

    // From 640px the row sits beside Today, inside the same bar; below it, under Today.
    // The order of the classes is what the layout reads: the bar's box turns into a row
    // at sm, and the row trades its top border for a left one at the same width.
    it.each([800, 1280])('puts the row beside Today at %ipx', (width) => {
      atWidth(width)
      render(<MonthView />)

      const box = row()!.parentElement!
      expect(box).toContainElement(screen.getByTestId('log-today-bar'))
      expect(box.className.split(' ')).toContain('sm:flex')
      // Beside Today the row has its own top and right edges and leans on Today's left.
      expect(row()!.className.split(' ')).toContain('sm:border-t')
      expect(row()!.className.split(' ')).toContain('sm:border-l-0')
      expect(row()!.className.split(' ')).toContain('sm:rounded-tr-xl')
      expect(screen.getByTestId('log-today-bar').className.split(' ')).toContain('sm:rounded-bl-xl')
      expect(box.firstElementChild).toBe(screen.getByTestId('log-today-bar'))
      expect(box.lastElementChild).toBe(row())
    })

    it('puts the row under Today on the phone', () => {
      atWidth(360)
      render(<MonthView />)

      const box = row()!.parentElement!
      expect(box.firstElementChild).toBe(screen.getByTestId('log-today-bar'))
      expect(box.lastElementChild).toBe(row())
      // Under Today the row leans on Today's bottom edge and carries the bottom corners.
      expect(row()!.className.split(' ')).toContain('border-t-0')
      expect(row()!.className.split(' ')).toContain('rounded-b-xl')
      expect(row()!.className.split(' ')).toContain('w-full')
    })

    // Each row draws its own edge and its own outer corners, and the box around them
    // draws and clips nothing: a parent that clipped cut the corners of Today's edge and
    // the keyboard ring, and they came out uneven.
    it.each([360, 1280])('lets each row draw its own corners at %ipx', (width) => {
      atWidth(width)
      render(<MonthView />)

      const box = row()!.parentElement!.className.split(' ')
      expect(box).not.toContain('overflow-hidden')
      expect(box).not.toContain('border')
      expect(box).not.toContain('rounded-xl')
      const today = screen.getByTestId('log-today-bar').className.split(' ')
      expect(today).toEqual(
        expect.arrayContaining(['border-2', 'border-emerald-700', 'rounded-t-xl'])
      )
      expect(row()!.className.split(' ')).toEqual(
        expect.arrayContaining(['border', 'border-emerald-200'])
      )
    })

    // The keyboard ring is outside the row, white gap then emerald-700, and the row with it
    // rises above its neighbour so the neighbour cannot cover it.
    it.each(['log-today-bar', 'log-yesterday-row'])('rings %s from the outside', (id) => {
      phone()
      render(<MonthView />)

      const classes = screen.getByTestId(id).className.split(' ')
      expect(classes).toEqual(
        expect.arrayContaining([
          'relative',
          'focus-visible:z-10',
          'focus-visible:ring-2',
          'focus-visible:ring-emerald-700',
          'focus-visible:ring-offset-2',
          'focus-visible:ring-offset-white',
        ])
      )
      expect(classes).not.toContain('focus-visible:ring-inset')
    })

    it('keeps the bar on the desktop without a rescue, with no row', () => {
      useCalendarStore.setState({ logs: loggedOn('2026-11-10', '2026-11-11') })
      render(<MonthView />)

      expect(screen.getByTestId('log-today-bar')).toBeInTheDocument()
      expect(row()).not.toBeInTheDocument()
    })

    it('is not said on another month', () => {
      phone()
      useCalendarStore.setState({ selectedMonth: 9 })
      render(<MonthView />)

      expect(row()).not.toBeInTheDocument()
    })

    // On the 1st, yesterday is in the month before: a grey cell, and the row still names it.
    it('names a yesterday in the month before', () => {
      phone()
      vi.setSystemTime(new Date(2026, 11, 1, 9, 0))
      useCalendarStore.setState({
        logs: loggedOn('2026-11-27', '2026-11-28', '2026-11-29'),
        selectedMonth: 11,
      })
      render(<MonthView />)

      expect(row()).toHaveTextContent('Log it to make 4 days in a row')
      expect(row()).toHaveTextContent('30')
      expect(numberIn('2026-11-30').className).toContain('border-gray-500')
    })
  })

  // One Today on the screen. The row's Today button is gone in every
  // month: in the month of today it did nothing, and in another month the way back is the
  // bar, which stays where it is and turns quiet.
  describe('the way back to today', () => {
    const oneHabit = [
      {
        id: 'a1',
        name: 'Exercise',
        color: '#10B981',
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
      },
    ]
    const back = () => screen.queryByTestId('back-to-today-bar')

    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date(2026, 10, 13, 9, 0))
      useCalendarStore.setState({
        activities: oneHabit,
        logs: [],
        selectedYear: 2026,
        selectedMonth: 10,
        selectedDate: null,
      })
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it.each([
      ['the month of today', 10],
      ['another month', 9],
    ])('has no Today button in the row, in %s', (_, month) => {
      useCalendarStore.setState({ selectedMonth: month })
      render(<MonthView />)

      expect(screen.queryByLabelText('Go to current month')).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Today' })).not.toBeInTheDocument()
    })

    // The arrows go up beside the title on the phone too; the title has a box of its own,
    // a column, so a line can go under it.
    it("keeps the arrows on the title's row, with the title in a column of its own", () => {
      atWidth(390)
      render(<MonthView />)

      const nav = screen.getByTestId('month-nav').className.split(' ')
      expect(nav).toEqual(expect.arrayContaining(['flex', 'flex-row', 'items-center']))
      expect(nav).not.toContain('flex-col')
      const box = screen.getByTestId('month-title-box')
      expect(box).toContainElement(screen.getByTestId('month-title-button'))
      expect(box.className.split(' ')).toContain('flex-col')
      expect(box).not.toContainElement(screen.getByLabelText('Previous month'))
    })

    it('is not there in the month of today, where the green bar is', () => {
      render(<MonthView />)

      expect(back()).not.toBeInTheDocument()
      expect(screen.getByTestId('log-today-bar')).toBeInTheDocument()
    })

    it.each([
      ['the month before', 2026, 9],
      ['the month after', 2026, 11],
      ['another year', 2025, 10],
    ])('turns the bar quiet in %s', (_, year, month) => {
      useCalendarStore.setState({ selectedYear: year, selectedMonth: month })
      render(<MonthView />)

      expect(screen.queryByTestId('log-today-bar')).not.toBeInTheDocument()
      expect(back()).toBeInTheDocument()
      expect(back()).toHaveTextContent('Today')
      expect(back()).toHaveTextContent('Friday, November 13')
    })

    // The same box as the green bar, so the calendar does not move between months; white
    // and a grey edge, so it does not read as the bar that logs.
    it("is the green bar's box, in white with a grey edge", () => {
      useCalendarStore.setState({ selectedMonth: 9 })
      render(<MonthView />)

      const classes = back()!.className.split(' ')
      expect(classes).toEqual(
        expect.arrayContaining([
          'w-full',
          'p-[11px]',
          'border-2',
          'rounded-xl',
          'mb-4',
          'min-h-[44px]',
          'bg-white',
          'border-gray-200',
          'focus-visible:ring-offset-2',
        ])
      )
      expect(classes).not.toContain('bg-emerald-50')
      expect(classes).not.toContain('border-emerald-700')
    })

    it('tells a screen reader where it goes, apart from the bar that logs', () => {
      useCalendarStore.setState({ selectedMonth: 9 })
      render(<MonthView />)

      expect(screen.getByRole('button', { name: 'Go to today, Friday, November 13' })).toBe(back())
    })

    it('is not there on the first day: the door is the way to today', () => {
      useCalendarStore.setState({ activities: [], selectedMonth: 9 })
      render(<MonthView />)

      expect(back()).not.toBeInTheDocument()
      expect(screen.getByTestId('first-day-door')).toBeInTheDocument()
    })

    it('is not there with yesterday still open in another month, and nor is the row', () => {
      useCalendarStore.setState({
        logs: ['2026-11-09', '2026-11-10', '2026-11-11'].map((date) => ({
          id: `l-${date}`,
          activityId: 'a1',
          date,
          completed: true,
          createdAt: date,
        })),
        selectedMonth: 9,
      })
      render(<MonthView />)

      expect(back()).toBeInTheDocument()
      expect(screen.queryByTestId('log-yesterday-row')).not.toBeInTheDocument()
    })

    it('brings the month of today back when pressed, and opens nothing', () => {
      useCalendarStore.setState({ selectedMonth: 9 })
      render(<MonthView />)

      fireEvent.click(back()!)

      const state = useCalendarStore.getState()
      expect(state.selectedYear).toBe(2026)
      expect(state.selectedMonth).toBe(10)
      expect(state.selectedDate).toBeNull()
      expect(back()).not.toBeInTheDocument()
      expect(screen.getByTestId('log-today-bar')).toBeInTheDocument()
    })

    it('brings it back from another year too', () => {
      useCalendarStore.setState({ selectedYear: 2025, selectedMonth: 2 })
      render(<MonthView />)

      fireEvent.click(back()!)

      expect(useCalendarStore.getState().selectedYear).toBe(2026)
      expect(useCalendarStore.getState().selectedMonth).toBe(10)
    })

    // The bar that was pressed is gone with the arrival, and the focus would fall to the
    // body. It goes to the green bar instead, in the same place.
    it('gives the focus to the green bar when pressed', () => {
      useCalendarStore.setState({ selectedMonth: 9 })
      render(<MonthView />)

      fireEvent.click(back()!)

      expect(screen.getByTestId('log-today-bar')).toHaveFocus()
    })

    it('goes back with Enter from the keyboard, and the focus lands on the green bar', async () => {
      const user = userEvent.setup()
      useCalendarStore.setState({ selectedMonth: 9 })
      render(<MonthView />)

      back()!.focus()
      await user.keyboard('{Enter}')

      expect(useCalendarStore.getState().selectedMonth).toBe(10)
      expect(useCalendarStore.getState().selectedDate).toBeNull()
      expect(screen.getByTestId('log-today-bar')).toHaveFocus()
    })

    it('leaves the focus alone when the month of today comes back by the arrows', () => {
      useCalendarStore.setState({ selectedMonth: 9 })
      render(<MonthView />)

      const next = screen.getByLabelText('Next month')
      next.focus()
      fireEvent.click(next)

      expect(useCalendarStore.getState().selectedMonth).toBe(10)
      expect(next).toHaveFocus()
    })
  })

  // Point 6 of 1.6.1: a short line in the title's box saying how the month on screen
  // stands, "17 of 25 days so far", under the title on the phone and beside it from 640px.
  // The days with something done over the days gone by, counted from the person's first
  // day in the month they started (lib/monthCompletion). Never a zero: the empty grid has
  // already said it, and "0 of 20" is the one form of it that scolds.
  describe('the month so far, in the title box', () => {
    const ACTIVITY = {
      id: 'a1',
      name: 'Run',
      color: '#22c55e',
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    }
    const marked = (...dates: string[]) =>
      dates.map((date) => ({ id: date, activityId: 'a1', date, completed: true, createdAt: date }))
    const days = (from: number, to: number, month = 11) =>
      Array.from(
        { length: to - from + 1 },
        (_, i) => `2026-${String(month).padStart(2, '0')}-${String(from + i).padStart(2, '0')}`
      )
    const line = () => screen.queryByTestId('month-progress')

    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date(2026, 10, 25, 12))
      useCalendarStore.setState({
        activities: [ACTIVITY],
        selectedYear: 2026,
        selectedMonth: 10,
        firstOpenedAt: '2026-01-10',
        logs: [],
      })
    })

    afterEach(() => {
      vi.useRealTimers()
      // In act: this runs before the shared cleanup, with the component still on screen.
      act(() => useCalendarStore.setState({ firstOpenedAt: null }))
    })

    it('says how the month we are in stands so far, inside the title box', () => {
      // Seventeen of the twenty-five days gone by: the 1st to the 17th.
      useCalendarStore.setState({ logs: marked('2026-01-10', ...days(1, 17)) })
      render(<MonthView />)

      expect(line()).toHaveTextContent(/^17 of 25 days so far$/)
      expect(screen.getByTestId('month-title-box')).toContainElement(line())
    })

    it('follows the arrows: a month over says its days without "so far", one to come says nothing', () => {
      useCalendarStore.setState({
        logs: marked('2026-01-10', ...days(1, 20, 10), ...days(1, 17)),
      })
      render(<MonthView />)
      expect(line()).toHaveTextContent(/^17 of 25 days so far$/)

      fireEvent.click(screen.getByLabelText('Previous month'))
      expect(line()).toHaveTextContent(/^20 of 31 days$/)

      fireEvent.click(screen.getByLabelText('Previous month'))
      // September, with nothing in it: no zero.
      expect(line()).not.toBeInTheDocument()

      fireEvent.click(screen.getByLabelText('Next month'))
      fireEvent.click(screen.getByLabelText('Next month'))
      fireEvent.click(screen.getByLabelText('Next month'))
      // December has not begun.
      expect(useCalendarStore.getState().selectedMonth).toBe(11)
      expect(line()).not.toBeInTheDocument()
    })

    it('says 1 of 1 on the first day, with that day done', () => {
      useCalendarStore.setState({ firstOpenedAt: '2026-11-25', logs: marked('2026-11-25') })
      render(<MonthView />)

      expect(line()).toHaveTextContent(/^1 of 1 day so far$/)
    })

    it('says nothing on the first day before anything is done', () => {
      useCalendarStore.setState({ firstOpenedAt: '2026-11-25', logs: [] })
      render(<MonthView />)

      expect(line()).not.toBeInTheDocument()
    })

    it('says 6 of 7 a week after starting, and nothing in the month before', () => {
      useCalendarStore.setState({
        firstOpenedAt: '2026-11-19',
        logs: marked(
          '2026-11-19',
          '2026-11-20',
          '2026-11-21',
          '2026-11-23',
          '2026-11-24',
          '2026-11-25'
        ),
      })
      render(<MonthView />)
      expect(line()).toHaveTextContent(/^6 of 7 days so far$/)

      fireEvent.click(screen.getByLabelText('Previous month'))
      expect(line()).not.toBeInTheDocument()
    })

    it('says nothing in a month with no day done, even with days gone by', () => {
      useCalendarStore.setState({ logs: marked('2026-01-10') })
      render(<MonthView />)

      expect(line()).not.toBeInTheDocument()
    })

    // The fault of #175 is reading a day off a moment in UTC. A first use near midnight is
    // on one day where the person is and on another in UTC, and the line has to count from
    // the first. Each zone is set inside the test, after which the clock is set again.
    describe('with a first use near midnight', () => {
      const env = (
        globalThis as unknown as { process: { env: Record<string, string | undefined> } }
      ).process.env
      const ZONE = env.TZ
      afterEach(() => {
        env.TZ = ZONE
      })

      it('west of UTC, counts from the evening it was, not the UTC day after', () => {
        env.TZ = 'America/Santo_Domingo'
        expect(new Date(2026, 10, 20, 12).getTimezoneOffset()).toBe(240)
        vi.setSystemTime(new Date(2026, 10, 25, 12))
        // 23:30 on the 19th here, 03:30 on the 20th in UTC.
        const firstUse = new Date(2026, 10, 19, 23, 30).toISOString()
        expect(firstUse.slice(0, 10)).toBe('2026-11-20')
        useCalendarStore.setState({ firstOpenedAt: firstUse, logs: marked(...days(20, 25)) })
        render(<MonthView />)

        expect(line()).toHaveTextContent(/^6 of 7 days so far$/)
      })

      it('east of UTC, counts from the morning it was, not the UTC day before', () => {
        env.TZ = 'Pacific/Auckland'
        expect(new Date(2026, 10, 20, 12).getTimezoneOffset()).toBe(-780)
        vi.setSystemTime(new Date(2026, 10, 25, 12))
        // 00:30 on the 20th here, 11:30 on the 19th in UTC.
        const firstUse = new Date(2026, 10, 20, 0, 30).toISOString()
        expect(firstUse.slice(0, 10)).toBe('2026-11-19')
        useCalendarStore.setState({ firstOpenedAt: firstUse, logs: marked(...days(20, 25)) })
        render(<MonthView />)

        expect(line()).toHaveTextContent(/^6 of 6 days so far$/)
      })
    })
  })
})
