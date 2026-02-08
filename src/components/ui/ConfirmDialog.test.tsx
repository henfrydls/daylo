import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfirmDialog } from './ConfirmDialog'

describe('ConfirmDialog', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    onConfirm: vi.fn(),
    title: 'Test Title',
    message: 'Test message content',
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    // Reset body overflow style that may be set by useFocusTrap
    document.body.style.overflow = 'unset'
  })

  describe('Rendering', () => {
    it('should not render when isOpen is false', () => {
      render(<ConfirmDialog {...defaultProps} isOpen={false} />)
      expect(screen.queryByText('Test Title')).not.toBeInTheDocument()
      expect(screen.queryByText('Test message content')).not.toBeInTheDocument()
    })

    it('should render when isOpen is true', () => {
      render(<ConfirmDialog {...defaultProps} />)
      expect(screen.getByText('Test Title')).toBeInTheDocument()
      expect(screen.getByText('Test message content')).toBeInTheDocument()
    })

    it('should display the title correctly', () => {
      render(<ConfirmDialog {...defaultProps} title="Custom Title" />)
      expect(screen.getByText('Custom Title')).toBeInTheDocument()
    })

    it('should display the message correctly', () => {
      render(<ConfirmDialog {...defaultProps} message="Custom message text" />)
      expect(screen.getByText('Custom message text')).toBeInTheDocument()
    })

    it('should apply custom data-testid when provided', () => {
      render(<ConfirmDialog {...defaultProps} data-testid="custom-dialog" />)
      expect(screen.getByTestId('custom-dialog')).toBeInTheDocument()
    })
  })

  describe('Button texts', () => {
    it('should display default button texts', () => {
      render(<ConfirmDialog {...defaultProps} />)
      expect(screen.getByTestId('confirm-dialog-confirm')).toHaveTextContent('Confirm')
      expect(screen.getByTestId('confirm-dialog-cancel')).toHaveTextContent('Cancel')
    })

    it('should display custom confirm text', () => {
      render(<ConfirmDialog {...defaultProps} confirmText="Delete" />)
      expect(screen.getByTestId('confirm-dialog-confirm')).toHaveTextContent('Delete')
    })

    it('should display custom cancel text', () => {
      render(<ConfirmDialog {...defaultProps} cancelText="Go Back" />)
      expect(screen.getByTestId('confirm-dialog-cancel')).toHaveTextContent('Go Back')
    })

    it('should display both custom button texts', () => {
      render(
        <ConfirmDialog
          {...defaultProps}
          confirmText="Yes, Delete"
          cancelText="No, Keep"
        />
      )
      expect(screen.getByTestId('confirm-dialog-confirm')).toHaveTextContent('Yes, Delete')
      expect(screen.getByTestId('confirm-dialog-cancel')).toHaveTextContent('No, Keep')
    })
  })

  describe('Variants', () => {
    it('should render default variant with gray icon', () => {
      render(<ConfirmDialog {...defaultProps} variant="default" />)
      const iconContainer = document.querySelector('.bg-gray-100')
      expect(iconContainer).toBeInTheDocument()
    })

    it('should render danger variant with red icon', () => {
      render(<ConfirmDialog {...defaultProps} variant="danger" />)
      const iconContainer = document.querySelector('.bg-red-100')
      expect(iconContainer).toBeInTheDocument()
    })

    it('should render warning variant with amber icon', () => {
      render(<ConfirmDialog {...defaultProps} variant="warning" />)
      const iconContainer = document.querySelector('.bg-amber-100')
      expect(iconContainer).toBeInTheDocument()
    })

    it('should apply danger button styling for danger variant', () => {
      render(<ConfirmDialog {...defaultProps} variant="danger" />)
      const confirmButton = screen.getByTestId('confirm-dialog-confirm')
      expect(confirmButton.className).toContain('bg-red-600')
    })

    it('should apply warning button styling for warning variant', () => {
      render(<ConfirmDialog {...defaultProps} variant="warning" />)
      const confirmButton = screen.getByTestId('confirm-dialog-confirm')
      expect(confirmButton.className).toContain('bg-amber-600')
    })

    it('should apply default button styling for default variant', () => {
      render(<ConfirmDialog {...defaultProps} variant="default" />)
      const confirmButton = screen.getByTestId('confirm-dialog-confirm')
      expect(confirmButton.className).toContain('bg-emerald-500')
    })

    it('should use default variant when no variant is specified', () => {
      render(<ConfirmDialog {...defaultProps} />)
      const iconContainer = document.querySelector('.bg-gray-100')
      expect(iconContainer).toBeInTheDocument()
    })
  })

  describe('User interactions', () => {
    it('should call onConfirm and onClose when confirm button is clicked', async () => {
      const onConfirm = vi.fn()
      const onClose = vi.fn()
      render(<ConfirmDialog {...defaultProps} onConfirm={onConfirm} onClose={onClose} />)

      fireEvent.click(screen.getByTestId('confirm-dialog-confirm'))

      expect(onConfirm).toHaveBeenCalledTimes(1)
      expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('should call onClose when cancel button is clicked', async () => {
      const onClose = vi.fn()
      render(<ConfirmDialog {...defaultProps} onClose={onClose} />)

      fireEvent.click(screen.getByTestId('confirm-dialog-cancel'))

      expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('should not call onConfirm when cancel button is clicked', async () => {
      const onConfirm = vi.fn()
      render(<ConfirmDialog {...defaultProps} onConfirm={onConfirm} />)

      fireEvent.click(screen.getByTestId('confirm-dialog-cancel'))

      expect(onConfirm).not.toHaveBeenCalled()
    })

    it('should call onClose when overlay is clicked', () => {
      const onClose = vi.fn()
      render(<ConfirmDialog {...defaultProps} onClose={onClose} />)

      const overlay = document.querySelector('[aria-hidden="true"]')
      fireEvent.click(overlay!)

      expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('should call onClose when Escape key is pressed', () => {
      const onClose = vi.fn()
      render(<ConfirmDialog {...defaultProps} onClose={onClose} />)

      fireEvent.keyDown(document, { key: 'Escape' })

      expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('should not call onClose when other keys are pressed', () => {
      const onClose = vi.fn()
      render(<ConfirmDialog {...defaultProps} onClose={onClose} />)

      fireEvent.keyDown(document, { key: 'Enter' })
      fireEvent.keyDown(document, { key: 'Space' })

      expect(onClose).not.toHaveBeenCalled()
    })
  })

  describe('Focus management', () => {
    it('should focus the cancel button when dialog opens', async () => {
      render(<ConfirmDialog {...defaultProps} />)

      await waitFor(() => {
        expect(screen.getByTestId('confirm-dialog-cancel')).toHaveFocus()
      })
    })

    it('should trap focus within the dialog on Tab', async () => {
      const user = userEvent.setup()
      render(<ConfirmDialog {...defaultProps} />)

      await waitFor(() => {
        expect(screen.getByTestId('confirm-dialog-cancel')).toHaveFocus()
      })

      // Tab to confirm button
      await user.tab()
      expect(screen.getByTestId('confirm-dialog-confirm')).toHaveFocus()

      // Tab again should cycle back to cancel button
      await user.tab()
      expect(screen.getByTestId('confirm-dialog-cancel')).toHaveFocus()
    })

    it('should trap focus within the dialog on Shift+Tab', async () => {
      const user = userEvent.setup()
      render(<ConfirmDialog {...defaultProps} />)

      await waitFor(() => {
        expect(screen.getByTestId('confirm-dialog-cancel')).toHaveFocus()
      })

      // Shift+Tab should cycle to confirm button (last element)
      await user.tab({ shift: true })
      expect(screen.getByTestId('confirm-dialog-confirm')).toHaveFocus()
    })

    it('should lock body scroll when open', () => {
      render(<ConfirmDialog {...defaultProps} />)
      expect(document.body.style.overflow).toBe('hidden')
    })

    it('should not lock body scroll when closed', () => {
      render(<ConfirmDialog {...defaultProps} isOpen={false} />)
      expect(document.body.style.overflow).not.toBe('hidden')
    })
  })

  describe('Accessibility', () => {
    it('should have role="alertdialog"', () => {
      render(<ConfirmDialog {...defaultProps} />)
      expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    })

    it('should have aria-modal="true"', () => {
      render(<ConfirmDialog {...defaultProps} />)
      const dialog = screen.getByRole('alertdialog')
      expect(dialog).toHaveAttribute('aria-modal', 'true')
    })

    it('should have aria-labelledby pointing to the title', () => {
      render(<ConfirmDialog {...defaultProps} />)
      const dialog = screen.getByRole('alertdialog')
      expect(dialog).toHaveAttribute('aria-labelledby', 'confirm-dialog-title')

      const title = document.getElementById('confirm-dialog-title')
      expect(title).toHaveTextContent('Test Title')
    })

    it('should have aria-describedby pointing to the message', () => {
      render(<ConfirmDialog {...defaultProps} />)
      const dialog = screen.getByRole('alertdialog')
      expect(dialog).toHaveAttribute('aria-describedby', 'confirm-dialog-message')

      const message = document.getElementById('confirm-dialog-message')
      expect(message).toHaveTextContent('Test message content')
    })

    it('should have aria-hidden on the overlay', () => {
      render(<ConfirmDialog {...defaultProps} />)
      const overlay = document.querySelector('.bg-black\\/50')
      expect(overlay).toHaveAttribute('aria-hidden', 'true')
    })
  })

  describe('Icon rendering', () => {
    it('should render an SVG icon for default variant', () => {
      render(<ConfirmDialog {...defaultProps} variant="default" />)
      const iconContainer = document.querySelector('.bg-gray-100')
      const svg = iconContainer?.querySelector('svg')
      expect(svg).toBeInTheDocument()
      expect(svg).toHaveClass('text-gray-600')
    })

    it('should render an SVG icon for danger variant', () => {
      render(<ConfirmDialog {...defaultProps} variant="danger" />)
      const iconContainer = document.querySelector('.bg-red-100')
      const svg = iconContainer?.querySelector('svg')
      expect(svg).toBeInTheDocument()
      expect(svg).toHaveClass('text-red-600')
    })

    it('should render an SVG icon for warning variant', () => {
      render(<ConfirmDialog {...defaultProps} variant="warning" />)
      const iconContainer = document.querySelector('.bg-amber-100')
      const svg = iconContainer?.querySelector('svg')
      expect(svg).toBeInTheDocument()
      expect(svg).toHaveClass('text-amber-600')
    })
  })

  describe('Multiple dialogs lifecycle', () => {
    it('should handle opening and closing correctly', () => {
      const onClose = vi.fn()
      const { rerender } = render(
        <ConfirmDialog {...defaultProps} isOpen={false} onClose={onClose} />
      )

      expect(screen.queryByText('Test Title')).not.toBeInTheDocument()

      rerender(<ConfirmDialog {...defaultProps} isOpen={true} onClose={onClose} />)
      expect(screen.getByText('Test Title')).toBeInTheDocument()

      rerender(<ConfirmDialog {...defaultProps} isOpen={false} onClose={onClose} />)
      expect(screen.queryByText('Test Title')).not.toBeInTheDocument()
    })
  })
})
