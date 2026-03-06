import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ActivityList } from './ActivityList'
import { useCalendarStore } from '../../store'
import type { Activity } from '../../types'

// Mock the store
vi.mock('../../store', () => ({
  useCalendarStore: vi.fn(),
}))

// Mock ActivityForm to avoid rendering complexity
vi.mock('./ActivityForm', () => ({
  ActivityForm: () => null,
}))

const makeActivities = (count: number): Activity[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `id-${i + 1}`,
    name: `Activity ${i + 1}`,
    color: '#3B82F6',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  }))

const mockDeleteActivity = vi.fn()
const mockShowToast = vi.fn()

// Mock the toast hook
vi.mock('../ui', async () => {
  const actual = await vi.importActual('../ui')
  return {
    ...actual,
    useToast: () => ({ showToast: mockShowToast }),
  }
})

function setupStore(activities: Activity[]) {
  const mockStore = vi.mocked(useCalendarStore)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockStore.mockImplementation((selector?: (state: any) => any) => {
    const state = {
      activities,
      deleteActivity: mockDeleteActivity,
    }
    if (typeof selector === 'function') {
      return selector(state)
    }
    return state
  })
}

describe('ActivityList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Pagination', () => {
    it('should show all activities when there are 8 or fewer', () => {
      setupStore(makeActivities(8))
      render(<ActivityList />)

      const items = screen.getAllByTestId('activity-item')
      expect(items).toHaveLength(8)
      expect(screen.queryByTestId('show-more-button')).not.toBeInTheDocument()
    })

    it('should show only 8 activities when there are more than 8', () => {
      setupStore(makeActivities(12))
      render(<ActivityList />)

      const items = screen.getAllByTestId('activity-item')
      expect(items).toHaveLength(8)
    })

    it('should show "Show all" button with count when there are more than 8', () => {
      setupStore(makeActivities(12))
      render(<ActivityList />)

      const button = screen.getByTestId('show-more-button')
      expect(button).toBeInTheDocument()
      expect(button).toHaveTextContent('Show all (12)')
    })

    it('should not show "Show all" button when there are 8 or fewer activities', () => {
      setupStore(makeActivities(5))
      render(<ActivityList />)

      expect(screen.queryByTestId('show-more-button')).not.toBeInTheDocument()
    })

    it('should show all activities when "Show all" is clicked', async () => {
      const user = userEvent.setup()
      setupStore(makeActivities(12))
      render(<ActivityList />)

      const button = screen.getByTestId('show-more-button')
      await user.click(button)

      const items = screen.getAllByTestId('activity-item')
      expect(items).toHaveLength(12)
      expect(button).toHaveTextContent('Show less')
    })

    it('should collapse back to 8 when "Show less" is clicked', async () => {
      const user = userEvent.setup()
      setupStore(makeActivities(12))
      render(<ActivityList />)

      const button = screen.getByTestId('show-more-button')
      await user.click(button) // expand
      await user.click(button) // collapse

      const items = screen.getAllByTestId('activity-item')
      expect(items).toHaveLength(8)
      expect(button).toHaveTextContent('Show all (12)')
    })
  })

  describe('Empty State', () => {
    it('should show empty message when there are no activities', () => {
      setupStore([])
      render(<ActivityList />)

      expect(screen.getByText(/No activities yet/)).toBeInTheDocument()
    })
  })
})
