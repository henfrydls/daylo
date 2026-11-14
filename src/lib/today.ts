import { useSyncExternalStore } from 'react'
import { formatDate } from './dates'

/**
 * The one answer to "what day is it" for everything on screen.
 *
 * Somebody ticks their habit in the evening and leaves Daylo open: on a desktop the window
 * stays for days, on Android the app waits in the background. Nothing used to read the
 * date again, so the next morning yesterday was still drawn as today, "Today" opened
 * yesterday's sheet already ticked, and the bar said the habit was done. This is where the
 * app learns that a new day started; App is what acts on it.
 *
 * It is a store outside React because there has to be exactly one: two components that
 * each kept their own day would disagree for as long as one of them had not been told.
 */

/**
 * How long after the last key or touch somebody still counts as in the middle of
 * something. A minute: long enough to cover a pause to think while writing a habit's
 * name, short enough that a window left with a sheet open overnight wakes up in today,
 * because nobody has touched it for hours.
 */
export const PENDING_GIVES_WAY_AFTER = 60_000

/** How often a waiting day looks again to see whether it can come in. */
const LOOK_AGAIN_EVERY = 5_000

/** Every sheet and dialog in Daylo marks itself with one of these. */
const SOMETHING_OPEN = '[role="dialog"], [aria-modal="true"]'

/** Inputs that take typing. A checkbox or a button with the focus is not somebody writing. */
const NOT_TYPING = new Set([
  'button',
  'checkbox',
  'radio',
  'submit',
  'reset',
  'range',
  'color',
  'file',
  'image',
])

let day: string | null = null
let pending = false
let lastGesture = Number.NEGATIVE_INFINITY
let midnight: ReturnType<typeof setTimeout> | null = null
let lookAgain: ReturnType<typeof setTimeout> | null = null
const listeners = new Set<() => void>()

const now = () => formatDate(new Date())

function getSnapshot(): string {
  // Nobody listening means nobody can be told, so the answer is simply the clock. While
  // somebody listens, it is the day they were last told, which is what lets a change wait.
  if (day === null) day = now()
  return day
}

/** Somebody writing in a field, or a sheet open that somebody is still using. */
function inTheMiddleOfSomething(): boolean {
  // A clock moved backwards makes the last touch look like it is in the future, and that
  // would keep the day waiting for as long as the clock was moved. Not a touch, then.
  const since = Date.now() - lastGesture
  if (since < 0 || since >= PENDING_GIVES_WAY_AFTER) return false
  if (document.querySelector(SOMETHING_OPEN) !== null) return true
  const focused = document.activeElement
  if (focused instanceof HTMLTextAreaElement) return true
  if (focused instanceof HTMLInputElement) return !NOT_TYPING.has(focused.type)
  return focused instanceof HTMLElement && focused.isContentEditable
}

/** Take whatever day the clock says, now, and tell everybody if it is a different one. */
function apply() {
  pending = false
  if (lookAgain !== null) {
    clearTimeout(lookAgain)
    lookAgain = null
  }
  const next = now()
  if (next === day) return
  day = next
  listeners.forEach((listener) => listener())
}

/**
 * Midnight arrived with the app in front of somebody. If they are in the middle of
 * something the new day waits, and goes on looking every few seconds until they are not:
 * a form being typed into does not get closed under their fingers.
 */
function tryApply() {
  if (now() === day) return
  if (!inTheMiddleOfSomething()) {
    apply()
    return
  }
  pending = true
  lookAgain = setTimeout(() => {
    lookAgain = null
    tryApply()
  }, LOOK_AGAIN_EVERY)
}

/**
 * A second past the next local midnight. Built from the date's parts and not by adding a
 * day's worth of milliseconds, so the night the clocks change is still one night.
 *
 * This only covers a window that stays visible and in front all night. In the background
 * browsers slow timers down and Android suspends them altogether, so for every other case
 * it is coming back (visibilitychange, focus, pageshow) that says a new day started.
 */
function armMidnight() {
  if (midnight !== null) clearTimeout(midnight)
  const at = new Date()
  const next = new Date(at.getFullYear(), at.getMonth(), at.getDate() + 1)
  midnight = setTimeout(
    () => {
      armMidnight()
      if (!pending) tryApply()
    },
    next.getTime() - at.getTime() + 1_000
  )
}

/**
 * Coming back always brings the new day at once: nobody is in the middle of anything.
 *
 * It also sets the midnight timer again, from the clock as it is now. A timer that sat
 * through a suspended laptop, or a clock somebody moved, would otherwise go off at the
 * wrong hour or not at all.
 */
function comeBack() {
  armMidnight()
  apply()
}

function onVisible() {
  if (document.visibilityState === 'visible') comeBack()
}

/** Only the time is kept: what was pressed is nobody's business here. */
function onGesture() {
  lastGesture = Date.now()
}

const passiveCapture = { capture: true, passive: true } as const

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  if (listeners.size === 1) {
    // A day read while nobody was listening may already be old.
    day = now()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', comeBack)
    window.addEventListener('pageshow', comeBack)
    window.addEventListener('keydown', onGesture, passiveCapture)
    window.addEventListener('pointerdown', onGesture, passiveCapture)
    armMidnight()
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size > 0) return
    document.removeEventListener('visibilitychange', onVisible)
    window.removeEventListener('focus', comeBack)
    window.removeEventListener('pageshow', comeBack)
    window.removeEventListener('keydown', onGesture, passiveCapture)
    window.removeEventListener('pointerdown', onGesture, passiveCapture)
    if (midnight !== null) clearTimeout(midnight)
    if (lookAgain !== null) clearTimeout(lookAgain)
    midnight = null
    lookAgain = null
    pending = false
    lastGesture = Number.NEGATIVE_INFINITY
    day = null
  }
}

/**
 * Today, as `YYYY-MM-DD` in local time, and a re-render the moment it changes.
 *
 * While a change is waiting for somebody to finish, this goes on answering the old day,
 * so the whole app stays consistent with itself until it changes all at once.
 */
export function useToday(): string {
  return useSyncExternalStore(subscribe, getSnapshot)
}
