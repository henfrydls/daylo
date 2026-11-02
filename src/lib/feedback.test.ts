import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { newAnswer, sendComment, sendRating, sendShown } from './feedback'
import { useCalendarStore } from '../store'

const invoke = vi.hoisted(() => vi.fn())
vi.mock('@tauri-apps/api/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tauri-apps/api/core')>()),
  invoke,
}))

beforeEach(() => {
  invoke.mockReset().mockResolvedValue(undefined)
  useCalendarStore.setState({ checkinEnabled: false, checkinId: null })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

const withTheCheckinOn = () =>
  useCalendarStore.setState({
    checkinEnabled: true,
    checkinId: '4f9c2a7e1b60d3a8c5e2f1b74a9d0c6e',
  })

describe('the number that joins one answer together', () => {
  it('is sixteen random bytes, written as hex', () => {
    expect(newAnswer()).toMatch(/^[0-9a-f]{32}$/)
  })

  // It exists so a rating and a comment can be read as two halves of one answer, and for
  // nothing else. A second one that repeated would be an identifier.
  it('is a different one every time', () => {
    expect(new Set(Array.from({ length: 50 }, newAnswer)).size).toBe(50)
  })
})

describe('what each answer carries', () => {
  const answer = '0a1b2c3d4e5f60718293a4b5c6d7e8f9'

  it('sends the star on its own', async () => {
    await sendRating(answer, 4)

    expect(invoke).toHaveBeenCalledExactlyOnceWith('send_feedback', {
      kind: 'rating',
      answer,
      id: undefined,
      stars: 4,
    })
  })

  it('sends what was written', async () => {
    await sendComment(answer, 'the year view')

    expect(invoke).toHaveBeenCalledExactlyOnceWith('send_feedback', {
      kind: 'comment',
      answer,
      id: undefined,
      text: 'the year view',
    })
  })

  it('says how the question arrived', async () => {
    withTheCheckinOn()

    await sendShown(answer, 'menu')

    expect(invoke).toHaveBeenCalledExactlyOnceWith('send_feedback', {
      kind: 'shown',
      answer,
      id: '4f9c2a7e1b60d3a8c5e2f1b74a9d0c6e',
      origin: 'menu',
    })
  })
})

/**
 * The one message nobody asked for.
 *
 * A rating and a comment are answers: somebody pressed a star or wrote a sentence, and
 * sending what they did is the whole point. `shown` is not an answer. The dialog puts
 * itself on screen after seven days and reports its own arrival, so on a device with the
 * check-in off it was the app reaching a server off its own bat, which is the single thing
 * that switch is there to stop.
 *
 * It left nothing lasting behind, because `lastingId` already read the switch. But a
 * connection is not nothing: it carries an address and the fact that Daylo is in use, on
 * that day, which is word for word what `CheckinNotice` says is no longer happening.
 */
describe('the message that reports the question was put', () => {
  const answer = '0a1b2c3d4e5f60718293a4b5c6d7e8f9'

  it('does not go out at all while the check-in is off', async () => {
    await sendShown(answer, 'automatic')

    expect(invoke).not.toHaveBeenCalled()
  })

  // Including the way in from the menu. Going looking for the feedback row is consent to
  // write a letter, not consent to be counted.
  it('does not go out from the menu either', async () => {
    await sendShown(answer, 'menu')

    expect(invoke).not.toHaveBeenCalled()
  })

  it('tells the caller plainly that nothing left', async () => {
    await expect(sendShown(answer, 'automatic')).resolves.toBe(false)
  })

  // The two that are answers still travel with the check-in off, and that is deliberate:
  // checkin.rs puts it as "of somebody who turned the check-in off we know only what they
  // chose to write to us". A star is something they chose.
  it('leaves the answers themselves alone', async () => {
    await sendRating(answer, 4)
    await sendComment(answer, 'the year view')

    expect(invoke).toHaveBeenCalledTimes(2)
  })

  it('goes out as before once the check-in is on', async () => {
    withTheCheckinOn()

    await expect(sendShown(answer, 'automatic')).resolves.toBe(true)
    expect(invoke).toHaveBeenCalledOnce()
  })
})

// Somebody who turned the check-in off turned off exactly this: a lasting number leaving
// their device. It may not travel here because it suits us.
describe('the check-in number', () => {
  const answer = '0a1b2c3d4e5f60718293a4b5c6d7e8f9'

  it('rides along while the check-in is on', async () => {
    withTheCheckinOn()

    await sendRating(answer, 5)

    expect(invoke.mock.calls[0][1]).toMatchObject({ id: '4f9c2a7e1b60d3a8c5e2f1b74a9d0c6e' })
  })

  // Only two of the three are reachable with the switch off now: `shown` does not go out
  // at all. These are the ones that do, and neither may carry the number.
  it('stays behind while it is off, in both of the ones that still travel', async () => {
    await sendRating(answer, 5)
    await sendComment(answer, 'anything')

    expect(invoke).toHaveBeenCalledTimes(2)
    for (const [, args] of invoke.mock.calls) {
      expect((args as { id?: string }).id).toBeUndefined()
    }
  })

  // The switch is what decides, not the leftover number: a store that somehow held one
  // with the check-in off would still not send it.
  it('stays behind when the switch is off however the number got there', async () => {
    useCalendarStore.setState({
      checkinEnabled: false,
      checkinId: '4f9c2a7e1b60d3a8c5e2f1b74a9d0c6e',
    })

    await sendRating(answer, 3)

    expect((invoke.mock.calls[0][1] as { id?: string }).id).toBeUndefined()
  })
})

describe('when it does not go through', () => {
  const answer = '0a1b2c3d4e5f60718293a4b5c6d7e8f9'

  // Nothing here may break the app, and nothing here may log the number either: a line
  // naming it would put on this device the one thing these messages are careful about.
  it('says so to the caller without throwing', async () => {
    invoke.mockRejectedValue(new Error('could not connect'))

    // The check-in is on here on purpose: with it off, sendShown returns false without
    // ever reaching the network, and this test would pass for a reason that has nothing to
    // do with the failure it is about.
    withTheCheckinOn()

    await expect(sendRating(answer, 2)).resolves.toBe(false)
    await expect(sendComment(answer, 'text')).resolves.toBe(false)
    await expect(sendShown(answer, 'menu')).resolves.toBe(false)
  })

  it('reports the plain truth when it does go through', async () => {
    await expect(sendRating(answer, 2)).resolves.toBe(true)
  })

  it('never writes the numbers into the log', async () => {
    withTheCheckinOn()
    invoke.mockRejectedValue(new Error('could not connect'))
    const logged = vi.mocked(console.error)

    await sendComment(answer, 'the year view')

    const written = logged.mock.calls.flat().map(String).join(' ')
    expect(written).not.toContain(answer)
    expect(written).not.toContain('4f9c2a7e1b60d3a8c5e2f1b74a9d0c6e')
  })
})
