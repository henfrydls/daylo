import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DayCell } from './DayCell'

function renderCell() {
  render(
    <DayCell
      date={new Date(2026, 0, 15)}
      level={0}
      completedCount={0}
      totalActivities={2}
      onClick={() => {}}
    />
  )
  return screen.getByTestId('day-cell')
}

describe('DayCell sizing', () => {
  // This is a layout rule that jsdom cannot check by measuring, so it is checked by
  // reading the classes. It is here because the alternative was a bug nobody could see
  // in Chromium.
  //
  // The cell sits in a grid whose rows are 1fr of a grid that has no definite height, so
  // the row is sized from its content. Giving the cell h-full made its height depend on
  // the row while the row depended on it. Chromium resolved the cycle quietly; WebKit fed
  // the hovered cell's scaled box back into the row, and one cell grew to fill the window
  // while the rest of the year was pushed out of view. Measured in WebKitGTK 4.1: forcing
  // the scale(1.1) that hover:scale-110 applies took the cell from 18x24 to 19x158 and
  // its week column from 18x170 to 18x1032. Without h-full the same forced scale leaves
  // it at 19x19 and the column at 18x192.
  //
  // So the height must come from the aspect ratio and nothing else.
  it('takes its height from the aspect ratio, never from the row', () => {
    const cell = renderCell()
    expect(cell.className).toContain('aspect-square')
    expect(cell.className).not.toContain('h-full')
  })

  it('still fills the width of its column', () => {
    expect(renderCell().className).toContain('w-full')
  })

  // The tap target on phones does not come from the row either.
  it('keeps a minimum tap target', () => {
    const cell = renderCell()
    expect(cell.className).toContain('min-w-[44px]')
    expect(cell.className).toContain('min-h-[44px]')
  })
})
