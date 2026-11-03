import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { StreakChip } from './StreakChip'

/** jsdom has no matchMedia, and the chip asks it whether anybody wants movement. */
function wants(movement: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: query.includes('prefers-reduced-motion') ? !movement : false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  })
}

describe('the streak chip', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    wants(true)
  })
  afterEach(() => vi.useRealTimers())

  it('says the run and whether today is in it', () => {
    render(<StreakChip streak={4} todayDone={false} />)

    expect(screen.getByTestId('streak-chip')).toHaveTextContent('4 days')
    expect(screen.getByTestId('streak-chip')).toHaveAccessibleName(
      '4 days in a row, today not logged yet'
    )
  })

  it('says one day in the singular, because a chip that says 1 days is a chip nobody wrote', () => {
    render(<StreakChip streak={1} todayDone />)

    expect(screen.getByTestId('streak-chip')).toHaveTextContent('1 day')
    expect(screen.getByTestId('streak-chip')).toHaveAccessibleName('1 day in a row, today included')
  })

  // Nothing to say and nothing said. A chip reading "0 days" tells somebody who has just
  // missed a day that they have nothing, in the one place they cannot look away from.
  it('is not there at all with no run', () => {
    render(<StreakChip streak={0} todayDone={false} />)

    expect(screen.queryByTestId('streak-chip')).not.toBeInTheDocument()
  })

  // The number walks rather than jumping, so a change is noticed without anything being
  // interrupted. It is the whole of the movement Henfry asked for.
  it('counts up to the new number instead of replacing it', () => {
    const { rerender } = render(<StreakChip streak={4} todayDone={false} />)
    rerender(<StreakChip streak={6} todayDone />)

    expect(screen.getByTestId('streak-chip')).toHaveTextContent('4 days')
    act(() => void vi.advanceTimersByTime(100))
    expect(screen.getByTestId('streak-chip')).toHaveTextContent('5 days')
    act(() => void vi.advanceTimersByTime(100))
    expect(screen.getByTestId('streak-chip')).toHaveTextContent('6 days')
  })

  // And it stops there. A counter that walks past its target is a counter that was written
  // with a timer and never watched.
  it('stops at the number it was given', () => {
    const { rerender } = render(<StreakChip streak={1} todayDone={false} />)
    rerender(<StreakChip streak={2} todayDone />)

    act(() => void vi.advanceTimersByTime(2000))
    expect(screen.getByTestId('streak-chip')).toHaveTextContent('2 days')
  })

  // The accessible name is the real number from the first frame. Somebody listening should
  // not have to wait out an animation to hear what their streak is.
  it('tells a screen reader the real number while the digits are still walking', () => {
    const { rerender } = render(<StreakChip streak={4} todayDone={false} />)
    rerender(<StreakChip streak={6} todayDone />)

    expect(screen.getByTestId('streak-chip')).toHaveAccessibleName(
      '6 days in a row, today included'
    )
  })

  it('reads as state and not as a button: no border, a soft green and a pill', () => {
    render(<StreakChip streak={9} todayDone />)
    const chip = screen.getByTestId('streak-chip')

    expect(chip.className).toContain('bg-emerald-50')
    expect(chip.className).toContain('rounded-full')
    expect(chip.className).not.toContain('border')
    expect(chip.className).toContain('min-h-12')
  })

  // A digit at a time is a nice touch over a step or two and a hostage situation over a
  // hundred. Importing a backup takes the run from 0 to whatever it was, and at a tenth of
  // a second a digit, 128 days is twelve and a half seconds of a number ticking in the
  // header while somebody waits to find out what they have.
  it('jumps when the distance is more than a few days', () => {
    const { rerender } = render(<StreakChip streak={0} todayDone={false} />)
    rerender(<StreakChip streak={128} todayDone />)

    expect(screen.getByTestId('streak-chip')).toHaveTextContent('128 days')
  })

  // The same the other way: deleting an old log can break a run of 30 into 3, and counting
  // down 27 steps is almost three seconds of watching a number fall.
  it('jumps down too, rather than counting the loss out loud', () => {
    const { rerender } = render(<StreakChip streak={30} todayDone />)
    rerender(<StreakChip streak={3} todayDone />)

    expect(screen.getByTestId('streak-chip')).toHaveTextContent('3 days')
  })

  // The movement is JavaScript, so the CSS rule that turns animation off does not reach it
  // and it has to ask for itself.
  it('does not walk at all for somebody who asked for less movement', () => {
    wants(false)
    const { rerender } = render(<StreakChip streak={4} todayDone={false} />)
    rerender(<StreakChip streak={6} todayDone />)

    expect(screen.getByTestId('streak-chip')).toHaveTextContent('6 days')
  })
})
