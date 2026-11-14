import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useToday, useTodayDate, PENDING_GIVES_WAY_AFTER } from './today'

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

/** A finger, or a button, by pointer. */
const pointer = (type: string, id = 1) => Object.assign(new Event(type), { pointerId: id })

/** A tap: down and up again. */
function touch() {
  window.dispatchEvent(pointer('pointerdown'))
  window.dispatchEvent(pointer('pointerup'))
}

/**
 * A text field, by default inside what the new day builds again (App marks that with
 * DayScope), holding what it opened with.
 */
function aField({ opened = '', inTheDay = true } = {}): HTMLInputElement {
  const field = document.createElement('input')
  field.type = 'text'
  field.value = opened
  const where = document.createElement('div')
  if (inTheDay) where.setAttribute('data-day-scope', '')
  where.appendChild(field)
  document.body.appendChild(where)
  return field
}

/**
 * Somebody puts the cursor in a field, writes, and leaves the focus somewhere else. The
 * page announces the moved cursor a moment later (jsdom's selectionchange, on a timer of
 * its own), and that moment is let pass so the tests that count timers count only ours.
 */
function write(field: HTMLInputElement, words: string) {
  field.focus()
  field.value = words
  field.blur()
  vi.advanceTimersByTime(0)
}

/** A field with words in it that nobody has saved, with the focus somewhere else. */
function writeInAField(words = 'Walk the dog'): HTMLInputElement {
  const field = aField()
  write(field, words)
  return field
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

    // Reading down a long sheet with the wheel or the trackpad, or a finger moving across
    // it, is using it as much as a tap is. A scroll does not bubble, so only somebody
    // listening on the way down hears one inside a sheet.
    it.each([
      [
        'the wheel',
        (inside: Element) => inside.dispatchEvent(new Event('wheel', { bubbles: true })),
      ],
      ['a scroll inside a sheet', (inside: Element) => inside.dispatchEvent(new Event('scroll'))],
      [
        'a finger moving',
        (inside: Element) => inside.dispatchEvent(new Event('touchmove', { bubbles: true })),
      ],
      [
        'a field changing',
        (inside: Element) => inside.dispatchEvent(new Event('input', { bubbles: true })),
      ],
    ])('counts %s as somebody still using a dialog', (_, gesture) => {
      vi.setSystemTime(at(13, 23, 59, 0))
      const { result } = renderHook(() => useToday())
      openADialog()
      const inside = document.createElement('div')
      document.querySelector('[role="dialog"]')!.appendChild(inside)

      act(() => {
        vi.advanceTimersByTime(50_000)
        gesture(inside)
        vi.advanceTimersByTime(15_000)
      })

      expect(result.current).toBe('2026-11-13')
    })

    // The landing ends by telling the store which view it reached: a day that came in
    // halfway would have its Month written over.
    it('waits while the views are on their way from one to the other', () => {
      vi.setSystemTime(at(13, 23, 59, 59))
      const { result } = renderHook(() => useToday())
      const rail = document.createElement('div')
      rail.setAttribute('data-between-views', '')
      document.body.appendChild(rail)

      act(() => {
        touch()
        vi.advanceTimersByTime(3_000)
      })
      expect(result.current).toBe('2026-11-13')

      act(() => {
        rail.removeAttribute('data-between-views')
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

  // Words somebody wrote and has not saved go with the form if the day comes in, so they
  // hold the day for as long as they are there: not a minute, not until the window comes
  // back, until they are saved or rubbed out.
  describe('with words written and not saved', () => {
    it('keeps the old day however long nobody touches anything', () => {
      vi.setSystemTime(at(13, 23, 59, 50))
      const { result } = renderHook(() => useToday())
      writeInAField()

      act(() => {
        vi.advanceTimersByTime(10 * 60 * 1000)
      })

      expect(result.current).toBe('2026-11-13')
    })

    it('keeps the old day when the window comes back', () => {
      vi.setSystemTime(at(13, 21, 0))
      const { result } = renderHook(() => useToday())
      writeInAField()

      // Gone to look at something else, or back from the system's colour picker.
      vi.setSystemTime(at(14, 8, 30))
      act(() => {
        window.dispatchEvent(new Event('focus'))
        becomeVisible()
        window.dispatchEvent(new Event('pageshow'))
      })

      expect(result.current).toBe('2026-11-13')
    })

    it('lets the day in once the words are gone', () => {
      vi.setSystemTime(at(13, 23, 59, 50))
      const { result } = renderHook(() => useToday())
      const field = writeInAField()
      act(() => {
        vi.advanceTimersByTime(10 * 60 * 1000)
      })
      expect(result.current).toBe('2026-11-13')

      // Saved: the form closes and takes its field with it.
      act(() => {
        field.remove()
        vi.advanceTimersByTime(5_000)
      })

      expect(result.current).toBe('2026-11-14')
    })

    it('lets the day in once the field is emptied', () => {
      vi.setSystemTime(at(13, 21, 0))
      const { result } = renderHook(() => useToday())
      const field = writeInAField()
      vi.setSystemTime(at(14, 8, 30))
      act(() => {
        window.dispatchEvent(new Event('focus'))
      })
      expect(result.current).toBe('2026-11-13')

      act(() => {
        field.value = '  '
        vi.advanceTimersByTime(5_000)
      })

      expect(result.current).toBe('2026-11-14')
    })

    // "Edit activity" opens with the name in it. Left open, a name nobody touched used to
    // hold the day for ever: the very thing this was written to stop.
    it('lets the day in past a field that holds only what it opened with', () => {
      vi.setSystemTime(at(13, 21, 0))
      const { result } = renderHook(() => useToday())
      write(aField({ opened: 'Read' }), 'Read')
      vi.setSystemTime(at(14, 8, 30))

      act(() => {
        window.dispatchEvent(new Event('focus'))
      })

      expect(result.current).toBe('2026-11-14')
    })

    it('waits for a field whose words were changed from what it opened with', () => {
      vi.setSystemTime(at(13, 21, 0))
      const { result } = renderHook(() => useToday())
      write(aField({ opened: 'Read' }), 'Read a chapter')
      vi.setSystemTime(at(14, 8, 30))

      act(() => {
        window.dispatchEvent(new Event('focus'))
      })

      expect(result.current).toBe('2026-11-13')
    })

    it('lets the day in once a field is put back to what it opened with', () => {
      vi.setSystemTime(at(13, 21, 0))
      const { result } = renderHook(() => useToday())
      const field = aField({ opened: 'Read' })
      write(field, '')
      vi.setSystemTime(at(14, 8, 30))
      act(() => {
        window.dispatchEvent(new Event('focus'))
      })
      expect(result.current).toBe('2026-11-13')

      act(() => {
        write(field, 'Read')
        vi.advanceTimersByTime(5_000)
      })

      expect(result.current).toBe('2026-11-14')
    })

    // The comment under the rating question lives in App, which a new day does not build
    // again: its words stay where they are, and there is nothing for the day to wait on.
    it('does not wait for words in a field the new day leaves alone', () => {
      vi.setSystemTime(at(13, 21, 0))
      const { result } = renderHook(() => useToday())
      write(aField({ inTheDay: false }), 'Love it')
      vi.setSystemTime(at(14, 8, 30))

      act(() => {
        window.dispatchEvent(new Event('focus'))
      })

      expect(result.current).toBe('2026-11-14')
    })

    // To write in a field it has to have the focus first.
    it('does not count a field that never had the focus', () => {
      vi.setSystemTime(at(13, 21, 0))
      const { result } = renderHook(() => useToday())
      aField({ opened: 'Read' }).value = 'Something else'
      vi.setSystemTime(at(14, 8, 30))

      act(() => {
        window.dispatchEvent(new Event('focus'))
      })

      expect(result.current).toBe('2026-11-14')
    })
  })

  // A laptop suspended with the window in front: WebKitGTK sends neither focus nor
  // visibilitychange on waking, and the midnight timeout, paused with the machine, goes off
  // hours late. Here the clock jumps and no timer is due.
  it('reads the clock every half a minute, whatever the midnight timer is doing', () => {
    const { result } = renderHook(() => useToday())

    vi.setSystemTime(at(14, 8, 30))
    act(() => {
      vi.advanceTimersByTime(30_000)
    })

    expect(result.current).toBe('2026-11-14')
  })

  it('does not stay waiting for ever when the clock goes back while it waits', () => {
    vi.setSystemTime(at(13, 23, 59, 50))
    const { result } = renderHook(() => useToday())
    const close = openADialog()
    act(() => {
      vi.advanceTimersByTime(5_000)
      touch()
      vi.advanceTimersByTime(10_000)
    })
    expect(result.current).toBe('2026-11-13')

    // Back to yesterday evening while the day was waiting, so there is nothing to wait for.
    act(() => {
      vi.setSystemTime(at(13, 23, 0))
      vi.advanceTimersByTime(5_000)
    })
    act(() => close())

    // And then the day really does change. It must still come in.
    act(() => {
      vi.setSystemTime(at(14, 0, 0, 5))
      vi.advanceTimersByTime(30_000)
    })

    expect(result.current).toBe('2026-11-14')
  })

  describe('with a finger on the screen', () => {
    it('waits while it is down, and lets the day in when it lifts', () => {
      vi.setSystemTime(at(13, 23, 59, 50))
      const { result } = renderHook(() => useToday())

      // Halfway through swiping from Month to Year when midnight comes.
      act(() => {
        vi.advanceTimersByTime(5_000)
        window.dispatchEvent(pointer('pointerdown'))
        vi.advanceTimersByTime(10_000)
      })
      expect(result.current).toBe('2026-11-13')

      act(() => {
        window.dispatchEvent(pointer('pointerup'))
        vi.advanceTimersByTime(5_000)
      })
      expect(result.current).toBe('2026-11-14')
    })

    it('lets the day in when the gesture is taken over by the browser', () => {
      vi.setSystemTime(at(13, 23, 59, 50))
      const { result } = renderHook(() => useToday())
      act(() => {
        vi.advanceTimersByTime(5_000)
        window.dispatchEvent(pointer('pointerdown', 7))
        vi.advanceTimersByTime(10_000)
      })
      expect(result.current).toBe('2026-11-13')

      act(() => {
        window.dispatchEvent(pointer('pointercancel', 7))
        vi.advanceTimersByTime(5_000)
      })
      expect(result.current).toBe('2026-11-14')
    })
  })

  // A finger that went down here and came up in another window never says so here. The
  // window coming back is what says it is no longer down.
  it('forgets a finger that was lifted somewhere else', () => {
    vi.setSystemTime(at(13, 23, 59, 50))
    const { result } = renderHook(() => useToday())
    act(() => {
      vi.advanceTimersByTime(5_000)
      window.dispatchEvent(pointer('pointerdown'))
      vi.advanceTimersByTime(1_000)
      window.dispatchEvent(new Event('focus'))
      vi.advanceTimersByTime(6_000)
    })

    expect(result.current).toBe('2026-11-14')
  })

  it('leaves no timer behind after waiting on words through several returns', () => {
    vi.setSystemTime(at(13, 21, 0))
    const { unmount } = renderHook(() => useToday())
    writeInAField()
    vi.setSystemTime(at(14, 8, 30))
    act(() => {
      window.dispatchEvent(new Event('focus'))
      window.dispatchEvent(new Event('focus'))
      window.dispatchEvent(new Event('pageshow'))
    })

    unmount()

    expect(vi.getTimerCount()).toBe(0)
  })

  it('gives the same day as a date, and keeps it while the new day waits', () => {
    vi.setSystemTime(at(13, 23, 59, 50))
    const { result } = renderHook(() => useTodayDate())
    expect(result.current).toEqual(new Date(2026, 10, 13))
    writeInAField()

    act(() => {
      vi.advanceTimersByTime(60_000)
    })

    expect(result.current).toEqual(new Date(2026, 10, 13))
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
