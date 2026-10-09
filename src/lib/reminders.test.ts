import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  REMINDER_ICON,
  REMINDER_ID,
  disableReminder,
  enableReminder,
  offeredReminderTime,
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

  // The small icon rides with the notification. It cannot be set in tauri.conf.json: the
  // plugin's Rust half builds with a unit config and a `plugins.notification` block aborts
  // the app at startup. See reminderNotificationIcon.test.ts.
  it('names the drawable Android should put in the status bar', async () => {
    pretendAndroid()
    isPermissionGranted.mockResolvedValue(true)

    await enableReminder(21, 0)

    expect(scheduled()).toEqual({
      options: expect.objectContaining({ icon: REMINDER_ICON }),
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

/**
 * What time to offer somebody who has just made their first activity.
 *
 * It used to be whatever hour this was written with, which is a reminder the person has to
 * go and move before it means anything. The next hour on the hour is soon enough to be
 * tonight, which is the point of being asked now.
 */
describe('the time the offer proposes', () => {
  const at = (hour: number, minute: number) =>
    offeredReminderTime(new Date(2026, 9, 9, hour, minute))

  it('is the next hour, on the hour', () => {
    expect(at(12, 0)).toEqual({ hour: 13, minute: 0 })
    expect(at(14, 37)).toEqual({ hour: 15, minute: 0 })
  })

  // Eleven at night to seven in the morning is a notification nobody wants. Eight in the
  // evening is the next time of day somebody would plausibly be told anything.
  it('stays out of the night', () => {
    expect(at(22, 59)).toEqual({ hour: 20, minute: 0 })
    expect(at(23, 30)).toEqual({ hour: 20, minute: 0 })
    expect(at(3, 0)).toEqual({ hour: 20, minute: 0 })
    expect(at(5, 0)).toEqual({ hour: 20, minute: 0 })
  })

  // The two edges of that window, which is where a rule like this goes wrong. Seven is
  // outside it: being reminded at seven in the morning is a choice people make.
  it('puts seven in the morning on the right side of it', () => {
    expect(at(6, 30)).toEqual({ hour: 7, minute: 0 })
    expect(at(6, 59)).toEqual({ hour: 7, minute: 0 })
    expect(at(5, 59)).toEqual({ hour: 20, minute: 0 })
  })

  it('does not propose eleven, the first hour of the window', () => {
    expect(at(22, 0)).toEqual({ hour: 20, minute: 0 })
    expect(at(21, 0)).toEqual({ hour: 22, minute: 0 })
  })

  /**
   * The examples, which are the part that goes wrong.
   *
   * The rule was right and tested from the day it was written. What was wrong was the
   * sentence explaining it, in the comment on `offeredReminderTime` and again in the
   * changelog fragment, both giving 22:52 as a reminder for eleven tonight. That is the
   * one case `does not propose eleven` exists to forbid, and nothing checked the example
   * against the rule because an example in a comment is not run.
   *
   * It is run now. Change either sentence and this is what says so.
   */
  it('matches the example the comment gives, and the one the changelog gives', () => {
    // "told at 20:52, a reminder at 21:00 is tonight"
    expect(at(20, 52)).toEqual({ hour: 21, minute: 0 })
    // "agreed to at ten to nine is one that arrives at nine"
    expect(at(20, 50)).toEqual({ hour: 21, minute: 0 })
    // "from ten at night until six in the morning ... eight in the evening"
    expect(at(22, 0)).toEqual({ hour: 20, minute: 0 })
    expect(at(5, 59)).toEqual({ hour: 20, minute: 0 })
    expect(at(6, 0)).toEqual({ hour: 7, minute: 0 })
  })
})

/**
 * What to do when the phone does not answer.
 *
 * Found while simulating the Tauri bridge for something else: a stub that returned null
 * where the plugin returns a list made this throw. The plugin is not expected to do that,
 * which is exactly why the line had no guard and why it is worth one: the cases nobody
 * expects are the ones nobody has written down.
 *
 * Which way to fall is the real question, and it is not "assume nothing is scheduled".
 * This function is only reached when there is nothing left to be reminded about, so taking
 * the reminder down is what it came to do. An unknown answer falls towards doing it.
 */
describe('when the phone does not say what is scheduled', () => {
  it('takes the reminder down anyway when the answer is nothing', async () => {
    pretendAndroid()
    pending.mockResolvedValue(null)

    await reconcileReminder(0)

    expect(cancel).toHaveBeenCalledWith([REMINDER_ID])
  })

  it('takes it down when the answer is not a list at all', async () => {
    pretendAndroid()
    pending.mockResolvedValue(undefined)

    await reconcileReminder(0)

    expect(cancel).toHaveBeenCalledWith([REMINDER_ID])
  })

  it('takes it down when asking throws', async () => {
    pretendAndroid()
    pending.mockRejectedValue(new Error('the plugin is not there'))

    await expect(reconcileReminder(0)).resolves.toBeUndefined()
    expect(cancel).toHaveBeenCalledWith([REMINDER_ID])
  })

  // And a real empty list still means what it says: nothing of ours is scheduled, so there
  // is nothing to cancel. That is the difference this whole change is about.
  it('cancels nothing when the phone says the list is empty', async () => {
    pretendAndroid()
    pending.mockResolvedValue([])

    await reconcileReminder(0)

    expect(cancel).not.toHaveBeenCalled()
  })
})
