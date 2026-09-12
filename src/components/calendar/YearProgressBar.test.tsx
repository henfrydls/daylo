import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { YearProgressBar } from './YearProgressBar'

const MOCK_DATE = new Date(2024, 5, 15) // June 15, 2024

describe('YearProgressBar', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(MOCK_DATE)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const defaultProps = {
    year: 2024,
    logsByDate: new Map<string, number>(),
    totalActivities: 2,
    currentStreak: 0,
  }

  it('should not render when there are no activities', () => {
    const { container } = render(<YearProgressBar {...defaultProps} totalActivities={0} />)

    expect(container.firstChild).toBeNull()
  })

  it('should render the progress bar', () => {
    render(<YearProgressBar {...defaultProps} />)

    expect(screen.getByTestId('year-progress-bar')).toBeInTheDocument()
    expect(screen.getByRole('progressbar')).toBeInTheDocument()
  })

  it('should show 0% when no logs', () => {
    render(<YearProgressBar {...defaultProps} />)

    expect(screen.getByText('0%')).toBeInTheDocument()
    expect(screen.getByText(/days active/)).toBeInTheDocument()
  })

  it('should calculate percentage correctly', () => {
    const logsByDate = new Map<string, number>()
    // Add logs for 10 days
    for (let d = 1; d <= 10; d++) {
      logsByDate.set(`2024-01-${String(d).padStart(2, '0')}`, 1)
    }

    render(<YearProgressBar {...defaultProps} logsByDate={logsByDate} />)

    // 10 active days out of ~167 elapsed days (Jan 1 - Jun 15)
    expect(screen.getByText('10')).toBeInTheDocument()
    expect(screen.getByText(/days active/)).toBeInTheDocument()
  })

  // The bar no longer works the run out for itself. It shows the one it is handed, which
  // is worked out over every log there is, so this and the Statistics panel cannot end up
  // reporting different numbers for the same run.
  it('shows the streak it is given', () => {
    render(<YearProgressBar {...defaultProps} currentStreak={3} />)

    const streakText = screen.getByText(/d streak/)
    expect(streakText.textContent).toContain('3')
  })

  it('says nothing about a streak of nothing', () => {
    render(<YearProgressBar {...defaultProps} currentStreak={0} />)

    expect(screen.queryByText(/d streak/)).not.toBeInTheDocument()
  })

  // "N/M days active" has the days gone by on the right of the slash, so a day still to
  // come on the left would be claiming more active days than there have been. An imported
  // file can carry dates in the future.
  it('does not count a day still to come among the active ones', () => {
    const logsByDate = new Map<string, number>()
    logsByDate.set('2024-06-14', 1)
    logsByDate.set('2024-12-01', 1)

    render(<YearProgressBar {...defaultProps} logsByDate={logsByDate} />)

    expect(screen.getByText(/days active/).textContent).toMatch(/^1\//)
  })

  it('should show best month', () => {
    const logsByDate = new Map<string, number>()
    // Add many logs in March
    for (let d = 1; d <= 20; d++) {
      logsByDate.set(`2024-03-${String(d).padStart(2, '0')}`, 1)
    }

    render(<YearProgressBar {...defaultProps} logsByDate={logsByDate} />)

    expect(screen.getByText('Mar')).toBeInTheDocument()
    expect(screen.getByText(/Best:/)).toBeInTheDocument()
  })

  it('should have proper aria attributes on progress bar', () => {
    render(<YearProgressBar {...defaultProps} />)

    const progressbar = screen.getByRole('progressbar')
    expect(progressbar).toHaveAttribute('aria-valuenow', '0')
    expect(progressbar).toHaveAttribute('aria-valuemin', '0')
    expect(progressbar).toHaveAttribute('aria-valuemax', '100')
  })
})
