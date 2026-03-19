import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MonthCard } from './MonthCard'

describe('MonthCard', () => {
  const defaultProps = {
    year: 2024,
    month: 0, // January
    totalActivities: 2,
    logsByDate: new Map<string, number>(),
    onSelect: vi.fn(),
  }

  it('should render the month name', () => {
    render(<MonthCard {...defaultProps} />)

    expect(screen.getByText('Jan')).toBeInTheDocument()
  })

  it('should display days completed stats', () => {
    const logsByDate = new Map<string, number>([
      ['2024-01-01', 1],
      ['2024-01-05', 2],
      ['2024-01-10', 1],
    ])

    render(<MonthCard {...defaultProps} logsByDate={logsByDate} />)

    // 3 days with activity out of 31 days in January
    expect(screen.getByText(/3\/31/)).toBeInTheDocument()
    expect(screen.getByText(/10%/)).toBeInTheDocument()
  })

  it('should display 0% when no logs exist', () => {
    render(<MonthCard {...defaultProps} />)

    expect(screen.getByText(/0\/31/)).toBeInTheDocument()
    expect(screen.getByText(/0%/)).toBeInTheDocument()
  })

  it('should call onSelect with month when clicked', () => {
    const onSelect = vi.fn()
    render(<MonthCard {...defaultProps} onSelect={onSelect} />)

    fireEvent.click(screen.getByTestId('month-card'))

    expect(onSelect).toHaveBeenCalledWith(0)
  })

  it('should have proper aria-label with stats', () => {
    const logsByDate = new Map<string, number>([
      ['2024-01-01', 1],
      ['2024-01-02', 2],
    ])

    render(<MonthCard {...defaultProps} logsByDate={logsByDate} />)

    const card = screen.getByTestId('month-card')
    expect(card).toHaveAttribute('aria-label', expect.stringContaining('January 2024'))
    expect(card).toHaveAttribute('aria-label', expect.stringContaining('2 of 31'))
  })

  it('should render mini heatmap grid cells', () => {
    render(<MonthCard {...defaultProps} />)

    // January 2024 starts on Monday, so there's 1 empty cell + 31 day cells
    // Total grid cells = 1 offset + 31 days + trailing to fill week = 35 cells
    const card = screen.getByTestId('month-card')
    const gridCells = card.querySelectorAll('[role="presentation"] > div')
    expect(gridCells.length).toBeGreaterThan(0)
  })

  it('should handle February in a leap year', () => {
    render(<MonthCard {...defaultProps} month={1} year={2024} />)

    // Feb 2024 has 29 days
    expect(screen.getByText(/0\/29/)).toBeInTheDocument()
  })

  it('should handle different months correctly', () => {
    // June has 30 days
    render(<MonthCard {...defaultProps} month={5} />)

    expect(screen.getByText('Jun')).toBeInTheDocument()
    expect(screen.getByText(/0\/30/)).toBeInTheDocument()
  })
})
