import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  REMINDER_ID,
  disableReminder,
  enableReminder,
  reconcileReminder,
  refreshReminder,
  remindersAvailable,
} from './reminders'

const isPermissionGranted = vi.hoisted(() => vi.fn())
const requestPermission = vi.hoisted(() => vi.fn())
const cancel = vi.hoisted(() => vi.fn())
const pending = vi.hoisted(() => vi.fn())
const invoke = vi.hoisted(() => vi.fn())

vi.mock('@tauri-apps/plugin-notification', () => ({
  isPermissionGranted,
  requestPermission,
  cancel,
  pending,
  Schedule: {
    interval: (interval: unknown, allowWhileIdle: boolean) => ({ interval, allowWhileIdle }),
  },
}))
vi.mock('@tauri-apps/api/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tauri-apps/api/core')>()),
  invoke,
}))

/** The Android app: the commands exist and answer. */
function pretendAndroid() {
  vi.stubGlobal('isTauri', true)
  invoke.mockImplementation((command: string) =>
    command === 'reminders_available' ? Promise.resolve(true) : Promise.resolve(undefined)
  )
}

/** What the plugin was asked to schedule, or undefined if it was never asked. */
function scheduled() {
  return invoke.mock.calls.find(([command]) => command === 'plugin:notification|notify')?.[1]
}

beforeEach(() => {
  for (const m of [isPermissionGranted, requestPermission, cancel, pending, invoke]) m.mockReset()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('where reminders exist', () => {
  it('nowhere on the web', async () => {
    await expect(remindersAvailable()).resolves.toBe(false)
    expect(invoke).not.toHaveBeenCalled()
  })

  // reminders_available is registered on Android only, so a rejected call is how every
  // other platform identifies itself. Same shape as the save dialog, for the same reason:
  // one side decides and the other cannot drift from it.
  it('nowhere the command is not registered', async () => {
    vi.stubGlobal('isTauri', true)
    invoke.mockRejectedValue(new Error('Command reminders_available not found'))
    await expect(remindersAvailable()).resolves.toBe(false)
  })

  it('on Android', async () => {
    pretendAndroid()
    await expect(remindersAvailable()).resolves.toBe(true)
  })
})

describe('turning the reminder on', () => {
  it('schedules a daily interval that can wake a sleeping phone', async () => {
    pretendAndroid()
    isPermissionGranted.mockResolvedValue(true)

    await expect(enableReminder(21, 0)).resolves.toMatchObject({ outcome: 'on' })

    expect(scheduled()).toEqual({
      options: expect.objectContaining({
        id: REMINDER_ID,
        // An interval matching hour and minute, which Android re-arms on its own and the
        // plugin restores after a reboot. Not Schedule.at: with repeating it computes the
        // repeat gap as the time left until the first fire, so a reminder set at 20:00 for
        // 21:00 would repeat hourly.
        schedule: { interval: { hour: 21, minute: 0 }, allowWhileIdle: true },
      }),
    })
  })

  it('asks for permission only when it does not have it', async () => {
    pretendAndroid()
    isPermissionGranted.mockResolvedValue(true)

    await enableReminder(21, 0)

    expect(requestPermission).not.toHaveBeenCalled()
  })

  // Asked once. A person who said no gets nothing scheduled and is not asked again by this
  // path; the setting is what they use if they change their mind.
  it('schedules nothing when permission is refused', async () => {
    pretendAndroid()
    isPermissionGranted.mockResolvedValue(false)
    requestPermission.mockResolvedValue('denied')

    await expect(enableReminder(21, 0)).resolves.toMatchObject({ outcome: 'permission-denied' })
    expect(scheduled()).toBeUndefined()
  })

  // The plugin's own sendNotification builds a window.Notification and the polyfill
  // forwards it inside a promise nobody returns, so a refusal from the phone used to
  // vanish and this said 'on' over nothing scheduled.
  it('says so when the phone refuses it', async () => {
    pretendAndroid()
    isPermissionGranted.mockResolvedValue(true)
    invoke.mockImplementation((command: string) =>
      command === 'reminders_available'
        ? Promise.resolve(true)
        : Promise.reject(new Error('notification channel is blocked'))
    )
    const complaint = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(enableReminder(21, 0)).resolves.toMatchObject({ outcome: 'failed' })

    // Written down rather than swallowed: on Android this line reaches logcat, which is
    // where somebody looks when a reminder does not arrive.
    expect(complaint).toHaveBeenCalledWith(
      expect.stringContaining('could not be scheduled'),
      expect.any(Error)
    )
  })

  it('does nothing at all off Android', async () => {
    await expect(enableReminder(21, 0)).resolves.toMatchObject({ outcome: 'unavailable' })
    expect(isPermissionGranted).not.toHaveBeenCalled()
    expect(scheduled()).toBeUndefined()
  })
})

describe('turning it off', () => {
  // By id, never cancelAll: that would take down anything else the app ever schedules.
  it('cancels only our own notification', async () => {
    pretendAndroid()

    await disableReminder()

    expect(cancel).toHaveBeenCalledWith([REMINDER_ID])
  })

  it('does nothing at all off Android', async () => {
    await disableReminder()

    expect(cancel).not.toHaveBeenCalled()
  })
})

describe('when the last activity goes', () => {
  it('takes the reminder down with it', async () => {
    pretendAndroid()
    pending.mockResolvedValue([{ id: REMINDER_ID, title: 'Daylo', schedule: {} }])

    await reconcileReminder(0)

    expect(cancel).toHaveBeenCalledWith([REMINDER_ID])
  })

  it('leaves it alone while activities remain', async () => {
    pretendAndroid()

    await reconcileReminder(3)

    expect(pending).not.toHaveBeenCalled()
    expect(cancel).not.toHaveBeenCalled()
  })

  // Reads what is really scheduled rather than trusting stored state: the phone's own
  // settings can take notifications away behind the app's back.
  it('cancels nothing when nothing of ours is scheduled', async () => {
    pretendAndroid()
    pending.mockResolvedValue([{ id: 99, title: 'Something else', schedule: {} }])

    await reconcileReminder(0)

    expect(cancel).not.toHaveBeenCalled()
  })
})

/**
 * The plugin arms the first fire with setExactAndAllowWhileIdle on RTC_WAKEUP, but every
 * re-arm after that, done from its own broadcast receiver, falls back to plain RTC. From
 * the second evening on, a dozing phone can hold the reminder until it next wakes. Arming
 * it again when the app is opened puts the good alarm back for the next evening, which is
 * the one that matters to somebody who opens Daylo to log their day.
 */
describe('re-arming at launch', () => {
  it('schedules again at the stored time', async () => {
    pretendAndroid()
    isPermissionGranted.mockResolvedValue(true)

    await expect(refreshReminder(21, 0)).resolves.toBe(true)

    expect(scheduled()).toEqual({
      options: expect.objectContaining({
        id: REMINDER_ID,
        schedule: { interval: { hour: 21, minute: 0 }, allowWhileIdle: true },
      }),
    })
  })

  // Opening the app is not a moment to be asked for anything. Somebody who took the
  // permission away has said what they think of it.
  it('never asks for the permission', async () => {
    pretendAndroid()
    isPermissionGranted.mockResolvedValue(false)

    await refreshReminder(21, 0)

    expect(requestPermission).not.toHaveBeenCalled()
  })

  it('reports itself off when the permission has been taken away', async () => {
    pretendAndroid()
    isPermissionGranted.mockResolvedValue(false)

    await expect(refreshReminder(21, 0)).resolves.toBe(false)
    expect(scheduled()).toBeUndefined()
  })

  it('does nothing at all off Android', async () => {
    await expect(refreshReminder(21, 0)).resolves.toBe(false)
    expect(isPermissionGranted).not.toHaveBeenCalled()
  })

  it('reports itself off when the phone refuses the schedule', async () => {
    pretendAndroid()
    isPermissionGranted.mockResolvedValue(true)
    invoke.mockImplementation((command: string) =>
      command === 'reminders_available' ? Promise.resolve(true) : Promise.reject(new Error('nope'))
    )
    vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(refreshReminder(21, 0)).resolves.toBe(false)
  })
})
