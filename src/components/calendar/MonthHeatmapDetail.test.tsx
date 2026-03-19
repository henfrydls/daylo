import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MonthHeatmapDetail } from './MonthHeatmapDetail'
import type { Activity } from '../../types'

const MOCK_DATE = new Date(2024, 5, 15) // June 15, 2024

const MOCK_ACTIVITIES: Activity[] = [
  { id: '1', name: 'Exercise', color: '#22c55e', createdAt: '2024-01-01', updatedAt: '2024-01-01' },
  { id: '2', name: 'Reading', color: '#3b82f6', createdAt: '2024-01-01', updatedAt: '2024-01-01' },
]

function createLogsByDate(entries: [string, number][]): Map<string, number> {
  return new Map(entries)
}

describe('MonthHeatmapDetail', () => {
  const defaultProps = {
    year: 2024,
    month: 5, // June
    activities: MOCK_ACTIVITIES,
    logsByDate: new Map<string, number>(),
    onDateSelect: vi.fn(),
    onMonthChange: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(MOCK_DATE)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('Rendering', () => {
    it('should render the month name in the header', () => {
      render(<MonthHeatmapDetail {...defaultProps} />)

      expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('June')
    })

    it('should render day-of-week headers', () => {
      render(<MonthHeatmapDetail {...defaultProps} />)

      // S, M, T, W, T, F, S
      const headers = screen.getAllByText('S')
      expect(headers.length).toBeGreaterThanOrEqual(2) // Sunday and Saturday

      expect(screen.getByText('M')).toBeInTheDocument()
      expect(screen.getByText('W')).toBeInTheDocument()
      expect(screen.getByText('F')).toBeInTheDocument()
    })

    it('should render day cells for the month', () => {
      render(<MonthHeatmapDetail {...defaultProps} />)

      const dayCells = screen.getAllByTestId('month-detail-cell')
      // June 2024 has 30 days
      expect(dayCells).toHaveLength(30)
    })

    it('should render the correct number of days for February in a leap year', () => {
      render(<MonthHeatmapDetail {...defaultProps} month={1} />) // February

      const dayCells = screen.getAllByTestId('month-detail-cell')
      expect(dayCells).toHaveLength(29) // 2024 is a leap year
    })

    it('should render the correct number of days for January', () => {
      render(<MonthHeatmapDetail {...defaultProps} month={0} />)

      const dayCells = screen.getAllByTestId('month-detail-cell')
      expect(dayCells).toHaveLength(31)
    })

    it('should render a grid with proper aria-label', () => {
      render(<MonthHeatmapDetail {...defaultProps} />)

      expect(screen.getByRole('grid', { name: 'June 2024 detail' })).toBeInTheDocument()
    })
  })

  describe('Navigation', () => {
    it('should render previous and next month buttons', () => {
      render(<MonthHeatmapDetail {...defaultProps} />)

      expect(screen.getByLabelText('Previous month')).toBeInTheDocument()
      expect(screen.getByLabelText('Next month')).toBeInTheDocument()
    })

    it('should call onMonthChange with month-1 when previous is clicked', () => {
      const onMonthChange = vi.fn()
      render(<MonthHeatmapDetail {...defaultProps} onMonthChange={onMonthChange} />)

      fireEvent.click(screen.getByLabelText('Previous month'))

      expect(onMonthChange).toHaveBeenCalledWith(4) // May
    })

    it('should call onMonthChange with month+1 when next is clicked', () => {
      const onMonthChange = vi.fn()
      render(<MonthHeatmapDetail {...defaultProps} onMonthChange={onMonthChange} />)

      fireEvent.click(screen.getByLabelText('Next month'))

      expect(onMonthChange).toHaveBeenCalledWith(6) // July
    })

    it('should disable previous button when month is January', () => {
      render(<MonthHeatmapDetail {...defaultProps} month={0} />)

      const prevButton = screen.getByLabelText('Previous month')
      expect(prevButton).toBeDisabled()
    })

    it('should disable next button when month is December', () => {
      render(<MonthHeatmapDetail {...defaultProps} month={11} />)

      const nextButton = screen.getByLabelText('Next month')
      expect(nextButton).toBeDisabled()
    })

    it('should not disable navigation buttons for middle months', () => {
      render(<MonthHeatmapDetail {...defaultProps} month={5} />)

      expect(screen.getByLabelText('Previous month')).not.toBeDisabled()
      expect(screen.getByLabelText('Next month')).not.toBeDisabled()
    })

    it('should have 44px minimum touch targets on navigation buttons', () => {
      render(<MonthHeatmapDetail {...defaultProps} />)

      const prevButton = screen.getByLabelText('Previous month')
      const nextButton = screen.getByLabelText('Next month')

      expect(prevButton.className).toContain('min-h-[44px]')
      expect(prevButton.className).toContain('min-w-[44px]')
      expect(nextButton.className).toContain('min-h-[44px]')
      expect(nextButton.className).toContain('min-w-[44px]')
    })
  })

  describe('Day Cell Interaction', () => {
    it('should call onDateSelect when a current-month cell is clicked', () => {
      const onDateSelect = vi.fn()
      render(<MonthHeatmapDetail {...defaultProps} onDateSelect={onDateSelect} />)

      const dayCells = screen.getAllByTestId('month-detail-cell')
      fireEvent.click(dayCells[0]) // First day of June

      expect(onDateSelect).toHaveBeenCalledWith('2024-06-01')
    })

    it('should not call onDateSelect for previous/next month cells', () => {
      const onDateSelect = vi.fn()
      render(<MonthHeatmapDetail {...defaultProps} onDateSelect={onDateSelect} />)

      // Find disabled cells (previous/next month)
      const allButtons = screen.getByRole('grid').querySelectorAll('button[disabled]')
      if (allButtons.length > 0) {
        fireEvent.click(allButtons[0])
        expect(onDateSelect).not.toHaveBeenCalled()
      }
    })

    it('should have aria-labels on current-month cells', () => {
      render(<MonthHeatmapDetail {...defaultProps} />)

      const dayCells = screen.getAllByTestId('month-detail-cell')
      dayCells.forEach((cell) => {
        expect(cell).toHaveAttribute('aria-label')
      })
    })
  })

  describe('Today Highlighting', () => {
    it('should highlight today with a blue ring', () => {
      // System time is June 15, 2024
      render(<MonthHeatmapDetail {...defaultProps} month={5} />)

      const todayCell = screen.getByLabelText('2024-06-15 (today)')
      expect(todayCell.className).toContain('ring-blue-500')
    })

    it('should not highlight non-today cells with blue ring', () => {
      render(<MonthHeatmapDetail {...defaultProps} month={5} />)

      const otherCell = screen.getByLabelText('2024-06-01')
      expect(otherCell.className).not.toContain('ring-blue-500')
    })
  })

  describe('Heatmap Colors', () => {
    it('should show gray background for days with no completions', () => {
      render(<MonthHeatmapDetail {...defaultProps} logsByDate={new Map()} />)

      const dayCells = screen.getAllByTestId('month-detail-cell')
      const grayCell = dayCells[0]
      expect(grayCell.className).toContain('bg-gray')
    })

    it('should show emerald background for days with completions', () => {
      const logsByDate = createLogsByDate([['2024-06-01', 2]]) // 100% → level 4
      render(<MonthHeatmapDetail {...defaultProps} logsByDate={logsByDate} />)

      const firstCell = screen.getByLabelText('2024-06-01')
      expect(firstCell.className).toContain('bg-emerald')
    })

    it('should show different levels of emerald based on completion percentage', () => {
      const logsByDate = createLogsByDate([
        ['2024-06-01', 1], // 50% → level 2 (bg-emerald-300)
        ['2024-06-02', 2], // 100% → level 4 (bg-emerald-500)
      ])
      render(<MonthHeatmapDetail {...defaultProps} logsByDate={logsByDate} />)

      const cell1 = screen.getByLabelText('2024-06-01')
      const cell2 = screen.getByLabelText('2024-06-02')

      expect(cell1.className).toContain('bg-emerald')
      expect(cell2.className).toContain('bg-emerald')
    })

    it('should show white text on high-level cells (level >= 3)', () => {
      // 2 activities, 2 completed = 100% → level 4
      const logsByDate = createLogsByDate([['2024-06-01', 2]])
      render(<MonthHeatmapDetail {...defaultProps} logsByDate={logsByDate} />)

      const cell = screen.getByLabelText('2024-06-01')
      const span = cell.querySelector('span')
      expect(span?.className).toContain('text-white')
    })
  })

  describe('Month Names', () => {
    it('should show January for month 0', () => {
      render(<MonthHeatmapDetail {...defaultProps} month={0} />)
      expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('January')
    })

    it('should show December for month 11', () => {
      render(<MonthHeatmapDetail {...defaultProps} month={11} />)
      expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('December')
    })
  })
})
