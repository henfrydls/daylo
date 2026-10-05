import { createContext, useContext } from 'react'

/**
 * How the views change hands when the carousel is on.
 *
 * Without it, a tap on a month card changes the view in the store and the new one simply
 * appears. With it, the same tap walks the same rail the finger would have walked, so the
 * three ways into Month look like one thing rather than three.
 *
 * Null everywhere the carousel is off, which is the desktop and the tests, and every
 * caller falls back to what it did before. A context rather than more props because the
 * callers are a month card deep inside the year and a title deep inside the month, and
 * neither of them should have to be handed something by everything in between.
 */
export interface Travel {
  toYear: () => void
  /**
   * With a month, that month is picked on the way, which is what tapping a card means.
   * Without one, whatever month was already selected is where it arrives, which is what
   * the toggle means.
   */
  toMonth: (pick?: { year: number; month: number }) => void
}

export const TravelContext = createContext<Travel | null>(null)

export function useTravel(): Travel | null {
  return useContext(TravelContext)
}
