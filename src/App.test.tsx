import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import { useCalendarStore } from './store'

const remindersAvailable = vi.hoisted(() => vi.fn())

// The platform side of reminders is stubbed: this is about what the menu offers, not
// about what Android does with it.
vi.mock('./lib/reminders', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./lib/reminders')>()),
  remindersAvailable,
  enableReminder: vi.fn().mockResolvedValue('on'),
  disableReminder: vi.fn().mockResolvedValue(undefined),
  reconcileReminder: vi.fn().mockResolvedValue(undefined),
}))

async function openTheMenu() {
  // Both triggers are in the DOM at once, one for phones and one for wider screens; jsdom
  // applies no media queries, so either will do.
  await userEvent.click(screen.getAllByLabelText('More options')[0])
}

beforeEach(() => {
  remindersAvailable.mockReset().mockResolvedValue(false)
  useCalendarStore.setState({
    activities: [],
    logs: [],
    _hasHydrated: true,
    reminderEnabled: false,
    reminderOffered: true,
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('the daily reminder in the menu', () => {
  it('is absent where a notification cannot arrive', async () => {
    render(<App />)
    await act(async () => {})

    await openTheMenu()

    expect(screen.queryByText('Daily reminder')).not.toBeInTheDocument()
  })

  it('is there on Android, and opens the setting', async () => {
    remindersAvailable.mockResolvedValue(true)
    render(<App />)
    await act(async () => {})

    await openTheMenu()
    await userEvent.click(screen.getByText('Daily reminder'))

    expect(await screen.findByTestId('reminder-settings')).toBeInTheDocument()
  })
})
