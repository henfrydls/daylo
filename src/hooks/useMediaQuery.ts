import { useState, useEffect } from 'react'

/**
 * Hook to detect if the viewport is below a given breakpoint.
 * Defaults to the Tailwind `sm` breakpoint (640px).
 *
 * @returns `isMobile` - true when the viewport width is below the breakpoint.
 */
export function useMediaQuery(query = '(min-width: 640px)'): { isMobile: boolean } {
  const [matches, setMatches] = useState<boolean>(() => {
    // SSR safe: default to false (assume desktop) when window is unavailable
    if (typeof window === 'undefined') return false
    return window.matchMedia(query).matches
  })

  useEffect(() => {
    if (typeof window === 'undefined') return

    const mediaQuery = window.matchMedia(query)

    // Sync initial value in case it differs from the SSR default
    setMatches(mediaQuery.matches)

    const handler = (event: MediaQueryListEvent) => {
      setMatches(event.matches)
    }

    mediaQuery.addEventListener('change', handler)

    return () => {
      mediaQuery.removeEventListener('change', handler)
    }
  }, [query])

  return { isMobile: !matches }
}
