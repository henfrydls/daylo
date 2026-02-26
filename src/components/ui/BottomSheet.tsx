import { useRef, useCallback, useEffect, type ReactNode } from 'react'
import { useFocusTrap } from '../../hooks'

interface BottomSheetProps {
  isOpen: boolean
  onClose: () => void
  children: ReactNode
  'aria-label'?: string
}

export function BottomSheet({
  isOpen,
  onClose,
  children,
  'aria-label': ariaLabel = 'Bottom sheet',
}: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null)

  useFocusTrap(sheetRef, isOpen, { onEscape: onClose, autoFocus: false })

  // Close on backdrop click
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        onClose()
      }
    },
    [onClose]
  )

  // Prevent body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    }
    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [isOpen])

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-30"
      onClick={handleBackdropClick}
      data-testid="bottom-sheet-backdrop"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30" aria-hidden="true" />

      {/* Sheet */}
      <div
        ref={sheetRef}
        className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl shadow-xl max-h-[75vh] overflow-y-auto"
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        data-testid="bottom-sheet"
      >
        {/* Handle bar */}
        <div className="flex justify-center pt-3 pb-1 sticky top-0 bg-white rounded-t-2xl z-10">
          <div className="w-10 h-1 bg-gray-300 rounded-full" aria-hidden="true" />
        </div>

        {/* Content */}
        <div className="px-4 pb-6 pt-2">{children}</div>
      </div>
    </div>
  )
}
