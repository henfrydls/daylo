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
 * A tap is not a drag.
 *
 * Everything inside this sheet is something you tap, and it used to begin a drag on any
 * touch at all. The backdrop's blur is cut while dragging, with no transition, so it
 * blinked off under each press and back on when the finger left: Henfry filmed six of
 * those in four seconds on the Activities sheet, including the pencil.
 */
describe('telling a tap from a drag', () => {
  const pressed = vi.fn()
  const show = () =>
    render(
      <BottomSheet isOpen onClose={vi.fn()} aria-label="Activities">
        <button onClick={pressed}>Edit</button>
      </BottomSheet>
    )
  const backdrop = () => screen.getByTestId('bottom-sheet-backdrop')
  const sheet = () => screen.getByTestId('bottom-sheet')
  // Where a drag to close is taken from by pointer. The list has its own, further down.
  const handle = () => screen.getByTestId('bottom-sheet-handle')
  const settle = () =>
    act(() => {
      vi.advanceTimersByTime(60)
    })

  beforeEach(() => {
    vi.useFakeTimers()
    pressed.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('leaves the backdrop alone for a press that goes nowhere', () => {
    show()
    settle()
    const before = backdrop().style.backdropFilter

    fireEvent.pointerDown(handle(), { pointerId: 1, clientX: 100, clientY: 300 })
    fireEvent.pointerMove(handle(), { pointerId: 1, clientX: 100, clientY: 302 })

    expect(backdrop().style.backdropFilter).toBe(before)
  })

  it('still lets the press reach the button under the finger', () => {
    show()
    settle()

    fireEvent.pointerDown(screen.getByText('Edit'), { pointerId: 1, clientX: 100, clientY: 300 })
    fireEvent.pointerUp(screen.getByText('Edit'), { pointerId: 1, clientX: 100, clientY: 300 })
    fireEvent.click(screen.getByText('Edit'))

    expect(pressed).toHaveBeenCalledOnce()
  })

  it('starts dragging once the finger has gone down far enough', () => {
    show()
    settle()

    fireEvent.pointerDown(handle(), { pointerId: 1, clientX: 100, clientY: 300 })
    fireEvent.pointerMove(handle(), { pointerId: 1, clientX: 100, clientY: 340 })

    // The sheet follows: it has left its resting place, which only a drag does.
    expect(sheet().style.transform).toBe('translateY(40px)')
  })

  // A finger crossing the sheet sideways is going somewhere else. Without this, a drag
  // that is mostly across takes the sheet down with it.
  it('ignores a finger that is going more across than down', () => {
    show()
    settle()

    fireEvent.pointerDown(handle(), { pointerId: 1, clientX: 100, clientY: 300 })
    fireEvent.pointerMove(handle(), { pointerId: 1, clientX: 220, clientY: 320 })

    expect(sheet().style.transform).toBe('translateY(0px)')
  })

  it('will not be dragged upwards', () => {
    show()
    settle()

    fireEvent.pointerDown(handle(), { pointerId: 1, clientX: 100, clientY: 300 })
    fireEvent.pointerMove(handle(), { pointerId: 1, clientX: 100, clientY: 240 })

    expect(sheet().style.transform).toBe('translateY(0px)')
  })

  // Faded with the drag rather than switched off by it: cutting it meant the blur and the
  // dimming disagreed the whole way down, one gone at once and the other easing away.
  it('fades the blur as the sheet goes down', () => {
    show()
    settle()
    const atRest = backdrop().style.backdropFilter

    fireEvent.pointerDown(handle(), { pointerId: 1, clientX: 100, clientY: 300 })
    fireEvent.pointerMove(handle(), { pointerId: 1, clientX: 100, clientY: 340 })
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

    fireEvent.pointerDown(handle(), { pointerId: 7, clientX: 100, clientY: 300 })

    expect(capture).toHaveBeenCalledWith(7)
  })

  it('ignores a second finger while the first is dragging', () => {
    show()
    settle()

    fireEvent.pointerDown(handle(), { pointerId: 1, clientX: 100, clientY: 300 })
    fireEvent.pointerMove(handle(), { pointerId: 1, clientX: 100, clientY: 340 })
    fireEvent.pointerMove(handle(), { pointerId: 2, clientX: 100, clientY: 600 })

    expect(sheet().style.transform).toBe('translateY(40px)')
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
  const at = (y: number, x = 100) => ({ touches: [{ clientX: x, clientY: y }] })
  const settle = () =>
    act(() => {
      vi.advanceTimersByTime(60)
    })

  beforeEach(() => {
    vi.useFakeTimers()
    onClose.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('takes the sheet down from the top, and keeps the browser out of it', () => {
    show()
    settle()

    fireEvent.touchStart(list(), at(300))
    const first = fireEvent.touchMove(list(), at(303))
    fireEvent.touchMove(list(), at(340))

    expect(first).toBe(false)
    expect(sheet().style.transform).toBe('translateY(40px)')
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
    fireEvent.touchEnd(list(), { touches: [] })

    fireEvent.touchStart(list(), at(300))
    fireEvent.touchMove(list(), at(303))
    fireEvent.touchMove(list(), at(340))
    expect(sheet().style.transform).toBe('translateY(40px)')
  })

  it('ignores a finger going more across than down', () => {
    show()
    settle()

    fireEvent.touchStart(list(), at(300, 100))
    fireEvent.touchMove(list(), at(320, 220))

    expect(sheet().style.transform).toBe('translateY(0px)')
  })

  it('goes back up when let go short of the distance that closes it', () => {
    show()
    settle()

    fireEvent.touchStart(list(), at(300))
    fireEvent.touchMove(list(), at(320))
    fireEvent.touchEnd(list(), { touches: [] })

    expect(onClose).not.toHaveBeenCalled()
    expect(sheet().style.transform).toBe('translateY(0px)')
  })
})
