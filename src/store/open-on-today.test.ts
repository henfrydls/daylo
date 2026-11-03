import { describe, it, expect, beforeEach } from 'vitest'
import { useCalendarStore, STORAGE_KEY } from './index'

/**
 * Daylo is for today. Where it opened was wherever it was left, which is a different app:
 * somebody who looked at March in March came back in November and was shown March, with
 * today a swipe away and nothing saying so. The day sheet came back open too, over a day
 * that was no longer the day.
 */
const now = new Date()

/** A state saved while looking at March 2024, with the 14th open. */
function savedLookingAtMarch(): string {
  return JSON.stringify({
    state: {
      activities: [],
      logs: [],
      selectedDate: '2024-03-14',
      selectedMonth: 2,
      selectedYear: 2024,
      currentView: 'month',
      checkinEnabled: true,
    },
    version: 0,
  })
}

describe('opening on today', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('does not reopen the day that was open when Daylo was closed', async () => {
    localStorage.setItem(STORAGE_KEY, savedLookingAtMarch())

    await useCalendarStore.persist.rehydrate()

    expect(useCalendarStore.getState().selectedDate).toBeNull()
  })

  it('comes back to this month and this year, not the ones last looked at', async () => {
    localStorage.setItem(STORAGE_KEY, savedLookingAtMarch())

    await useCalendarStore.persist.rehydrate()

    const { selectedMonth, selectedYear } = useCalendarStore.getState()
    expect(selectedMonth).toBe(now.getMonth())
    expect(selectedYear).toBe(now.getFullYear())
  })

  // The three of them stop being written at all, rather than being written and then
  // ignored. A value on disk that nothing reads is a value somebody will read one day.
  it('writes none of the three to disk', async () => {
    await useCalendarStore.persist.rehydrate()
    useCalendarStore.getState().setSelectedDate('2024-03-14')
    useCalendarStore.getState().setSelectedMonth(2)
    useCalendarStore.getState().setSelectedYear(2024)
    await new Promise((resolve) => setTimeout(resolve, 20))

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{"state":{}}')
    expect(stored.state).not.toHaveProperty('selectedDate')
    expect(stored.state).not.toHaveProperty('selectedMonth')
    expect(stored.state).not.toHaveProperty('selectedYear')
  })

  // What is still kept: which of the two views somebody prefers is a preference, not a
  // place, and so is how they like the year read.
  it('still remembers the view and the year mode', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ state: { currentView: 'year', yearMode: 'byActivity' }, version: 0 })
    )

    await useCalendarStore.persist.rehydrate()

    expect(useCalendarStore.getState().currentView).toBe('year')
    expect(useCalendarStore.getState().yearMode).toBe('byActivity')
  })
})
