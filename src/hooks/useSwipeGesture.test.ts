import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useSwipeGesture } from './useSwipeGesture'

function createTouchEvent(type: string, x: number, y: number): TouchEvent {
  return new TouchEvent(type, {
    bubbles: true,
    cancelable: true,
    ...(type === 'touchend'
      ? { changedTouches: [{ clientX: x, clientY: y } as Touch] }
      : { touches: [{ clientX: x, clientY: y } as Touch] }),
  })
}

describe('useSwipeGesture', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should return a ref object', () => {
    const { result } = renderHook(() =>
      useSwipeGesture({ onSwipeLeft: vi.fn(), onSwipeRight: vi.fn() })
    )
    expect(result.current).toHaveProperty('current')
  })

  it('should detect a swipe left (negative deltaX)', () => {
    const onSwipeLeft = vi.fn()
    const onSwipeRight = vi.fn()
    const { result } = renderHook(() => useSwipeGesture({ onSwipeLeft, onSwipeRight }))

    const div = document.createElement('div')
    ;(result.current as React.MutableRefObject<HTMLDivElement>).current = div

    // Re-render so useEffect picks up the element
    const { result: result2 } = renderHook(() => useSwipeGesture({ onSwipeLeft, onSwipeRight }))
    const div2 = document.createElement('div')
    Object.defineProperty(result2.current, 'current', {
      writable: true,
      value: div2,
    })

    // Simpler approach: create a fresh hook with element already set
    const container = document.createElement('div')
    document.body.appendChild(container)

    const onLeft = vi.fn()
    const onRight = vi.fn()

    const { unmount } = renderHook(() => {
      const ref = useSwipeGesture<HTMLDivElement>({ onSwipeLeft: onLeft, onSwipeRight: onRight })
      Object.defineProperty(ref, 'current', { value: container, writable: true })
      return ref
    })

    // Simulate swipe left: start at x=200, end at x=100 (delta = -100)
    container.dispatchEvent(createTouchEvent('touchstart', 200, 100))
    container.dispatchEvent(createTouchEvent('touchend', 100, 100))

    expect(onLeft).toHaveBeenCalledTimes(1)
    expect(onRight).not.toHaveBeenCalled()

    unmount()
    document.body.removeChild(container)
  })

  it('should detect a swipe right (positive deltaX)', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)

    const onLeft = vi.fn()
    const onRight = vi.fn()

    const { unmount } = renderHook(() => {
      const ref = useSwipeGesture<HTMLDivElement>({ onSwipeLeft: onLeft, onSwipeRight: onRight })
      Object.defineProperty(ref, 'current', { value: container, writable: true })
      return ref
    })

    // Simulate swipe right: start at x=100, end at x=250 (delta = +150)
    container.dispatchEvent(createTouchEvent('touchstart', 100, 100))
    container.dispatchEvent(createTouchEvent('touchend', 250, 100))

    expect(onRight).toHaveBeenCalledTimes(1)
    expect(onLeft).not.toHaveBeenCalled()

    unmount()
    document.body.removeChild(container)
  })

  it('should ignore small movements below the threshold', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)

    const onLeft = vi.fn()
    const onRight = vi.fn()

    const { unmount } = renderHook(() => {
      const ref = useSwipeGesture<HTMLDivElement>({
        onSwipeLeft: onLeft,
        onSwipeRight: onRight,
        threshold: 50,
      })
      Object.defineProperty(ref, 'current', { value: container, writable: true })
      return ref
    })

    // Simulate a tiny horizontal move: delta = 30px (below 50px threshold)
    container.dispatchEvent(createTouchEvent('touchstart', 100, 100))
    container.dispatchEvent(createTouchEvent('touchend', 130, 100))

    expect(onLeft).not.toHaveBeenCalled()
    expect(onRight).not.toHaveBeenCalled()

    unmount()
    document.body.removeChild(container)
  })

  it('should ignore vertical swipes (deltaY > deltaX)', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)

    const onLeft = vi.fn()
    const onRight = vi.fn()

    const { unmount } = renderHook(() => {
      const ref = useSwipeGesture<HTMLDivElement>({ onSwipeLeft: onLeft, onSwipeRight: onRight })
      Object.defineProperty(ref, 'current', { value: container, writable: true })
      return ref
    })

    // Simulate vertical scroll: deltaX=30, deltaY=150 — vertical dominates
    container.dispatchEvent(createTouchEvent('touchstart', 100, 100))
    container.dispatchEvent(createTouchEvent('touchend', 130, 250))

    expect(onLeft).not.toHaveBeenCalled()
    expect(onRight).not.toHaveBeenCalled()

    unmount()
    document.body.removeChild(container)
  })

  it('should clean up event listeners on unmount', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)

    const addSpy = vi.spyOn(container, 'addEventListener')
    const removeSpy = vi.spyOn(container, 'removeEventListener')

    const { unmount } = renderHook(() => {
      const ref = useSwipeGesture<HTMLDivElement>({ onSwipeLeft: vi.fn() })
      Object.defineProperty(ref, 'current', { value: container, writable: true })
      return ref
    })

    expect(addSpy).toHaveBeenCalledWith('touchstart', expect.any(Function), { passive: true })
    expect(addSpy).toHaveBeenCalledWith('touchend', expect.any(Function), { passive: true })

    unmount()

    expect(removeSpy).toHaveBeenCalledWith('touchstart', expect.any(Function))
    expect(removeSpy).toHaveBeenCalledWith('touchend', expect.any(Function))

    document.body.removeChild(container)
  })
})
