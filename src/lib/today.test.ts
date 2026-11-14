import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useToday, PENDING_GIVES_WAY_AFTER } from './today'

/**
 * The day the app believes it is, and the three ways it learns otherwise.
 *
 * Somebody ticks their habit in the evening and leaves Daylo open. In the morning the
 * window comes back, or the phone brings the app to the front, or on a desktop left in
 * front of somebody the clock simply passes midnight. Before this, nothing read the date
 * again, and yesterday went on being drawn as today.
 */

/** A local time, written the way a person says it. */
const at = (day: number, hour: number, minute: number, second = 0) =>
  new Date(2026, 10, day, hour, minute, second)

function becomeVisible() {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
  document.dispatchEvent(new Event('visibilitychange'))
}

function becomeHidden() {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
  document.dispatchEvent(new Event('visibilitychange'))
}

/** A dialog on the page, the way every sheet and modal in Daylo marks itself. */
function openADialog(): () => void {
  const dialog = document.createElement('div')
  dialog.setAttribute('role', 'dialog')
  dialog.setAttribute('aria-modal', 'true')
  document.body.appendChild(dialog)
  return () => dialog.remove()
}

function touch() {
  window.dispatchEvent(new Event('pointerdown'))
}

describe('useToday', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(at(13, 21, 0))
  })

  afterEach(() => {
    vi.useRealTimers()
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
    document.body.innerHTML = ''
  })

  it('says what day it is', () => {
    const { result } = renderHook(() => useToday())
    expect(result.current).toBe('2026-11-13')
  })

  it('learns the day changed when the window comes back', () => {
    const { result } = renderHook(() => useToday())

    vi.setSystemTime(at(14, 8, 30))
    // The clock alone is not enough: something has to say time passed.
    expect(result.current).toBe('2026-11-13')

    act(() => becomeVisible())
    expect(result.current).toBe('2026-11-14')
  })

  it('learns it from the window taking the focus', () => {
    const { result } = renderHook(() => useToday())

    vi.setSystemTime(at(14, 8, 30))
    act(() => {
      window.dispatchEvent(new Event('focus'))
    })

    expect(result.current).toBe('2026-11-14')
  })

  it('learns it from the page being shown again', () => {
    const { result } = renderHook(() => useToday())

    vi.setSystemTime(at(14, 8, 30))
    act(() => {
      window.dispatchEvent(new Event('pageshow'))
    })

    expect(result.current).toBe('2026-11-14')
  })

  it('learns it at midnight with nothing else happening', () => {
    vi.setSystemTime(at(13, 23, 59, 50))
    const { result } = renderHook(() => useToday())

    act(() => {
      vi.advanceTimersByTime(15_000)
    })

    expect(result.current).toBe('2026-11-14')
  })

  it('learns it again the night after, without being told twice', () => {
    vi.setSystemTime(at(13, 23, 59, 50))
    const { result } = renderHook(() => useToday())

    act(() => {
      vi.advanceTimersByTime(15_000)
    })
    act(() => {
      vi.advanceTimersByTime(24 * 60 * 60 * 1000)
    })

    expect(result.current).toBe('2026-11-15')
  })

  it('does not count going to the background as a new day', () => {
    const { result } = renderHook(() => useToday())

    vi.setSystemTime(at(14, 8, 30))
    act(() => becomeHidden())

    expect(result.current).toBe('2026-11-13')
  })

  it('stays the same day when the window comes back on the same day', () => {
    let renders = 0
    const { result } = renderHook(() => {
      renders += 1
      return useToday()
    })
    const before = renders

    vi.setSystemTime(at(13, 22, 0))
    act(() => {
      window.dispatchEvent(new Event('focus'))
      becomeVisible()
    })

    expect(result.current).toBe('2026-11-13')
    expect(renders).toBe(before)
  })

  describe('at midnight, with somebody in the middle of something', () => {
    it('waits while a dialog is open and somebody is still using it', () => {
      vi.setSystemTime(at(13, 23, 59, 50))
      const { result } = renderHook(() => useToday())
      const close = openADialog()

      act(() => {
        vi.advanceTimersByTime(5_000)
        touch()
        vi.advanceTimersByTime(10_000)
      })
      expect(result.current).toBe('2026-11-13')

      // Closing it is what lets the day through, within a few seconds.
      act(() => {
        close()
        vi.advanceTimersByTime(5_000)
      })
      expect(result.current).toBe('2026-11-14')
    })

    it('waits while somebody is typing in a field', () => {
      vi.setSystemTime(at(13, 23, 59, 50))
      const { result } = renderHook(() => useToday())
      const field = document.createElement('input')
      document.body.appendChild(field)
      field.focus()

      act(() => {
        vi.advanceTimersByTime(5_000)
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }))
        vi.advanceTimersByTime(10_000)
      })
      expect(result.current).toBe('2026-11-13')

      act(() => {
        field.blur()
        vi.advanceTimersByTime(5_000)
      })
      expect(result.current).toBe('2026-11-14')
    })

    it('does not wait for a dialog nobody has touched in a minute', () => {
      vi.setSystemTime(at(13, 23, 59, 50))
      const { result } = renderHook(() => useToday())
      openADialog()
      act(() => {
        vi.advanceTimersByTime(5_000)
        touch()
      })

      // Still within the minute after the last touch.
      act(() => {
        vi.advanceTimersByTime(PENDING_GIVES_WAY_AFTER - 10_000)
      })
      expect(result.current).toBe('2026-11-13')

      // A window left with a sheet open all night still wakes up in today.
      act(() => {
        vi.advanceTimersByTime(15_000)
      })
      expect(result.current).toBe('2026-11-14')
    })

    it('does not wait for an open dialog when nobody touched anything recently', () => {
      vi.setSystemTime(at(13, 23, 50, 0))
      const { result } = renderHook(() => useToday())
      act(() => touch())
      openADialog()

      act(() => {
        vi.advanceTimersByTime(10 * 60 * 1000 + 5_000)
      })

      expect(result.current).toBe('2026-11-14')
    })

    it('does not wait for a recent touch when nothing is open', () => {
      vi.setSystemTime(at(13, 23, 59, 50))
      const { result } = renderHook(() => useToday())

      act(() => {
        vi.advanceTimersByTime(5_000)
        touch()
        vi.advanceTimersByTime(10_000)
      })

      expect(result.current).toBe('2026-11-14')
    })

    it('does not take a touch from before the clock was moved back as a recent one', () => {
      vi.setSystemTime(at(14, 9, 0))
      const { result } = renderHook(() => useToday())
      act(() => touch())
      openADialog()
      // Somebody sets the clock back to just before midnight. Their last touch is now an
      // hour in the future, which is not a reason to hold the day for an hour.
      act(() => {
        vi.setSystemTime(at(13, 23, 59, 50))
        window.dispatchEvent(new Event('focus'))
      })
      expect(result.current).toBe('2026-11-13')

      act(() => {
        vi.advanceTimersByTime(15_000)
      })

      expect(result.current).toBe('2026-11-14')
    })

    it('lets the day through at once when the window comes back', () => {
      vi.setSystemTime(at(13, 23, 59, 50))
      const { result } = renderHook(() => useToday())
      openADialog()
      act(() => {
        vi.advanceTimersByTime(5_000)
        touch()
        vi.advanceTimersByTime(10_000)
      })
      expect(result.current).toBe('2026-11-13')

      act(() => {
        window.dispatchEvent(new Event('focus'))
      })

      expect(result.current).toBe('2026-11-14')
    })
  })

  it('leaves no listener and no timer behind', () => {
    const onWindow = vi.spyOn(window, 'addEventListener')
    const offWindow = vi.spyOn(window, 'removeEventListener')
    const onDocument = vi.spyOn(document, 'addEventListener')
    const offDocument = vi.spyOn(document, 'removeEventListener')
    vi.setSystemTime(at(13, 23, 59, 50))
    const { unmount } = renderHook(() => useToday())
    openADialog()
    act(() => {
      vi.advanceTimersByTime(5_000)
      touch()
      vi.advanceTimersByTime(10_000)
    })
    // Pending, so the look every few seconds is running as well as the midnight timer.
    expect(vi.getTimerCount()).toBeGreaterThan(0)

    unmount()

    expect(vi.getTimerCount()).toBe(0)
    const pairs = (on: typeof onWindow, off: typeof offWindow) =>
      on.mock.calls.map(([type, fn]) => off.mock.calls.some(([t, f]) => t === type && f === fn))
    expect(onWindow.mock.calls.length).toBeGreaterThan(0)
    expect(pairs(onWindow, offWindow).every(Boolean)).toBe(true)
    expect(pairs(onDocument, offDocument).every(Boolean)).toBe(true)
  })

  it('is one day for everybody who asks', () => {
    vi.setSystemTime(at(13, 23, 59, 50))
    const first = renderHook(() => useToday())
    const second = renderHook(() => useToday())

    act(() => {
      vi.advanceTimersByTime(15_000)
    })

    expect(first.result.current).toBe('2026-11-14')
    expect(second.result.current).toBe('2026-11-14')
  })
})
