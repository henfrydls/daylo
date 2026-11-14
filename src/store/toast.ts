import { create } from 'zustand'
import { useCallback, useMemo } from 'react'

export interface Toast {
  id: string
  message: string
  variant: 'success' | 'error' | 'info'
}

interface ToastOptions {
  /**
   * Stays on the screen until the person closes it. For the notice that asks them to do
   * something before it is too late: three seconds is shorter than it takes to read it.
   */
  untilDismissed?: boolean
}

interface ToastState {
  toasts: Toast[]
  addToast: (message: string, variant: Toast['variant'], options?: ToastOptions) => void
  removeToast: (id: string) => void
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],

  addToast: (message, variant, options) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    const newToast: Toast = { id, message, variant }

    set((state) => ({
      toasts: [...state.toasts, newToast],
    }))

    if (options?.untilDismissed) return

    // Auto-dismiss after 3 seconds
    setTimeout(() => {
      set((state) => ({
        toasts: state.toasts.filter((t) => t.id !== id),
      }))
    }, 3000)
  },

  removeToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }))
  },
}))

export function useToast() {
  const addToast = useToastStore((state) => state.addToast)

  const showToast = useCallback(
    (message: string, variant: Toast['variant'] = 'info') => {
      addToast(message, variant)
    },
    [addToast]
  )

  // Return a stable object reference
  return useMemo(
    () => ({
      showToast,
    }),
    [showToast]
  )
}
