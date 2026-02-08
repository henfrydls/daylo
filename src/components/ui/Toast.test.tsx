import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { ToastContainer } from './Toast'
import { useToastStore } from '../../store/toast'

describe('ToastContainer', () => {
  beforeEach(() => {
    // Reset store state before each test
    useToastStore.setState({ toasts: [] })
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should not render when there are no toasts', () => {
    render(<ToastContainer />)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('should render ToastContainer with a toast', () => {
    useToastStore.setState({
      toasts: [{ id: 'toast-1', message: 'Test message', variant: 'success' }],
    })

    render(<ToastContainer />)
    expect(screen.getByText('Test message')).toBeInTheDocument()
  })

  it('should render toast with message', () => {
    useToastStore.setState({
      toasts: [{ id: 'toast-1', message: 'Hello World', variant: 'info' }],
    })

    render(<ToastContainer />)
    expect(screen.getByText('Hello World')).toBeInTheDocument()
  })

  describe('variants', () => {
    it('should render success variant with correct styles', () => {
      useToastStore.setState({
        toasts: [{ id: 'toast-1', message: 'Success message', variant: 'success' }],
      })

      render(<ToastContainer />)
      const alert = screen.getByRole('alert')
      expect(alert.className).toContain('bg-emerald-50')
      expect(alert.className).toContain('border-emerald-200')
    })

    it('should render error variant with correct styles', () => {
      useToastStore.setState({
        toasts: [{ id: 'toast-1', message: 'Error message', variant: 'error' }],
      })

      render(<ToastContainer />)
      const alert = screen.getByRole('alert')
      expect(alert.className).toContain('bg-red-50')
      expect(alert.className).toContain('border-red-200')
    })

    it('should render info variant with correct styles', () => {
      useToastStore.setState({
        toasts: [{ id: 'toast-1', message: 'Info message', variant: 'info' }],
      })

      render(<ToastContainer />)
      const alert = screen.getByRole('alert')
      expect(alert.className).toContain('bg-blue-50')
      expect(alert.className).toContain('border-blue-200')
    })
  })

  describe('icons', () => {
    it('should render CheckCircleIcon for success variant', () => {
      useToastStore.setState({
        toasts: [{ id: 'toast-1', message: 'Success message', variant: 'success' }],
      })

      render(<ToastContainer />)
      const alert = screen.getByRole('alert')
      const icon = alert.querySelector('svg')
      expect(icon).toBeInTheDocument()
      expect(icon?.getAttribute('class')).toContain('text-emerald-500')
    })

    it('should render ExclamationCircleIcon for error variant', () => {
      useToastStore.setState({
        toasts: [{ id: 'toast-1', message: 'Error message', variant: 'error' }],
      })

      render(<ToastContainer />)
      const alert = screen.getByRole('alert')
      const icon = alert.querySelector('svg')
      expect(icon).toBeInTheDocument()
      expect(icon?.getAttribute('class')).toContain('text-red-500')
    })

    it('should render InfoCircleIcon for info variant', () => {
      useToastStore.setState({
        toasts: [{ id: 'toast-1', message: 'Info message', variant: 'info' }],
      })

      render(<ToastContainer />)
      const alert = screen.getByRole('alert')
      const icon = alert.querySelector('svg')
      expect(icon).toBeInTheDocument()
      expect(icon?.getAttribute('class')).toContain('text-blue-500')
    })
  })

  describe('auto-dismiss', () => {
    it('should auto-dismiss toast after timeout', () => {
      // For auto-dismiss, we test directly through the store since the component
      // relies on the store's internal setTimeout mechanism
      const { addToast } = useToastStore.getState()

      const { rerender } = render(<ToastContainer />)

      act(() => {
        addToast('Test message', 'success')
      })

      // Force re-render to pick up state change
      rerender(<ToastContainer />)

      expect(screen.getByText('Test message')).toBeInTheDocument()

      // Fast-forward time by 3 seconds to trigger auto-dismiss in the store
      act(() => {
        vi.advanceTimersByTime(3000)
      })

      // Re-render to pick up the state change after timeout
      rerender(<ToastContainer />)

      expect(screen.queryByText('Test message')).not.toBeInTheDocument()
    })
  })

  describe('manual dismiss', () => {
    it('should dismiss toast when X button is clicked', () => {
      useToastStore.setState({
        toasts: [{ id: 'toast-1', message: 'Test message', variant: 'success' }],
      })

      render(<ToastContainer />)
      expect(screen.getByText('Test message')).toBeInTheDocument()

      const dismissButton = screen.getByLabelText('Dismiss notification')
      fireEvent.click(dismissButton)

      expect(screen.queryByText('Test message')).not.toBeInTheDocument()
    })

    it('should call removeToast with correct id when dismissed', () => {
      const removeToastSpy = vi.fn()
      useToastStore.setState({
        toasts: [{ id: 'toast-123', message: 'Test message', variant: 'success' }],
        removeToast: removeToastSpy,
      })

      render(<ToastContainer />)

      const dismissButton = screen.getByLabelText('Dismiss notification')
      fireEvent.click(dismissButton)

      expect(removeToastSpy).toHaveBeenCalledWith('toast-123')
    })
  })

  describe('multiple toasts', () => {
    it('should render multiple toasts', () => {
      useToastStore.setState({
        toasts: [
          { id: 'toast-1', message: 'First message', variant: 'success' },
          { id: 'toast-2', message: 'Second message', variant: 'error' },
          { id: 'toast-3', message: 'Third message', variant: 'info' },
        ],
      })

      render(<ToastContainer />)

      expect(screen.getByText('First message')).toBeInTheDocument()
      expect(screen.getByText('Second message')).toBeInTheDocument()
      expect(screen.getByText('Third message')).toBeInTheDocument()
    })

    it('should render correct number of alerts', () => {
      useToastStore.setState({
        toasts: [
          { id: 'toast-1', message: 'First message', variant: 'success' },
          { id: 'toast-2', message: 'Second message', variant: 'error' },
        ],
      })

      render(<ToastContainer />)

      const alerts = screen.getAllByRole('alert')
      expect(alerts.length).toBe(2)
    })

    it('should dismiss only the clicked toast', () => {
      // Use spy to track removeToast calls with correct IDs
      const removeToastSpy = vi.fn()
      useToastStore.setState({
        toasts: [
          { id: 'toast-1', message: 'First message', variant: 'success' },
          { id: 'toast-2', message: 'Second message', variant: 'error' },
        ],
        removeToast: removeToastSpy,
      })

      render(<ToastContainer />)

      // Verify both toasts are rendered
      expect(screen.getByText('First message')).toBeInTheDocument()
      expect(screen.getByText('Second message')).toBeInTheDocument()

      // Click the first dismiss button (associated with toast-1)
      const dismissButtons = screen.getAllByLabelText('Dismiss notification')
      fireEvent.click(dismissButtons[0])

      // Verify removeToast was called with the first toast's ID
      expect(removeToastSpy).toHaveBeenCalledTimes(1)
      expect(removeToastSpy).toHaveBeenCalledWith('toast-1')
    })
  })

  describe('accessibility', () => {
    it('should have role="alert" on toast items', () => {
      useToastStore.setState({
        toasts: [{ id: 'toast-1', message: 'Test message', variant: 'success' }],
      })

      render(<ToastContainer />)
      const alert = screen.getByRole('alert')
      expect(alert).toBeInTheDocument()
    })

    it('should have aria-live="polite" on toast items', () => {
      useToastStore.setState({
        toasts: [{ id: 'toast-1', message: 'Test message', variant: 'success' }],
      })

      render(<ToastContainer />)
      const alert = screen.getByRole('alert')
      expect(alert).toHaveAttribute('aria-live', 'polite')
    })

    it('should have aria-label on dismiss button', () => {
      useToastStore.setState({
        toasts: [{ id: 'toast-1', message: 'Test message', variant: 'success' }],
      })

      render(<ToastContainer />)
      const dismissButton = screen.getByLabelText('Dismiss notification')
      expect(dismissButton).toBeInTheDocument()
    })

    it('should have aria-label="Notifications" on container', () => {
      useToastStore.setState({
        toasts: [{ id: 'toast-1', message: 'Test message', variant: 'success' }],
      })

      render(<ToastContainer />)
      const container = screen.getByLabelText('Notifications')
      expect(container).toBeInTheDocument()
    })
  })
})
