import { useState, useEffect } from 'react'

/**
 * Hook to reactively match a CSS media query.
 *
 * @returns true when the media query matches, false otherwise.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia(query).matches
  })

  useEffect(() => {
    if (typeof window === 'undefined') return

    const mediaQuery = window.matchMedia(query)
    /* eslint-disable react-hooks/set-state-in-effect */
    setMatches(mediaQuery.matches)
    /* eslint-enable react-hooks/set-state-in-effect */

    const handler = (event: MediaQueryListEvent) => {
      setMatches(event.matches)
    }

    mediaQuery.addEventListener('change', handler)
    return () => mediaQuery.removeEventListener('change', handler)
  }, [query])

  return matches
}
