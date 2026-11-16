import { useEffect } from 'react'
import { create } from 'zustand'

/**
 * How many dialogs are open right now, counted by Modal and ConfirmDialog themselves.
 *
 * The one-time offers must not open over another dialog, and the dialogs live in many
 * places (the activity form and the delete confirmation inside ActivityList, Export,
 * Import, the feedback question). Listing each in App missed some; counting where every
 * dialog is drawn cannot. A dialog counts from the moment it is asked to open until it is
 * asked to close, not while it is still leaving.
 */
export const useOpenDialogs = create<{ open: number }>(() => ({ open: 0 }))

/** Counts the calling dialog as open while `isOpen` is true. */
export function useCountsAsOpenDialog(isOpen: boolean) {
  useEffect(() => {
    if (!isOpen) return
    useOpenDialogs.setState((state) => ({ open: state.open + 1 }))
    return () => useOpenDialogs.setState((state) => ({ open: state.open - 1 }))
  }, [isOpen])
}
