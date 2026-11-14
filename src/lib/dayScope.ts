import { createContext } from 'react'

/**
 * Whether a component is inside what the new day builds again.
 *
 * App puts everything that draws the day under a key that changes with it, and anything
 * written in there goes when the day comes in. The DOM marks it with `data-day-scope`, so
 * lib/today.ts can tell a field that would lose its words from one that would not. A
 * dialog drawn through a portal leaves that DOM behind. Modal reads this instead and
 * carries the mark onto its own root; ConfirmDialog does not, which is fine while it has
 * no field to type into.
 */
export const DayScopeContext = createContext(false)

/** The attribute that marks what the new day builds again. */
export const DAY_SCOPE = 'data-day-scope'
