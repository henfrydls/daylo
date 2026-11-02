import { create } from 'zustand'

/**
 * What to do when Daylo cannot open what it saved.
 *
 * A store of its own, and that is not a style choice. When hydration throws, zustand calls
 * the rehydrate callback with `undefined` for the state, and it does it from inside
 * `create()`: the const holding the calendar store has not been assigned yet, so anything
 * in that callback that names it dies in the temporal dead zone. This store is finished
 * being built by then, because nothing about it is persisted.
 *
 * It is also the right shape for the job on its own terms. The screen it drives has to
 * work when the main store is the thing that failed, so it may not read from it, and the
 * bytes it hands back come straight off the disk rather than through anything that parses
 * them.
 */

export interface CouldNotOpen {
  /**
   * `unreadable`: the data is there and Daylo could not make sense of it. This is the one
   * worth rescuing, because the bytes are still whole and somebody else can read them.
   *
   * `unreachable`: the storage itself refused, which a browser does with site data blocked
   * or in some private windows. There is nothing to hand back, and nothing is wrong with
   * the data either.
   */
  reason: 'unreadable' | 'unreachable'
  /** Exactly what is on the disk, untouched, or null when there was nothing to take. */
  raw: string | null
}

interface RescueState {
  failure: CouldNotOpen | null
  couldNotOpen: (failure: CouldNotOpen) => void
}

export const useRescueStore = create<RescueState>((set) => ({
  failure: null,
  couldNotOpen: (failure) => set({ failure }),
}))

/**
 * What is on the disk, asked in the one way that cannot throw.
 *
 * Reading is attempted rather than assumed, because the two failures want different
 * sentences on screen and the difference is not visible from the hydration error alone:
 * one means "your data is here and I could not read it", the other means "I cannot see
 * any storage at all". Telling somebody the first when it is the second sends them
 * looking for damage that is not there.
 */
export function whatIsOnDisk(read: () => string | null): CouldNotOpen {
  let raw: string | null
  try {
    raw = read()
  } catch {
    return { reason: 'unreachable', raw: null }
  }

  if (raw === null) return { reason: 'unreachable', raw: null }
  return { reason: 'unreadable', raw }
}
