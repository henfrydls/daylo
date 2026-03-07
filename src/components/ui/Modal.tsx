import { useRef } from 'react'
import type { ReactNode } from 'react'
import { useFocusTrap, useAnimatedPresence } from '../../hooks'
import { XIcon } from './Icons'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  children: ReactNode
  'data-testid'?: string
}

export function Modal({ isOpen, onClose, title, children, 'data-testid': testId }: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null)
  const { shouldRender, isVisible } = useAnimatedPresence(isOpen, 150)

  useFocusTrap(modalRef, isOpen, { onEscape: onClose, autoFocus: false })

  if (!shouldRender) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div
        className={`absolute inset-0 bg-black/50 transition-opacity duration-150 ${isVisible ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={modalRef}
        className={`relative bg-white rounded-t-xl sm:rounded-xl shadow-xl max-w-md w-full mx-0 sm:mx-4 p-4 sm:p-6 max-h-[90dvh] flex flex-col overflow-hidden ${
          isVisible
            ? 'animate-in fade-in zoom-in-95 duration-200'
            : 'animate-out fade-out zoom-out-95 duration-150'
        }`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        data-testid={testId}
      >
        <div className="flex items-center justify-between mb-4 shrink-0">
          <h2 id="modal-title" className="text-base sm:text-lg font-semibold text-gray-900">
            {title}
          </h2>
          <button
            onClick={onClose}
            className="p-2.5 sm:p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 flex items-center justify-center"
            aria-label="Close modal"
          >
            <XIcon className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto min-h-0">
          {children}
        </div>
      </div>
    </div>
  )
}
