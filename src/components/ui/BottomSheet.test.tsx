import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { BottomSheet } from './BottomSheet'

describe('BottomSheet', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    children: <div>Sheet content</div>,
  }

  it('should not render when closed', () => {
    const { container } = render(<BottomSheet {...defaultProps} isOpen={false} />)

    expect(container.firstChild).toBeNull()
  })

  it('should render children when open', () => {
    render(<BottomSheet {...defaultProps} />)

    expect(screen.getByText('Sheet content')).toBeInTheDocument()
  })

  it('should have dialog role and aria-modal', () => {
    render(<BottomSheet {...defaultProps} />)

    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
  })

  it('should use provided aria-label', () => {
    render(<BottomSheet {...defaultProps} aria-label="Activities panel" />)

    expect(screen.getByRole('dialog')).toHaveAttribute('aria-label', 'Activities panel')
  })

  it('should render the handle bar', () => {
    render(<BottomSheet {...defaultProps} />)

    const sheet = screen.getByTestId('bottom-sheet')
    expect(sheet).toBeInTheDocument()
  })

  it('should call onClose when backdrop is clicked', () => {
    const onClose = vi.fn()
    render(<BottomSheet {...defaultProps} onClose={onClose} />)

    // Click on the backdrop (outer container)
    fireEvent.click(screen.getByTestId('bottom-sheet-backdrop'))

    expect(onClose).toHaveBeenCalled()
  })

  it('should not close when content is clicked', () => {
    const onClose = vi.fn()
    render(<BottomSheet {...defaultProps} onClose={onClose} />)

    fireEvent.click(screen.getByText('Sheet content'))

    // onClose should not be called for content clicks
    expect(onClose).not.toHaveBeenCalled()
  })

  it('should close on Escape key', () => {
    const onClose = vi.fn()
    render(<BottomSheet {...defaultProps} onClose={onClose} />)

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(onClose).toHaveBeenCalled()
  })
})
