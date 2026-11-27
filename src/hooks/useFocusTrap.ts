import { useEffect, useRef, type RefObject } from 'react'
import { onAndroidBack } from '../lib/androidBack'
import { reachable } from '../lib/onScreen'
import { isTab } from '../lib/keys'
import { nextTabbable } from '../lib/tabbable'
import { focusFromKeyboard, giveFocusBack } from '../lib/quietFocus'

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

/**
 * The traps that are switched on, oldest first, so one that closes with nowhere to send the
 * focus can give it to the one underneath: the delete confirmation over the activities
 * panel, whose opener was the row it deleted.
 */
const openTraps: Array<RefObject<HTMLElement | null>> = []

/**
 * The first control in a trap that the focus can land on (see lib/tabbable). With none, the
 * trap itself, made focusable by script only for as long as it holds the focus, so the
 * focus is at least inside it.
 */
function firstReachable(container: HTMLElement): HTMLElement {
  const first = nextTabbable(container, null, false)
  if (first !== null) return first
  if (!container.hasAttribute('tabindex')) {
    container.tabIndex = -1
    // Taken away when the focus goes somewhere else on the page, and not when the window
    // loses it (another app, the system's own dialog): that comes back to the panel.
    const onFocusOut = (e: FocusEvent) => {
      if (e.target !== container || e.relatedTarget === null) return
      container.removeAttribute('tabindex')
      container.removeEventListener('focusout', onFocusOut)
    }
    container.addEventListener('focusout', onFocusOut)
  }
  return container
}

interface UseFocusTrapOptions {
  /** Callback when Escape key is pressed */
  onEscape?: () => void
  /** Whether to restore focus to the previously focused element when deactivated */
  restoreFocus?: boolean
  /** Whether to auto-focus the first focusable element when activated */
  autoFocus?: boolean
  /**
   * Where the focus goes back to when what opened the trap is no longer on the page. The
   * first activity replaces the door that opened the day sheet with the Today bar, and
   * deleting the last one takes away the round button that opened the activities panel.
   */
  fallbackFocus?: () => HTMLElement | null
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
  const { onEscape, restoreFocus = true, autoFocus = true, fallbackFocus } = options
  const previousActiveElement = useRef<HTMLElement | null>(null)
  // In a ref for the same reason as Escape below: read when the trap lets go, not when it
  // was set up.
  const fallback = useRef(fallbackFocus)
  useEffect(() => {
    fallback.current = fallbackFocus
  })

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
    openTraps.push(containerRef)

    // Lock body scroll
    document.body.style.overflow = 'hidden'

    // Auto-focus the first control that can have the focus
    // Cancelled if the trap lets go first: opened and closed in one go (a double activation,
    // StrictMode), the timer put the focus inside a sheet that was already closed.
    const firstFocus =
      autoFocus && container
        ? setTimeout(() => nextTabbable(container, null, false)?.focus(), 0)
        : undefined

    // The last thing that had the focus, so that focus found on <body> at the end can be
    // told apart: dropped there from the sheet or from its opener (a tap on the backdrop),
    // or from somewhere else on the page. <body> never gets a focusin of its own.
    let lastFocused: Element | null = document.activeElement
    const onFocusIn = (e: FocusEvent) => {
      lastFocused = e.target as Element
    }
    document.addEventListener('focusin', onFocusIn)

    return () => {
      clearTimeout(firstFocus)
      document.removeEventListener('focusin', onFocusIn)
      // Restore body scroll
      document.body.style.overflow = 'unset'

      const at = openTraps.lastIndexOf(containerRef)
      // The traps opened over this one and still switched on. Import's confirmation and the
      // Import dialog close in one commit; the confirmation is drawn through a portal, so it
      // is not inside the dialog on the page, and as the dialog's sibling its trap lets go
      // after the dialog's. Focus on it is focus in front of this trap, and this trap's to
      // give back to what opened it.
      const above = at === -1 ? [] : openTraps.slice(at + 1)
      if (at !== -1) openTraps.splice(at, 1)
      if (!restoreFocus) return

      // The container as it is now, and not as it was when the trap switched on: the day
      // sheet is put on the page a render after it opens, so that one was always null and
      // the focus was never given back from it at all.
      // eslint-disable-next-line react-hooks/exhaustive-deps -- the node now, on purpose
      const holder = containerRef.current ?? container
      const active = document.activeElement
      const within = (node: Element | null) =>
        node !== null &&
        ((holder?.contains(node) ?? false) || above.some((trap) => trap.current?.contains(node)))
      const inside = within(active)
      const lost = active === null || active === document.body
      // Dropped on <body> from the sheet or from what opened it, and nowhere else.
      const fellFromHere =
        lost && (within(lastFocused) || lastFocused === previousActiveElement.current)

      // Back to what opened it, when somebody could still be there. <body> is not
      // somewhere to go back to: the door in Year has gone into the hidden view by the time
      // the day sheet opens, and the focus went with it.
      const before = previousActiveElement.current
      if (before !== null && before !== document.body && reachable(before)) {
        // From inside, or from <body> when it fell there from the sheet or the opener,
        // which is what a tap on the backdrop does. That one was left where it fell while
        // giving it back scrolled the page to the opener and lit a ring after a tap;
        // giveFocusBack does neither, and <body> is where Tab starts again from the top of
        // the page. Focus taken by something else on the page, or dropped from it, stays.
        if (inside || fellFromHere) giveFocusBack(before)
        return
      }
      // Nowhere to go back to. From inside, or lost to the page when what held it went
      // away: into the trap underneath while one is open, so the focus does not go behind
      // a panel that is still there; with none, to what replaced the opener on the page.
      if (!inside && !lost) return
      const underneath = openTraps[openTraps.length - 1]?.current ?? null
      const target = underneath !== null ? firstReachable(underneath) : fallback.current?.()
      if (target) giveFocusBack(target)
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

  // Focus trap - handle Tab and Shift+Tab. On the document and with the container read at
  // the key, not when the trap switched on: the activities panel and the day sheet are put
  // on the page a render after they open, so there was no container to listen on then,
  // and Tab walked out of them. Only the trap in front answers, or the one underneath would
  // take the same key and pull the focus out of the one in front.
  useEffect(() => {
    if (!isActive) return

    const handleKeyDown = (e: KeyboardEvent) => {
      // A control that answers Tab itself, and said so, keeps it.
      if (!isTab(e) || e.defaultPrevented) return
      // The highest one that is on the page: a trap switched on a render before its
      // container arrives leaves Tab to the one underneath until then, rather than to nobody.
      const front = [...openTraps].reverse().find((trap) => trap.current !== null)
      if (front !== containerRef) return
      const container = containerRef.current
      if (container === null) return

      // Every Tab, moved here and never left to the browser. In WKWebView on a Mac with
      // "Keyboard navigation" off, which is how a Mac comes, the browser's own Tab visits
      // fields and selects only, so from a button in the middle of a sheet it went to the
      // page behind. Leaving the middle to the browser and wrapping at the ends was not
      // enough there. From outside the trap (the opener the sheets leave the focus on,
      // <body> after a tap on nothing) it comes in at the end the key is going towards;
      // from something inside that Tab does not stop at, to its neighbour on the page.
      e.preventDefault()
      // With the ring: a Tab is the keyboard, however the focus got here (see quietFocus).
      const next = nextTabbable(container, document.activeElement, e.shiftKey)
      if (next !== null) {
        focusFromKeyboard(next)
        return
      }
      // With nothing inside that can have it, the sheet itself holds it, so it is at least
      // not behind the sheet. Without a ring: one around the whole panel says nothing.
      firstReachable(container).focus()
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isActive, containerRef])
}
