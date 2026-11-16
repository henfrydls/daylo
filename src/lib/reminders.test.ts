import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  REMINDER_ICON,
  REMINDER_ID,
  disableReminder,
  enableReminder,
  reminderOfferOwed,
  reconcileReminder,
  refreshReminder,
  remindersAvailable,
  askForExactAlarms,
  exactAlarms,
  notificationPermission,
  openNotificationSettings,
  PERMISSION_PATIENCE_MS,
  reminderStartsAfter,
} from './reminders'
import { useCalendarStore } from '../store'

const cancel = vi.hoisted(() => vi.fn())
const pending = vi.hoisted(() => vi.fn())
const invoke = vi.hoisted(() => vi.fn())

vi.mock('@tauri-apps/plugin-notification', () => ({
  cancel,
  pending,
  Schedule: {
    // The real shape, so that what is added to it is seen where the plugin would read it.
    interval: (interval: unknown, allowWhileIdle: boolean) => ({
      at: undefined,
      interval: { interval, allowWhileIdle },
      every: undefined,
    }),
  },
}))
vi.mock('@tauri-apps/api/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tauri-apps/api/core')>()),
  invoke,
}))

const PERMISSION = 'plugin:notification|is_permission_granted'
const REQUEST = 'plugin:notification|request_permission'
const NOTIFY = 'plugin:notification|notify'

/**
 * What the phone answers, command by command. Each test changes the answers it is about.
 * The permission is asked of the plugin every time, live: the page's own
 * Notification.permission is read once when the page loads and never again, so a
 * permission given in the phone's settings never reached it.
 */
let phone: Record<string, (args?: unknown) => Promise<unknown>> = {}

/** The Android app: the commands exist and answer, and notifications are allowed. */
function pretendAndroid() {
  vi.stubGlobal('isTauri', true)
  phone = {
    reminders_available: () => Promise.resolve(true),
    [PERMISSION]: () => Promise.resolve(true),
    [REQUEST]: () => Promise.resolve('granted'),
  }
  invoke.mockImplementation((command: string, args?: unknown) =>
    (phone[command] ?? (() => Promise.resolve(undefined)))(args)
  )
}

/** The plugin's live answer: true granted, false denied, null not asked yet. */
function permissionIs(answer: boolean | null) {
  phone[PERMISSION] = () => Promise.resolve(answer)
}

/** What the person answers when they are asked, as the plugin names it. */
function personAnswers(state: string) {
  phone[REQUEST] = () => Promise.resolve(state)
}

const callsTo = (command: string) => invoke.mock.calls.filter(([c]) => c === command).length

/** What the plugin was asked to schedule, or undefined if it was never asked. */
function scheduled() {
  return invoke.mock.calls.find(([command]) => command === 'plugin:notification|notify')?.[1]
}

beforeEach(() => {
  for (const m of [cancel, pending, invoke]) m.mockReset()
  useCalendarStore.setState({ logs: [] })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

// Measured on a phone on 2026-10-13: the alarm came out as origWhen=21:00:36, carrying the
// seconds of the moment it was scheduled, so a reminder set for nine o'clock arrived 36
// seconds into the minute. The plugin's Kotlin builds the next trigger from a calendar made
// of *now* and overwrites only the fields it was given: it zeroes the milliseconds and
// leaves the seconds alone (NotificationSchedule.kt, buildNextTriggerTime). Sending the zero
// is what makes the time the time.
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
    permissionIs(true)

    await expect(enableReminder(21, 0)).resolves.toMatchObject({ outcome: 'on' })

    expect(scheduled()).toEqual({
      options: expect.objectContaining({
        id: REMINDER_ID,
        // An interval matching hour and minute, which the plugin re-arms each day and
        // restores after a restart or an update. Not Schedule.at: with repeating it computes the
        // repeat gap as the time left until the first fire, so a reminder set at 20:00 for
        // 21:00 would repeat hourly.
        schedule: {
          interval: { interval: { hour: 21, minute: 0, second: 0 }, allowWhileIdle: true },
        },
      }),
    })
  })

  // The small icon rides with the notification. It cannot be set in tauri.conf.json: the
  // plugin's Rust half builds with a unit config and a `plugins.notification` block aborts
  // the app at startup. See reminderNotificationIcon.test.ts.
  it('names the drawable Android should put in the status bar', async () => {
    pretendAndroid()
    permissionIs(true)

    await enableReminder(21, 0)

    expect(scheduled()).toEqual({
      options: expect.objectContaining({ icon: REMINDER_ICON }),
    })
  })

  it('asks for permission only when it does not have it', async () => {
    pretendAndroid()
    permissionIs(true)

    await enableReminder(21, 0)

    expect(callsTo(REQUEST)).toBe(0)
  })

  // Asked once. A person who said no gets nothing scheduled and is not asked again by this
  // path; the setting is what they use if they change their mind.
  it('schedules nothing when permission is refused', async () => {
    pretendAndroid()
    permissionIs(false)
    personAnswers('denied')

    await expect(enableReminder(21, 0)).resolves.toMatchObject({ outcome: 'permission-denied' })
    expect(scheduled()).toBeUndefined()
  })

  // The plugin's own sendNotification builds a window.Notification and the polyfill
  // forwards it inside a promise nobody returns, so a refusal from the phone used to
  // vanish and this said 'on' over nothing scheduled.
  it('says so when the phone refuses it', async () => {
    pretendAndroid()
    permissionIs(true)
    phone[NOTIFY] = () => Promise.reject(new Error('notification channel is blocked'))
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
    expect(callsTo(PERMISSION)).toBe(0)
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
  /**
   * The case every real phone is in, and the one the old code could not act on.
   *
   * getPending reads the plugin's own store, and that store was only ever written by the
   * Kotlin `batch` path. Daylo schedules through `notify`, which reaches `show`, and `show`
   * wrote nothing, before the patched plugin in 1.5.3. So `pending()` answered `[]` on a
   * phone with the reminder live and ringing every night, and the old condition read that
   * as "nothing of ours is scheduled" and cancelled nothing. Somebody who deleted their
   * last activity went on being asked how the day went, over an app with nothing left in it.
   */
  it('takes the reminder down even though the phone lists nothing', async () => {
    pretendAndroid()
    pending.mockResolvedValue([])

    await reconcileReminder(0)

    expect(cancel).toHaveBeenCalledWith([REMINDER_ID])
  })

  it('takes it down when the phone does list it', async () => {
    pretendAndroid()
    pending.mockResolvedValue([{ id: REMINDER_ID, title: 'Daylo', schedule: {} }])

    await reconcileReminder(0)

    expect(cancel).toHaveBeenCalledWith([REMINDER_ID])
  })

  it('leaves it alone while activities remain', async () => {
    pretendAndroid()

    await reconcileReminder(3)

    expect(cancel).not.toHaveBeenCalled()
  })

  /**
   * It does not ask any more, and that is the change.
   *
   * By the time this runs there is nothing left to be reminded about, so taking the
   * reminder down is the whole of what it came to do, whatever any list says. Cancelling
   * one that was never scheduled costs nothing. Asking first only ever gave an answer that
   * could talk it out of its own job, and on a real phone that is exactly what it did.
   */
  it('does not consult a list it cannot act on', async () => {
    pretendAndroid()

    await reconcileReminder(0)

    expect(pending).not.toHaveBeenCalled()
    expect(cancel).toHaveBeenCalledWith([REMINDER_ID])
  })

  // Nothing on this path may throw: it runs from a screen somebody is looking at, right
  // after they deleted something.
  it('does not throw when cancelling itself fails', async () => {
    pretendAndroid()
    cancel.mockRejectedValue(new Error('the plugin is not there'))

    await expect(reconcileReminder(0)).resolves.toBeUndefined()
  })

  it('does nothing at all where there are no reminders', async () => {
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
    permissionIs(true)

    await expect(refreshReminder(21, 0)).resolves.toBe(true)

    expect(scheduled()).toEqual({
      options: expect.objectContaining({
        id: REMINDER_ID,
        schedule: {
          interval: { interval: { hour: 21, minute: 0, second: 0 }, allowWhileIdle: true },
        },
      }),
    })
  })

  // Opening the app is not a moment to be asked for anything. Somebody who took the
  // permission away has said what they think of it.
  it('never asks for the permission', async () => {
    pretendAndroid()
    permissionIs(false)

    await refreshReminder(21, 0)

    expect(callsTo(REQUEST)).toBe(0)
  })

  it('reports itself off when the permission has been taken away', async () => {
    pretendAndroid()
    permissionIs(false)

    await expect(refreshReminder(21, 0)).resolves.toBe(false)
    expect(scheduled()).toBeUndefined()
  })

  it('does nothing at all off Android', async () => {
    await expect(refreshReminder(21, 0)).resolves.toBe(false)
    expect(callsTo(PERMISSION)).toBe(0)
  })

  it('reports itself off when the phone refuses the schedule', async () => {
    pretendAndroid()
    permissionIs(true)
    phone[NOTIFY] = () => Promise.reject(new Error('nope'))
    vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(refreshReminder(21, 0)).resolves.toBe(false)
  })
})

/**
 * A re-arm that set off at launch and arrives after something newer.
 *
 * Opening the app re-arms the reminder through a few round trips to the phone, and the
 * person can act during them. Each test holds the re-arm's permission check open, lets the
 * newer call in, and only then lets the re-arm go on, which is the order a slow phone puts
 * them in.
 */
describe('a re-arm overtaken on its way', () => {
  function heldOpen() {
    let answer!: (granted: boolean) => void
    const held = new Promise<boolean>((r) => (answer = r))
    const later = phone[PERMISSION]
    let first = true
    phone[PERMISSION] = () => {
      if (!first) return later()
      first = false
      return held
    }
    return (granted: boolean) => answer(granted)
  }

  const notified = () => callsTo(NOTIFY)

  // The last habit is deleted while the re-arm is on its way. The cancel used to go
  // through at once and the re-arm landed after it, and the plugin stores what it arms:
  // the reminder came back after every restart, over an app with nothing in it.
  it('does not schedule the reminder after the last habit took it down', async () => {
    pretendAndroid()
    const answer = heldOpen()

    const refreshed = refreshReminder(21, 0)
    const reconciled = reconcileReminder(0)
    answer(true)

    const answered = await refreshed
    await reconciled
    expect(notified()).toBe(0)
    expect(cancel).toHaveBeenCalledWith([REMINDER_ID])
    expect(answered).toBeNull()
  })

  // The switch is turned on while the re-arm is on its way, before the permission was
  // given. The re-arm saw no permission and said off, late, and the screen cancels on
  // off: the reminder somebody had just turned on was taken down under them.
  it('does not report off after the switch was turned on', async () => {
    pretendAndroid()
    const answer = heldOpen()

    const refreshed = refreshReminder(21, 0)
    const enabled = enableReminder(21, 0)
    answer(false)

    await expect(refreshed).resolves.toBeNull()
    await expect(enabled).resolves.toEqual({ outcome: 'on' })
    expect(notified()).toBe(1)
  })

  // Nothing newer came in: the re-arm says what it found, as before.
  it('still reports off when nothing came after it', async () => {
    pretendAndroid()
    const answer = heldOpen()

    const refreshed = refreshReminder(21, 0)
    answer(false)

    await expect(refreshed).resolves.toBe(false)
  })

  // The calls made with the switch are never skipped, only put in order: turning it on
  // and straight off leaves it off, whatever the phone answers first.
  it('keeps the switch calls in the order they were made', async () => {
    pretendAndroid()
    const answer = heldOpen()

    const enabled = enableReminder(21, 0)
    const disabled = disableReminder()
    answer(true)
    await enabled
    await disabled

    const order =
      invoke.mock.invocationCallOrder[
        invoke.mock.calls.findIndex(([command]) => command === 'plugin:notification|notify')
      ]
    expect(order).toBeLessThan(cancel.mock.invocationCallOrder[0])
  })
})

/**
 * Whether the offer is owed: the one rule DailyReminder and App both read.
 */
describe('whether the offer is owed', () => {
  const owed = {
    available: true,
    offered: false,
    activityCount: 1,
    lastTickDay: '2026-10-09',
    dismissedOn: null,
    closedThisSession: false,
  }

  // The first habit is enough, on the day it is made.
  it('is owed as soon as there is a habit, on the first day of use', () => {
    expect(reminderOfferOwed(owed)).toBe(true)
  })

  it('is not owed where reminders do not exist', () => {
    expect(reminderOfferOwed({ ...owed, available: false })).toBe(false)
  })

  it('is not owed without a habit', () => {
    expect(reminderOfferOwed({ ...owed, activityCount: 0 })).toBe(false)
  })

  it('is not owed once answered', () => {
    expect(reminderOfferOwed({ ...owed, offered: true })).toBe(false)
  })

  it('is not owed again in the session it was closed in', () => {
    expect(reminderOfferOwed({ ...owed, closedThisSession: true })).toBe(false)
  })

  it('is not owed on the day it was put off, even after a tick', () => {
    expect(reminderOfferOwed({ ...owed, dismissedOn: '2026-10-09' })).toBe(false)
  })

  it('is owed again after a tick on a later day', () => {
    expect(
      reminderOfferOwed({ ...owed, dismissedOn: '2026-10-09', lastTickDay: '2026-10-10' })
    ).toBe(true)
  })
})

describe('whether it will arrive on time', () => {
  /** The phone, answering what the installed build asks for, what it allows, and its API level. */
  const phoneSays = (answer: unknown) => {
    pretendAndroid()
    invoke.mockImplementation((command: string) =>
      command === 'exact_alarms' ? Promise.resolve(answer) : Promise.resolve(true)
    )
  }

  // The Play build on Android 12 and up: the installed package does not ask for the
  // permission, so Android picks the moment and there is nothing to offer.
  it('is around the time when the build does not ask, on Android 12 and up', async () => {
    phoneSays({ requested: false, allowed: false, sdk: 34 })
    await expect(exactAlarms()).resolves.toBe('inexact')
  })

  // Read from the package, not from the phone's answer: a build that never asked has no
  // screen to send anybody to.
  it('is around the time even if a build that does not ask is somehow allowed', async () => {
    phoneSays({ requested: false, allowed: true, sdk: 31 })
    await expect(exactAlarms()).resolves.toBe('inexact')
  })

  // The APK, on a phone that allows it.
  it('is on time when the build asks and the phone allows it', async () => {
    phoneSays({ requested: true, allowed: true, sdk: 34 })
    await expect(exactAlarms()).resolves.toBe('exact')
  })

  // The APK on Android 14 and up, where the permission comes denied.
  it('is late when the build asks and the phone says no', async () => {
    phoneSays({ requested: true, allowed: false, sdk: 34 })
    await expect(exactAlarms()).resolves.toBe('denied')
  })

  // Below Android 12 there is no permission to have: the plugin arms an exact alarm for
  // every build (Arming.kt, armsExact: sdk < S || (declares && can)), the Play one included.
  // Saying "Android picks the exact moment" there would be false.
  it('is on time below Android 12 even for the build that does not ask', async () => {
    phoneSays({ requested: false, allowed: true, sdk: 30 })
    await expect(exactAlarms()).resolves.toBe('exact')
  })

  // And whatever the phone says about a permission that does not exist there yet.
  it('is on time below Android 12 whatever the phone says about allowing it', async () => {
    phoneSays({ requested: true, allowed: false, sdk: 26 })
    await expect(exactAlarms()).resolves.toBe('exact')
    phoneSays({ requested: false, allowed: false, sdk: 30 })
    await expect(exactAlarms()).resolves.toBe('exact')
  })

  it('takes Android 12 as the first version with the permission', async () => {
    phoneSays({ requested: false, allowed: true, sdk: 31 })
    await expect(exactAlarms()).resolves.toBe('inexact')
    phoneSays({ requested: true, allowed: false, sdk: 31 })
    await expect(exactAlarms()).resolves.toBe('denied')
  })

  it('is around the time where there is no phone to ask', async () => {
    vi.stubGlobal('isTauri', false)
    await expect(exactAlarms()).resolves.toBe('inexact')
    expect(invoke).not.toHaveBeenCalled()
  })

  // Not knowing is said in the words that promise nothing and offer nothing, and said in
  // the console, because an app that cannot read its own package is something to find.
  it('is around the time, and says why in the console, when the question fails', async () => {
    vi.stubGlobal('isTauri', true)
    invoke.mockRejectedValue('no such command')
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(exactAlarms()).resolves.toBe('inexact')
    expect(logged).toHaveBeenCalledWith(expect.stringContaining('[Daylo]'), 'no such command')
  })

  // An answer in some other shape is not an answer. An older native side, or a fake that
  // says false to everything it does not know, must not be read as a yes.
  it('is around the time, and says so in the console, when the answer makes no sense', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    const answers = [
      false,
      null,
      'exact',
      { requested: 'yes', allowed: true, sdk: 34 },
      {},
      { requested: false, allowed: true },
      { requested: false, allowed: true, sdk: '30' },
    ]
    for (const answer of answers) {
      phoneSays(answer)
      await expect(exactAlarms()).resolves.toBe('inexact')
    }
    expect(logged).toHaveBeenCalledTimes(answers.length)
  })
})

describe('asking for exact alarms', () => {
  it('does nothing where there is no phone', async () => {
    vi.stubGlobal('isTauri', false)
    await expect(askForExactAlarms()).resolves.toBe(false)
    expect(invoke).not.toHaveBeenCalled()
  })

  it('says whether the system screen opened', async () => {
    pretendAndroid()
    invoke.mockImplementation((command: string) =>
      command === 'ask_for_exact_alarms' ? Promise.resolve(true) : Promise.resolve(true)
    )
    await expect(askForExactAlarms()).resolves.toBe(true)
  })

  // Nothing is granted by opening a screen, so a refusal to open it is not a refusal of
  // anything else: it only means there was no screen to open.
  it('says no when the screen would not open', async () => {
    vi.stubGlobal('isTauri', true)
    invoke.mockRejectedValue('no activity')
    await expect(askForExactAlarms()).resolves.toBe(false)
  })
})

/**
 * The permission, read from the plugin each time it is needed (#192).
 *
 * The plugin's own isPermissionGranted reads window.Notification.permission, which its
 * script sets once when the page loads. Somebody who said no, went to the phone's settings
 * and allowed notifications came back to a page that still believed the no, and the switch
 * stayed dead until Daylo was closed and opened again.
 */
describe('the permission, as the phone has it now', () => {
  it('is granted, denied, or not asked yet, as the plugin says', async () => {
    pretendAndroid()
    permissionIs(true)
    await expect(notificationPermission()).resolves.toBe('granted')
    permissionIs(false)
    await expect(notificationPermission()).resolves.toBe('denied')
    permissionIs(null)
    await expect(notificationPermission()).resolves.toBe('prompt')
  })

  it('asks the plugin every time rather than remembering', async () => {
    pretendAndroid()
    await notificationPermission()
    await notificationPermission()
    expect(callsTo(PERMISSION)).toBe(2)
  })

  // A question that never comes back must not hold the switch, or every call queued
  // behind it, for ever. Not knowing is its own answer.
  it('is unknown when the plugin does not answer in time', async () => {
    vi.useFakeTimers()
    try {
      pretendAndroid()
      phone[PERMISSION] = () => new Promise(() => {})
      vi.spyOn(console, 'error').mockImplementation(() => {})

      const asked = notificationPermission()
      await vi.advanceTimersByTimeAsync(PERMISSION_PATIENCE_MS - 1)
      let settled = false
      void asked.then(() => (settled = true))
      await Promise.resolve()
      expect(settled).toBe(false)
      await vi.advanceTimersByTimeAsync(1)
      await expect(asked).resolves.toBe('unknown')
    } finally {
      vi.useRealTimers()
    }
  })

  it('is unknown, and says so in the console, when the question fails', async () => {
    pretendAndroid()
    phone[PERMISSION] = () => Promise.reject('no such command')
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(notificationPermission()).resolves.toBe('unknown')
    expect(logged).toHaveBeenCalledWith(expect.stringContaining('[Daylo]'), 'no such command')
  })

  it('is unknown for an answer in a shape it does not know', async () => {
    pretendAndroid()
    phone[PERMISSION] = () => Promise.resolve('granted')
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(notificationPermission()).resolves.toBe('unknown')
  })

  it('is unknown, without asking anything, where there are no reminders', async () => {
    await expect(notificationPermission()).resolves.toBe('unknown')
    expect(invoke).not.toHaveBeenCalled()
  })
})

describe('turning it on, with the permission as it is now', () => {
  it('asks the person when the phone has not asked yet, and schedules on a yes', async () => {
    pretendAndroid()
    permissionIs(null)
    personAnswers('granted')

    await expect(enableReminder(21, 0)).resolves.toEqual({ outcome: 'on' })
    expect(callsTo(REQUEST)).toBe(1)
    expect(callsTo(NOTIFY)).toBe(1)
  })

  // The plugin calls one refusal "prompt-with-rationale": Android would still ask again.
  it('schedules nothing when the person says no', async () => {
    pretendAndroid()
    permissionIs(null)
    personAnswers('prompt-with-rationale')

    await expect(enableReminder(21, 0)).resolves.toEqual({ outcome: 'permission-denied' })
    expect(callsTo(NOTIFY)).toBe(0)
  })

  // A permission given in the phone's settings, after the page loaded: the cached
  // Notification.permission still says denied, the plugin says granted.
  it('schedules without asking once the permission was given in the settings', async () => {
    pretendAndroid()
    permissionIs(true)

    await expect(enableReminder(21, 0)).resolves.toEqual({ outcome: 'on' })
    expect(callsTo(REQUEST)).toBe(0)
  })

  // Nothing is asked and nothing is scheduled on a question that did not come back: the
  // request could hang the same way, and it holds every call behind it.
  it('says the phone did not answer, and asks nothing, when the permission is unknown', async () => {
    pretendAndroid()
    phone[PERMISSION] = () => Promise.reject('stuck')
    vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(enableReminder(21, 0)).resolves.toMatchObject({ outcome: 'unanswered' })
    expect(callsTo(REQUEST)).toBe(0)
    expect(callsTo(NOTIFY)).toBe(0)
  })
})

describe('re-arming, with the permission as it is now', () => {
  // Not knowing is not "off": the screen would turn the switch off and cancel a reminder
  // that may be perfectly fine, on a slow answer.
  it('decides nothing when the permission is unknown', async () => {
    pretendAndroid()
    phone[PERMISSION] = () => Promise.reject('stuck')
    vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(refreshReminder(21, 0)).resolves.toBeNull()
    expect(callsTo(NOTIFY)).toBe(0)
  })

  it('reports itself off when the phone has not asked yet', async () => {
    pretendAndroid()
    permissionIs(null)

    await expect(refreshReminder(21, 0)).resolves.toBe(false)
    expect(callsTo(REQUEST)).toBe(0)
  })
})

/**
 * Not on a day already logged (#192). "How did today go? Tap to log it." at nine, to
 * somebody who logged at seven, every day, teaches them to silence it.
 *
 * The plugin's interval keeps going by itself every day after its first firing, so the
 * reminder is still an interval: only its first firing is moved, to tomorrow. A day nobody
 * opens Daylo is still reminded, which is why it was not done by cancelling.
 */
describe('a day already logged', () => {
  const activity = 'a1'
  const log = (date: string, completed = true) => ({
    id: `${activity}-${date}`,
    activityId: activity,
    date,
    completed,
    createdAt: '2026-11-16T08:00:00.000Z',
  })

  it('starts after midnight when anything was logged today', () => {
    const now = new Date(2026, 10, 16, 19, 30)
    expect(reminderStartsAfter([log('2026-11-16')], now)).toBe(
      new Date(2026, 10, 17, 0, 0, 0, 0).getTime()
    )
  })

  it('starts now when today has nothing logged', () => {
    const now = new Date(2026, 10, 16, 19, 30)
    expect(reminderStartsAfter([log('2026-11-15')], now)).toBeUndefined()
    expect(reminderStartsAfter([], now)).toBeUndefined()
  })

  // Unticking keeps a log that has a note, with completed false. That day is not logged.
  it('does not count a log that was unticked', () => {
    const now = new Date(2026, 10, 16, 19, 30)
    expect(reminderStartsAfter([log('2026-11-16', false)], now)).toBeUndefined()
  })

  // The day is the phone's own, read at the moment of arming: just before midnight, the
  // next one is minutes away, and the reminder is tomorrow evening's.
  it('reads the day from the clock it is given', () => {
    expect(reminderStartsAfter([log('2026-11-16')], new Date(2026, 10, 16, 23, 59))).toBe(
      new Date(2026, 10, 17).getTime()
    )
    expect(reminderStartsAfter([log('2026-11-16')], new Date(2026, 10, 17, 0, 1))).toBeUndefined()
  })

  it('tells the plugin to start tomorrow when it arms on a logged day', async () => {
    pretendAndroid()
    const today = new Date()
    const day = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    useCalendarStore.setState({ logs: [log(day)] })

    await refreshReminder(21, 0)
    const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)
    expect(scheduled()).toEqual({
      options: expect.objectContaining({
        schedule: {
          interval: {
            interval: { hour: 21, minute: 0, second: 0 },
            allowWhileIdle: true,
            notBefore: tomorrow.getTime(),
          },
        },
      }),
    })
  })

  it('says nothing about tomorrow on a day with nothing logged', async () => {
    pretendAndroid()

    await enableReminder(21, 0)
    const options = (scheduled() as { options: { schedule: { interval: object } } }).options
    expect(options.schedule.interval).not.toHaveProperty('notBefore')
  })
})

describe('the phone settings for notifications', () => {
  it('opens them, and says whether they opened', async () => {
    pretendAndroid()
    phone.open_notification_settings = () => Promise.resolve(true)

    await expect(openNotificationSettings()).resolves.toBe(true)
    expect(callsTo('open_notification_settings')).toBe(1)
  })

  it('says no when they would not open', async () => {
    pretendAndroid()
    phone.open_notification_settings = () => Promise.reject('no activity')

    await expect(openNotificationSettings()).resolves.toBe(false)
  })

  it('does nothing where there is no phone', async () => {
    await expect(openNotificationSettings()).resolves.toBe(false)
    expect(invoke).not.toHaveBeenCalled()
  })
})
