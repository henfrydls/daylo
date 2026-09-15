import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  checkinFields,
  generateCheckinId,
  sendCheckin,
  sendCheckinIfDue,
  today,
  turnOffCheckin,
  turnOnCheckin,
} from './checkin'
import { useCalendarStore } from '../store'

const invoke = vi.hoisted(() => vi.fn())
vi.mock('@tauri-apps/api/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tauri-apps/api/core')>()),
  invoke,
  isTauri: () => Boolean((globalThis as { isTauri?: boolean }).isTauri),
}))

const off = () => ({ checkinEnabled: false, checkinId: null, checkinLastAttempt: null })

beforeEach(() => {
  invoke.mockReset()
  invoke.mockResolvedValue(undefined)
  ;(globalThis as { isTauri?: boolean }).isTauri = true
  useCalendarStore.setState(off())
})

afterEach(() => {
  delete (globalThis as { isTauri?: boolean }).isTauri
})

describe('asking the app whether there is a check-in here', () => {
  it('says no outside the native app, without asking', async () => {
    ;(globalThis as { isTauri?: boolean }).isTauri = false

    expect(await checkinFields()).toBeNull()
    expect(invoke).not.toHaveBeenCalled()
  })

  // The command is registered on desktop and Android and nowhere else, so a rejection is
  // the answer rather than an error: it is how iOS, the web build and Docker say no.
  it('says no when the command is not there', async () => {
    invoke.mockRejectedValue(new Error('not found'))

    expect(await checkinFields()).toBeNull()
  })

  it('returns the two values the message will carry', async () => {
    invoke.mockResolvedValue({ version: '1.3.0', os: 'android' })

    expect(await checkinFields()).toEqual({ version: '1.3.0', os: 'android' })
  })
})

describe('the random number', () => {
  it('is 32 lowercase hex characters', () => {
    expect(generateCheckinId()).toMatch(/^[0-9a-f]{32}$/)
  })

  it('is different every time', () => {
    expect(generateCheckinId()).not.toBe(generateCheckinId())
  })

  // Not randomUUID: it needs a secure context, and a value shaped like a UUID reads like
  // an identifier that came from somewhere else. This one is made here and looks it.
  it('comes from the platform random source', () => {
    const spy = vi.spyOn(crypto, 'getRandomValues')

    generateCheckinId()

    expect(spy).toHaveBeenCalledOnce()
    expect(spy.mock.calls[0][0]).toBeInstanceOf(Uint8Array)
    expect((spy.mock.calls[0][0] as Uint8Array).length).toBe(16)
    spy.mockRestore()
  })
})

describe('sending one', () => {
  it('passes the three arguments and nothing else', async () => {
    expect(await sendCheckin({ id: 'abc', date: '2026-09-14', last: false })).toBe(true)
    expect(invoke).toHaveBeenCalledExactlyOnceWith('send_checkin', {
      id: 'abc',
      date: '2026-09-14',
      last: false,
    })
  })

  // A failed send is a fact the caller records, not an error anything has to survive:
  // nothing in the app is allowed to break because a server was unreachable.
  it('reports a refusal as false and never throws', async () => {
    invoke.mockRejectedValue(new Error('no route to host'))

    await expect(sendCheckin({ id: 'abc', date: '2026-09-14', last: true })).resolves.toBe(false)
  })
})

describe('turning it on', () => {
  it('makes a number, keeps it, and sends today straight away', async () => {
    await turnOnCheckin()

    const state = useCalendarStore.getState()
    expect(state.checkinEnabled).toBe(true)
    expect(state.checkinId).toMatch(/^[0-9a-f]{32}$/)
    expect(invoke).toHaveBeenCalledExactlyOnceWith('send_checkin', {
      id: state.checkinId,
      date: today(),
      last: false,
    })
    expect(state.checkinLastAttempt).toEqual({ date: today(), at: expect.any(String), ok: true })
  })

  // Consent is what the switch records, not delivery. Someone who says yes on a train
  // has said yes, and the day is spent either way.
  it('stays on when the send fails, and does not try again today', async () => {
    invoke.mockRejectedValue(new Error('offline'))

    await turnOnCheckin()

    const state = useCalendarStore.getState()
    expect(state.checkinEnabled).toBe(true)
    expect(state.checkinId).toMatch(/^[0-9a-f]{32}$/)
    expect(state.checkinLastAttempt?.ok).toBe(false)

    invoke.mockClear()
    await sendCheckinIfDue()
    expect(invoke).not.toHaveBeenCalled()
  })
})

describe('the daily one', () => {
  const on = (lastAttemptDate: string | null) => {
    useCalendarStore.setState({
      checkinEnabled: true,
      checkinId: '4f9c2a7e1b60d3a8c5e2f1b74a9d0c6e',
      checkinLastAttempt: lastAttemptDate
        ? { date: lastAttemptDate, at: `${lastAttemptDate}T21:12:00.000Z`, ok: true }
        : null,
    })
  }

  it('sends when the last try was another day', async () => {
    on('2020-01-01')

    await sendCheckinIfDue()

    expect(invoke).toHaveBeenCalledExactlyOnceWith('send_checkin', {
      id: '4f9c2a7e1b60d3a8c5e2f1b74a9d0c6e',
      date: today(),
      last: false,
    })
  })

  it('sends when there has been no try at all', async () => {
    on(null)

    await sendCheckinIfDue()

    expect(invoke).toHaveBeenCalledOnce()
  })

  // Tried is spent, whatever came back. Retrying would send a second heartbeat for the
  // same day, which is the one thing the dialog promises does not happen.
  it('does not send twice in a day, even when the first one failed', async () => {
    useCalendarStore.setState({
      checkinEnabled: true,
      checkinId: '4f9c2a7e1b60d3a8c5e2f1b74a9d0c6e',
      checkinLastAttempt: { date: today(), at: new Date().toISOString(), ok: false },
    })

    await sendCheckinIfDue()

    expect(invoke).not.toHaveBeenCalled()
  })

  it('does nothing while it is off', async () => {
    await sendCheckinIfDue()

    expect(invoke).not.toHaveBeenCalled()
  })

  it('does nothing without a number, however the switch reads', async () => {
    useCalendarStore.setState({ checkinEnabled: true, checkinId: null })

    await sendCheckinIfDue()

    expect(invoke).not.toHaveBeenCalled()
  })

  // Two callers want the same moment: the effect that runs once the store has hydrated,
  // and the tab becoming visible. Both fire on a desktop that was never closed.
  it('sends once when two callers ask at the same time', async () => {
    on('2020-01-01')
    let release = () => {}
    invoke.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          release = () => resolve()
        })
    )

    const both = Promise.all([sendCheckinIfDue(), sendCheckinIfDue()])
    release()
    await both

    expect(invoke).toHaveBeenCalledOnce()
  })
})

describe('turning it off', () => {
  beforeEach(() => {
    useCalendarStore.setState({
      checkinEnabled: true,
      checkinId: '4f9c2a7e1b60d3a8c5e2f1b74a9d0c6e',
      checkinLastAttempt: { date: today(), at: new Date().toISOString(), ok: true },
    })
  })

  // The order is the point: what protects the person happens on this device, now, and
  // does not wait on a network that may not answer.
  it('forgets the number before the last note leaves', async () => {
    let seen: ReturnType<typeof useCalendarStore.getState> | null = null
    invoke.mockImplementation(async () => {
      seen = useCalendarStore.getState()
    })

    await turnOffCheckin()

    expect(seen!.checkinEnabled).toBe(false)
    expect(seen!.checkinId).toBeNull()
    expect(seen!.checkinLastAttempt).toBeNull()
  })

  it('sends one last note with the number it was using', async () => {
    expect(await turnOffCheckin()).toBe('sent')
    expect(invoke).toHaveBeenCalledExactlyOnceWith('send_checkin', {
      id: '4f9c2a7e1b60d3a8c5e2f1b74a9d0c6e',
      date: today(),
      last: true,
    })
  })

  it('says the note was lost when it does not go through', async () => {
    invoke.mockRejectedValue(new Error('offline'))

    expect(await turnOffCheckin()).toBe('lost')
    expect(useCalendarStore.getState().checkinEnabled).toBe(false)
  })

  it('has nothing to send when there was no number', async () => {
    useCalendarStore.setState(off())

    expect(await turnOffCheckin()).toBe('lost')
    expect(invoke).not.toHaveBeenCalled()
  })

  it('leaves nothing behind for the daily send to find', async () => {
    await turnOffCheckin()
    invoke.mockClear()

    await sendCheckinIfDue()

    expect(invoke).not.toHaveBeenCalled()
  })

  it('makes a new number when it is turned on again', async () => {
    await turnOffCheckin()
    await turnOnCheckin()

    expect(useCalendarStore.getState().checkinId).not.toBe('4f9c2a7e1b60d3a8c5e2f1b74a9d0c6e')
    expect(useCalendarStore.getState().checkinId).toMatch(/^[0-9a-f]{32}$/)
  })
})
