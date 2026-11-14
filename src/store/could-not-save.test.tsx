import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react'

/**
 * When the disk refuses a write: full, or blocked.
 *
 * It is the one moment Daylo knows it is about to lose something and can still prevent it,
 * because what was not written is still in memory and Export still works. The notice used
 * to be in Spanish in an app in English, went away by itself after 3 seconds, and came once
 * per session whatever happened after it.
 *
 * Each test imports the store afresh, because whether a failure has been reported lives in
 * the module, and a test that inherited the one before it would prove nothing.
 */
describe('a write the disk refuses', { timeout: 30_000 }, () => {
  let setItem: ReturnType<typeof vi.spyOn>

  async function freshStore() {
    const store = await import('./index')
    const toast = await import('./toast')
    const ui = await import('../components/ui/Toast')
    return { ...store, ...toast, ...ui }
  }

  const refuseWrites = () => {
    setItem.mockImplementation(() => {
      throw new DOMException('quota exceeded', 'QuotaExceededError')
    })
  }
  const acceptWrites = () => setItem.mockRestore()

  beforeEach(() => {
    vi.useFakeTimers()
    vi.resetModules()
    localStorage.clear()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    setItem = vi.spyOn(Storage.prototype, 'setItem')
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('says so in English, and stays until it is closed', async () => {
    const { useCalendarStore, useToastStore, ToastContainer, COULD_NOT_SAVE } = await freshStore()
    refuseWrites()

    useCalendarStore.getState().addActivity('Run')
    act(() => void vi.advanceTimersByTime(10))
    render(<ToastContainer />)

    expect(COULD_NOT_SAVE).toBe(
      'Daylo could not save your last changes. Open Settings and export a backup so nothing is lost.'
    )
    expect(screen.getByText(COULD_NOT_SAVE)).toBeInTheDocument()

    act(() => void vi.advanceTimersByTime(3_000))
    expect(screen.getByText(COULD_NOT_SAVE)).toBeInTheDocument()
    act(() => void vi.advanceTimersByTime(27_000))
    expect(screen.getByText(COULD_NOT_SAVE)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss notification' }))
    act(() => void vi.advanceTimersByTime(300))
    expect(screen.queryByText(COULD_NOT_SAVE)).not.toBeInTheDocument()
    expect(useToastStore.getState().toasts).toEqual([])
  })

  // Every tap is a write. A notice per tap would bury the screen under copies of itself.
  it('says it once while the writes keep failing, even after it is closed', async () => {
    const { useCalendarStore, useToastStore } = await freshStore()
    refuseWrites()

    useCalendarStore.getState().addActivity('Run')
    vi.advanceTimersByTime(10)
    useToastStore.getState().removeToast(useToastStore.getState().toasts[0].id)
    useCalendarStore.getState().addActivity('Swim')
    vi.advanceTimersByTime(10)

    expect(useToastStore.getState().toasts).toEqual([])
  })

  // A write that went through is the disk working again. If it stops after that, that is
  // new, and the person has to hear about it again.
  it('says it again when the disk fails again after a write went through', async () => {
    const { useCalendarStore, useToastStore, COULD_NOT_SAVE } = await freshStore()
    const said = () =>
      useToastStore.getState().toasts.filter((t) => t.message === COULD_NOT_SAVE).length

    refuseWrites()
    useCalendarStore.getState().addActivity('Run')
    vi.advanceTimersByTime(10)
    expect(said()).toBe(1)
    useToastStore.getState().removeToast(useToastStore.getState().toasts[0].id)

    acceptWrites()
    useCalendarStore.getState().addActivity('Swim')
    vi.advanceTimersByTime(10)

    setItem = vi.spyOn(Storage.prototype, 'setItem')
    refuseWrites()
    useCalendarStore.getState().addActivity('Walk')
    vi.advanceTimersByTime(10)
    expect(said()).toBe(1)
  })

  // The disk works again, so the notice is no longer true. Left up, it would ask for a
  // backup that is no longer needed, and the next real failure would look like the old one.
  it('goes away by itself once a later write goes through', async () => {
    const { useCalendarStore, useToastStore, COULD_NOT_SAVE } = await freshStore()

    refuseWrites()
    useCalendarStore.getState().addActivity('Run')
    vi.advanceTimersByTime(10)
    expect(useToastStore.getState().toasts.map((t) => t.message)).toEqual([COULD_NOT_SAVE])

    acceptWrites()
    useCalendarStore.getState().addActivity('Swim')
    vi.advanceTimersByTime(10)

    expect(useToastStore.getState().toasts).toEqual([])
  })

  // Closing it is not the same as the problem going away. Once per tap would bury the
  // screen; never again would leave somebody losing changes for the rest of the day
  // because they closed one notice in the morning.
  it('says it again five minutes later if it was closed and the writes still fail', async () => {
    const { useCalendarStore, useToastStore, COULD_NOT_SAVE } = await freshStore()
    const said = () =>
      useToastStore.getState().toasts.filter((t) => t.message === COULD_NOT_SAVE).length

    refuseWrites()
    useCalendarStore.getState().addActivity('Run')
    vi.advanceTimersByTime(10)
    useToastStore.getState().removeToast(useToastStore.getState().toasts[0].id)

    vi.advanceTimersByTime(4 * 60_000 + 59_000)
    useCalendarStore.getState().addActivity('Swim')
    vi.advanceTimersByTime(10)
    expect(said()).toBe(0)

    vi.advanceTimersByTime(1_000)
    useCalendarStore.getState().addActivity('Walk')
    vi.advanceTimersByTime(10)
    expect(said()).toBe(1)
  })

  it('does not stack a second copy over one still on the screen', async () => {
    const { useCalendarStore, useToastStore, COULD_NOT_SAVE } = await freshStore()

    refuseWrites()
    useCalendarStore.getState().addActivity('Run')
    vi.advanceTimersByTime(10)

    acceptWrites()
    useCalendarStore.getState().addActivity('Swim')
    vi.advanceTimersByTime(10)

    setItem = vi.spyOn(Storage.prototype, 'setItem')
    refuseWrites()
    useCalendarStore.getState().addActivity('Walk')
    vi.advanceTimersByTime(10)

    expect(useToastStore.getState().toasts.map((t) => t.message)).toEqual([COULD_NOT_SAVE])
  })

  it('still lets an ordinary notice go after 3 seconds', async () => {
    const { useToastStore } = await freshStore()

    useToastStore.getState().addToast('Saved', 'success')
    vi.advanceTimersByTime(3_000)

    expect(useToastStore.getState().toasts).toEqual([])
  })
})
