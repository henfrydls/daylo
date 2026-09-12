import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { ActivityWeekStrip } from './ActivityWeekStrip'

const WEDNESDAY = new Date(2026, 8, 9, 12)

function paint(props: Partial<Parameters<typeof ActivityWeekStrip>[0]> = {}) {
  return render(
    <ActivityWeekStrip
      name="Hiking"
      color="#8B5CF6"
      done={new Set(['2026-09-06', '2026-09-07', '2026-09-08'])}
      end={WEDNESDAY}
      days={102}
      streak={1}
      {...props}
    />
  )
}

const blocks = () => screen.getAllByTestId('week-block')
const lastBlock = () => blocks()[blocks().length - 1]

describe('the strip', () => {
  it('is twenty six blocks', () => {
    paint()

    expect(blocks()).toHaveLength(26)
  })

  it('says whose it is and how it is going', () => {
    paint()

    const strip = screen.getByTestId('strip-Hiking')
    expect(strip).toHaveTextContent('Hiking')
    expect(strip).toHaveTextContent('102 days · 1 streak')
  })

  it('says one day, not one days', () => {
    paint({ days: 1 })

    expect(screen.getByTestId('strip-Hiking')).toHaveTextContent('1 day · 1 streak')
  })

  // Without this the strip is twenty six anonymous rectangles: a phone has no hover, so
  // the block itself has to carry what it means.
  it('tells a screen reader what a block holds', () => {
    paint()

    expect(lastBlock()).toHaveAttribute('aria-label', 'Week of Sep 6: 3 of 7 days')
  })

  it('explains its own unit, and the months it spans', () => {
    paint()

    const strip = screen.getByTestId('strip-Hiking')
    expect(strip).toHaveTextContent('each block is one week')
    expect(strip).toHaveTextContent('Mar')
    expect(strip).toHaveTextContent('Sep')
  })
})

describe('how solid a week looks', () => {
  it('darkens with the days done in it', () => {
    paint({ done: new Set(['2026-09-06', '2026-09-07', '2026-09-08']) })

    expect(lastBlock()).toHaveStyle({ backgroundColor: '#8B5CF6', opacity: '0.6' })
  })

  it('is the full colour for a whole week', () => {
    const week = ['06', '07', '08', '09', '10', '11', '12'].map((d) => `2026-09-${d}`)
    paint({ done: new Set(week) })

    expect(lastBlock()).toHaveStyle({ backgroundColor: '#8B5CF6', opacity: '1' })
  })

  // An empty week is grey, not a very faint version of the colour: a run of nothing has to
  // read as nothing at arm's length.
  it('is grey when the week is empty', () => {
    paint({ done: new Set() })

    expect(lastBlock()).not.toHaveStyle({ backgroundColor: '#8B5CF6' })
    expect(lastBlock()).toHaveAttribute('data-days', '0')
  })
})

describe('a year already over', () => {
  it('ends on the week it is given rather than on today', () => {
    paint({ end: new Date(2025, 11, 31, 12), done: new Set(['2025-12-29']) })

    expect(lastBlock()).toHaveAttribute('aria-label', 'Week of Dec 28: 1 of 7 days')
    expect(within(screen.getByTestId('strip-Hiking')).getByText('Dec')).toBeInTheDocument()
  })
})
