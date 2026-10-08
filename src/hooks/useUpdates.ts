import { useCallback, useEffect, useRef, useState } from 'react'
import type { Update } from '@tauri-apps/plugin-updater'
import {
  checkForUpdate,
  installFormat,
  openDownloads,
  restartApp,
  takeUpdate,
  whatWeMayDo,
  type InstallFormat,
  type TakeStep,
} from '../lib/updater'
import type { UpdateState } from '../components/updates/UpdateNotice'
import { useCalendarStore } from '../store'

/**
 * Everything the app knows about a newer version, in one place.
 *
 * A hook and not four pieces of state in App, because the card and the sheet are two views
 * of one situation and the failure mode of keeping them apart is the two of them
 * disagreeing: the card saying an update is waiting while the sheet offers to look for one.
 *
 * What it will not do is as much of the design as what it will. It asks nothing inside the
 * Microsoft Store, where the Store does the updating; it asks nothing where nothing
 * packaged this copy, because we do not know what we would be replacing; and an automatic
 * check that fails says nothing to anybody, because nobody asked it a question.
 */

/** Once an hour at most. The window coming back is a poor clock; a person alt-tabbing is
 *  not news, and every ask is a request that leaves the machine. */
const ASK_AGAIN_AFTER = 60 * 60 * 1000

export type UpdateStatus =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'up-to-date' }
  | { kind: 'available'; version: string; canInstall: boolean }
  /** Being downloaded or installed right now, which the card behind this is narrating. */
  | { kind: 'working' }
  /** Installed, and the relaunch did not happen by itself. */
  | { kind: 'restart' }
  | { kind: 'failed' }

export interface Updates {
  /** Whether this copy can be told about updates at all: the menu entry hangs off it. */
  supported: boolean
  /** What the card should be saying, or null for no card. */
  notice: UpdateState | null
  /** What the sheet should be saying. */
  status: UpdateStatus
  /** The version waiting behind the cross, for the dot. Null when the card has it. */
  waiting: string | null
  /** The one action: check, update, go to the downloads page, or restart. */
  act: () => void
  /**
   * Ask GitHub, and nothing else, whatever has already been found.
   *
   * Apart from `act` because the caller, and not the state, decides which one it wants. A
   * whole row that can be pressed by somebody running a thumb down a list of settings must
   * never install: installing closes the application and opens it again. Only the small
   * word next to the version does that.
   */
  check: () => void
  /** The cross. Later, not no: the dot keeps the offer. */
  later: () => void
}

/** What a check found and what may be done about it. */
interface Found {
  version: string
  update: Update
  canInstall: boolean
}

/** The card's states and the steps of taking an update are the same list, on purpose. */
function asNotice(step: TakeStep): UpdateState {
  return step.step === 'downloading'
    ? { kind: 'downloading', percent: step.percent }
    : { kind: step.step }
}

export function useUpdates(): Updates {
  const hasHydrated = useCalendarStore((s) => s._hasHydrated)
  const enabled = useCalendarStore((s) => s.updatesEnabled)

  // Null while nobody has asked the backend yet, and null again where the answer was that
  // nothing packaged this copy. Both mean the same thing here: show nothing.
  const [format, setFormat] = useState<InstallFormat | null>(null)
  const [found, setFound] = useState<Found | null>(null)
  const [showCard, setShowCard] = useState(false)
  const [checking, setChecking] = useState(false)
  /** The answer to a question somebody put, which is the only kind that gets an answer. */
  const [answered, setAnswered] = useState<'up-to-date' | 'failed' | null>(null)
  const [taking, setTaking] = useState<TakeStep | null>(null)

  const askedAt = useRef(0)
  const busy = useRef(false)

  const supported = format !== null && whatWeMayDo(format) !== 'silent'

  useEffect(() => {
    let cancelled = false
    installFormat().then((value) => {
      if (!cancelled) setFormat(value)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const look = useCallback(
    async (asked: boolean) => {
      if (busy.current) return
      busy.current = true
      askedAt.current = Date.now()
      if (asked) {
        setChecking(true)
        setAnswered(null)
      }

      try {
        const result = await checkForUpdate(asked)
        if (result.kind === 'available') {
          const canInstall = whatWeMayDo(format) === 'install'
          setFound({ version: result.version, update: result.update, canInstall })
          // Read now rather than while rendering. Showing the card is what marks the
          // version seen, so a condition that read the store on every render would take
          // the card away on the frame after it appeared. The check-in's line learned
          // this the hard way.
          setShowCard(useCalendarStore.getState().updateNoticeSeenFor !== result.version)
        } else if (result.kind === 'none') {
          setFound(null)
          // Kept even when nobody asked. Nothing appears on screen for it, but it is what
          // the sheet says when somebody opens it, and a sheet that knows nothing has only
          // its own buttons to show. A failure is different and is not kept: see 'quiet'.
          setAnswered('up-to-date')
        } else if (result.kind === 'failed') {
          setAnswered('failed')
        }
      } finally {
        busy.current = false
        setChecking(false)
      }
    },
    [format]
  )

  // On opening, and when the window comes back. Twice for the same reason the check-in is
  // sent twice: a phone is closed and opened again, which remounts this, while a desktop
  // is left running for days and never remounts anything.
  useEffect(() => {
    if (!hasHydrated || !enabled || !supported) return

    void look(false)
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      if (Date.now() - askedAt.current < ASK_AGAIN_AFTER) return
      void look(false)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [hasHydrated, enabled, supported, look])

  const act = useCallback(() => {
    if (taking?.step === 'restart') {
      void restartApp()
      return
    }
    if (found === null) {
      void look(true)
      return
    }
    if (!found.canInstall) {
      void openDownloads()
      return
    }
    if (busy.current) return
    busy.current = true
    void takeUpdate(found.update, setTaking).finally(() => {
      busy.current = false
    })
  }, [found, look, taking])

  const check = useCallback(() => {
    void look(true)
  }, [look])

  const later = useCallback(() => {
    setShowCard(false)
    setTaking(null)
  }, [])

  const notice: UpdateState | null =
    taking !== null
      ? asNotice(taking)
      : showCard && found !== null
        ? found.canInstall
          ? { kind: 'available', version: found.version }
          : { kind: 'elsewhere', version: found.version }
        : null

  // What the sheet says is the same situation the card says, told to somebody who went
  // looking for the setting. While an update is being taken, that is what it says: the
  // card behind the sheet is narrating it, and a second "Update" button over an update
  // already running would be offering to do it twice. The failures are the exception and
  // go back to the offer, because trying again is the whole of what there is to do.
  const working: UpdateStatus | null =
    taking === null
      ? null
      : taking.step === 'downloading' || taking.step === 'installing'
        ? { kind: 'working' }
        : taking.step === 'restart'
          ? { kind: 'restart' }
          : null

  const status: UpdateStatus = checking
    ? { kind: 'checking' }
    : working !== null
      ? working
      : found !== null
        ? { kind: 'available', version: found.version, canInstall: found.canInstall }
        : answered === null
          ? { kind: 'idle' }
          : { kind: answered }

  return {
    supported,
    notice,
    status,
    // Exactly when there is something waiting and the card is not the one saying it.
    waiting: found !== null && notice === null ? found.version : null,
    act,
    check,
    later,
  }
}
