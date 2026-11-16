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

  /**
   * #221. zustand hands merge `undefined` for three different things: an empty storage, a
   * value that parses but carries no `state`, and a value saved under a version this build
   * does not know how to migrate. Only the first is a new installation. The other two used
   * to open as one, empty, and the first write of the launch put the empty state over what
   * was there.
   */
  describe('something stored that does not open as a state', () => {
    const activity = { id: 'a', name: 'Walk', color: '#10B981' }

    it('treats a value with no state as unreadable, not as a new installation', async () => {
      const stored = JSON.stringify({ activities: [activity], logs: [] })
      localStorage.setItem(STORAGE_KEY, stored)

      await useCalendarStore.persist.rehydrate()

      expect(useRescueStore.getState().failure).toEqual({ reason: 'unreadable', raw: stored })
      expect(useCalendarStore.getState()._hasHydrated).toBe(false)
      await settle()
      expect(localStorage.getItem(STORAGE_KEY)).toBe(stored)
    })

    /** What a copy downgraded from a build that bumped `version` would hold. */
    it('treats a value from a version it cannot migrate as unreadable', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      const stored = JSON.stringify({ state: { activities: [activity], logs: [] }, version: 7 })
      localStorage.setItem(STORAGE_KEY, stored)

      await useCalendarStore.persist.rehydrate()

      expect(useRescueStore.getState().failure).toEqual({ reason: 'unreadable', raw: stored })
      expect(useCalendarStore.getState()._hasHydrated).toBe(false)
      await settle()
      expect(localStorage.getItem(STORAGE_KEY)).toBe(stored)
    })

    it('still opens an empty storage as a new installation', async () => {
      await useCalendarStore.persist.rehydrate()

      expect(useRescueStore.getState().failure).toBeNull()
      expect(useCalendarStore.getState()._hasHydrated).toBe(true)
      expect(useCalendarStore.getState()._checkinStart).toBe('new')
    })
  })
})

/**
 * The other half of #221's trap. Giving `persist` a version without a migrate makes zustand
 * throw away every stored value written under the old one. With the merge above that now
 * stops at the rescue screen instead of wiping the data, but every copy updating would
 * still land there. A version bump has to come with its migration.
 */
describe('the persisted format', () => {
  it('has no version without a migrate to go with it', () => {
    const options = useCalendarStore.persist.getOptions()
    if ((options.version ?? 0) !== 0) {
      expect(options.migrate).toBeTypeOf('function')
    }
  })
})
