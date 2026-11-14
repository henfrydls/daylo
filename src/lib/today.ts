import { useMemo, useSyncExternalStore } from 'react'
import { formatDate, parseDateString } from './dates'
import { DAY_SCOPE } from './dayScope'

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
 * something, when nothing they wrote is at stake: a sheet open, a field with the focus and
 * nothing in it, a finger down. A minute: long enough to cover a pause, short enough that
 * a window left with a sheet open overnight wakes up in today, because nobody has touched
 * it for hours. Words written are not on this clock at all.
 */
export const PENDING_GIVES_WAY_AFTER = 60_000

/** How often a waiting day looks again to see whether it can come in. */
const LOOK_AGAIN_EVERY = 5_000

/**
 * How often the clock is read regardless of anything else. The midnight timer is one long
 * timeout, and a laptop suspended with the window in front pauses it: WebKitGTK sends
 * neither focus nor visibilitychange on waking, and the paused timer goes off hours late.
 * Half a minute is cheap, and it is the most a day can be late by.
 */
const READ_THE_CLOCK_EVERY = 30_000

/**
 * Set on the views while they are on their way from one to the other: from the moment the
 * one beside comes into sight until the rail has landed. The landing ends by telling the
 * store which view it reached, and a new day that came in halfway would have its own view
 * written over by it.
 */
export const BETWEEN_VIEWS = 'data-between-views'

/** Every sheet and dialog in Daylo marks itself with one of these; the views in motion too. */
const SOMETHING_OPEN = `[role="dialog"], [aria-modal="true"], [${BETWEEN_VIEWS}]`

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
let readTheClock: ReturnType<typeof setInterval> | null = null
/** Fingers and buttons down right now, by pointer. A drag in progress is one of these. */
const pressed = new Set<number>()
/**
 * What each field held the first time it took the focus. Words are only somebody's when
 * they differ from what the field opened with: "Edit activity" opens with the name in it,
 * and a name nobody touched is not something a new day would take away from anybody.
 */
let openedWith = new WeakMap<Element, string>()
const listeners = new Set<() => void>()

const now = () => formatDate(new Date())

function getSnapshot(): string {
  // Nobody listening means nobody can be told, so the answer is simply the clock. While
  // somebody listens, it is the day they were last told, which is what lets a change wait.
  if (day === null) day = now()
  return day
}

/** Fields that hold words somebody typed. A date or a time picked from a list does not count. */
const WORDS = ['textarea', 'input:not([type])', 'input[type="text"]', 'input[type="search"]']

/** The same fields, only inside what the new day builds again. */
const WORDS_THE_DAY_WOULD_TAKE = WORDS.map((field) => `[${DAY_SCOPE}] ${field}`).join(', ')

/**
 * Whether somebody wrote something, not saved yet, in a field the new day would build
 * again and so empty. However long it has been since the last key.
 *
 * Only inside what App marks with DayScope: a field anywhere else stays as it is when the
 * day changes, and has nothing to lose. And only when it differs from what the field held
 * when it first took the focus: to write in a field it has to have the focus first, so a
 * field that never had it holds nothing anybody wrote, and one emptied and put back as it
 * was holds nothing new.
 */
function somethingWritten(): boolean {
  return Array.from(
    document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(WORDS_THE_DAY_WOULD_TAKE)
  ).some((field) => {
    const opened = openedWith.get(field)
    return opened !== undefined && field.value.trim() !== opened.trim()
  })
}

/** The first time a field takes the focus, what it held then. */
function onFocusIn(event: Event) {
  const field = event.target
  if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement)) return
  if (openedWith.has(field) || !field.matches(WORDS.join(', '))) return
  openedWith.set(field, field.value)
}

/**
 * Somebody with words in a field, somebody writing in one, somebody with a finger on the
 * screen, or a sheet open that somebody is still using.
 *
 * Words wait for ever: they go when the field is saved or emptied, never on a timer. The
 * rest wait at most a minute after the last key or touch, so a window left with a sheet
 * open all night still wakes up in today.
 */
function inTheMiddleOfSomething(): boolean {
  if (somethingWritten()) return true
  // A clock moved backwards makes the last touch look like it is in the future, and that
  // would keep the day waiting for as long as the clock was moved. Not a touch, then.
  const since = Date.now() - lastGesture
  if (since < 0 || since >= PENDING_GIVES_WAY_AFTER) return false
  // A finger in the middle of swiping between views, or of pulling a sheet: building the
  // views again under it would leave the gesture holding a view that is gone.
  if (pressed.size > 0) return true
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
  if (lookAgain !== null) {
    clearTimeout(lookAgain)
    lookAgain = null
  }
  // Nothing to wait for any more, which is also what a clock moved back looks like. Left
  // set, nothing would ever look again: the midnight timer and the clock reading both
  // leave a day that is already waiting alone.
  if (now() === day) {
    pending = false
    return
  }
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
 * Coming back brings the new day at once: nobody is in the middle of anything. Except
 * somebody who left words in a field, went to look at something else and came back to
 * finish them: those wait, as they would at midnight, until the field is saved or emptied.
 *
 * It also sets the midnight timer again, from the clock as it is now. A timer that sat
 * through a suspended laptop, or a clock somebody moved, would otherwise go off at the
 * wrong hour or not at all.
 */
function comeBack() {
  // Whatever was held down when the window went away was let go somewhere else.
  pressed.clear()
  armMidnight()
  if (somethingWritten()) tryApply()
  else apply()
}

function onVisible() {
  if (document.visibilityState === 'visible') comeBack()
}

/**
 * Every sign of somebody using the page: a key, the wheel or the trackpad, a finger moving,
 * a field changing, a scroll. A scroll does not bubble, which is why all of these are
 * heard on the way down (capture) rather than on the way up.
 */
const GESTURES = ['keydown', 'wheel', 'scroll', 'touchmove', 'input'] as const

/** Only the time is kept: what was pressed is nobody's business here. */
function onGesture() {
  lastGesture = Date.now()
}

function onPress(event: Event) {
  lastGesture = Date.now()
  pressed.add((event as PointerEvent).pointerId ?? 0)
}

function onRelease(event: Event) {
  pressed.delete((event as PointerEvent).pointerId ?? 0)
}

function onClockReading() {
  if (!pending && now() !== day) tryApply()
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
    GESTURES.forEach((type) => window.addEventListener(type, onGesture, passiveCapture))
    window.addEventListener('focusin', onFocusIn, passiveCapture)
    window.addEventListener('pointerdown', onPress, passiveCapture)
    window.addEventListener('pointerup', onRelease, passiveCapture)
    window.addEventListener('pointercancel', onRelease, passiveCapture)
    armMidnight()
    readTheClock = setInterval(onClockReading, READ_THE_CLOCK_EVERY)
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size > 0) return
    document.removeEventListener('visibilitychange', onVisible)
    window.removeEventListener('focus', comeBack)
    window.removeEventListener('pageshow', comeBack)
    GESTURES.forEach((type) => window.removeEventListener(type, onGesture, passiveCapture))
    window.removeEventListener('focusin', onFocusIn, passiveCapture)
    window.removeEventListener('pointerdown', onPress, passiveCapture)
    window.removeEventListener('pointerup', onRelease, passiveCapture)
    window.removeEventListener('pointercancel', onRelease, passiveCapture)
    if (midnight !== null) clearTimeout(midnight)
    if (lookAgain !== null) clearTimeout(lookAgain)
    if (readTheClock !== null) clearInterval(readTheClock)
    midnight = null
    lookAgain = null
    readTheClock = null
    pressed.clear()
    openedWith = new WeakMap()
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

/**
 * The same day as a Date, at its first moment, for the components that compare dates.
 *
 * Read this instead of `new Date()` anywhere that draws today. While a new day is waiting
 * for somebody to finish, the clock has moved on and this has not, and a part of the screen
 * that read the clock would draw tomorrow beside a calendar still showing today.
 */
export function useTodayDate(): Date {
  const today = useToday()
  return useMemo(() => parseDateString(today), [today])
}
