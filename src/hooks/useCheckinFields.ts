import { useEffect, useState } from 'react'
import { checkinFields, type CheckinFields } from '../lib/checkin'

/**
 * The version and system this build would send, or null where nothing can be sent.
 *
 * Null is both "not asked yet" and "no check-in here", and they behave the same on
 * purpose: everything about the check-in hangs off this — the menu entry, the dialog, the
 * sheet — so a first render that assumed yes would put an option on the web for one frame
 * and take it away again. Same shape as useRemindersAvailable, for the same reason.
 */
export function useCheckinFields(): CheckinFields | null {
  const [fields, setFields] = useState<CheckinFields | null>(null)

  useEffect(() => {
    let cancelled = false
    checkinFields().then((value) => {
      if (!cancelled) setFields(value)
    })
    return () => {
      cancelled = true
    }
  }, [])

  return fields
}
