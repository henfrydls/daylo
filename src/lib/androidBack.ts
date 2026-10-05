import { addPluginListener, isTauri, type PluginListener } from '@tauri-apps/api/core'

/**
 * The Android back button, routed to whatever is open.
 *
 * Android's back is the same gesture as Escape on a keyboard: it takes away the thing in
 * front of you. Daylo was taking away the whole app instead, because nothing on this side
 * was listening and Android's default for an activity is to finish it.
 *
 * Tauri already offers the press as a plugin event, and the way it offers it is the whole
 * design here. Its own handler checks whether anybody is listening: if nobody is, it does
 * the default; if somebody is, it hands the press over and does nothing else. So the
 * listener exists **only while something is open**. On the main screen there is no
 * listener, Android behaves exactly as it always did, and the back button still closes
 * Daylo. Nothing here has to reimplement that, which matters because reimplementing it is
 * how an app ends up unable to be closed at all.
 */

/** Innermost last, the way they were opened. */
const stack: (() => void)[] = []

let listener: PluginListener | null = null
/** In flight, so that opening and closing faster than the registration cannot leave one. */
let registering: Promise<PluginListener> | null = null

async function startListening(): Promise<void> {
  if (listener !== null || registering !== null) return

  registering = addPluginListener('app', 'back-button', () => {
    // The innermost one, and only that one: two things closing for one press is one more
    // than was asked for.
    stack[stack.length - 1]?.()
  })

  try {
    listener = await registering
  } finally {
    registering = null
  }

  // Everything may have closed while this was being registered. One exit for that case and
  // for the ordinary one, so the listener cannot be unregistered twice or left behind
  // once: with it in place and nothing open, a press would call nothing at all and the
  // app could not be closed.
  if (stack.length === 0) await stopListening()
}

async function stopListening(): Promise<void> {
  // Still being registered. Leave it: the tail of startListening sees the empty stack and
  // takes it down, which keeps one place responsible for that.
  if (registering !== null) return
  if (listener === null) return

  const going = listener
  listener = null
  void going.unregister()
}

/**
 * Close this when the back button is pressed, until the returned function is called.
 *
 * Does nothing where there is no platform to ask, which is the browser and the tests.
 */
export function onAndroidBack(close: () => void): () => void {
  if (!isTauri()) return () => {}

  stack.push(close)
  void startListening()

  let gone = false
  return () => {
    if (gone) return
    gone = true
    const at = stack.lastIndexOf(close)
    if (at !== -1) stack.splice(at, 1)
    if (stack.length === 0) void stopListening()
  }
}
