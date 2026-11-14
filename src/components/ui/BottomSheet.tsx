import { useRef, useCallback, useEffect, useState, type ReactNode } from 'react'
import { useAnimatedPresence, useArrival, useFocusTrap } from '../../hooks'
import { axisOf } from '../../lib/carousel'

interface BottomSheetProps {
  isOpen: boolean
  onClose: () => void
  children: ReactNode
  'aria-label'?: string
}

const ANIMATION_DURATION = 300
const DISMISS_THRESHOLD = 0.3

/**
 * What a finger on the list is doing, decided once per gesture.
 *
 * `undecided` only while the list is at the top and the finger has not gone anywhere yet;
 * `scroll` is the list's own, and stays that for the rest of the gesture even if the list
 * reaches the top under it; `drag` takes the sheet down; `none` is a finger going across.
 *
 * Whether a finger is going down or across is the carousel's question, asked with its
 * `axisOf` and its eight pixels: the first two or three pixels of any press are noise, and
 * deciding there turns a tap into a drag.
 */
type ListGesture = 'undecided' | 'scroll' | 'drag' | 'none'

export function BottomSheet({
  isOpen,
  onClose,
  children,
  'aria-label': ariaLabel = 'Bottom sheet',
}: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const { shouldRender, isVisible } = useAnimatedPresence(isOpen, ANIMATION_DURATION)

  // Two frames under the bottom edge before it comes up, with the frames belonging to the
  // opening that asked for them. This sheet had the same late-frame hole the day sheet
  // had: shut faster than they land and the next opening had nowhere to come up from.
  const sheetVisible = useArrival(isVisible)

  useFocusTrap(sheetRef, isOpen, { onEscape: onClose, autoFocus: false })

  // Drag state. The state is what is drawn; the refs are what the next event reads, which
  // it needs before React has rendered anything, and which the list's own listeners need
  // without being added again on every move.
  const [dragOffset, setDragOffset] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const [sheetHeight, setSheetHeight] = useState(0)
  const dragging = useRef(false)
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

  const beginDrag = useCallback(() => {
    dragging.current = true
    setIsDragging(true)
  }, [])

  const moveDrag = useCallback((deltaY: number) => {
    offset.current = Math.max(0, deltaY)
    setDragOffset(offset.current)
  }, [])

  /** Let go: past 30% of the sheet it closes, short of that it goes back up. */
  const endDrag = useCallback(() => {
    if (!dragging.current) return
    dragging.current = false
    setIsDragging(false)
    if (height.current > 0 && offset.current > height.current * DISMISS_THRESHOLD) {
      onCloseRef.current()
    }
    offset.current = 0
    setDragOffset(0)
  }, [])

  /**
   * Taken away: back up, however far it had gone.
   *
   * A cancel is the system taking the finger, not the person letting go of the sheet: the
   * notification shade coming down, a call, switching apps. Read as a release, a sheet
   * pulled past 30% closed on its own when the phone rang.
   */
  const cancelDrag = useCallback(() => {
    if (!dragging.current) return
    dragging.current = false
    setIsDragging(false)
    offset.current = 0
    setDragOffset(0)
  }, [])

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
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }, [])

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (pointer.current !== e.pointerId) return
      if (!dragging.current) {
        // Downwards, far enough to mean it, and more down than across. A tap never gets
        // here; a finger crossing the sheet diagonally does not take it with it.
        const deltaY = e.clientY - dragStartY.current
        const axis = axisOf(e.clientX - dragStartX.current, deltaY)
        if (axis !== 'vertical' || deltaY <= 0) return
        // Followed from here, not from where the finger went down: counting the pixels
        // spent deciding made the sheet jump that far the moment it began to move.
        dragStartY.current = e.clientY
        beginDrag()
      }
      moveDrag(e.clientY - dragStartY.current)
    },
    [beginDrag, moveDrag]
  )

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (pointer.current !== e.pointerId) return
      pointer.current = null
      if (dragging.current) {
        endDrag()
        return
      }
      // The strip above the edge is outside the sheet to the eye, so a tap there is a tap
      // outside, and closes it like one. Without this, it was the one place above the
      // sheet where tapping did nothing.
      const went = axisOf(e.clientX - dragStartX.current, e.clientY - dragStartY.current)
      if (pressedAbove.current && went === 'undecided') onCloseRef.current()
    },
    [endDrag]
  )

  const handlePointerCancel = useCallback(
    (e: React.PointerEvent) => {
      if (pointer.current !== e.pointerId) return
      pointer.current = null
      cancelDrag()
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
   * One finger: the one that began it. A second finger on the list used to end the drag,
   * and past 30% that closed the sheet.
   */
  useEffect(() => {
    const list = listRef.current
    if (!shouldRender || !list) return
    let gesture: ListGesture = 'none'
    let finger: number | null = null
    let startX = 0
    let startY = 0

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
      gesture = list.scrollTop <= 0 ? 'undecided' : 'scroll'
    }

    const onMove = (e: TouchEvent) => {
      const touch = ours(e.changedTouches)
      if (!touch || gesture === 'scroll' || gesture === 'none') return
      if (gesture === 'undecided') {
        const deltaX = touch.clientX - startX
        const deltaY = touch.clientY - startY
        if (deltaY < 0 || list.scrollTop > 0) {
          gesture = 'scroll'
          return
        }
        const axis = axisOf(deltaX, deltaY)
        if (axis === 'undecided') {
          if (deltaY > Math.abs(deltaX) && e.cancelable) e.preventDefault()
          return
        }
        if (axis === 'horizontal') {
          gesture = 'none'
          return
        }
        gesture = 'drag'
        // Followed from here, as the handle is: no jump by the pixels spent deciding.
        startY = touch.clientY
        beginDrag()
      }
      if (e.cancelable) e.preventDefault()
      moveDrag(touch.clientY - startY)
    }

    const finish = (e: TouchEvent, release: boolean) => {
      if (!ours(e.changedTouches)) return
      finger = null
      if (gesture === 'drag') {
        if (release) endDrag()
        else cancelDrag()
      }
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
  }, [shouldRender, beginDrag, moveDrag, endDrag, cancelDrag])

  // Reset drag state when closing
  useEffect(() => {
    if (!isOpen) {
      dragging.current = false
      offset.current = 0
      pointer.current = null
      /* eslint-disable react-hooks/set-state-in-effect */
      setDragOffset(0)
      setIsDragging(false)
      /* eslint-enable react-hooks/set-state-in-effect */
    }
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
          className="min-h-0 overflow-y-auto overscroll-contain touch-pan-y px-4 pb-6"
          data-testid="bottom-sheet-list"
        >
          {children}
        </div>
      </div>
    </div>
  )
}
