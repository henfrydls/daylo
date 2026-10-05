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

/**
 * Android, by the one fact the webview already carries.
 *
 * It has to be asked, because the event is Android's. Measured in `@tauri-apps/api`: on
 * any other system `addPluginListener` invokes `plugin:app|register_listener`, then
 * `plugin:app|registerListener`, and both are refused, so every dialog opening on a
 * desktop would make two round trips to be told no and leave a rejected promise behind.
 *
 * The user agent and not a plugin, because this is a question the page can answer by
 * itself and the alternative is a dependency for one boolean. If it were ever wrong, the
 * catch below is what keeps it harmless.
 */
function onAndroid(): boolean {
  return isTauri() && /Android/i.test(navigator.userAgent)
}

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
  } catch (error) {
    // Nothing is lost by failing here: without a listener, Android keeps doing what it
    // always did, which is the behaviour this replaces rather than a broken state.
    console.error('[Daylo] the back button could not be taken over', error)
    listener = null
    return
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
 * Does nothing anywhere but Android: a browser has no such button, and on a desktop the
 * window manager closes windows.
 */
export function onAndroidBack(close: () => void): () => void {
  if (!onAndroid()) return () => {}

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
