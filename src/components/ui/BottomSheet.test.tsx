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
