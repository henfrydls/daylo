import { useEffect, useState } from 'react'

/**
 * Whether a surface that is on the page has had a frame to arrive from.
 *
 * A CSS transition only runs when the value it is leaving has already been painted. A
 * panel put into the page at its resting place has no such value, so it does not slide in,
 * it is simply there. Two frames rather than one, because one is not reliably enough for
 * the first state to have been drawn.
 *
 * The frames belong to the opening that asked for them. Open and shut faster than they
 * land and a late frame would mark a closed surface as arrived, leaving the next opening
 * nowhere to come from: the same fault again, but only sometimes, which is worse.
 */
export function useArrival(isVisible: boolean): boolean {
  const [arrived, setArrived] = useState(false)

  useEffect(() => {
    if (!isVisible) {
      /* eslint-disable react-hooks/set-state-in-effect */
      setArrived(false)
      /* eslint-enable react-hooks/set-state-in-effect */
      return
    }
    let thisOpening = true
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (thisOpening) setArrived(true)
      })
    )
    return () => {
      thisOpening = false
    }
  }, [isVisible])

  return arrived && isVisible
}
