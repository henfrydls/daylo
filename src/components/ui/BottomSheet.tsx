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

export function BottomSheet({
  isOpen,
  onClose,
  children,
  'aria-label': ariaLabel = 'Bottom sheet',
}: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null)
  const { shouldRender, isVisible } = useAnimatedPresence(isOpen, ANIMATION_DURATION)

  // Two frames under the bottom edge before it comes up, with the frames belonging to the
  // opening that asked for them. This sheet had the same late-frame hole the day sheet
  // had: shut faster than they land and the next opening had nowhere to come up from.
  const sheetVisible = useArrival(isVisible)

  useFocusTrap(sheetRef, isOpen, { onEscape: onClose, autoFocus: false })

  // Drag state
  const [dragOffset, setDragOffset] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const [sheetHeight, setSheetHeight] = useState(0)
  const dragStartY = useRef(0)
  const dragStartX = useRef(0)

  // Measure sheet height when visible
  useEffect(() => {
    if (isVisible && sheetRef.current) {
      setSheetHeight(sheetRef.current.getBoundingClientRect().height)
    }
  }, [isVisible])

  /**
   * Where the finger went down, and nothing decided yet.
   *
   * It used to begin a drag here, on any touch at all. Everything inside the sheet is
   * something you tap, so every tap put the sheet into a drag for as long as the finger
   * was down: the backdrop's blur is cut while dragging, with no transition, so it blinked
   * off and back on under each press. Henfry filmed six of those in four seconds on the
   * Activities sheet, including the pencil.
   */
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    dragStartY.current = e.clientY
    dragStartX.current = e.clientX
  }, [])

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const deltaY = e.clientY - dragStartY.current
      if (!isDragging) {
        // Downwards, far enough to mean it, and more down than across. A tap never gets
        // here; a finger crossing the sheet diagonally does not take it with it.
        const deltaX = Math.abs(e.clientX - dragStartX.current)
        if (deltaY < DRAG_AT || deltaY <= deltaX) return
        setIsDragging(true)
      }
      setDragOffset(Math.max(0, deltaY))
    },
    [isDragging]
  )

  const handlePointerUp = useCallback(() => {
    if (!isDragging) return
    setIsDragging(false)

    if (sheetHeight > 0 && dragOffset > sheetHeight * DISMISS_THRESHOLD) {
      onClose()
    }
    setDragOffset(0)
  }, [isDragging, dragOffset, sheetHeight, onClose])

  // Reset drag state when closing
  useEffect(() => {
    if (!isOpen) {
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
        className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl shadow-xl max-h-[75dvh] overflow-y-auto touch-none"
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
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {/* Handle bar */}
        <div className="flex justify-center pt-3 pb-1 sticky top-0 bg-white rounded-t-2xl z-10 cursor-grab active:cursor-grabbing">
          <div className="w-10 h-1 bg-gray-300 rounded-full" aria-hidden="true" />
        </div>

        {/* Content */}
        <div className="px-4 pb-6 pt-2">{children}</div>
      </div>
    </div>
  )
}
