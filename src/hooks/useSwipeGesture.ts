import { useRef, useEffect } from 'react'

interface SwipeGestureOptions {
  onSwipeLeft?: () => void
  onSwipeRight?: () => void
  /** Minimum horizontal distance in pixels to trigger a swipe (default: 50) */
  threshold?: number
}

/**
 * Hook to detect horizontal swipe gestures on touch devices.
 *
 * Returns a ref to attach to the swipeable container element.
 * Ignores vertical scrolling (when deltaY > deltaX) and small movements
 * below the threshold. Does not interfere with normal scrolling or
 * other touch interactions.
 */
export function useSwipeGesture<T extends HTMLElement = HTMLDivElement>(
  options: SwipeGestureOptions
) {
  const { onSwipeLeft, onSwipeRight, threshold = 50 } = options
  const ref = useRef<T>(null)

  // Store callbacks in refs to avoid re-attaching listeners
  const onSwipeLeftRef = useRef(onSwipeLeft)
  const onSwipeRightRef = useRef(onSwipeRight)

  useEffect(() => {
    onSwipeLeftRef.current = onSwipeLeft
    onSwipeRightRef.current = onSwipeRight
  }, [onSwipeLeft, onSwipeRight])

  useEffect(() => {
    const element = ref.current
    if (!element) return

    let startX = 0
    let startY = 0
    let startTime = 0

    const handleTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0]
      startX = touch.clientX
      startY = touch.clientY
      startTime = Date.now()
    }

    const handleTouchEnd = (e: TouchEvent) => {
      const touch = e.changedTouches[0]
      const deltaX = touch.clientX - startX
      const deltaY = touch.clientY - startY
      const elapsed = Date.now() - startTime

      const absDeltaX = Math.abs(deltaX)
      const absDeltaY = Math.abs(deltaY)

      // Ignore if vertical movement dominates (user is scrolling)
      if (absDeltaY > absDeltaX) return

      // Ignore if horizontal distance is below threshold
      if (absDeltaX < threshold) return

      // Velocity check: swipe should complete within a reasonable time (1 second)
      if (elapsed > 1000) return

      // A gesture is not a click, and whatever the finger last touched keeps DOM focus.
      // Left alone it points at the screen the person has just swiped away from: on the
      // view toggle that showed as a ring on one button and the selection on the other.
      // Only once the movement has been accepted as a swipe, so a stray touch cannot take
      // the focus from something somebody was using.
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur()
      }

      if (deltaX < 0) {
        onSwipeLeftRef.current?.()
      } else {
        onSwipeRightRef.current?.()
      }
    }

    element.addEventListener('touchstart', handleTouchStart, { passive: true })
    element.addEventListener('touchend', handleTouchEnd, { passive: true })

    return () => {
      element.removeEventListener('touchstart', handleTouchStart)
      element.removeEventListener('touchend', handleTouchEnd)
    }
  }, [threshold])

  return ref
}
