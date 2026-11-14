import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { BottomSheet } from './BottomSheet'

describe('BottomSheet', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    children: <div>Sheet content</div>,
  }

  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should render children when open', () => {
    render(<BottomSheet {...defaultProps} />)
    expect(screen.getByText('Sheet content')).toBeInTheDocument()
  })

  it('should not render when closed', () => {
    render(<BottomSheet {...defaultProps} isOpen={false} />)
    expect(screen.queryByTestId('bottom-sheet')).not.toBeInTheDocument()
  })

  it('should have dialog role and aria-modal', () => {
    render(<BottomSheet {...defaultProps} />)
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
  })

  it('should call onClose when backdrop is clicked', () => {
    const onClose = vi.fn()
    render(<BottomSheet {...defaultProps} onClose={onClose} />)
    fireEvent.click(screen.getByTestId('bottom-sheet-backdrop'))
    expect(onClose).toHaveBeenCalled()
  })

  it('should not close when content is clicked', () => {
    const onClose = vi.fn()
    render(<BottomSheet {...defaultProps} onClose={onClose} />)
    fireEvent.click(screen.getByText('Sheet content'))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('should close on Escape key', () => {
    const onClose = vi.fn()
    render(<BottomSheet {...defaultProps} onClose={onClose} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('should render the handle bar', () => {
    render(<BottomSheet {...defaultProps} />)
    expect(screen.getByTestId('bottom-sheet')).toBeInTheDocument()
  })

  it('should use provided aria-label', () => {
    render(<BottomSheet {...defaultProps} aria-label="Activities panel" />)
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-label', 'Activities panel')
  })

  it('should unmount after animation duration when closed', () => {
    const { rerender } = render(<BottomSheet {...defaultProps} />)
    expect(screen.getByTestId('bottom-sheet')).toBeInTheDocument()

    rerender(<BottomSheet {...defaultProps} isOpen={false} />)

    // Still in DOM during animation
    expect(screen.getByTestId('bottom-sheet')).toBeInTheDocument()

    // After animation duration
    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(screen.queryByTestId('bottom-sheet')).not.toBeInTheDocument()
  })
})

/**
 * A sheet with a height, which jsdom does not give it.
 *
 * The sheet learns its height from a ResizeObserver, and the 30% that closes it is 30% of
 * that. jsdom has neither layout nor a real observer, so without this every release reads
 * as short of the distance, and "it did not close" would pass for any reason at all.
 */
function giveTheSheetAHeight(height: number, top = 0) {
  const RealObserver = globalThis.ResizeObserver
  globalThis.ResizeObserver = class {
    report: ResizeObserverCallback
    constructor(report: ResizeObserverCallback) {
      this.report = report
    }
    observe() {
      this.report([], this as unknown as ResizeObserver)
    }
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
  const rect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    height,
    top,
    bottom: top + height,
    left: 0,
    right: 360,
    width: 360,
  } as DOMRect)
  return () => {
    globalThis.ResizeObserver = RealObserver
    rect.mockRestore()
  }
}

/**
 * A tap is not a drag.
 *
 * Everything inside this sheet is something you tap, and it used to begin a drag on any
 * touch at all. The backdrop's blur is cut while dragging, with no transition, so it
 * blinked off under each press and back on when the finger left: Henfry filmed six of
 * those in four seconds on the Activities sheet, including the pencil.
 */
describe('telling a tap from a drag', () => {
  const pressed = vi.fn()
  const onClose = vi.fn()
  const show = () =>
    render(
      <BottomSheet isOpen onClose={onClose} aria-label="Activities">
        <button onClick={pressed}>Edit</button>
      </BottomSheet>
    )
  const backdrop = () => screen.getByTestId('bottom-sheet-backdrop')
  const sheet = () => screen.getByTestId('bottom-sheet')
  // Where a drag to close is taken from by pointer. The list has its own, further down.
  const handle = () => screen.getByTestId('bottom-sheet-handle')
  const at = (clientY: number, clientX = 100, pointerId = 1) => ({ pointerId, clientX, clientY })
  const settle = () =>
    act(() => {
      vi.advanceTimersByTime(60)
    })
  let restore = () => {}

  beforeEach(() => {
    vi.useFakeTimers()
    pressed.mockReset()
    onClose.mockReset()
  })

  afterEach(() => {
    restore()
    restore = () => {}
    vi.useRealTimers()
  })

  it('leaves the backdrop alone for a press that goes nowhere', () => {
    show()
    settle()
    const before = backdrop().style.backdropFilter

    fireEvent.pointerDown(handle(), at(300))
    fireEvent.pointerMove(handle(), at(302))

    expect(backdrop().style.backdropFilter).toBe(before)
  })

  it('still lets the press reach the button under the finger', () => {
    show()
    settle()

    fireEvent.pointerDown(screen.getByText('Edit'), at(300))
    fireEvent.pointerUp(screen.getByText('Edit'), at(300))
    fireEvent.click(screen.getByText('Edit'))

    expect(pressed).toHaveBeenCalledOnce()
  })

  it('starts dragging once the finger has gone down far enough', () => {
    show()
    settle()

    fireEvent.pointerDown(handle(), at(300))
    fireEvent.pointerMove(handle(), at(340))
    fireEvent.pointerMove(handle(), at(360))

    // The sheet follows: it has left its resting place, which only a drag does.
    expect(sheet().style.transform).toBe('translateY(20px)')
  })

  // The eight pixels spent deciding are not part of the drag. Counted in, the sheet
  // jumped by all of them the moment it began to move.
  it('follows the finger from where the drag began, without a jump', () => {
    show()
    settle()

    fireEvent.pointerDown(handle(), at(300))
    fireEvent.pointerMove(handle(), at(330))

    expect(sheet().style.transform).toBe('translateY(0px)')

    fireEvent.pointerMove(handle(), at(331))
    expect(sheet().style.transform).toBe('translateY(1px)')
  })

  // A finger crossing the sheet sideways is going somewhere else. Without this, a drag
  // that is mostly across takes the sheet down with it.
  it('ignores a finger that is going more across than down', () => {
    show()
    settle()

    fireEvent.pointerDown(handle(), at(300))
    fireEvent.pointerMove(handle(), at(320, 220))
    fireEvent.pointerMove(handle(), at(330, 340))

    expect(sheet().style.transform).toBe('translateY(0px)')
  })

  it('will not be dragged upwards', () => {
    show()
    settle()

    fireEvent.pointerDown(handle(), at(300))
    fireEvent.pointerMove(handle(), at(240))
    fireEvent.pointerMove(handle(), at(200))

    expect(sheet().style.transform).toBe('translateY(0px)')
  })

  // Faded with the drag rather than switched off by it: cutting it meant the blur and the
  // dimming disagreed the whole way down, one gone at once and the other easing away.
  it('fades the blur as the sheet goes down', () => {
    show()
    settle()
    const atRest = backdrop().style.backdropFilter

    fireEvent.pointerDown(handle(), at(300))
    fireEvent.pointerMove(handle(), at(310))
    fireEvent.pointerMove(handle(), at(350))
    const moving = backdrop().style.backdropFilter

    expect(moving).not.toBe(atRest)
    expect(moving).not.toBe('blur(0px)')
    expect(Number(/blur\(([\d.]+)px\)/.exec(moving)?.[1])).toBeLessThan(
      Number(/blur\(([\d.]+)px\)/.exec(atRest)?.[1])
    )
  })

  // Captured, so the release reaches the handle wherever it happens: a mouse let go above
  // the sheet used to leave it dragging, following a pointer with no button down.
  it('keeps hold of the pointer that went down on the handle', () => {
    show()
    settle()
    const capture = vi.fn()
    handle().setPointerCapture = capture

    fireEvent.pointerDown(handle(), at(300, 100, 7))

    expect(capture).toHaveBeenCalledWith(7)
  })

  it('ignores a second finger while the first is dragging', () => {
    show()
    settle()

    fireEvent.pointerDown(handle(), at(300))
    fireEvent.pointerMove(handle(), at(340))
    fireEvent.pointerMove(handle(), at(360))
    fireEvent.pointerMove(handle(), at(600, 100, 2))

    expect(sheet().style.transform).toBe('translateY(20px)')
  })

  // A right click opens a menu, and the menu can swallow the release. The handle was then
  // left believing a button was down, and the next move of the mouse dragged the sheet.
  it('takes no press from any button but the main one', () => {
    show()
    settle()

    fireEvent.pointerDown(handle(), { ...at(300), button: 2 })
    fireEvent.pointerMove(handle(), at(340))
    fireEvent.pointerMove(handle(), at(380))

    expect(sheet().style.transform).toBe('translateY(0px)')
  })

  it('forgets the press when it loses the pointer', () => {
    show()
    settle()

    fireEvent.pointerDown(handle(), at(300))
    fireEvent.lostPointerCapture(handle(), at(300))
    fireEvent.pointerMove(handle(), at(340))
    fireEvent.pointerMove(handle(), at(380))

    expect(sheet().style.transform).toBe('translateY(0px)')
  })

  // A cancel is the system taking the finger: the notification shade, a call, another
  // app. Read as a release, a sheet pulled past 30% closed on its own when the phone rang.
  it('goes back up without closing when the system takes the pointer', () => {
    restore = giveTheSheetAHeight(500)
    show()
    settle()

    fireEvent.pointerDown(handle(), at(300))
    fireEvent.pointerMove(handle(), at(310))
    fireEvent.pointerMove(handle(), at(560))
    fireEvent.pointerCancel(handle(), at(560))

    expect(onClose).not.toHaveBeenCalled()
    expect(sheet().style.transform).toBe('translateY(0px)')
  })

  // The same pull, let go: so the test above is about the cancel, not about a sheet that
  // could not be closed at all.
  it('closes when let go past 30% of its height', () => {
    restore = giveTheSheetAHeight(500)
    show()
    settle()

    fireEvent.pointerDown(handle(), at(300))
    fireEvent.pointerMove(handle(), at(310))
    fireEvent.pointerMove(handle(), at(560))
    fireEvent.pointerUp(handle(), at(560))

    expect(onClose).toHaveBeenCalledOnce()
  })

  // The strip above the edge is outside the sheet to the eye, so a tap there closes it as
  // a tap outside does. On the grey bar itself a tap does nothing, as it always has.
  it('closes for a tap in the strip above the edge, and not for one on the bar', () => {
    restore = giveTheSheetAHeight(500, 200)
    show()
    settle()

    fireEvent.pointerDown(handle(), at(210))
    fireEvent.pointerUp(handle(), at(210))
    expect(onClose).not.toHaveBeenCalled()

    fireEvent.pointerDown(handle(), at(190))
    fireEvent.pointerUp(handle(), at(191))
    expect(onClose).toHaveBeenCalledOnce()
  })
})

/**
 * Pulling the list down from the top closes the sheet, as the handle does.
 *
 * The list scrolls, and with one to three activities there is nothing to scroll: a pull
 * down on it did nothing, and only the handle and a tap outside closed the sheet. So the
 * list keeps that one gesture from the browser, at the top and going down, and everything
 * else stays the browser's scroll. `fireEvent` returns false when a listener called
 * `preventDefault`, which is how these see whether the browser was told to keep out.
 */
describe('a drag from the list', () => {
  const onClose = vi.fn()
  const show = () =>
    render(
      <BottomSheet isOpen onClose={onClose} aria-label="Activities">
        <button>Edit</button>
      </BottomSheet>
    )
  const sheet = () => screen.getByTestId('bottom-sheet')
  const list = () => screen.getByTestId('bottom-sheet-list')
  const touch = (clientY: number, clientX = 100, identifier = 1) => ({
    identifier,
    clientX,
    clientY,
  })
  /** One finger, the one these tests follow unless they say otherwise. */
  const at = (clientY: number, clientX = 100) => {
    const t = touch(clientY, clientX)
    return { touches: [t], changedTouches: [t] }
  }
  const lift = (clientY = 0, identifier = 1) => ({
    touches: [],
    changedTouches: [touch(clientY, 100, identifier)],
  })
  const settle = () =>
    act(() => {
      vi.advanceTimersByTime(60)
    })
  let restore = () => {}

  beforeEach(() => {
    vi.useFakeTimers()
    onClose.mockReset()
  })

  afterEach(() => {
    restore()
    restore = () => {}
    vi.useRealTimers()
  })

  it('takes the sheet down from the top, and keeps the browser out of it', () => {
    show()
    settle()

    fireEvent.touchStart(list(), at(300))
    const first = fireEvent.touchMove(list(), at(303))
    fireEvent.touchMove(list(), at(340))
    fireEvent.touchMove(list(), at(360))

    expect(first).toBe(false)
    // From where the drag was recognised, at 340: no jump by the pixels spent deciding.
    expect(sheet().style.transform).toBe('translateY(20px)')
  })

  it('leaves a list that is scrolled to the browser', () => {
    show()
    settle()
    list().scrollTop = 120

    fireEvent.touchStart(list(), at(300))
    const moved = fireEvent.touchMove(list(), at(340))

    expect(moved).toBe(true)
    expect(sheet().style.transform).toBe('translateY(0px)')
  })

  it('leaves a finger going up to the browser', () => {
    show()
    settle()

    fireEvent.touchStart(list(), at(300))
    const moved = fireEvent.touchMove(list(), at(260))

    expect(moved).toBe(true)
    expect(sheet().style.transform).toBe('translateY(0px)')
  })

  // A gesture that went up first is a scroll for the rest of its life.
  it('does not take the sheet when the finger went up before coming down', () => {
    show()
    settle()

    fireEvent.touchStart(list(), at(300))
    fireEvent.touchMove(list(), at(280))
    const back = fireEvent.touchMove(list(), at(360))

    expect(back).toBe(true)
    expect(sheet().style.transform).toBe('translateY(0px)')
  })

  // A thumb that trembles two pixels down before going up to scroll. The tremble is held
  // back, since it leans down, but what follows is the browser's: measured in Chromium,
  // the next move that is not held back starts the scroll.
  it('hands a finger back to the browser once it turns upwards', () => {
    show()
    settle()

    fireEvent.touchStart(list(), at(300))
    fireEvent.touchMove(list(), at(302))
    const up = fireEvent.touchMove(list(), at(290))
    const further = fireEvent.touchMove(list(), at(250))

    expect([up, further]).toEqual([true, true])
    expect(sheet().style.transform).toBe('translateY(0px)')
  })

  // Scrolling back up and reaching the top under the finger is still scrolling. The sheet
  // setting off down the screen at that moment would be a surprise; the next pull closes.
  it('does not take the sheet when the list reaches the top in the middle of a scroll', () => {
    show()
    settle()
    list().scrollTop = 40

    fireEvent.touchStart(list(), at(300))
    list().scrollTop = 0
    fireEvent.touchMove(list(), at(380))
    // Read with the finger still down: letting go puts any sheet back at rest.
    expect(sheet().style.transform).toBe('translateY(0px)')
    fireEvent.touchEnd(list(), lift(380))

    fireEvent.touchStart(list(), at(300))
    fireEvent.touchMove(list(), at(303))
    fireEvent.touchMove(list(), at(340))
    fireEvent.touchMove(list(), at(380))
    expect(sheet().style.transform).toBe('translateY(40px)')
  })

  // Not held back either: going across is not this sheet's gesture, and keeping it from
  // the browser on the way to finding that out was keeping something that was not ours.
  it('ignores a finger going more across than down, and leaves it to the browser', () => {
    show()
    settle()

    fireEvent.touchStart(list(), at(300, 100))
    const across = fireEvent.touchMove(list(), at(320, 220))

    expect(across).toBe(true)
    expect(sheet().style.transform).toBe('translateY(0px)')
  })

  it('does not hold back a small move that leans across', () => {
    show()
    settle()

    fireEvent.touchStart(list(), at(300, 100))
    const small = fireEvent.touchMove(list(), at(302, 105))

    expect(small).toBe(true)
  })

  it('goes back up when let go short of the distance that closes it', () => {
    show()
    settle()

    fireEvent.touchStart(list(), at(300))
    fireEvent.touchMove(list(), at(310))
    fireEvent.touchMove(list(), at(330))
    fireEvent.touchEnd(list(), lift(330))

    expect(onClose).not.toHaveBeenCalled()
    expect(sheet().style.transform).toBe('translateY(0px)')
  })

  it('closes when let go past 30% of its height', () => {
    restore = giveTheSheetAHeight(500)
    show()
    settle()

    fireEvent.touchStart(list(), at(300))
    fireEvent.touchMove(list(), at(310))
    fireEvent.touchMove(list(), at(560))
    fireEvent.touchEnd(list(), lift(560))

    expect(onClose).toHaveBeenCalledOnce()
  })

  // The system taking the finger, not the person letting go: back up, never closed.
  it('goes back up without closing when the system cancels the touch', () => {
    restore = giveTheSheetAHeight(500)
    show()
    settle()

    fireEvent.touchStart(list(), at(300))
    fireEvent.touchMove(list(), at(310))
    fireEvent.touchMove(list(), at(560))
    fireEvent.touchCancel(list(), lift(560))

    expect(onClose).not.toHaveBeenCalled()
    expect(sheet().style.transform).toBe('translateY(0px)')
  })

  // A second finger on the list used to end the drag, and past 30% that closed the sheet.
  // It follows the finger that began it, as the handle does.
  it('follows the finger that began the drag and ignores a second one', () => {
    restore = giveTheSheetAHeight(500)
    show()
    settle()
    const first = touch(300)

    fireEvent.touchStart(list(), at(300))
    fireEvent.touchMove(list(), at(310))
    fireEvent.touchMove(list(), at(500))
    const second = touch(400, 200, 2)
    fireEvent.touchStart(list(), { touches: [first, second], changedTouches: [second] })
    fireEvent.touchMove(list(), {
      touches: [touch(500), touch(700, 200, 2)],
      changedTouches: [touch(700, 200, 2)],
    })
    fireEvent.touchEnd(list(), { touches: [touch(500)], changedTouches: [touch(700, 200, 2)] })

    expect(onClose).not.toHaveBeenCalled()
    expect(sheet().style.transform).toBe('translateY(190px)')

    fireEvent.touchMove(list(), at(520))
    expect(sheet().style.transform).toBe('translateY(210px)')
  })
})
