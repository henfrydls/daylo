import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  forgetTheLaunchForTests,
  isReminderTap,
  launchedFromReminder,
  listenForReminderTaps,
} from './reminderTap'
import { REMINDER_ID } from './reminders'

const invoke = vi.hoisted(() => vi.fn())
const addPluginListener = vi.hoisted(() => vi.fn())

vi.mock('@tauri-apps/api/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tauri-apps/api/core')>()),
  invoke,
  addPluginListener,
}))

const userAgent = navigator.userAgent

function pretendAndroid() {
  vi.stubGlobal('isTauri', true)
  Object.defineProperty(navigator, 'userAgent', {
    value: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36',
    configurable: true,
  })
}

beforeEach(() => {
  invoke.mockReset()
  addPluginListener.mockReset()
  forgetTheLaunchForTests()
})

afterEach(() => {
  vi.unstubAllGlobals()
  Object.defineProperty(navigator, 'userAgent', { value: userAgent, configurable: true })
  vi.restoreAllMocks()
})

/**
 * What the plugin sends when a notification is tapped while Daylo is in memory: its
 * `actionPerformed` event, with the notification as Daylo scheduled it and the action,
 * "tap" for the notification itself.
 */
describe('which taps are the reminder', () => {
  it('is the reminder when the notification is ours', () => {
    expect(isReminderTap({ actionId: 'tap', notification: { id: REMINDER_ID } })).toBe(true)
  })

  // An alarm armed by a build from before the plugin kept what it scheduled has no copy of
  // the notification on its intent. Daylo sends one notification, so a tap is that one.
  it('is the reminder when the notification did not come with it', () => {
    expect(isReminderTap({ actionId: 'tap', notification: null })).toBe(true)
    expect(isReminderTap({ actionId: 'tap' })).toBe(true)
  })

  it('is not a notification with another id', () => {
    expect(isReminderTap({ actionId: 'tap', notification: { id: REMINDER_ID + 1 } })).toBe(false)
  })

  it('is not a dismissal', () => {
    expect(isReminderTap({ actionId: 'dismiss', notification: { id: REMINDER_ID } })).toBe(false)
  })

  it('is not something that is not an event at all', () => {
    expect(isReminderTap(null)).toBe(false)
    expect(isReminderTap('tap')).toBe(false)
  })
})

/**
 * A tap that starts Daylo from nothing. The plugin fires its event while it loads, before
 * the page listens, and Tauri drops it, so the page asks the launch itself.
 */
describe('a launch from the reminder', () => {
  it('is one when the app was started by the reminder', async () => {
    pretendAndroid()
    invoke.mockResolvedValue(REMINDER_ID)

    await expect(launchedFromReminder()).resolves.toBe(true)
    expect(invoke).toHaveBeenCalledWith('launch_notification')
  })

  it('is not one when the app was started some other way', async () => {
    pretendAndroid()
    invoke.mockResolvedValue(null)

    await expect(launchedFromReminder()).resolves.toBe(false)
  })

  it('is not one for another notification', async () => {
    pretendAndroid()
    invoke.mockResolvedValue(REMINDER_ID + 1)

    await expect(launchedFromReminder()).resolves.toBe(false)
  })

  // Asked once a page. A second question, from React running an effect twice or from a
  // second screen, gets the same answer rather than a fresh "no" from the native side,
  // which answers only once a process.
  it('asks the phone once, and gives every caller the same answer', async () => {
    pretendAndroid()
    invoke.mockResolvedValueOnce(REMINDER_ID).mockResolvedValue(null)

    await expect(launchedFromReminder()).resolves.toBe(true)
    await expect(launchedFromReminder()).resolves.toBe(true)
    expect(invoke).toHaveBeenCalledTimes(1)
  })

  it('is not one when the question fails', async () => {
    pretendAndroid()
    invoke.mockRejectedValue('no such command')

    await expect(launchedFromReminder()).resolves.toBe(false)
  })

  it('asks nothing anywhere but Android', async () => {
    await expect(launchedFromReminder()).resolves.toBe(false)
    expect(invoke).not.toHaveBeenCalled()
  })
})

describe('listening for a tap while the app is in memory', () => {
  type Handler = (payload: unknown) => void

  function registered() {
    const unregister = vi.fn().mockResolvedValue(undefined)
    let handler: Handler = () => {}
    addPluginListener.mockImplementation((_plugin: string, _event: string, h: Handler) => {
      handler = h
      return Promise.resolve({ unregister })
    })
    return { unregister, tap: (payload: unknown) => handler(payload) }
  }

  it('listens to the plugin for actions performed', () => {
    pretendAndroid()
    registered()

    listenForReminderTaps(() => {})

    expect(addPluginListener).toHaveBeenCalledWith(
      'notification',
      'actionPerformed',
      expect.any(Function)
    )
  })

  it('says when the reminder is tapped, and only then', () => {
    pretendAndroid()
    const { tap } = registered()
    const onTap = vi.fn()

    listenForReminderTaps(onTap)
    tap({ actionId: 'dismiss', notification: { id: REMINDER_ID } })
    expect(onTap).not.toHaveBeenCalled()
    tap({ actionId: 'tap', notification: { id: REMINDER_ID } })
    expect(onTap).toHaveBeenCalledTimes(1)
  })

  it('stops listening when it is told to', async () => {
    pretendAndroid()
    const { unregister } = registered()

    const stop = listenForReminderTaps(() => {})
    await Promise.resolve()
    await Promise.resolve()
    stop()

    expect(unregister).toHaveBeenCalledTimes(1)
  })

  // Stopped before the registration came back: the listener still has to go, or it would
  // outlive the screen that asked for it.
  it('stops a listener that arrives after it was told to stop', async () => {
    pretendAndroid()
    const { unregister } = registered()

    const stop = listenForReminderTaps(() => {})
    stop()
    await Promise.resolve()
    await Promise.resolve()

    expect(unregister).toHaveBeenCalledTimes(1)
  })

  it('does not listen anywhere but Android', () => {
    listenForReminderTaps(() => {})
    expect(addPluginListener).not.toHaveBeenCalled()
  })

  it('does not throw when the listener cannot be registered', async () => {
    pretendAndroid()
    addPluginListener.mockRejectedValue(new Error('no plugin'))
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(() => listenForReminderTaps(() => {})).not.toThrow()
    await Promise.resolve()
    await Promise.resolve()
    expect(logged).toHaveBeenCalledWith(expect.stringContaining('[Daylo]'), expect.any(Error))
  })
})
