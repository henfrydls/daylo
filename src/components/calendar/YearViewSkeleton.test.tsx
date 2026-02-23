import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { YearViewSkeleton } from './YearViewSkeleton'

describe('YearViewSkeleton', () => {
  it('should render the skeleton container', () => {
    render(<YearViewSkeleton />)
    expect(screen.getByTestId('year-view-skeleton')).toBeInTheDocument()
  })

  it('should render 12 month skeleton blocks', () => {
    const { container } = render(<YearViewSkeleton />)
    // Each month skeleton has a grid of 6 columns (weeks) x 7 rows (days) = 42 cells
    // The months grid container has 12 children
    const monthsGrid = container.querySelector('.grid.grid-cols-1.sm\\:grid-cols-2.lg\\:grid-cols-3.xl\\:grid-cols-4')
    expect(monthsGrid).toBeInTheDocument()
    expect(monthsGrid?.children.length).toBe(12)
  })

  it('should have correct outer padding classes matching YearView', () => {
    const { container } = render(<YearViewSkeleton />)
    const outerDiv = container.firstElementChild
    expect(outerDiv?.className).toContain('p-4')
    expect(outerDiv?.className).toContain('sm:p-6')
    expect(outerDiv?.className).toContain('lg:p-8')
    expect(outerDiv?.className).toContain('w-full')
  })

  it('should render navigation placeholder elements', () => {
    const { container } = render(<YearViewSkeleton />)
    // Should have animate-pulse elements for year and nav buttons
    const pulseElements = container.querySelectorAll('.animate-pulse')
    expect(pulseElements.length).toBeGreaterThan(0)
  })

  it('should render legend placeholder with 5 level boxes', () => {
    const { container } = render(<YearViewSkeleton />)
    // Legend has 5 level indicator boxes (w-[14px] h-[14px])
    const legendBoxes = container.querySelectorAll('[style*=""], .w-\\[14px\\].h-\\[14px\\]')
    // There are exactly 5 heatmap level placeholder boxes
    const levelBoxes = container.querySelectorAll('.w-\\[14px\\]')
    expect(levelBoxes.length).toBe(5)
  })

  it('should render bottom summary placeholders', () => {
    const { container } = render(<YearViewSkeleton />)
    // Bottom summary section has border-t
    const summarySection = container.querySelector('.border-t.border-gray-100')
    expect(summarySection).toBeInTheDocument()
  })

  it('should have day cells with correct dimensions for CLS=0', () => {
    const { container } = render(<YearViewSkeleton />)
    // Each month has 42 day cells (6 weeks * 7 days)
    const dayCells = container.querySelectorAll('.min-w-\\[10px\\].min-h-\\[10px\\].aspect-square')
    // 12 months * 42 cells = 504
    expect(dayCells.length).toBe(504)
  })
})
