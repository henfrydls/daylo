import { describe, it, expect } from 'vitest'
import { whatIsOnDisk } from './rescue'

/**
 * The two ways opening the data can go wrong, which want different sentences on screen.
 *
 * The hydration error does not tell them apart: a parse failure and a storage that refuses
 * to be read arrive the same way. Asking the disk a second time is what separates them,
 * and that second ask is the only place either answer can be got.
 */
describe('what is on the disk when the data will not open', () => {
  it('hands back the bytes untouched when there are some', () => {
    const stored = '{"state":{"logs":[truncated'

    expect(whatIsOnDisk(() => stored)).toEqual({ reason: 'unreadable', raw: stored })
  })

  // Site data blocked, or some private windows. Nothing is wrong with the data; there is
  // no data, and telling somebody their file is damaged would send them looking for
  // something that is not there.
  it('says the storage is out of reach when reading throws', () => {
    expect(
      whatIsOnDisk(() => {
        throw new DOMException('The operation is insecure.', 'SecurityError')
      })
    ).toEqual({ reason: 'unreachable', raw: null })
  })

  it('says the same when there is simply nothing stored', () => {
    expect(whatIsOnDisk(() => null)).toEqual({ reason: 'unreachable', raw: null })
  })

  // It must not throw, whatever happens. It runs on the one path where everything else
  // already has.
  it('never throws, which is the whole point of it', () => {
    expect(() =>
      whatIsOnDisk(() => {
        throw new Error('anything at all')
      })
    ).not.toThrow()
  })
})
