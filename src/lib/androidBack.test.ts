import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * The stack and the listener are one per running app, which is what they are for. Each
 * test gets its own copy of the module so that one test's open dialog is not still open
 * in the next.
 */
let onAndroidBack: (close: () => void) => () => void

const unlisten = vi.fn()
const addPluginListener = vi.fn()
let isTauri = true

/** The webview's own answer to "what am I running on". */
const sayAndroid = (yes: boolean) =>
  Object.defineProperty(window.navigator, 'userAgent', {
    value: yes
      ? 'Mozilla/5.0 (Linux; Android 16; SM-S926B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140 Mobile Safari/537.36'
      : 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140 Safari/537.36',
    configurable: true,
  })

vi.mock('@tauri-apps/api/core', () => ({
  isTauri: () => isTauri,
  addPluginListener: (plugin: string, event: string, cb: () => void) =>
    addPluginListener(plugin, event, cb),
}))

/** The press itself: whatever the plugin would have called. */
const press = () => {
  const calls = addPluginListener.mock.calls
  calls[calls.length - 1][2]()
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

beforeEach(async () => {
  isTauri = true
  sayAndroid(true)
  unlisten.mockReset()
  addPluginListener.mockReset().mockResolvedValue({ unregister: unlisten })
  vi.resetModules()
  ;({ onAndroidBack } = await import('./androidBack'))
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('what the back button closes', () => {
  it('closes the one thing that is open', async () => {
    const close = vi.fn()
    onAndroidBack(close)
    await settle()

    press()

    expect(close).toHaveBeenCalledOnce()
  })

  // A sheet opened from a dialog closes first, and the dialog stays. Anything else would
  // take two things away for one press, and the person asked for one.
  it('closes the last thing opened, and only that', async () => {
    const first = vi.fn()
    const second = vi.fn()
    onAndroidBack(first)
    onAndroidBack(second)
    await settle()

    press()

    expect(second).toHaveBeenCalledOnce()
    expect(first).not.toHaveBeenCalled()
  })

  it('goes back to the one underneath once the top one is gone', async () => {
    const first = vi.fn()
    const second = vi.fn()
    onAndroidBack(first)
    const closeSecond = onAndroidBack(second)
    await settle()

    closeSecond()
    press()

    expect(first).toHaveBeenCalledOnce()
    expect(second).not.toHaveBeenCalled()
  })
})

// The listener is what tells Android we are handling the press. While it exists, Android's
// own behaviour is off, so a listener left behind when nothing is open would be a back
// button that does nothing on the main screen.
describe('while nothing is open, Android does what it always did', () => {
  it('listens only while something is open', async () => {
    const stop = onAndroidBack(vi.fn())
    await settle()
    expect(addPluginListener).toHaveBeenCalledOnce()

    stop()
    await settle()

    expect(unlisten).toHaveBeenCalledOnce()
  })

  it('keeps one listener for however many things are open', async () => {
    const first = onAndroidBack(vi.fn())
    const second = onAndroidBack(vi.fn())
    await settle()

    expect(addPluginListener).toHaveBeenCalledOnce()

    first()
    await settle()
    expect(unlisten).not.toHaveBeenCalled()

    second()
    await settle()
    expect(unlisten).toHaveBeenCalledOnce()
  })

  // Opened and closed before the listener finished registering. Without this the listener
  // outlives everything it was for, which is the one failure that leaves the app unable
  // to be closed by the back button.
  it('does not leave a listener behind when it closes before it is ready', async () => {
    const stop = onAndroidBack(vi.fn())

    stop()
    await settle()

    expect(unlisten).toHaveBeenCalledOnce()
  })
})

describe('anywhere that is not Android', () => {
  it('asks for nothing in a browser', async () => {
    isTauri = false

    const stop = onAndroidBack(vi.fn())
    await settle()

    expect(addPluginListener).not.toHaveBeenCalled()
    expect(() => stop()).not.toThrow()
  })

  // The event is Android's. On a desktop the registration is refused twice by the API's
  // own fallback, so asking would be two round trips to be told no, once per dialog.
  it('asks for nothing on a desktop either', async () => {
    sayAndroid(false)

    const stop = onAndroidBack(vi.fn())
    await settle()

    expect(addPluginListener).not.toHaveBeenCalled()
    expect(() => stop()).not.toThrow()
  })

  // And if that reading were ever wrong, being told no costs nothing: Android keeps doing
  // what it always did, which is what this replaces rather than a broken state.
  it('carries on when the platform refuses', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    addPluginListener.mockRejectedValue(new Error('no such command'))

    const close = vi.fn()
    const stop = onAndroidBack(close)
    await settle()

    expect(() => stop()).not.toThrow()
    expect(close).not.toHaveBeenCalled()
  })
})
