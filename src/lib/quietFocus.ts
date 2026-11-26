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

/**
 * Focus moved by script for a key, with the ring the key is owed.
 *
 * The focus trap moves every Tab itself, and an engine decides from its own account
 * whether focus given by script gets a ring. WebKit (WebKitGTK on Linux, Safari, the Mac
 * app) gives it none whenever the last focus the engine moved itself came from a click,
 * and since the trap moves every Tab, no Tab ever told it otherwise: after one click
 * anywhere, nothing inside a sheet ever showed where the keyboard was. Measured in
 * WebKitGTK 2.52.3 with real X key events.
 *
 * So it asks for the ring, and an engine that does not read `focusVisible: true` gets the
 * element marked `data-focus-keyboard` until it loses the focus: index.css draws the ring
 * on an element that carries the mark.
 */
export function focusFromKeyboard(element: HTMLElement): void {
  element.focus({ focusVisible: true } as FocusOptions)
  if (element.ownerDocument.activeElement !== element) return
  if (element.matches(':focus-visible')) return
  element.setAttribute('data-focus-keyboard', '')
  element.addEventListener('blur', () => element.removeAttribute('data-focus-keyboard'), {
    once: true,
  })
}
