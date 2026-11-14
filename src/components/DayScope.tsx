import type { ReactNode } from 'react'
import { DayScopeContext } from '../lib/dayScope'

interface DayScopeProps {
  /** The day on screen. When it changes, everything inside is built again. */
  day: string
  className?: string
  children: ReactNode
}

/**
 * Everything inside starts again when the day changes, and is marked as such. See App for
 * why the day is a key, and lib/today.ts for why the mark: words written in here hold the
 * new day back until they are saved, and words written anywhere else do not need to.
 */
export function DayScope({ day, className, children }: DayScopeProps) {
  return (
    <DayScopeContext.Provider value={true}>
      <div key={day} data-day-scope="" className={className}>
        {children}
      </div>
    </DayScopeContext.Provider>
  )
}
