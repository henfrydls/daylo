import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { YearHeatmap } from './YearHeatmap'
import type { HeatmapLevel } from '../../types'

const onSelectDate = vi.fn()

function dayData(entries: Record<string, [number, HeatmapLevel]>) {
  return new Map(
    Object.entries(entries).map(([date, [completedCount, level]]) => [
      date,
      { completedCount, level },
    ])
  )
}

function paint(props: Partial<Parameters<typeof YearHeatmap>[0]> = {}) {
  return render(
    <YearHeatmap
      year={2026}
      dayData={dayData({ '2026-03-04': [2, 3] })}
      totalActivities={3}
      selectedDate={null}
      onSelectDate={onSelectDate}
      {...props}
    />
  )
}

const cells = () => screen.getAllByTestId('day-cell')
const cellFor = (date: string) =>
  cells().find((c) => c.getAttribute('data-date') === date) as HTMLElement
const tooltip = () => screen.queryByTestId('heatmap-tooltip')

beforeEach(() => {
  onSelectDate.mockReset()
  vi.setSystemTime(new Date(2026, 2, 4, 12))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('what it draws', () => {
  it('gives every day of the year a cell, and the padding none', () => {
    paint()

    expect(cells()).toHaveLength(365)
    expect(cellFor('2026-01-01')).toBeInTheDocument()
    expect(cellFor('2026-12-31')).toBeInTheDocument()
    // The padding holds the shape of the first and last weeks; it must not be clickable,
    // or a year would begin with days belonging to the one before it.
    expect(cellFor('2025-12-31')).toBeUndefined()
  })

  it('says what a day holds', () => {
    paint()

    expect(cellFor('2026-03-04')).toHaveAttribute('aria-label', 'Mar 4, 2026 — 2 of 3 completed')
    expect(cellFor('2026-03-05')).toHaveAttribute('aria-label', 'Mar 5, 2026 — 0 of 3 completed')
  })

  // Before there is anything to track, "0 of 0 completed" says nothing true.
  it('says something else when nothing is tracked yet', () => {
    paint({ totalActivities: 0, dayData: dayData({}) })

    expect(cellFor('2026-03-04')).toHaveAttribute('aria-label', 'Mar 4, 2026 — No activities yet')
  })

  it('colours a day by its level', () => {
    paint()

    expect(cellFor('2026-03-04')).toHaveAttribute('data-level', '3')
    expect(cellFor('2026-03-05')).toHaveAttribute('data-level', '0')
  })
})

describe('the tooltip', () => {
  it('opens on the cell under the pointer, and says that cell', () => {
    paint()

    fireEvent.pointerOver(cellFor('2026-03-04'))

    expect(tooltip()).toHaveTextContent('Mar 4, 2026 — 2 of 3 completed')
  })

  // One node, whatever the number of cells. Four thousand of them is the case this whole
  // approach exists for.
  it('is a single node that follows the pointer from cell to cell', () => {
    paint()

    fireEvent.pointerOver(cellFor('2026-03-04'))
    fireEvent.pointerOver(cellFor('2026-07-09'))

    expect(screen.getAllByTestId('heatmap-tooltip')).toHaveLength(1)
    expect(tooltip()).toHaveTextContent('Jul 9, 2026')
  })

  it('closes when the pointer leaves the grid', () => {
    paint()
    fireEvent.pointerOver(cellFor('2026-03-04'))

    fireEvent.pointerLeave(screen.getByRole('group'))

    expect(tooltip()).not.toBeInTheDocument()
  })

  // A keyboard reader gets the same thing the pointer does, or the grid says nothing at
  // all to them.
  it('opens on focus too', () => {
    paint()

    act(() => cellFor('2026-03-04').focus())

    expect(tooltip()).toHaveTextContent('Mar 4, 2026 — 2 of 3 completed')
  })
})

describe('the keyboard', () => {
  it('is one stop for the whole grid', () => {
    paint()

    expect(cells().filter((c) => c.getAttribute('tabindex') === '0')).toHaveLength(1)
    expect(cellFor('2026-01-01')).toHaveAttribute('tabindex', '0')
  })

  it('moves a day down the column and a week across', async () => {
    paint()
    act(() => cellFor('2026-03-04').focus())

    await userEvent.keyboard('{ArrowDown}')
    expect(cellFor('2026-03-05')).toHaveFocus()

    await userEvent.keyboard('{ArrowRight}')
    expect(cellFor('2026-03-12')).toHaveFocus()

    await userEvent.keyboard('{ArrowUp}')
    expect(cellFor('2026-03-11')).toHaveFocus()
  })

  it('takes the tab stop with it', async () => {
    paint()
    act(() => cellFor('2026-03-04').focus())

    await userEvent.keyboard('{ArrowDown}')

    expect(cellFor('2026-03-05')).toHaveAttribute('tabindex', '0')
    expect(cells().filter((c) => c.getAttribute('tabindex') === '0')).toHaveLength(1)
  })

  it('stops at the end of the year rather than wrapping', async () => {
    paint()
    act(() => cellFor('2026-12-31').focus())

    await userEvent.keyboard('{ArrowRight}')

    expect(cellFor('2026-12-31')).toHaveFocus()
  })
})

describe('picking a day', () => {
  it('reports the date that was clicked', async () => {
    paint()

    await userEvent.click(cellFor('2026-07-09'))

    expect(onSelectDate).toHaveBeenCalledWith('2026-07-09')
  })

  it('marks today and the selected day', () => {
    paint({ selectedDate: '2026-07-09' })

    expect(cellFor('2026-07-09').className).toContain('emerald')
    expect(cellFor('2026-03-04').className).toContain('blue')
  })
})
