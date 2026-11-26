/**
 * Focus given back by script, without a ring unless the keyboard asked for it.
 *
 * What lit the Today bar on the phone was not a tap. Measured in Chromium 145 and in
 * WebKitGTK 2.52: an engine draws the keyboard ring on a script's focus() whenever the
 * last thing it saw was not a press that moved the focus. A sheet opened by the reminder
 * and closed by a tap on the backdrop, or by Android's back, is exactly that: the page has
 * seen no press on anything focusable, and the bar came back ringed.
 *
 * So the page keeps its own account of how it was last driven, and says so to focus():
 * `focusVisible: false` after a pointer, or after nothing at all. Chrome and the Android
 * WebView read it from 145, Safari from 18.4, WebKitGTK 2.52 does (measured). An engine
 * that does not read it still matches :focus-visible, and for those the element is marked
 * `data-focus-quiet` until it loses the focus or a key is pressed: index.css leaves the
 * ring off an element that carries the mark.
 */

import { isTab } from './keys'

let keyboard = false

const MODIFIERS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'AltGraph', 'CapsLock'])

/** Once, before the first render. Returns what stops it, for the tests. */
export function followInputModality(target: Window): () => void {
  const onKey = (event: KeyboardEvent) => {
    if (MODIFIERS.has(event.key)) return
    // Writing in a field is not driving the page with the keyboard: a phone's own keyboard
    // sends keydown for every letter, and after it Android's back would light the ring.
    // Tab and Escape are driving wherever they are pressed.
    const field =
      event.target instanceof HTMLElement &&
      (event.target.isContentEditable || event.target.matches('input, textarea, select'))
    if (field && !isTab(event) && event.key !== 'Escape') return
    keyboard = true
    // A key means the keyboard is in charge again, and its ring is owed.
    for (const quiet of target.document.querySelectorAll('[data-focus-quiet]')) {
      quiet.removeAttribute('data-focus-quiet')
    }
  }
  const onPointer = () => (keyboard = false)
  target.addEventListener('keydown', onKey, true)
  target.addEventListener('pointerdown', onPointer, true)
  return () => {
    target.removeEventListener('keydown', onKey, true)
    target.removeEventListener('pointerdown', onPointer, true)
    keyboard = false
  }
}

export function giveFocusBack(element: HTMLElement): void {
  if (keyboard) {
    element.focus({ preventScroll: true })
    return
  }
  element.focus({ preventScroll: true, focusVisible: false } as FocusOptions)
  if (!element.matches(':focus-visible')) return
  element.setAttribute('data-focus-quiet', '')
  element.addEventListener('blur', () => element.removeAttribute('data-focus-quiet'), {
    once: true,
  })
}
