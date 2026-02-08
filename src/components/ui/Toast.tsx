import { memo, useCallback } from 'react'
import { useToastStore } from '../../store/toast'
import type { Toast as ToastType } from '../../store/toast'
import { CheckCircleIcon, ExclamationCircleIcon, InfoCircleIcon, XIcon } from './Icons'
import { useShallow } from 'zustand/react/shallow'

const variantStyles = {
  success: {
    bg: 'bg-emerald-50 border-emerald-200',
    text: 'text-emerald-800',
    icon: <CheckCircleIcon className="w-5 h-5 text-emerald-500" />,
  },
  error: {
    bg: 'bg-red-50 border-red-200',
    text: 'text-red-800',
    icon: <ExclamationCircleIcon className="w-5 h-5 text-red-500" />,
  },
  info: {
    bg: 'bg-blue-50 border-blue-200',
    text: 'text-blue-800',
    icon: <InfoCircleIcon className="w-5 h-5 text-blue-500" />,
  },
}

interface ToastItemProps {
  toast: ToastType
  onClose: () => void
}

const ToastItem = memo(function ToastItem({ toast, onClose }: ToastItemProps) {
  const styles = variantStyles[toast.variant]

  return (
    <div
      className={`
        flex items-center gap-3 px-4 py-3
        border rounded-lg shadow-sm
        animate-in slide-in-from-right-full fade-in duration-300
        ${styles.bg}
      `}
      role="alert"
      aria-live="polite"
    >
      <span className="flex-shrink-0">{styles.icon}</span>
      <p className={`text-sm font-medium ${styles.text}`}>{toast.message}</p>
      <button
        onClick={onClose}
        className={`
          relative ml-auto -mr-2 -my-1
          min-w-[44px] min-h-[44px]
          flex items-center justify-center
          rounded-lg
          transition-colors duration-150
          hover:bg-black/5
          ${styles.text}
        `}
        aria-label="Dismiss notification"
      >
        <XIcon className="w-4 h-4" />
      </button>
    </div>
  )
})

export const ToastContainer = memo(function ToastContainer() {
  const toasts = useToastStore(useShallow((state) => state.toasts))
  const removeToast = useToastStore((state) => state.removeToast)

  const handleClose = useCallback((id: string) => {
    removeToast(id)
  }, [removeToast])

  if (toasts.length === 0) return null

  return (
    <div
      className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm"
      aria-label="Notifications"
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onClose={() => handleClose(toast.id)} />
      ))}
    </div>
  )
})

// Re-export the hook for convenience
export { useToast } from '../../store/toast'
