import { useEffect, useRef, type RefObject } from 'react'
import { onAndroidBack } from '../lib/androidBack'

/**
 * Everything on screen that answers Escape, oldest first. Only the last one does.
 *
 * Each trap listened on `document`, so Escape reached all of them at once and a dialog
 * opened from inside a sheet took the sheet with it when it closed. Android never had the
 * fault: `onAndroidBack` has kept a stack from the day it was written, and the comment
 * below says the two are one gesture. They are now.
 *
 * A module-level array rather than a context, for the same reason the Android one is: what
 * is in front of what is a fact about the screen, not about any tree of components, and a
 * dialog rendered through a portal is in nobody's tree.
 */
const answeringEscape: Array<{ fire: () => void }> = []

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

  // Handle Escape key. Through the ref and on [isActive] alone, exactly as the Android
  // half above: a dialog whose onEscape is written inline gets a new one every render, and
  // re-registering would put it back on top of the stack while something else is in front.
  useEffect(() => {
    if (!isActive || escape.current === undefined) return

    const mine = { fire: () => escape.current?.() }
    answeringEscape.push(mine)

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // Only what is in front. Everything else is behind something and keeps its place.
      if (answeringEscape[answeringEscape.length - 1] !== mine) return
      mine.fire()
    }

    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('keydown', handleEscape)
      const at = answeringEscape.lastIndexOf(mine)
      if (at !== -1) answeringEscape.splice(at, 1)
    }
  }, [isActive])

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
