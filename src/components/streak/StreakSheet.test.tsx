import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react'
import { HeaderStreak } from './HeaderStreak'
import { StreakDetails } from './StreakSheet'
import { useOpenDialogs } from '../../hooks'

/** jsdom has no matchMedia, and the chip asks it whether anybody wants movement. */
beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  })
  useOpenDialogs.setState({ open: 0 })
})

/** 14 March 2026, a Saturday, at noon. */
const NOW = new Date(2026, 2, 14, 12)
const days = (...dates: string[]) => new Set(dates)
/** The run of `n` days ending on the 14th (or on the 13th, with today not in yet). */
function run(n: number, endingOn = 14) {
  return days(
    ...Array.from({ length: n }, (_, i) => `2026-03-${String(endingOn - i).padStart(2, '0')}`)
  )
}

describe('what the streak sheet says', () => {
  it('says the run, today, and the rule about what counts', () => {
    render(<StreakDetails streak={4} best={9} todayDone={false} done={run(4, 13)} now={NOW} />)

    expect(screen.getByText('Today is not logged yet.')).toBeInTheDocument()
    expect(screen.getByTestId('streak-tile-now')).toHaveTextContent('4 days')
    expect(screen.getByTestId('streak-tile-now')).toHaveTextContent('Right now')
    expect(screen.getByText('Last 14 days')).toBeInTheDocument()
    expect(screen.getByText('A day counts once you log any activity.')).toBeInTheDocument()
  })

  it('says when today is in', () => {
    render(<StreakDetails streak={5} best={9} todayDone done={run(5)} now={NOW} />)

    expect(screen.getByText('Today is in.')).toBeInTheDocument()
    expect(screen.queryByText('Today is not logged yet.')).not.toBeInTheDocument()
  })

  it('says 1 day in the singular and other runs in the plural', () => {
    render(<StreakDetails streak={1} best={9} todayDone done={run(1)} now={NOW} />)

    expect(screen.getByTestId('streak-tile-now')).toHaveTextContent(/^1 day/)
    expect(screen.getByTestId('streak-tile-best')).toHaveTextContent('9 days')
  })

  // The rule agreed on 3 November: the second tile is "Longest" until the run going now
  // equals it, and then it is the same fact and says so.
  it('calls the best "Longest" while the run now is shorter', () => {
    render(<StreakDetails streak={4} best={9} todayDone={false} done={run(4, 13)} now={NOW} />)

    expect(screen.getByTestId('streak-tile-best')).toHaveTextContent('9 days')
    expect(screen.getByTestId('streak-tile-best')).toHaveTextContent(/Longest$/)
  })

  it('calls it "Your best ever" when the run now equals it', () => {
    render(<StreakDetails streak={5} best={5} todayDone done={run(5)} now={NOW} />)

    expect(screen.getByTestId('streak-tile-best')).toHaveTextContent(/Your best ever$/)
    expect(screen.queryByText('Longest')).not.toBeInTheDocument()
  })

  // There is no chip to press with no run, so nobody should see this; but if the sheet is
  // ever drawn with nothing, "Your best ever" over 0 days would be a joke at their expense.
  it('never calls 0 days "Your best ever"', () => {
    render(<StreakDetails streak={0} best={0} todayDone={false} done={days()} now={NOW} />)

    expect(screen.getByTestId('streak-tile-best')).toHaveTextContent(/Longest$/)
  })

  it('shows the last fourteen days, which are logged, and today last', () => {
    render(<StreakDetails streak={4} best={9} todayDone={false} done={run(4, 13)} now={NOW} />)
    const cells = screen.getAllByTestId('streak-day')

    expect(cells).toHaveLength(14)
    expect(cells.map((cell) => cell.textContent)).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
      '9',
      '10',
      '11',
      '12',
      '13',
      '14',
    ])
    expect(cells.map((cell) => cell.dataset.done)).toEqual([
      ...Array(9).fill('false'),
      'true',
      'true',
      'true',
      'true',
      'false',
    ])
    expect(cells[13]).toHaveAttribute('data-today', 'true')
    expect(screen.getByRole('img', { name: /Last 14 days/ })).toHaveAccessibleName(
      'Last 14 days: something logged on 4 of them'
    )
  })

  // A row is a week long, so each column is one day of the week in both rows, and the
  // letters above are true. 1 March 2026 was a Sunday.
  it('heads the columns with the days of the week they really are', () => {
    render(<StreakDetails streak={4} best={9} todayDone={false} done={run(4, 13)} now={NOW} />)

    expect(screen.getAllByTestId('streak-weekday').map((cell) => cell.textContent)).toEqual([
      'S',
      'M',
      'T',
      'W',
      'T',
      'F',
      'S',
    ])
  })
})

function Header({
  surface,
  streak = 4,
  onOpenChange,
}: {
  surface: 'sheet' | 'panel'
  streak?: number
  onOpenChange?: (open: boolean) => void
}) {
  return (
    <div>
      <button type="button">Somewhere else</button>
      <HeaderStreak
        surface={surface}
        streak={streak}
        best={9}
        todayDone={false}
        done={run(streak, 13)}
        now={NOW}
        onOpenChange={onOpenChange}
      />
    </div>
  )
}

describe('the streak sheet on a phone', () => {
  it('opens as a sheet from the chip and says what is behind it', () => {
    render(<Header surface="sheet" />)
    const chip = screen.getByTestId('streak-chip')

    fireEvent.click(chip)

    const sheet = screen.getByTestId('streak-sheet')
    expect(sheet).toHaveAttribute('role', 'dialog')
    expect(within(sheet).getByText('Your streak')).toBeInTheDocument()
    expect(within(sheet).getByText('Today is not logged yet.')).toBeInTheDocument()
    expect(chip).toHaveAttribute('aria-expanded', 'true')
  })

  it('goes on Escape and gives the focus back to the chip', async () => {
    render(<Header surface="sheet" />)
    const chip = screen.getByTestId('streak-chip')
    chip.focus()
    fireEvent.click(chip)

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(chip).toHaveAttribute('aria-expanded', 'false')
    await waitFor(() => expect(screen.queryByTestId('streak-sheet')).not.toBeInTheDocument())
    expect(chip).toHaveFocus()
  })

  it('goes on a press outside it and gives the focus back to the chip', async () => {
    render(<Header surface="sheet" />)
    const chip = screen.getByTestId('streak-chip')
    fireEvent.click(chip)

    // The dimmed backdrop is the sheet's first child in the portal.
    const backdrop = screen.getByTestId('streak-sheet').previousElementSibling as HTMLElement
    fireEvent.click(backdrop)

    await waitFor(() => expect(screen.queryByTestId('streak-sheet')).not.toBeInTheDocument())
    expect(chip).toHaveFocus()
  })

  // So the reminder's offer does not open over it.
  it('counts as an open dialog while it is open', async () => {
    render(<Header surface="sheet" />)
    fireEvent.click(screen.getByTestId('streak-chip'))
    expect(useOpenDialogs.getState().open).toBe(1)

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(useOpenDialogs.getState().open).toBe(0)
  })
})

describe('the streak panel on a wide screen', () => {
  it('hangs from the chip, with the focus inside it', () => {
    render(<Header surface="panel" />)
    const chip = screen.getByTestId('streak-chip')

    fireEvent.click(chip)

    const panel = screen.getByTestId('streak-panel')
    expect(panel).toHaveAttribute('role', 'dialog')
    expect(panel).toHaveAccessibleName('Your streak')
    expect(panel).toHaveFocus()
    expect(panel.parentElement).toContainElement(chip)
    expect(chip).toHaveAttribute('aria-expanded', 'true')
  })

  it('goes on Escape and gives the focus back to the chip', () => {
    render(<Header surface="panel" />)
    const chip = screen.getByTestId('streak-chip')
    fireEvent.click(chip)

    fireEvent.keyDown(screen.getByTestId('streak-panel'), { key: 'Escape' })

    expect(screen.queryByTestId('streak-panel')).not.toBeInTheDocument()
    expect(chip).toHaveFocus()
    expect(chip).toHaveAttribute('aria-expanded', 'false')
  })

  it('goes on a press anywhere else and gives the focus back to the chip', async () => {
    render(<Header surface="panel" />)
    const chip = screen.getByTestId('streak-chip')
    fireEvent.click(chip)

    fireEvent.mouseDown(document.body)

    expect(screen.queryByTestId('streak-panel')).not.toBeInTheDocument()
    await waitFor(() => expect(chip).toHaveFocus())
  })

  // A press on something that takes the focus keeps it: the gear, pressed while the panel
  // is open, should open the menu and not have its focus taken back.
  it('leaves the focus where a press outside put it', async () => {
    render(<Header surface="panel" />)
    fireEvent.click(screen.getByTestId('streak-chip'))
    const elsewhere = screen.getByText('Somewhere else')

    fireEvent.mouseDown(elsewhere)
    elsewhere.focus()
    await act(async () => {})

    expect(screen.queryByTestId('streak-panel')).not.toBeInTheDocument()
    expect(elsewhere).toHaveFocus()
  })

  it('goes when the focus leaves it for somewhere else', () => {
    render(<Header surface="panel" />)
    fireEvent.click(screen.getByTestId('streak-chip'))

    act(() => screen.getByText('Somewhere else').focus())

    expect(screen.queryByTestId('streak-panel')).not.toBeInTheDocument()
  })

  it('goes when the chip is pressed again', () => {
    render(<Header surface="panel" />)
    const chip = screen.getByTestId('streak-chip')
    fireEvent.click(chip)

    fireEvent.mouseDown(chip)
    fireEvent.click(chip)

    expect(screen.queryByTestId('streak-panel')).not.toBeInTheDocument()
  })

  it('counts as an open dialog while it is open, and says so to whoever asked', () => {
    const onOpenChange = vi.fn()
    render(<Header surface="panel" onOpenChange={onOpenChange} />)

    fireEvent.click(screen.getByTestId('streak-chip'))
    expect(useOpenDialogs.getState().open).toBe(1)
    expect(onOpenChange).toHaveBeenLastCalledWith(true)

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(useOpenDialogs.getState().open).toBe(0)
    expect(onOpenChange).toHaveBeenLastCalledWith(false)
  })

  // Untick the one day there was and the run is gone, and with it the chip; the panel has
  // nothing left to talk about.
  // And it stays gone when a run starts again: ticking today after that should bring back
  // the chip, not a panel nobody opened.
  it('goes with the run, and does not come back with the next one', () => {
    const onOpenChange = vi.fn()
    const { rerender } = render(<Header surface="panel" streak={1} onOpenChange={onOpenChange} />)
    fireEvent.click(screen.getByTestId('streak-chip'))

    rerender(<Header surface="panel" streak={0} onOpenChange={onOpenChange} />)
    expect(screen.queryByTestId('streak-panel')).not.toBeInTheDocument()
    expect(useOpenDialogs.getState().open).toBe(0)
    expect(onOpenChange).toHaveBeenLastCalledWith(false)

    rerender(<Header surface="panel" streak={1} onOpenChange={onOpenChange} />)
    expect(screen.getByTestId('streak-chip')).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByTestId('streak-panel')).not.toBeInTheDocument()
  })
})
