import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useDailyReminder } from './useDailyReminder'
import { useCalendarStore } from '../store'

const enableReminder = vi.hoisted(() => vi.fn())
const disableReminder = vi.hoisted(() => vi.fn())
const exactAlarmsAllowed = vi.hoisted(() => vi.fn())
const askForExactAlarms = vi.hoisted(() => vi.fn())

vi.mock('../lib/reminders', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/reminders')>()),
  enableReminder,
  disableReminder,
  exactAlarmsAllowed,
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
  exactAlarmsAllowed.mockReset().mockResolvedValue(true)
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
    exactAlarmsAllowed.mockResolvedValue(false)

    const { result } = renderHook(() => useDailyReminder())
    await waitFor(() => expect(result.current.onTime).toBe(false))
  })

  it('says nothing about a reminder nobody has set', async () => {
    useCalendarStore.setState({ reminderEnabled: false })

    renderHook(() => useDailyReminder())
    await waitFor(() => expect(enableReminder).not.toHaveBeenCalled())
    expect(exactAlarmsAllowed).not.toHaveBeenCalled()
  })

  // The permission is granted on a screen that belongs to the phone, not to Daylo, so
  // coming back is the only moment the app can learn the answer changed. Without this the
  // sheet would keep offering a fix for something already fixed.
  it('asks again when the app comes back to the front', async () => {
    useCalendarStore.setState({ reminderEnabled: true })
    exactAlarmsAllowed.mockResolvedValue(false)
    const { result } = renderHook(() => useDailyReminder())
    await waitFor(() => expect(result.current.onTime).toBe(false))

    exactAlarmsAllowed.mockResolvedValue(true)
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
    })

    await waitFor(() => expect(result.current.onTime).toBe(true))
  })

  it('asks again after the reminder is turned on', async () => {
    exactAlarmsAllowed.mockResolvedValue(false)
    const { result } = renderHook(() => useDailyReminder())

    await act(async () => {
      await result.current.turnOn(21, 0)
    })

    await waitFor(() => expect(result.current.onTime).toBe(false))
  })

  // Measured on a real phone on 2026-10-13: after granting the permission, `dumpsys alarm`
  // still showed the alarm set before it, RTC_WAKEUP with window=+1h, inexact. It only
  // became window=0 after the switch was turned off and on by hand. So the person grants
  // the permission and that night's reminder can still arrive an hour late, which is the
  // one thing granting it was supposed to prevent.
  it('sets the reminder again when the permission has just been granted', async () => {
    useCalendarStore.setState({ reminderEnabled: true, reminderHour: 21, reminderMinute: 0 })
    exactAlarmsAllowed.mockResolvedValue(false)
    const { result } = renderHook(() => useDailyReminder())
    await waitFor(() => expect(result.current.onTime).toBe(false))
    enableReminder.mockClear()

    exactAlarmsAllowed.mockResolvedValue(true)
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
    })

    await waitFor(() => expect(enableReminder).toHaveBeenCalledWith(21, 0))
  })

  // The other direction, which is the one that would make this expensive: coming back to
  // the front is an ordinary thing a person does many times a day, and rescheduling on
  // each of them would replace a pending alarm for no reason.
  it('leaves the reminder alone when the answer has not changed', async () => {
    useCalendarStore.setState({ reminderEnabled: true })
    exactAlarmsAllowed.mockResolvedValue(true)
    const { result } = renderHook(() => useDailyReminder())
    await waitFor(() => expect(result.current.onTime).toBe(true))
    enableReminder.mockClear()

    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await waitFor(() => expect(exactAlarmsAllowed).toHaveBeenCalledTimes(2))

    expect(enableReminder).not.toHaveBeenCalled()
  })

  it('opens the phone screen where it is granted', async () => {
    const { result } = renderHook(() => useDailyReminder())

    await act(async () => {
      await result.current.askForTime()
    })

    expect(askForExactAlarms).toHaveBeenCalled()
  })
})
