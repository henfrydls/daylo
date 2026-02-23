import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AppSkeleton } from './AppSkeleton'

describe('AppSkeleton', () => {
  it('should render the app skeleton container', () => {
    render(<AppSkeleton />)
    expect(screen.getByTestId('app-skeleton')).toBeInTheDocument()
  })

  it('should have min-h-screen and bg-gray-50 matching App layout', () => {
    render(<AppSkeleton />)
    const container = screen.getByTestId('app-skeleton')
    expect(container.className).toContain('min-h-screen')
    expect(container.className).toContain('bg-gray-50')
  })

  it('should render a header skeleton', () => {
    const { container } = render(<AppSkeleton />)
    const header = container.querySelector('header')
    expect(header).toBeInTheDocument()
    expect(header?.className).toContain('bg-white')
    expect(header?.className).toContain('border-b')
  })

  it('should render main content with grid layout', () => {
    const { container } = render(<AppSkeleton />)
    const mainContent = container.querySelector('main')
    expect(mainContent).toBeInTheDocument()
    // Should have the 4-column grid
    const grid = mainContent?.querySelector('.grid.grid-cols-1.lg\\:grid-cols-4')
    expect(grid).toBeInTheDocument()
  })

  it('should include YearViewSkeleton in the calendar section', () => {
    render(<AppSkeleton />)
    expect(screen.getByTestId('year-view-skeleton')).toBeInTheDocument()
  })

  it('should render sidebar skeleton with activity list and stats placeholders', () => {
    const { container } = render(<AppSkeleton />)
    // Sidebar should have space-y-6
    const sidebar = container.querySelector('.space-y-6')
    expect(sidebar).toBeInTheDocument()
    // Should contain skeleton cards with bg-white rounded-xl border
    const cards = sidebar?.querySelectorAll('.bg-white.rounded-xl.border')
    expect(cards?.length).toBeGreaterThanOrEqual(2)
  })

  it('should render animate-pulse elements for loading state', () => {
    const { container } = render(<AppSkeleton />)
    const pulseElements = container.querySelectorAll('.animate-pulse')
    expect(pulseElements.length).toBeGreaterThan(0)
  })

  it('should render calendar section spanning 3 columns', () => {
    const { container } = render(<AppSkeleton />)
    const calendarSection = container.querySelector('.lg\\:col-span-3')
    expect(calendarSection).toBeInTheDocument()
    expect(calendarSection?.className).toContain('bg-white')
    expect(calendarSection?.className).toContain('rounded-xl')
  })
})
