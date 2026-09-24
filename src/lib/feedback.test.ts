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
    await sendShown(answer, 'menu')

    expect(invoke).toHaveBeenCalledExactlyOnceWith('send_feedback', {
      kind: 'shown',
      answer,
      id: undefined,
      origin: 'menu',
    })
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

  it('stays behind while it is off, in every one of the three', async () => {
    await sendShown(answer, 'automatic')
    await sendRating(answer, 5)
    await sendComment(answer, 'anything')

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
