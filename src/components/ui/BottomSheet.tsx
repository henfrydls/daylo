import { useRef, useCallback, useEffect, useState, type ReactNode } from 'react'
import { useAnimatedPresence, useArrival, useFocusTrap } from '../../hooks'

interface BottomSheetProps {
  isOpen: boolean
  onClose: () => void
  children: ReactNode
  'aria-label'?: string
}

const ANIMATION_DURATION = 300
const DISMISS_THRESHOLD = 0.3

/**
 * How far down a finger goes before the sheet is being dragged rather than touched.
 *
 * The same eight pixels the carousel uses to decide what a gesture is, and for the same
 * reason: the first two or three pixels of any press are noise, and deciding there turns
 * a tap into a drag.
 */
const DRAG_AT = 8

/**
 * What a finger on the list is doing, decided once per gesture.
 *
 * `undecided` only while the list is at the top and the finger has not gone anywhere yet;
 * `scroll` is the list's own, and stays that for the rest of the gesture even if the list
 * reaches the top under it; `drag` takes the sheet down; `none` is a finger going across.
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

  const measure = useCallback(() => {
    const node = sheetRef.current
    if (!node) return
    height.current = node.getBoundingClientRect().height
    setSheetHeight(height.current)
  }, [])

  // Measured again whenever the sheet changes size, not only when it opens. "Show all"
  // makes it taller, and with the height it opened at, the 30% that closes it was 30% of
  // a shorter sheet, and going away it slid down by less than its own height and vanished
  // the rest of the way.
  useEffect(() => {
    if (!isVisible || !sheetRef.current) return
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(sheetRef.current)
    return () => observer.disconnect()
  }, [isVisible, measure])

  const beginDrag = useCallback(() => {
    // And once more at the start of each drag, which is the moment the number is used.
    measure()
    dragging.current = true
    setIsDragging(true)
  }, [measure])

  const moveDrag = useCallback((deltaY: number) => {
    offset.current = Math.max(0, deltaY)
    setDragOffset(offset.current)
  }, [])

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
   */
  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (pointer.current !== null) return
    pointer.current = e.pointerId
    dragStartY.current = e.clientY
    dragStartX.current = e.clientX
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }, [])

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (pointer.current !== e.pointerId) return
      const deltaY = e.clientY - dragStartY.current
      if (!dragging.current) {
        // Downwards, far enough to mean it, and more down than across. A tap never gets
        // here; a finger crossing the sheet diagonally does not take it with it.
        const deltaX = Math.abs(e.clientX - dragStartX.current)
        if (deltaY < DRAG_AT || deltaY <= deltaX) return
        beginDrag()
      }
      moveDrag(deltaY)
    },
    [beginDrag, moveDrag]
  )

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (pointer.current !== e.pointerId) return
      pointer.current = null
      endDrag()
    },
    [endDrag]
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
   * Decided at the start and kept. A gesture that began with the list scrolled is a scroll
   * even when the list reaches the top under the finger, or the sheet would set off down
   * the screen in the middle of somebody scrolling back up; the next one can close it. And
   * a gesture that went up first is a scroll even if it comes back down.
   */
  useEffect(() => {
    const list = listRef.current
    if (!shouldRender || !list) return
    let gesture: ListGesture = 'none'
    let startX = 0
    let startY = 0

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) {
        if (gesture === 'drag') endDrag()
        gesture = 'none'
        return
      }
      startX = e.touches[0].clientX
      startY = e.touches[0].clientY
      gesture = list.scrollTop <= 0 ? 'undecided' : 'scroll'
    }

    const onMove = (e: TouchEvent) => {
      if (gesture === 'scroll' || gesture === 'none') return
      const deltaY = e.touches[0].clientY - startY
      if (gesture === 'undecided') {
        if (deltaY < 0 || list.scrollTop > 0) {
          gesture = 'scroll'
          return
        }
        if (deltaY === 0) return
        // Held back from the browser from the first pixel down, not from the eighth:
        // by then it has already taken the gesture for a scroll and will not give it up.
        if (e.cancelable) e.preventDefault()
        const deltaX = Math.abs(e.touches[0].clientX - startX)
        if (deltaY < DRAG_AT && deltaX < DRAG_AT) return
        if (deltaY <= deltaX) {
          gesture = 'none'
          return
        }
        gesture = 'drag'
        beginDrag()
      }
      if (e.cancelable) e.preventDefault()
      moveDrag(deltaY)
    }

    const onEnd = () => {
      if (gesture === 'drag') endDrag()
      gesture = 'none'
    }

    list.addEventListener('touchstart', onStart, { passive: true })
    list.addEventListener('touchmove', onMove, { passive: false })
    list.addEventListener('touchend', onEnd)
    list.addEventListener('touchcancel', onEnd)
    return () => {
      list.removeEventListener('touchstart', onStart)
      list.removeEventListener('touchmove', onMove)
      list.removeEventListener('touchend', onEnd)
      list.removeEventListener('touchcancel', onEnd)
    }
  }, [shouldRender, beginDrag, moveDrag, endDrag])

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
          onPointerCancel={handlePointerUp}
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
