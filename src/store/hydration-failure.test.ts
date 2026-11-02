import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useCalendarStore, STORAGE_KEY } from './index'
import { useRescueStore } from './rescue'

/**
 * What happens when the stored value cannot be read.
 *
 * Driven through zustand's own `persist.rehydrate()` rather than by calling the handler
 * directly, because the handler's signature is the thing that was wrong: the old body took
 * one argument and zustand passes two, and a test that called it with what it expected
 * would have agreed with the bug.
 */
describe('a stored value that will not open', () => {
  /**
   * The wait is load bearing and the reason is worth knowing.
   *
   * The store's storage adapter defers writes and, while one is pending, `getItem` returns
   * what is waiting rather than what is on the disk. So a `setState` here leaves a valid
   * value in hand, and a rehydrate a moment later reads that instead of the corrupt bytes
   * this test just wrote: the test would pass hydration cleanly and prove nothing. Waiting
   * lets the flush happen first, and only then is the disk the thing that answers.
   */
  const settle = () => new Promise((done) => setTimeout(done, 20))

  beforeEach(async () => {
    useRescueStore.setState({ failure: null })
    useCalendarStore.setState({ _hasHydrated: false })
    await settle()
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('raises the way out, and does not report itself as loaded', async () => {
    localStorage.setItem(STORAGE_KEY, '{"state":{"logs":[truncated')

    await useCalendarStore.persist.rehydrate()

    expect(useRescueStore.getState().failure).toEqual({
      reason: 'unreadable',
      raw: '{"state":{"logs":[truncated',
    })
    expect(useCalendarStore.getState()._hasHydrated).toBe(false)
  })

  /**
   * The part that makes the screen worth having. Whatever is on the disk is the only copy,
   * and a device that could not be read is the last one that should be written to.
   */
  it('leaves the bytes on the disk exactly as they were', async () => {
    const stored = '{"state":{"activities":[{"id":"a"}],"logs":[trunc'
    localStorage.setItem(STORAGE_KEY, stored)

    await useCalendarStore.persist.rehydrate()

    expect(localStorage.getItem(STORAGE_KEY)).toBe(stored)
  })

  it('opens normally and says nothing when the value is fine', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ state: { activities: [], logs: [] }, version: 0 })
    )

    await useCalendarStore.persist.rehydrate()

    expect(useRescueStore.getState().failure).toBeNull()
    expect(useCalendarStore.getState()._hasHydrated).toBe(true)
  })
})
