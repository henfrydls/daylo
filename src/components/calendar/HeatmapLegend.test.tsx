import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { HeatmapLegend } from './HeatmapLegend'

describe('HeatmapLegend', () => {
  it('should render the legend group', () => {
    render(<HeatmapLegend />)

    const legend = screen.getByRole('group', { name: 'Activity level legend' })
    expect(legend).toBeInTheDocument()
  })

  it('should display Less and More labels', () => {
    render(<HeatmapLegend />)

    expect(screen.getByText('Less')).toBeInTheDocument()
    expect(screen.getByText('More')).toBeInTheDocument()
  })

  it('should render all 5 legend color boxes', () => {
    render(<HeatmapLegend />)

    const legend = screen.getByRole('group', { name: 'Activity level legend' })
    const legendItems = within(legend).getAllByRole('listitem')

    expect(legendItems).toHaveLength(5)
  })

  it('should have proper aria-labels on legend items', () => {
    render(<HeatmapLegend />)

    expect(screen.getByRole('listitem', { name: 'No activity: 0%' })).toBeInTheDocument()
    expect(screen.getByRole('listitem', { name: 'Low activity: 1-25%' })).toBeInTheDocument()
    expect(screen.getByRole('listitem', { name: 'Medium activity: 26-50%' })).toBeInTheDocument()
    expect(screen.getByRole('listitem', { name: 'High activity: 51-75%' })).toBeInTheDocument()
    expect(
      screen.getByRole('listitem', { name: 'Very high activity: 76-100%' })
    ).toBeInTheDocument()
  })
})
