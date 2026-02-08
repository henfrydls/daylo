import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useToastStore, useToast } from './toast'

describe('useToastStore', () => {
  beforeEach(() => {
    // Reset store state before each test
    useToastStore.setState({ toasts: [] })
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('addToast', () => {
    it('should add a toast to the array', () => {
      const { addToast } = useToastStore.getState()
      addToast('Test message', 'success')

      const { toasts } = useToastStore.getState()
      expect(toasts.length).toBe(1)
      expect(toasts[0].message).toBe('Test message')
      expect(toasts[0].variant).toBe('success')
      expect(toasts[0].id).toBeDefined()
    })

    it('should add multiple toasts', () => {
      const { addToast } = useToastStore.getState()
      addToast('First message', 'success')
      addToast('Second message', 'error')
      addToast('Third message', 'info')

      const { toasts } = useToastStore.getState()
      expect(toasts.length).toBe(3)
      expect(toasts[0].message).toBe('First message')
      expect(toasts[1].message).toBe('Second message')
      expect(toasts[2].message).toBe('Third message')
    })

    it('should generate unique IDs for each toast', () => {
      const { addToast } = useToastStore.getState()
      addToast('First message', 'success')
      addToast('Second message', 'error')

      const { toasts } = useToastStore.getState()
      expect(toasts[0].id).not.toBe(toasts[1].id)
    })

    it('should support success variant', () => {
      const { addToast } = useToastStore.getState()
      addToast('Success message', 'success')

      const { toasts } = useToastStore.getState()
      expect(toasts[0].variant).toBe('success')
    })

    it('should support error variant', () => {
      const { addToast } = useToastStore.getState()
      addToast('Error message', 'error')

      const { toasts } = useToastStore.getState()
      expect(toasts[0].variant).toBe('error')
    })

    it('should support info variant', () => {
      const { addToast } = useToastStore.getState()
      addToast('Info message', 'info')

      const { toasts } = useToastStore.getState()
      expect(toasts[0].variant).toBe('info')
    })
  })

  describe('removeToast', () => {
    it('should remove a toast by id', () => {
      const { addToast, removeToast } = useToastStore.getState()
      addToast('Test message', 'success')

      const { toasts: toastsBefore } = useToastStore.getState()
      const toastId = toastsBefore[0].id

      removeToast(toastId)

      const { toasts: toastsAfter } = useToastStore.getState()
      expect(toastsAfter.length).toBe(0)
    })

    it('should only remove the specified toast', () => {
      const { addToast, removeToast } = useToastStore.getState()
      addToast('First message', 'success')
      addToast('Second message', 'error')

      const { toasts: toastsBefore } = useToastStore.getState()
      const firstToastId = toastsBefore[0].id

      removeToast(firstToastId)

      const { toasts: toastsAfter } = useToastStore.getState()
      expect(toastsAfter.length).toBe(1)
      expect(toastsAfter[0].message).toBe('Second message')
    })

    it('should do nothing if toast id does not exist', () => {
      const { addToast, removeToast } = useToastStore.getState()
      addToast('Test message', 'success')

      removeToast('non-existent-id')

      const { toasts } = useToastStore.getState()
      expect(toasts.length).toBe(1)
    })
  })

  describe('auto-dismiss', () => {
    it('should auto-dismiss toast after 3 seconds', () => {
      const { addToast } = useToastStore.getState()
      addToast('Test message', 'success')

      const { toasts: toastsBefore } = useToastStore.getState()
      expect(toastsBefore.length).toBe(1)

      // Fast-forward time by 3 seconds
      vi.advanceTimersByTime(3000)

      const { toasts: toastsAfter } = useToastStore.getState()
      expect(toastsAfter.length).toBe(0)
    })

    it('should not dismiss toast before 3 seconds', () => {
      const { addToast } = useToastStore.getState()
      addToast('Test message', 'success')

      // Fast-forward time by 2.9 seconds
      vi.advanceTimersByTime(2900)

      const { toasts } = useToastStore.getState()
      expect(toasts.length).toBe(1)
    })

    it('should auto-dismiss multiple toasts independently', () => {
      const { addToast } = useToastStore.getState()

      addToast('First message', 'success')
      vi.advanceTimersByTime(1000)

      addToast('Second message', 'error')
      vi.advanceTimersByTime(1000)

      addToast('Third message', 'info')

      const { toasts: toastsBefore } = useToastStore.getState()
      expect(toastsBefore.length).toBe(3)

      // After 1 more second, first toast should be dismissed (3 seconds total)
      vi.advanceTimersByTime(1000)
      expect(useToastStore.getState().toasts.length).toBe(2)

      // After another second, second toast should be dismissed
      vi.advanceTimersByTime(1000)
      expect(useToastStore.getState().toasts.length).toBe(1)

      // After another second, third toast should be dismissed
      vi.advanceTimersByTime(1000)
      expect(useToastStore.getState().toasts.length).toBe(0)
    })
  })
})

describe('useToast hook', () => {
  beforeEach(() => {
    useToastStore.setState({ toasts: [] })
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should return showToast function', () => {
    const { result } = renderHook(() => useToast())
    expect(result.current.showToast).toBeDefined()
    expect(typeof result.current.showToast).toBe('function')
  })

  it('should add toast when showToast is called', () => {
    const { result } = renderHook(() => useToast())

    act(() => {
      result.current.showToast('Test message', 'success')
    })

    const { toasts } = useToastStore.getState()
    expect(toasts.length).toBe(1)
    expect(toasts[0].message).toBe('Test message')
    expect(toasts[0].variant).toBe('success')
  })

  it('should default to info variant when not specified', () => {
    const { result } = renderHook(() => useToast())

    act(() => {
      result.current.showToast('Test message')
    })

    const { toasts } = useToastStore.getState()
    expect(toasts[0].variant).toBe('info')
  })

  it('should return stable reference', () => {
    const { result, rerender } = renderHook(() => useToast())
    const firstShowToast = result.current.showToast

    rerender()

    expect(result.current.showToast).toBe(firstShowToast)
  })
})
