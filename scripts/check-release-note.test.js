import { describe, it, expect } from 'vitest'
import { aTagIsComing, newestTag, noteAt, verdictOn } from './check-release-note.js'

/**
 * The check that moves the release note's rules from the tag to the pull request.
 *
 * The rules themselves live in `checkReleaseNote` and are tested beside it. What is tested
 * here is the part that is new and the part that went wrong: finding which note to compare
 * against, and refusing when that cannot be established.
 */

describe('which tag to compare against', () => {
  it('takes the newest version, not the last one written', () => {
    expect(newestTag(['v1.4.2', 'v1.5.1', 'v1.5.0'])).toBe('v1.5.1')
  })

  // Sorted as text, "v1.5.10" would come before "v1.5.9", and the note of a version two
  // releases back would be the one compared against: a check that passes for the wrong
  // reason, which is the kind this whole exercise exists to remove.
  it('compares the numbers, not the characters', () => {
    expect(newestTag(['v1.5.9', 'v1.5.10'])).toBe('v1.5.10')
    expect(newestTag(['v9.0.0', 'v10.0.0'])).toBe('v10.0.0')
  })

  it('ignores anything that is not a version', () => {
    expect(newestTag(['lab-2026-10-01', 'v1.5.1', 'nightly'])).toBe('v1.5.1')
  })

  // A repository with no releases yet. Told apart from a failure to look, below.
  it('says so when there is no version at all', () => {
    expect(newestTag(['nightly'])).toBeNull()
  })
})

describe('reading the note a tag shipped with', () => {
  it('returns what the tag holds', () => {
    const read = () => 'The note 1.5.1 shipped with.\n'
    expect(noteAt('v1.5.1', read)).toEqual({ found: true, note: 'The note 1.5.1 shipped with.\n' })
  })

  /**
   * The whole point of this file.
   *
   * `updater-manifest` asks GitHub for the published manifest and reads a 404 as "there is
   * no previous note", so the comparison is skipped and the check passes. Here a failure to
   * read is a refusal, not an absence: not knowing and knowing there is nothing are two
   * different answers and only one of them means the note is fine.
   */
  it('refuses rather than passes when it cannot read the tag', () => {
    const read = () => {
      throw new Error('fatal: invalid object name')
    }
    expect(noteAt('v1.5.1', read)).toEqual({
      found: false,
      why: 'fatal: invalid object name',
    })
  })
})

describe('the verdict', () => {
  const fresh = 'Something this version brings, said once.'

  it('passes a note that is new, short and not empty', () => {
    expect(verdictOn({ note: fresh, previous: { found: true, note: 'the old one' } })).toEqual({
      ok: true,
    })
  })

  it('fails a note that is word for word the one the last tag shipped', () => {
    const verdict = verdictOn({ note: fresh, previous: { found: true, note: `${fresh}\n` } })
    expect(verdict.ok).toBe(false)
    expect(verdict.problem).toMatch(/word for word/)
  })

  it('fails an empty note', () => {
    const verdict = verdictOn({ note: '   \n', previous: { found: true, note: 'the old one' } })
    expect(verdict.ok).toBe(false)
    expect(verdict.problem).toMatch(/empty/)
  })

  it('fails a note over the length the update dialog can show', () => {
    const verdict = verdictOn({
      note: 'x'.repeat(201),
      previous: { found: true, note: 'the old one' },
    })
    expect(verdict.ok).toBe(false)
    expect(verdict.problem).toMatch(/201 characters/)
  })

  // A first release has nothing to be the same as, and that is a fact rather than a gap.
  it('passes when the repository has no tag yet', () => {
    expect(verdictOn({ note: fresh, previous: { found: true, note: null } })).toEqual({ ok: true })
  })

  it('fails when the previous note could not be read', () => {
    const verdict = verdictOn({
      note: fresh,
      previous: { found: false, why: 'fatal: invalid object name' },
    })
    expect(verdict.ok).toBe(false)
    expect(verdict.problem).toMatch(/could not read/)
    expect(verdict.problem).toMatch(/invalid object name/)
  })
})

/**
 * When the rules apply at all.
 *
 * The note only has to be fresh when a tag is being prepared, and the repository says so
 * plainly: the version pull request raises package.json above the newest tag, and stays
 * there until that tag exists. Asking on every pull request would paint a typo fix red for
 * a note nobody was due to write yet, and a check that is red for reasons the author
 * cannot act on is a check people learn to merge past.
 */
describe('whether a tag is being prepared', () => {
  it('says yes once the version has been raised above the newest tag', () => {
    expect(aTagIsComing({ version: '1.5.2', tag: 'v1.5.1' })).toBe(true)
  })

  it('says no while the version is the one already tagged', () => {
    expect(aTagIsComing({ version: '1.5.1', tag: 'v1.5.1' })).toBe(false)
  })

  // Nothing published yet: the first release is being prepared by definition.
  it('says yes when there is no tag at all', () => {
    expect(aTagIsComing({ version: '1.0.0', tag: null })).toBe(true)
  })
})
