import { useEffect, useRef, type RefObject } from 'react'
import { onAndroidBack } from '../lib/androidBack'

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

  // Android's back button, in the same place as Escape and for the same reason: they are
  // one gesture, "take away the thing in front of me". Here rather than in each dialog
  // because everything that traps focus is something in front of you, so the ones that
  // exist and the ones nobody has written yet are covered by the same line.
  //
  // The handler is kept in a ref so that a dialog whose onEscape changes identity between
  // renders does not register and unregister on every render: the registration is what
  // tells Android to stop handling the press, and it should last exactly as long as the
  // dialog does.
  const escape = useRef(onEscape)
  // In an effect and not during render, which is both the rule and the right time: a press
  // can only arrive after a render has been committed.
  useEffect(() => {
    escape.current = onEscape
  })
  useEffect(() => {
    if (!isActive || escape.current === undefined) return
    return onAndroidBack(() => escape.current?.())
  }, [isActive])

  // Store the previously focused element and handle body scroll lock
  useEffect(() => {
    if (!isActive) return

    // Store the previously focused element
    if (restoreFocus) {
      previousActiveElement.current = document.activeElement as HTMLElement
    }

    // Capture container node for cleanup (React hooks/exhaustive-deps rule)
    const container = containerRef.current

    // Lock body scroll
    document.body.style.overflow = 'hidden'

    // Auto-focus the first focusable element
    if (autoFocus && container) {
      setTimeout(() => {
        const firstFocusable = container?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)
        firstFocusable?.focus()
      }, 0)
    }

    return () => {
      // Restore body scroll
      document.body.style.overflow = 'unset'

      // Restore focus only on keyboard-driven close (focus still inside container)
      // Mouse clicks on backdrop/Done move focus outside, so skip restoration
      if (
        restoreFocus &&
        previousActiveElement.current &&
        container?.contains(document.activeElement)
      ) {
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
