import { useState, useEffect, useRef } from 'react'

/**
 * Hook for delayed unmount — keeps component in DOM during exit animation.
 *
 * @param isOpen - Whether the component should be visible
 * @param duration - Exit animation duration in ms
 * @returns shouldRender (keep in DOM), isVisible (apply enter/exit classes)
 */
export function useAnimatedPresence(
  isOpen: boolean,
  duration: number
): { shouldRender: boolean; isVisible: boolean } {
  const [shouldRender, setShouldRender] = useState(isOpen)
  const [isVisible, setIsVisible] = useState(isOpen)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (isOpen) {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
      setShouldRender(true)
      setIsVisible(true)
    } else {
      setIsVisible(false)
      timerRef.current = setTimeout(() => {
        setShouldRender(false)
        timerRef.current = null
      }, duration)
      return () => {
        if (timerRef.current) {
          clearTimeout(timerRef.current)
          timerRef.current = null
        }
      }
    }
  }, [isOpen, duration])

  return { shouldRender, isVisible }
}
