import { useEffect, useState } from 'react'
import { remindersAvailable } from '../lib/reminders'

/**
 * Whether to show anything about reminders at all.
 *
 * Starts as false and stays false everywhere but the Android app, so nothing about
 * reminders appears on the web or the desktop even for the instant before the answer
 * arrives: an option that flickers into view and then leaves is worse than one that never
 * appeared.
 */
export function useRemindersAvailable(): boolean {
  const [available, setAvailable] = useState(false)

  useEffect(() => {
    let cancelled = false
    remindersAvailable().then((value) => {
      if (!cancelled) setAvailable(value)
    })
    return () => {
      cancelled = true
    }
  }, [])

  return available
}
