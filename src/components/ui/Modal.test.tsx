import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Modal } from './Modal'

describe('Modal', () => {
  it('should not render when isOpen is false', () => {
    render(
      <Modal isOpen={false} onClose={() => {}} title="Test Modal">
        Content
      </Modal>
    )
    expect(screen.queryByText('Test Modal')).not.toBeInTheDocument()
  })

  it('should render when isOpen is true', () => {
    render(
      <Modal isOpen={true} onClose={() => {}} title="Test Modal">
        Content
      </Modal>
    )
    expect(screen.getByText('Test Modal')).toBeInTheDocument()
    expect(screen.getByText('Content')).toBeInTheDocument()
  })

  it('should call onClose when close button is clicked', () => {
    const handleClose = vi.fn()
    render(
      <Modal isOpen={true} onClose={handleClose} title="Test Modal">
        Content
      </Modal>
    )

    fireEvent.click(screen.getByLabelText('Close modal'))
    expect(handleClose).toHaveBeenCalledTimes(1)
  })

  it('should call onClose when backdrop is clicked', () => {
    const handleClose = vi.fn()
    render(
      <Modal isOpen={true} onClose={handleClose} title="Test Modal">
        Content
      </Modal>
    )

    // Click on the backdrop (the element with aria-hidden="true")
    const backdrop = document.querySelector('[aria-hidden="true"]')
    fireEvent.click(backdrop!)
    expect(handleClose).toHaveBeenCalledTimes(1)
  })

  it('should call onClose when Escape key is pressed', () => {
    const handleClose = vi.fn()
    render(
      <Modal isOpen={true} onClose={handleClose} title="Test Modal">
        Content
      </Modal>
    )

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(handleClose).toHaveBeenCalledTimes(1)
  })

  it('should have proper accessibility attributes', () => {
    render(
      <Modal isOpen={true} onClose={() => {}} title="Test Modal">
        Content
      </Modal>
    )

    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAttribute('aria-labelledby', 'modal-title')
  })
})
