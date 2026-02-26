import { useRef, useCallback, useEffect, useState, type ReactNode } from 'react'
import { useFocusTrap, useAnimatedPresence } from '../../hooks'

interface BottomSheetProps {
  isOpen: boolean
  onClose: () => void
  children: ReactNode
  'aria-label'?: string
}

const ANIMATION_DURATION = 300
const DISMISS_THRESHOLD = 0.3

export function BottomSheet({
  isOpen,
  onClose,
  children,
  'aria-label': ariaLabel = 'Bottom sheet',
}: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null)
  const { shouldRender, isVisible } = useAnimatedPresence(isOpen, ANIMATION_DURATION)

  useFocusTrap(sheetRef, isOpen, { onEscape: onClose, autoFocus: false })

  // Drag state
  const [dragOffset, setDragOffset] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const dragStartY = useRef(0)
  const sheetHeight = useRef(0)

  // Measure sheet height when visible
  useEffect(() => {
    if (isVisible && sheetRef.current) {
      sheetHeight.current = sheetRef.current.getBoundingClientRect().height
    }
  }, [isVisible])

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    dragStartY.current = e.clientY
    setIsDragging(true)
  }, [])

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging) return
      const deltaY = e.clientY - dragStartY.current
      setDragOffset(Math.max(0, deltaY))
    },
    [isDragging]
  )

  const handlePointerUp = useCallback(() => {
    if (!isDragging) return
    setIsDragging(false)

    if (sheetHeight.current > 0 && dragOffset > sheetHeight.current * DISMISS_THRESHOLD) {
      onClose()
    }
    setDragOffset(0)
  }, [isDragging, dragOffset, onClose])

  // Reset drag state when closing
  useEffect(() => {
    if (!isOpen) {
      setDragOffset(0)
      setIsDragging(false)
    }
  }, [isOpen])

  if (!shouldRender) return null

  const maxDrag = sheetHeight.current || 400
  const backdropOpacity = isDragging
    ? Math.max(0, 0.3 * (1 - dragOffset / maxDrag))
    : isVisible
      ? 0.3
      : 0

  const translateY = isVisible ? dragOffset : sheetHeight.current || 400

  return (
    <div className="fixed inset-0 z-30" data-testid="bottom-sheet-container">
      {/* Backdrop */}
      <div
        className="absolute inset-0 transition-opacity"
        style={{
          backgroundColor: `rgba(0, 0, 0, ${backdropOpacity})`,
          transitionDuration: isDragging ? '0ms' : `${ANIMATION_DURATION}ms`,
        }}
        onClick={onClose}
        aria-hidden="true"
        data-testid="bottom-sheet-backdrop"
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl shadow-xl max-h-[75vh] overflow-y-auto touch-none"
        style={{
          transform: `translateY(${translateY}px)`,
          transition: isDragging
            ? 'none'
            : `transform ${ANIMATION_DURATION}ms cubic-bezier(0.32, 0.72, 0, 1)`,
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
