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

    fireEvent.pointerDown(sheet(), { clientX: 100, clientY: 300 })
    fireEvent.pointerMove(sheet(), { clientX: 100, clientY: 302 })

    expect(backdrop().style.backdropFilter).toBe(before)
  })

  it('still lets the press reach the button under the finger', () => {
    show()
    settle()

    fireEvent.pointerDown(screen.getByText('Edit'), { clientX: 100, clientY: 300 })
    fireEvent.pointerUp(screen.getByText('Edit'), { clientX: 100, clientY: 300 })
    fireEvent.click(screen.getByText('Edit'))

    expect(pressed).toHaveBeenCalledOnce()
  })

  it('starts dragging once the finger has gone down far enough', () => {
    show()
    settle()

    fireEvent.pointerDown(sheet(), { clientX: 100, clientY: 300 })
    fireEvent.pointerMove(sheet(), { clientX: 100, clientY: 340 })

    // The sheet follows: it has left its resting place, which only a drag does.
    expect(sheet().style.transform).toBe('translateY(40px)')
  })

  // A finger crossing the sheet sideways is going somewhere else. Without this, a drag
  // that is mostly across takes the sheet down with it.
  it('ignores a finger that is going more across than down', () => {
    show()
    settle()

    fireEvent.pointerDown(sheet(), { clientX: 100, clientY: 300 })
    fireEvent.pointerMove(sheet(), { clientX: 220, clientY: 320 })

    expect(sheet().style.transform).toBe('translateY(0px)')
  })

  it('will not be dragged upwards', () => {
    show()
    settle()

    fireEvent.pointerDown(sheet(), { clientX: 100, clientY: 300 })
    fireEvent.pointerMove(sheet(), { clientX: 100, clientY: 240 })

    expect(sheet().style.transform).toBe('translateY(0px)')
  })

  // Faded with the drag rather than switched off by it: cutting it meant the blur and the
  // dimming disagreed the whole way down, one gone at once and the other easing away.
  it('fades the blur as the sheet goes down', () => {
    show()
    settle()
    const atRest = backdrop().style.backdropFilter

    fireEvent.pointerDown(sheet(), { clientX: 100, clientY: 300 })
    fireEvent.pointerMove(sheet(), { clientX: 100, clientY: 340 })
    const moving = backdrop().style.backdropFilter

    expect(moving).not.toBe(atRest)
    expect(moving).not.toBe('blur(0px)')
    expect(Number(/blur\(([\d.]+)px\)/.exec(moving)?.[1])).toBeLessThan(
      Number(/blur\(([\d.]+)px\)/.exec(atRest)?.[1])
    )
  })
})
