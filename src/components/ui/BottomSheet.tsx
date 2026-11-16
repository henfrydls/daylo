import { useRef, useCallback, useEffect, useState, type ReactNode } from 'react'
import { useAnimatedPresence, useArrival, useFocusTrap } from '../../hooks'
import { axisOf } from '../../lib/carousel'

interface BottomSheetProps {
  isOpen: boolean
  onClose: () => void
  children: ReactNode
  /** Where the focus goes on closing when what opened the sheet has gone. */
  fallbackFocus?: () => HTMLElement | null
  'aria-label'?: string
}

const ANIMATION_DURATION = 300
const DISMISS_THRESHOLD = 0.3

/**
 * What a press is doing, decided once and kept: `undecided` until it has gone far enough
 * to tell, then `drag` to take the sheet down, or one of the list's own: `scroll`, or
 * `none` for a finger going across or a press that came too late to drag.
 */
type Gesture = 'undecided' | 'scroll' | 'drag' | 'none'

/**
 * Where a press that has moved (dx, dy) since it went down is going, as far as this sheet
 * cares. One answer for the handle and the list, so the two cannot disagree about what a
 * drag is.
 *
 * Whether a finger is going down or across is the carousel's question, asked with its
 * `axisOf` and its eight pixels: the first two or three pixels of any press are noise, and
 * deciding there turns a tap into a drag. Before that, a press that leans down, a tie
 * included, is `leaning-down`: the list holds it back from the browser while it waits.
 * One pixel down and one across is the first move of many pulls, and not holding it back
 * gave the gesture to the browser and the pull no longer closed the sheet.
 */
function decideDrag(
  dx: number,
  dy: number
): 'drag' | 'up' | 'across' | 'leaning-down' | 'undecided' {
  const axis = axisOf(dx, dy)
  if (axis === 'horizontal') return 'across'
  if (axis === 'vertical') return dy > 0 ? 'drag' : 'up'
  return dy > 0 && dy >= Math.abs(dx) ? 'leaning-down' : 'undecided'
}

export function BottomSheet({
  isOpen,
  onClose,
  children,
  fallbackFocus,
  'aria-label': ariaLabel = 'Bottom sheet',
}: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const { shouldRender, isVisible } = useAnimatedPresence(isOpen, ANIMATION_DURATION)

  // Two frames under the bottom edge before it comes up, with the frames belonging to the
  // opening that asked for them. This sheet had the same late-frame hole the day sheet
  // had: shut faster than they land and the next opening had nowhere to come up from.
  const sheetVisible = useArrival(isVisible)

  useFocusTrap(sheetRef, isOpen, { onEscape: onClose, autoFocus: false, fallbackFocus })

  // Drag state. The state is what is drawn; the refs are what the next event reads, which
  // it needs before React has rendered anything, and which the list's own listeners need
  // without being added again on every move.
  const [dragOffset, setDragOffset] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const [sheetHeight, setSheetHeight] = useState(0)
  /**
   * Who is dragging the sheet, or null: one pointer on the handle, or one finger on the
   * list. Whoever begins a drag has it until they let go, and every other press is ignored
   * until it is let go too.
   *
   * The handle and the list each kept their own finger, so both could drag at once on the
   * same offset. When one let go, the other went on moving the sheet with nothing left to
   * release it, and it hung half way down the screen.
   */
  const owner = useRef<string | null>(null)
  const offset = useRef(0)
  const height = useRef(0)
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  // Measured whenever the sheet changes size, not only when it opens. "Show all" makes it
  // taller, and with the height it opened at, the 30% that closes it was 30% of a shorter
  // sheet, and going away it slid down by less than its own height and vanished the rest
  // of the way. An observer reports once as soon as it starts watching, so this is also
  // the first measurement.
  useEffect(() => {
    const node = sheetRef.current
    if (!isVisible || !node) return
    const observer = new ResizeObserver(() => {
      height.current = node.getBoundingClientRect().height
      setSheetHeight(height.current)
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [isVisible])

  /** Takes the drag for `who`, if nobody has it. Says whether it did. */
  const beginDrag = useCallback((who: string) => {
    if (owner.current !== null) return false
    owner.current = who
    setIsDragging(true)
    return true
  }, [])

  const moveDrag = useCallback((who: string, deltaY: number) => {
    if (owner.current !== who) return
    offset.current = Math.max(0, deltaY)
    setDragOffset(offset.current)
  }, [])

  /**
   * Taken away: back up, however far it had gone.
   *
   * A cancel is the system taking the finger, not the person letting go of the sheet: the
   * notification shade coming down, a call, switching apps. Read as a release, a sheet
   * pulled past 30% closed on its own when the phone rang.
   */
  const cancelDrag = useCallback((who: string) => {
    if (owner.current !== who) return
    owner.current = null
    setIsDragging(false)
    offset.current = 0
    setDragOffset(0)
  }, [])

  /** Let go: past 30% of the sheet it closes, and either way the drag is over. */
  const endDrag = useCallback(
    (who: string) => {
      if (owner.current !== who) return
      if (height.current > 0 && offset.current > height.current * DISMISS_THRESHOLD) {
        onCloseRef.current()
      }
      cancelDrag(who)
    },
    [cancelDrag]
  )

  // --- The handle: a drag from here, by finger or by mouse ---------------------------

  const dragStartY = useRef(0)
  const dragStartX = useRef(0)
  /**
   * Which pointer is actually down on the handle, or null.
   *
   * Without it a move was enough, and `dragStartY` begins at zero, so the first time a
   * pointer crossed the sheet at all it measured its own height as a drag: five hundred
   * and thirty-one pixels, past the distance that dismisses it. Nothing happened at once,
   * because the press that follows reads the flag React has not committed yet; the sheet
   * went the next time something was let go anywhere, which is how pressing Cancel on
   * "Delete Activity?" closed the panel the question was asked in.
   *
   * The listeners are on the handle and not on the sheet, which is also what keeps a
   * dialog opened from the list out of here: it renders through a portal, React bubbles
   * its events up the tree it knows, and that tree goes through the list, not the handle.
   */
  const pointer = useRef<number | null>(null)
  /** Whether the press began in the invisible strip above the sheet's edge. */
  const pressedAbove = useRef(false)
  /** What this press on the handle is doing, decided once, as the list's is. */
  const handleGesture = useRef<Gesture>('none')
  const handleOwner = (pointerId: number) => `pointer:${pointerId}`

  /**
   * Where the finger went down, and nothing decided yet.
   *
   * It used to begin a drag here, on any touch at all. Everything inside the sheet is
   * something you tap, so every tap put the sheet into a drag for as long as the finger
   * was down: the backdrop's blur is cut while dragging, with no transition, so it blinked
   * off and back on under each press. Henfry filmed six of those in four seconds on the
   * Activities sheet, including the pencil.
   *
   * Captured, so that the release reaches the handle wherever it happens. A mouse let go
   * above the sheet used to leave it mid-drag, following the pointer with no button down.
   * Only the main button: a right click opens a menu that can swallow the release, and
   * the handle was left waiting for one move to start dragging.
   */
  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (pointer.current !== null || e.button !== 0) return
    pointer.current = e.pointerId
    dragStartY.current = e.clientY
    dragStartX.current = e.clientX
    pressedAbove.current = e.clientY < e.currentTarget.getBoundingClientRect().top
    // Somebody is already dragging from the list: this press waits until it is let go.
    handleGesture.current = owner.current === null ? 'undecided' : 'none'
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }, [])

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (pointer.current !== e.pointerId) return
      const who = handleOwner(e.pointerId)
      if (handleGesture.current === 'undecided') {
        // Downwards, far enough to mean it, and more down than across. A tap never gets
        // here; a finger crossing the sheet diagonally does not take it with it, and does
        // not take it later either by turning downwards.
        const went = decideDrag(e.clientX - dragStartX.current, e.clientY - dragStartY.current)
        if (went === 'across' || went === 'up') handleGesture.current = 'none'
        if (went !== 'drag') return
        // Followed from here, not from where the finger went down: counting the pixels
        // spent deciding made the sheet jump that far the moment it began to move.
        dragStartY.current = e.clientY
        handleGesture.current = beginDrag(who) ? 'drag' : 'none'
      }
      if (handleGesture.current === 'drag') moveDrag(who, e.clientY - dragStartY.current)
    },
    [beginDrag, moveDrag]
  )

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (pointer.current !== e.pointerId) return
      pointer.current = null
      const was = handleGesture.current
      handleGesture.current = 'none'
      if (was === 'drag') {
        endDrag(handleOwner(e.pointerId))
        return
      }
      // The strip above the edge is outside the sheet to the eye, so a tap there is a tap
      // outside, and closes it like one. Without this, it was the one place above the
      // sheet where tapping did nothing.
      const went = axisOf(e.clientX - dragStartX.current, e.clientY - dragStartY.current)
      if (was === 'undecided' && pressedAbove.current && went === 'undecided') {
        onCloseRef.current()
      }
    },
    [endDrag]
  )

  const handlePointerCancel = useCallback(
    (e: React.PointerEvent) => {
      if (pointer.current !== e.pointerId) return
      pointer.current = null
      handleGesture.current = 'none'
      cancelDrag(handleOwner(e.pointerId))
    },
    [cancelDrag]
  )

  // --- The list: a drag from here only from the top, and only downwards --------------

  /**
   * With the list at the top, a finger going down on it takes the sheet down.
   *
   * The list scrolls (`touch-action: pan-y`), and that hands every vertical gesture to the
   * browser, including the one that has nothing to scroll: with one to three activities
   * the sheet fits, and a pull down on it did nothing at all. So the list listens for itself
   * and keeps that one gesture back from the browser, with `preventDefault` on a listener
   * that is not passive: at the top, and going down. Anything else is the browser's scroll,
   * untouched.
   *
   * Held back while still undecided, if it leans down. Measured in Chromium: when the first
   * move the page sees is not held back, every move after it arrives too late to hold
   * back, so the browser has the gesture for good even with nothing to scroll. Holding
   * back one that then turns upwards costs nothing, measured too: the next move that is
   * not held back starts the scroll. A finger leaning across is never held back.
   *
   * Decided at the start and kept. A gesture that began with the list scrolled is a scroll
   * even when the list reaches the top under the finger, or the sheet would set off down
   * the screen in the middle of somebody scrolling back up; the next one can close it. And
   * a gesture that went up first is a scroll even if it comes back down.
   *
   * One finger: the one that began it, and only if nobody else is dragging the sheet. A
   * second finger on the list used to end the drag, and past 30% that closed the sheet.
   *
   * Two limits, known and accepted. A gesture that has become a drag stays one: if the
   * finger turns back up, the sheet follows it back to rest but the list does not scroll in
   * that same touch; the next touch does. And the list reads its own `scrollTop` only: a
   * child with a scroll of its own would have its pulls taken for the list's, at the top
   * and going down. No sheet has one today.
   */
  useEffect(() => {
    const list = listRef.current
    // Made again each time the sheet opens or closes, which forgets any finger and any
    // gesture from before. Closed with Escape in the middle of a drag, the finger that was
    // dragging lived on, and moved the sheet of the next opening.
    if (!shouldRender || !list || !isOpen) return
    let gesture: Gesture = 'none'
    let finger: number | null = null
    let startX = 0
    let startY = 0
    const who = () => `touch:${finger}`

    const ours = (touches: TouchList) => {
      for (let i = 0; i < touches.length; i++) {
        if (touches[i].identifier === finger) return touches[i]
      }
      return null
    }

    const onStart = (e: TouchEvent) => {
      if (finger !== null) return
      const touch = e.changedTouches[0]
      finger = touch.identifier
      startX = touch.clientX
      startY = touch.clientY
      if (owner.current !== null) gesture = 'none'
      else gesture = list.scrollTop <= 0 ? 'undecided' : 'scroll'
    }

    const onMove = (e: TouchEvent) => {
      const touch = ours(e.changedTouches)
      if (!touch || gesture === 'scroll' || gesture === 'none') return
      if (gesture === 'undecided') {
        const deltaX = touch.clientX - startX
        const deltaY = touch.clientY - startY
        if (deltaX === 0 && deltaY === 0) return
        if (list.scrollTop > 0) {
          gesture = 'scroll'
          return
        }
        const went = decideDrag(deltaX, deltaY)
        if (went === 'leaning-down') {
          if (e.cancelable) e.preventDefault()
          return
        }
        if (went === 'across') {
          gesture = 'none'
          return
        }
        if (went !== 'drag') {
          // Up, or not leaning down, and not held back: from here the browser has it.
          gesture = 'scroll'
          return
        }
        // Followed from here, as the handle is: no jump by the pixels spent deciding.
        startY = touch.clientY
        if (!beginDrag(who())) {
          gesture = 'none'
          return
        }
        gesture = 'drag'
      }
      if (e.cancelable) e.preventDefault()
      moveDrag(who(), touch.clientY - startY)
    }

    const finish = (e: TouchEvent, release: boolean) => {
      if (!ours(e.changedTouches)) return
      if (gesture === 'drag') {
        if (release) endDrag(who())
        else cancelDrag(who())
      }
      finger = null
      gesture = 'none'
    }
    const onEnd = (e: TouchEvent) => finish(e, true)
    const onCancel = (e: TouchEvent) => finish(e, false)

    list.addEventListener('touchstart', onStart, { passive: true })
    list.addEventListener('touchmove', onMove, { passive: false })
    list.addEventListener('touchend', onEnd)
    list.addEventListener('touchcancel', onCancel)
    return () => {
      list.removeEventListener('touchstart', onStart)
      list.removeEventListener('touchmove', onMove)
      list.removeEventListener('touchend', onEnd)
      list.removeEventListener('touchcancel', onCancel)
    }
  }, [shouldRender, isOpen, beginDrag, moveDrag, endDrag, cancelDrag])

  // Nothing carried over from one opening to the next, in either direction: closed in the
  // middle of a drag, the drag ends there, and a sheet that opens always opens at rest.
  useEffect(() => {
    owner.current = null
    offset.current = 0
    pointer.current = null
    handleGesture.current = 'none'
    /* eslint-disable react-hooks/set-state-in-effect */
    setDragOffset(0)
    setIsDragging(false)
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [isOpen])

  if (!shouldRender) return null

  const maxDrag = sheetHeight || 400
  const backdropOpacity = isDragging
    ? Math.max(0, 0.3 * (1 - dragOffset / maxDrag))
    : sheetVisible
      ? 0.3
      : 0

  const translateY = sheetVisible ? dragOffset : sheetHeight || 400

  return (
    <div className="fixed inset-0 z-30" data-testid="bottom-sheet-container">
      {/* Backdrop */}
      <div
        className="absolute inset-0 transition-[opacity,backdrop-filter]"
        style={{
          backgroundColor: `rgba(0, 0, 0, ${backdropOpacity})`,
          // Faded with the drag rather than switched off by it. Cutting it meant the
          // blur and the dimming disagreed the whole way down: one gone at once, the
          // other easing away with the sheet.
          backdropFilter: `blur(${sheetVisible ? 4 * (1 - Math.min(1, dragOffset / maxDrag)) : 0}px)`,
          transitionDuration: isDragging ? '0ms' : sheetVisible ? '300ms' : '200ms',
        }}
        onClick={onClose}
        aria-hidden="true"
        data-testid="bottom-sheet-backdrop"
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl shadow-xl max-h-[75dvh] flex flex-col"
        style={{
          transform: `translateY(${translateY}px)`,
          transition: isDragging
            ? 'none'
            : sheetVisible
              ? 'transform 300ms var(--ease-emphasized-decel)'
              : 'transform 200ms var(--ease-emphasized-accel)',
        }}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        data-testid="bottom-sheet"
      >
        {/* Handle bar. The only place a finger is never scrolling, so a drag from here
            closes the sheet however far the list has gone. Its grey bar and the gap under
            it are 28 pixels, under the 44 a thumb needs; the rest is an invisible strip
            above the sheet's edge, so the list stays exactly where it was and nothing in
            it is covered. */}
        <div
          className="relative shrink-0 flex justify-center pt-3 pb-3 bg-white rounded-t-2xl cursor-grab active:cursor-grabbing touch-none before:absolute before:inset-x-0 before:-top-4 before:h-4 before:content-['']"
          data-testid="bottom-sheet-handle"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          onLostPointerCapture={handlePointerCancel}
        >
          <div className="w-10 h-1 bg-gray-300 rounded-full" aria-hidden="true" />
        </div>

        {/* Content. It scrolls, and keeps its scroll to itself at either end rather than
            handing it on to the page behind. */}
        <div
          ref={listRef}
          className="min-h-0 overflow-y-auto overscroll-contain touch-pan-y px-4 pb-[calc(1.5rem+var(--inset-bottom))]"
          data-testid="bottom-sheet-list"
        >
          {children}
        </div>
      </div>
    </div>
  )
}
