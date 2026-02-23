import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MiniHeatmap } from './MiniHeatmap'
import type { Activity } from '../../types'

const MOCK_ACTIVITIES: Activity[] = [
  { id: '1', name: 'Exercise', color: '#22c55e', createdAt: '2024-01-01', updatedAt: '2024-01-01' },
  { id: '2', name: 'Reading', color: '#3b82f6', createdAt: '2024-01-01', updatedAt: '2024-01-01' },
]

function createLogsByDate(dates: string[], count = 1): Map<string, number> {
  const map = new Map<string, number>()
  dates.forEach((d) => map.set(d, count))
  return map
}

describe('MiniHeatmap', () => {
  const defaultProps = {
    year: 2024,
    activities: MOCK_ACTIVITIES,
    logsByDate: new Map<string, number>(),
    selectedMonth: 0,
    onMonthSelect: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Rendering', () => {
    it('should render all 12 month labels', () => {
      render(<MiniHeatmap {...defaultProps} />)

      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
      months.forEach((month) => {
        expect(screen.getByText(month)).toBeInTheDocument()
      })
    })

    it('should render 12 month buttons', () => {
      render(<MiniHeatmap {...defaultProps} />)

      const buttons = screen.getAllByRole('button')
      expect(buttons).toHaveLength(12)
    })

    it('should render a grid container with aria-label', () => {
      render(<MiniHeatmap {...defaultProps} />)

      expect(screen.getByRole('grid', { name: 'Mini heatmap for 2024' })).toBeInTheDocument()
    })

    it('should render heatmap cells as divs, not buttons', () => {
      render(<MiniHeatmap {...defaultProps} />)

      // The mini heatmap cells are divs with aria-hidden
      const grid = screen.getByRole('grid')
      const cells = grid.querySelectorAll('[aria-hidden="true"]')
      expect(cells.length).toBeGreaterThan(0)

      // None of the heatmap cells should be buttons
      cells.forEach((cell) => {
        expect(cell.tagName).not.toBe('BUTTON')
      })
    })
  })

  describe('Month Selection', () => {
    it('should highlight the selected month with ring styling', () => {
      render(<MiniHeatmap {...defaultProps} selectedMonth={3} />)

      const aprButton = screen.getByLabelText('Apr 2024 (selected)')
      expect(aprButton.className).toContain('ring-2')
      expect(aprButton.className).toContain('ring-emerald-500')
    })

    it('should not highlight non-selected months with ring', () => {
      render(<MiniHeatmap {...defaultProps} selectedMonth={0} />)

      const febButton = screen.getByLabelText('Feb 2024')
      expect(febButton.className).not.toContain('ring-emerald-500')
    })

    it('should call onMonthSelect when a month is tapped', () => {
      const onMonthSelect = vi.fn()
      render(<MiniHeatmap {...defaultProps} onMonthSelect={onMonthSelect} />)

      const junButton = screen.getByLabelText('Jun 2024')
      fireEvent.click(junButton)

      expect(onMonthSelect).toHaveBeenCalledWith(5)
    })

    it('should have aria-pressed=true on the selected month', () => {
      render(<MiniHeatmap {...defaultProps} selectedMonth={6} />)

      const julButton = screen.getByLabelText('Jul 2024 (selected)')
      expect(julButton).toHaveAttribute('aria-pressed', 'true')
    })

    it('should have aria-pressed=false on non-selected months', () => {
      render(<MiniHeatmap {...defaultProps} selectedMonth={0} />)

      const marButton = screen.getByLabelText('Mar 2024')
      expect(marButton).toHaveAttribute('aria-pressed', 'false')
    })
  })

  describe('Heatmap Colors', () => {
    it('should show gray cells when no logs exist', () => {
      render(<MiniHeatmap {...defaultProps} logsByDate={new Map()} />)

      const grid = screen.getByRole('grid')
      const cells = grid.querySelectorAll('[aria-hidden="true"]')

      // All day cells should have gray background (level 0)
      const grayCells = Array.from(cells).filter((c) => c.className.includes('bg-gray'))
      expect(grayCells.length).toBeGreaterThan(0)
    })

    it('should show emerald cells when logs exist', () => {
      const logsByDate = createLogsByDate(['2024-01-01', '2024-01-02'], 2) // 2/2 = 100% → level 4
      render(<MiniHeatmap {...defaultProps} logsByDate={logsByDate} />)

      const grid = screen.getByRole('grid')
      const cells = grid.querySelectorAll('[aria-hidden="true"]')
      const emeraldCells = Array.from(cells).filter((c) => c.className.includes('bg-emerald'))
      expect(emeraldCells.length).toBeGreaterThan(0)
    })
  })

  describe('Year handling', () => {
    it('should render correctly for a different year', () => {
      render(<MiniHeatmap {...defaultProps} year={2025} selectedMonth={3} />)

      expect(screen.getByRole('grid', { name: 'Mini heatmap for 2025' })).toBeInTheDocument()
      expect(screen.getByLabelText('Jan 2025')).toBeInTheDocument()
    })

    it('should handle leap year correctly (Feb has 29 days in 2024)', () => {
      const logsByDate = createLogsByDate(['2024-02-29'], 2)
      render(<MiniHeatmap {...defaultProps} logsByDate={logsByDate} />)

      // Should render without error - the grid should contain Feb 29 data
      const grid = screen.getByRole('grid')
      const emeraldCells = grid.querySelectorAll('.bg-emerald-500')
      expect(emeraldCells.length).toBeGreaterThan(0)
    })
  })
})
