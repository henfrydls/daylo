import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useReminderOpensToday } from './useReminderOpensToday'
import { useCalendarStore } from '../store'
import { formatDate } from '../lib/dates'

const launchedFromReminder = vi.hoisted(() => vi.fn())
const listenForReminderTaps = vi.hoisted(() => vi.fn())

vi.mock('../lib/reminderTap', () => ({ launchedFromReminder, listenForReminderTaps }))

let tap: () => void = () => {}
const stopListening = vi.fn()

const today = () => formatDate(new Date())
const state = () => useCalendarStore.getState()

beforeEach(() => {
  launchedFromReminder.mockReset().mockResolvedValue(false)
  stopListening.mockReset()
  listenForReminderTaps.mockReset().mockImplementation((onTap: () => void) => {
    tap = onTap
    return stopListening
  })
  useCalendarStore.setState({
    selectedDate: null,
    selectedYear: 2020,
    selectedMonth: 0,
    _openTodayAsked: false,
  })
})

afterEach(() => {
  vi.useRealTimers()
})

/**
 * A tap on the reminder opens today's sheet, whichever road it came by (#192).
 */
describe('a tap on the reminder', () => {
  it('opens today when the app was in memory', async () => {
    const clear = vi.fn()
    renderHook(() => useReminderOpensToday(today(), true, clear))

    await act(async () => tap())

    expect(state().selectedDate).toBe(today())
    expect(clear).toHaveBeenCalledTimes(1)
  })

  it('opens today when the tap started the app', async () => {
    launchedFromReminder.mockResolvedValue(true)

    renderHook(() => useReminderOpensToday(today(), true, () => {}))
    await act(async () => {})

    expect(state().selectedDate).toBe(today())
  })

  it('opens nothing on a launch that was not the reminder', async () => {
    renderHook(() => useReminderOpensToday(today(), true, () => {}))
    await act(async () => {})

    expect(state().selectedDate).toBeNull()
  })

  // Closing the sheet lands on today's month, not on whatever month was being looked at.
  it('shows the month that holds today behind the sheet', async () => {
    renderHook(() => useReminderOpensToday(today(), true, () => {}))

    await act(async () => tap())

    expect(state().selectedYear).toBe(new Date().getFullYear())
    expect(state().selectedMonth).toBe(new Date().getMonth())
  })

  it('is answered once: the sheet closed afterwards stays closed', async () => {
    renderHook(() => useReminderOpensToday(today(), true, () => {}))
    await act(async () => tap())

    act(() => state().setSelectedDate(null))

    expect(state().selectedDate).toBeNull()
    expect(state()._openTodayAsked).toBe(false)
  })

  // Before the store has been read from disk there is nothing to open the sheet over.
  it('waits for the app to be ready', async () => {
    const { rerender } = renderHook(
      ({ ready }) => useReminderOpensToday(today(), ready, () => {}),
      {
        initialProps: { ready: false },
      }
    )
    await act(async () => tap())
    expect(state().selectedDate).toBeNull()

    rerender({ ready: true })

    expect(state().selectedDate).toBe(today())
  })

  // The tap the morning after: the app still shows yesterday until it notices the new day,
  // and noticing it closes any sheet. Opened before that, today's sheet would be closed
  // by the new day a moment later; so it waits for the day on screen to be the clock's.
  it('waits for the day on screen to catch up with the clock', async () => {
    const yesterday = formatDate(new Date(Date.now() - 24 * 60 * 60 * 1000))
    const { rerender } = renderHook(({ day }) => useReminderOpensToday(day, true, () => {}), {
      initialProps: { day: yesterday },
    })

    await act(async () => tap())
    expect(state().selectedDate).toBeNull()

    rerender({ day: today() })

    expect(state().selectedDate).toBe(today())
  })

  it('stops listening when the app goes', () => {
    const { unmount } = renderHook(() => useReminderOpensToday(today(), true, () => {}))

    unmount()

    expect(stopListening).toHaveBeenCalledTimes(1)
  })
})
