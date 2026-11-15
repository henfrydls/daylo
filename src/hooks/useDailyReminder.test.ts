import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useDailyReminder } from './useDailyReminder'
import { useCalendarStore } from '../store'

const enableReminder = vi.hoisted(() => vi.fn())
const disableReminder = vi.hoisted(() => vi.fn())
const exactAlarms = vi.hoisted(() => vi.fn())
const askForExactAlarms = vi.hoisted(() => vi.fn())

vi.mock('../lib/reminders', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/reminders')>()),
  enableReminder,
  disableReminder,
  exactAlarms,
  askForExactAlarms,
}))

const showToast = vi.fn()
vi.mock('../components/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../components/ui')>()),
  useToast: () => ({ showToast }),
}))

const reminder = () => useCalendarStore.getState()

beforeEach(() => {
  enableReminder.mockReset().mockResolvedValue({ outcome: 'on' })
  // The APK on a phone that allows it. The Play build, which does not ask, has tests of
  // its own below.
  exactAlarms.mockReset().mockResolvedValue('exact')
  askForExactAlarms.mockReset().mockResolvedValue(true)
  disableReminder.mockReset().mockResolvedValue(undefined)
  showToast.mockReset()
  useCalendarStore.setState({ reminderEnabled: false, reminderHour: 21, reminderMinute: 0 })
})

afterEach(() => {
  vi.restoreAllMocks()
})

/**
 * What the reminder sheet knew, now that two screens ask for the same reminder.
 *
 * The rule the whole thing hangs on: **the store is written after the platform agrees, and
 * never before**. A switch that wrote first would say a reminder is running on a phone that
 * declined to schedule one, and the person would find out by not being reminded.
 */
describe('turning it on', () => {
  it('schedules at the time it was given, and only then says it is on', async () => {
    const { result } = renderHook(() => useDailyReminder())

    await act(async () => {
      await result.current.turnOn(8, 30)
    })

    expect(enableReminder).toHaveBeenCalledWith(8, 30)
    expect(reminder().reminderEnabled).toBe(true)
    expect(reminder().reminderHour).toBe(8)
    expect(reminder().reminderMinute).toBe(30)
  })

  /**
   * The rule, watched **while the platform is still thinking** rather than afterwards.
   *
   * Looking only at the end state cannot see this: a hook that wrote `true` first and then
   * corrected itself on a refusal ends up in the same place. What differs is the window in
   * between, where the switch is on and nothing has been scheduled. On a phone that is a
   * switch that flicks on and back off by itself, and on a slow answer it is a switch left
   * claiming a reminder for as long as the wait lasts.
   */
  it('says nothing is on until the platform has said yes', async () => {
    let letItAnswer: (answer: { outcome: string }) => void = () => {}
    enableReminder.mockReturnValue(
      new Promise<{ outcome: string }>((resolve) => {
        letItAnswer = resolve
      })
    )
    const { result } = renderHook(() => useDailyReminder())

    let asking: Promise<boolean> | null = null
    await act(async () => {
      asking = result.current.turnOn(8, 30)
    })

    expect(reminder().reminderEnabled).toBe(false)

    await act(async () => {
      letItAnswer({ outcome: 'on' })
      await asking
    })

    expect(reminder().reminderEnabled).toBe(true)
  })

  it('stays off when the permission is refused, and says why', async () => {
    enableReminder.mockResolvedValue({ outcome: 'permission-denied' })
    const { result } = renderHook(() => useDailyReminder())

    await act(async () => {
      await result.current.turnOn(8, 30)
    })

    expect(reminder().reminderEnabled).toBe(false)
    expect(showToast).toHaveBeenCalledWith('Daylo needs permission to send notifications', 'error')
  })

  it('stays off, and quotes the phone, when the schedule is refused', async () => {
    enableReminder.mockResolvedValue({ outcome: 'failed', reason: 'exact alarms are off' })
    const { result } = renderHook(() => useDailyReminder())

    await act(async () => {
      await result.current.turnOn(8, 30)
    })

    expect(reminder().reminderEnabled).toBe(false)
    expect(result.current.failure).toBe('exact alarms are off')
  })

  it('says something even when the phone says nothing', async () => {
    enableReminder.mockResolvedValue({ outcome: 'failed' })
    const { result } = renderHook(() => useDailyReminder())

    await act(async () => {
      await result.current.turnOn(8, 30)
    })

    expect(result.current.failure).toBe('the phone did not say why')
  })

  it('stops showing an old reason once one is accepted', async () => {
    enableReminder.mockResolvedValueOnce({ outcome: 'failed', reason: 'exact alarms are off' })
    const { result } = renderHook(() => useDailyReminder())
    await act(async () => {
      await result.current.turnOn(8, 30)
    })
    expect(result.current.failure).not.toBeNull()

    enableReminder.mockResolvedValue({ outcome: 'on' })
    await act(async () => {
      await result.current.turnOn(9, 0)
    })

    expect(result.current.failure).toBeNull()
  })

  // A refusal while it was on, a new time picked after the permission was taken away for
  // instance, leaves the switch off, and the alarm already on the phone has to go with it.
  // Left there, the plugin would restore it after every restart and it would ring under a
  // switch that says off.
  it('takes down the alarm already set when the permission is refused', async () => {
    useCalendarStore.setState({ reminderEnabled: true })
    enableReminder.mockResolvedValue({ outcome: 'permission-denied' })
    const { result } = renderHook(() => useDailyReminder())

    await act(async () => {
      await result.current.turnOn(8, 30)
    })

    expect(disableReminder).toHaveBeenCalled()
    expect(reminder().reminderEnabled).toBe(false)
  })

  it('takes down the alarm already set when the schedule is refused', async () => {
    useCalendarStore.setState({ reminderEnabled: true })
    enableReminder.mockResolvedValue({ outcome: 'failed', reason: 'the phone said no' })
    const { result } = renderHook(() => useDailyReminder())

    await act(async () => {
      await result.current.turnOn(8, 30)
    })

    expect(disableReminder).toHaveBeenCalled()
    expect(reminder().reminderEnabled).toBe(false)
  })

  it('still turns the switch off when taking the alarm down fails', async () => {
    useCalendarStore.setState({ reminderEnabled: true })
    enableReminder.mockResolvedValue({ outcome: 'failed', reason: 'the phone said no' })
    disableReminder.mockRejectedValue('cancel failed')
    const { result } = renderHook(() => useDailyReminder())

    await act(async () => {
      await result.current.turnOn(8, 30)
    })

    expect(reminder().reminderEnabled).toBe(false)
  })

  it('cancels nothing when it is accepted', async () => {
    const { result } = renderHook(() => useDailyReminder())

    await act(async () => {
      await result.current.turnOn(8, 30)
    })

    expect(disableReminder).not.toHaveBeenCalled()
  })

  // The time it refused is still the time that was asked for, so the picker shows what the
  // person chose rather than snapping back to the old one.
  it('keeps the time that was asked for even when it was refused', async () => {
    enableReminder.mockResolvedValue({ outcome: 'permission-denied' })
    const { result } = renderHook(() => useDailyReminder())

    await act(async () => {
      await result.current.turnOn(8, 30)
    })

    expect(reminder().reminderHour).toBe(8)
    expect(reminder().reminderMinute).toBe(30)
  })
})

describe('turning it off', () => {
  it('cancels it and goes back to off', async () => {
    useCalendarStore.setState({ reminderEnabled: true })
    const { result } = renderHook(() => useDailyReminder())

    await act(async () => {
      await result.current.turnOff()
    })

    expect(disableReminder).toHaveBeenCalled()
    expect(reminder().reminderEnabled).toBe(false)
  })
})

// Two different things, depending on whether there is anything running to reschedule.
describe('the time', () => {
  it('reschedules at once while the reminder is on', async () => {
    useCalendarStore.setState({ reminderEnabled: true })
    const { result } = renderHook(() => useDailyReminder())

    await act(async () => {
      result.current.changeTime(7, 15)
    })

    expect(enableReminder).toHaveBeenCalledWith(7, 15)
    expect(reminder().reminderHour).toBe(7)
  })

  it('is only remembered while the reminder is off', async () => {
    const { result } = renderHook(() => useDailyReminder())

    await act(async () => {
      result.current.changeTime(7, 15)
    })

    // Nothing to reschedule, so nothing is asked of the platform.
    expect(enableReminder).not.toHaveBeenCalled()
    expect(reminder().reminderHour).toBe(7)
    expect(reminder().reminderEnabled).toBe(false)
  })
})

describe('what it says', () => {
  it('says the time the way somebody would', () => {
    useCalendarStore.setState({ reminderHour: 20, reminderMinute: 0 })
    const { result } = renderHook(() => useDailyReminder())

    expect(result.current.at).toBe('8:00 PM')
  })
})

describe('whether it will arrive on time', () => {
  it('asks the phone when the reminder is already on', async () => {
    useCalendarStore.setState({ reminderEnabled: true })
    exactAlarms.mockResolvedValue('denied')

    const { result } = renderHook(() => useDailyReminder())
    await waitFor(() => expect(result.current.punctuality).toBe('denied'))
  })

  it('says nothing about a reminder nobody has set', async () => {
    useCalendarStore.setState({ reminderEnabled: false })

    renderHook(() => useDailyReminder())
    await waitFor(() => expect(enableReminder).not.toHaveBeenCalled())
    expect(exactAlarms).not.toHaveBeenCalled()
  })

  // The permission is granted on a screen that belongs to the phone, not to Daylo, so
  // coming back is the only moment the app can learn the answer changed. Without this the
  // sheet would keep offering a fix for something already fixed.
  it('asks again when the app comes back to the front', async () => {
    useCalendarStore.setState({ reminderEnabled: true })
    exactAlarms.mockResolvedValue('denied')
    const { result } = renderHook(() => useDailyReminder())
    await waitFor(() => expect(result.current.punctuality).toBe('denied'))

    exactAlarms.mockResolvedValue('exact')
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
    })

    await waitFor(() => expect(result.current.punctuality).toBe('exact'))
  })

  it('asks again after the reminder is turned on', async () => {
    exactAlarms.mockResolvedValue('denied')
    const { result } = renderHook(() => useDailyReminder())

    await act(async () => {
      await result.current.turnOn(21, 0)
    })

    await waitFor(() => expect(result.current.punctuality).toBe('denied'))
  })

  // Measured on a real phone on 2026-10-13: after granting the permission, `dumpsys alarm`
  // still showed the alarm set before it, RTC_WAKEUP with window=+1h, inexact. It only
  // became window=0 after the switch was turned off and on by hand. So the person grants
  // the permission and that night's reminder can still arrive an hour late, which is the
  // one thing granting it was supposed to prevent.
  it('sets the reminder again when the permission has just been granted', async () => {
    useCalendarStore.setState({ reminderEnabled: true, reminderHour: 21, reminderMinute: 0 })
    exactAlarms.mockResolvedValue('denied')
    const { result } = renderHook(() => useDailyReminder())
    await waitFor(() => expect(result.current.punctuality).toBe('denied'))
    enableReminder.mockClear()

    exactAlarms.mockResolvedValue('exact')
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
    })

    await waitFor(() => expect(enableReminder).toHaveBeenCalledWith(21, 0))
  })

  // The first answer is not a change. Nothing was known before it, and the reminder was
  // already set when it was turned on, so setting it again would only replace the alarm
  // that was just made.
  it('leaves the reminder alone when the first answer is already allowed', async () => {
    useCalendarStore.setState({ reminderEnabled: true })
    exactAlarms.mockResolvedValue('exact')
    const { result } = renderHook(() => useDailyReminder())

    await waitFor(() => expect(result.current.punctuality).toBe('exact'))

    expect(enableReminder).not.toHaveBeenCalled()
  })

  // The other direction, which is the one that would make this expensive: coming back to
  // the front is an ordinary thing a person does many times a day, and rescheduling on
  // each of them would replace a pending alarm for no reason.
  it('leaves the reminder alone when the answer has not changed', async () => {
    useCalendarStore.setState({ reminderEnabled: true })
    exactAlarms.mockResolvedValue('exact')
    const { result } = renderHook(() => useDailyReminder())
    await waitFor(() => expect(result.current.punctuality).toBe('exact'))
    enableReminder.mockClear()

    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await waitFor(() => expect(exactAlarms).toHaveBeenCalledTimes(2))

    expect(enableReminder).not.toHaveBeenCalled()
  })

  it('opens the phone screen where it is granted', async () => {
    useCalendarStore.setState({ reminderEnabled: true })
    exactAlarms.mockResolvedValue('denied')
    const { result } = renderHook(() => useDailyReminder())
    await waitFor(() => expect(result.current.punctuality).toBe('denied'))

    await act(async () => {
      await result.current.askForTime()
    })

    expect(askForExactAlarms).toHaveBeenCalled()
  })
})

describe('before the phone has answered', () => {
  const pending = () => {
    let answer: (state: string) => void = () => {}
    exactAlarms.mockReturnValueOnce(new Promise<string>((resolve) => (answer = resolve)))
    return (state: string) => act(async () => answer(state))
  }

  // The words that promise nothing: true of every build on every phone, so nothing has to
  // be taken back when the answer comes, and nothing to press until it does.
  it('says it arrives around the time, rather than guessing that it will be on time', async () => {
    useCalendarStore.setState({ reminderEnabled: true })
    const answer = pending()
    const { result } = renderHook(() => useDailyReminder())

    expect(result.current.punctuality).toBe('inexact')

    await answer('denied')
    expect(result.current.punctuality).toBe('denied')
  })

  it('does not open the phone screen before it knows the build is on it', async () => {
    useCalendarStore.setState({ reminderEnabled: true })
    pending()
    const { result } = renderHook(() => useDailyReminder())

    await act(async () => {
      await result.current.askForTime()
    })

    expect(askForExactAlarms).not.toHaveBeenCalled()
  })

  it('goes back to around the time when the reminder is turned off and on again', async () => {
    useCalendarStore.setState({ reminderEnabled: true })
    const first = pending()
    const { result } = renderHook(() => useDailyReminder())
    await first('exact')
    expect(result.current.punctuality).toBe('exact')

    act(() => useCalendarStore.setState({ reminderEnabled: false }))
    expect(result.current.punctuality).toBe('inexact')

    const second = pending()
    act(() => useCalendarStore.setState({ reminderEnabled: true }))
    expect(result.current.punctuality).toBe('inexact')

    await second('denied')
    expect(result.current.punctuality).toBe('denied')
  })
})

// The Google Play build, which does not ask for the permission. Android will not list Daylo
// on its "Alarms & reminders" screen then, so offering the way there is a button that opens
// a screen Daylo is not on. What the build asks for is read from the installed package, so
// the same code is the APK on one phone and the Play build on another.
describe('when the installed build does not ask for exact alarms', () => {
  beforeEach(() => {
    exactAlarms.mockResolvedValue('inexact')
  })

  it('says it arrives around the time, with the reminder on', async () => {
    useCalendarStore.setState({ reminderEnabled: true })
    const { result } = renderHook(() => useDailyReminder())

    await waitFor(() => expect(exactAlarms).toHaveBeenCalled())
    expect(result.current.punctuality).toBe('inexact')
  })

  it('does not open the phone screen it would not be on', async () => {
    useCalendarStore.setState({ reminderEnabled: true })
    const { result } = renderHook(() => useDailyReminder())
    await waitFor(() => expect(exactAlarms).toHaveBeenCalled())
    // Past the answer, so this is the build that said it does not ask, and not one that
    // has not answered yet.
    await act(async () => {})

    await act(async () => {
      await result.current.askForTime()
    })

    expect(askForExactAlarms).not.toHaveBeenCalled()
  })

  // Coming back to the front asks again, and the answer is the same: nothing to set again.
  it('leaves the reminder alone when the app comes back to the front', async () => {
    useCalendarStore.setState({ reminderEnabled: true })
    renderHook(() => useDailyReminder())
    await waitFor(() => expect(exactAlarms).toHaveBeenCalledTimes(1))

    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await waitFor(() => expect(exactAlarms).toHaveBeenCalledTimes(2))

    expect(enableReminder).not.toHaveBeenCalled()
  })
})
