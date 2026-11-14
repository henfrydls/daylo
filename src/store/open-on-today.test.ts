import { describe, it, expect, beforeEach } from 'vitest'
import { useCalendarStore, STORAGE_KEY, WHERE_SOMEBODY_IS } from './index'

/**
 * Every test starts from the store a launch starts from. Without this a test inherits
 * whatever the one before it set (March 2024, the year view), and passes or fails by the
 * order they run in. The write the reset schedules is let through before the storage is
 * cleared, or it would land on top of what the test puts there.
 */
async function freshLaunch() {
  useCalendarStore.setState(useCalendarStore.getInitialState(), true)
  await new Promise((resolve) => setTimeout(resolve, 20))
  localStorage.clear()
}

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
  beforeEach(freshLaunch)

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

  // What is still kept: how somebody likes the year read is a preference, not a place.
  it('still remembers how the year is read', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ state: { currentView: 'year', yearMode: 'byActivity' }, version: 0 })
    )

    await useCalendarStore.persist.rehydrate()

    expect(useCalendarStore.getState().yearMode).toBe('byActivity')
  })
})

/**
 * The view turned out to be a place too. Somebody who tapped Year once, or swiped sideways
 * on a phone without meaning to, came back the next day to twelve cards with no Today bar
 * and no obvious way to tick today off, which is what they had opened Daylo to do.
 */
describe('opening on the month', () => {
  beforeEach(freshLaunch)

  it('opens on the month even when the year was on screen when Daylo was closed', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ state: { currentView: 'year', yearMode: 'byActivity' }, version: 0 })
    )

    await useCalendarStore.persist.rehydrate()

    expect(useCalendarStore.getState().currentView).toBe('month')
  })

  // Not written, rather than written and then ignored, for the same reason as the three
  // above.
  it('does not write the view to disk', async () => {
    await useCalendarStore.persist.rehydrate()
    useCalendarStore.getState().setCurrentView('year')
    await new Promise((resolve) => setTimeout(resolve, 20))

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{"state":{}}')
    expect(stored.state).not.toHaveProperty('currentView')
    // And the write did happen, so the line above is about what it carried.
    expect(stored.state).toHaveProperty('yearMode')
  })
})

/**
 * The two halves read the same list. partialize names what is kept and merge drops what is
 * not, and the day a new place is added to the store it has to be left out of one and
 * dropped by the other; checked here against the list rather than against four names
 * written out again.
 */
describe('where somebody is', () => {
  beforeEach(freshLaunch)

  it.each(WHERE_SOMEBODY_IS)('is not written: %s', (place) => {
    const partialize = useCalendarStore.persist.getOptions().partialize!
    expect(partialize(useCalendarStore.getState())).not.toHaveProperty(place)
  })

  it.each(WHERE_SOMEBODY_IS)('is dropped when read back: %s', (place) => {
    const merge = useCalendarStore.persist.getOptions().merge!
    const current = useCalendarStore.getState()
    const stored = { [place]: 'from disk' }
    expect(merge(stored, current)[place]).toBe(current[place])
  })
})
