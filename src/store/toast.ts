import { create } from 'zustand'

export interface Toast {
  id: string
  message: string
  variant: 'success' | 'error' | 'info'
}

interface ToastState {
  toasts: Toast[]
  addToast: (message: string, variant: Toast['variant']) => void
  removeToast: (id: string) => void
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],

  addToast: (message, variant) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    const newToast: Toast = { id, message, variant }

    set((state) => ({
      toasts: [...state.toasts, newToast],
    }))

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

  return {
    showToast: (message: string, variant: Toast['variant'] = 'info') => {
      addToast(message, variant)
    },
  }
}
