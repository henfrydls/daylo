import { useEffect, useRef, type RefObject } from 'react'

const FOCUSABLE_SELECTOR =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

interface UseFocusTrapOptions {
  /** Callback when Escape key is pressed */
  onEscape?: () => void
  /** Whether to restore focus to the previously focused element when deactivated */
  restoreFocus?: boolean
  /** Whether to auto-focus the first focusable element when activated */
  autoFocus?: boolean
}

/**
 * Hook that traps focus within a container element for accessibility.
 * Handles Tab/Shift+Tab cycling, Escape key, and focus restoration.
 *
 * @param containerRef - Ref to the container element
 * @param isActive - Whether the focus trap is active
 * @param options - Configuration options
 */
export function useFocusTrap(
  containerRef: RefObject<HTMLElement | null>,
  isActive: boolean,
  options: UseFocusTrapOptions = {}
): void {
  const { onEscape, restoreFocus = true, autoFocus = true } = options
  const previousActiveElement = useRef<HTMLElement | null>(null)

  // Store the previously focused element and handle body scroll lock
  useEffect(() => {
    if (!isActive) return

    // Store the previously focused element
    if (restoreFocus) {
      previousActiveElement.current = document.activeElement as HTMLElement
    }

    // Lock body scroll
    document.body.style.overflow = 'hidden'

    // Auto-focus the first focusable element
    if (autoFocus && containerRef.current) {
      setTimeout(() => {
        const firstFocusable = containerRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)
        firstFocusable?.focus()
      }, 0)
    }

    return () => {
      // Restore body scroll
      document.body.style.overflow = 'unset'

      // Restore focus only on keyboard-driven close (focus still inside container)
      // Mouse clicks on backdrop/Done move focus outside, so skip restoration
      if (restoreFocus && previousActiveElement.current && containerRef.current?.contains(document.activeElement)) {
        previousActiveElement.current.focus()
      }
    }
  }, [isActive, restoreFocus, autoFocus, containerRef])

  // Handle Escape key
  useEffect(() => {
    if (!isActive || !onEscape) return

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onEscape()
      }
    }

    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isActive, onEscape])

  // Focus trap - handle Tab and Shift+Tab
  useEffect(() => {
    if (!isActive || !containerRef.current) return

    const container = containerRef.current

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return

      const focusableElements = container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      if (focusableElements.length === 0) return

      const firstElement = focusableElements[0]
      const lastElement = focusableElements[focusableElements.length - 1]

      if (e.shiftKey) {
        // Shift+Tab: if on first element, go to last
        if (document.activeElement === firstElement) {
          e.preventDefault()
          lastElement?.focus()
        }
      } else {
        // Tab: if on last element, go to first
        if (document.activeElement === lastElement) {
          e.preventDefault()
          firstElement?.focus()
        }
      }
    }

    container.addEventListener('keydown', handleKeyDown)

    return () => {
      container.removeEventListener('keydown', handleKeyDown)
    }
  }, [isActive, containerRef])
}
