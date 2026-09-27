import { describe, it, expect } from 'vitest'
import { collect, isFragment, nameOf } from './collect-changelog.js'

const CHANGELOG = `# Changelog

Some preamble that must survive.

## 1.2.0

**Something older.** It happened.

## 1.1.3

**Older still.**
`

const fragment = (name, body) => ({ name, body })

describe('the order fragments are joined in', () => {
  it('follows the pull request number, not the file listing', () => {
    const out = collect({
      changelog: CHANGELOG,
      version: '1.3.0',
      fragments: [
        fragment('60-later.md', '**Later.** Came second.'),
        fragment('9-earlier.md', '**Earlier.** Came first.'),
      ],
    })

    expect(out.indexOf('**Earlier.**')).toBeLessThan(out.indexOf('**Later.**'))
  })

  // Sorted as numbers. As text, "9" comes after "60" and the release would read in an
  // order nobody chose.
  it('does not sort them as strings', () => {
    const out = collect({
      changelog: CHANGELOG,
      version: '1.3.0',
      fragments: [fragment('100-a.md', '**A.**'), fragment('9-b.md', '**B.**')],
    })

    expect(out.indexOf('**B.**')).toBeLessThan(out.indexOf('**A.**'))
  })
})

describe('where the new section goes', () => {
  it('sits above the most recent one, under the preamble', () => {
    const out = collect({
      changelog: CHANGELOG,
      version: '1.3.0',
      fragments: [fragment('1-x.md', '**New.** Just landed.')],
    })

    expect(out.indexOf('Some preamble that must survive.')).toBeLessThan(out.indexOf('## 1.3.0'))
    expect(out.indexOf('## 1.3.0')).toBeLessThan(out.indexOf('## 1.2.0'))
  })

  it('keeps everything that was already there', () => {
    const out = collect({
      changelog: CHANGELOG,
      version: '1.3.0',
      fragments: [fragment('1-x.md', '**New.**')],
    })

    expect(out).toContain('**Something older.** It happened.')
    expect(out).toContain('## 1.1.3')
  })

  it('leaves one blank line between fragments and no trailing pile of them', () => {
    const out = collect({
      changelog: CHANGELOG,
      version: '1.3.0',
      fragments: [fragment('1-a.md', '**A.**\n'), fragment('2-b.md', '\n**B.**\n\n\n')],
    })

    expect(out).toContain('**A.**\n\n**B.**\n\n## 1.2.0')
  })
})

describe('when it should refuse', () => {
  it('refuses to write a version that is already in the file', () => {
    expect(() =>
      collect({ changelog: CHANGELOG, version: '1.2.0', fragments: [fragment('1-x.md', '**X.**')] })
    ).toThrow(/already/i)
  })

  // Releasing with nothing to say is more likely a forgotten fragment than a silent
  // release, and the empty section would have to be cleaned up by hand afterwards.
  it('refuses when there is nothing to collect', () => {
    expect(() => collect({ changelog: CHANGELOG, version: '1.3.0', fragments: [] })).toThrow(
      /no fragments/i
    )
  })

  it('refuses a file that is not named after a pull request', () => {
    expect(() =>
      collect({
        changelog: CHANGELOG,
        version: '1.3.0',
        fragments: [fragment('the-year-view.md', '**X.**')],
      })
    ).toThrow(/the-year-view\.md/)
  })
})

describe('naming a fragment', () => {
  it('is the pull request number and a slug', () => {
    expect(nameOf(54, 'Stop a tap from leaving a ring behind')).toBe(
      '54-stop-a-tap-from-leaving-a-ring-behind.md'
    )
  })

  it('does not run on forever', () => {
    expect(nameOf(7, 'a'.repeat(80)).length).toBeLessThanOrEqual(60)
  })
})

// Two files in changelog.d/ are not fragments, and one of them stopped a release.
describe('which files are fragments', () => {
  it('takes a file named after its pull request', () => {
    expect(isFragment('80-ask-with-stars-instead-of-a-letter.md')).toBe(true)
  })

  it('leaves the README alone', () => {
    expect(isFragment('README.md')).toBe(false)
  })

  // The one that mattered. RELEASE-NOTE.md arrived in 1.4 and went straight into collect(),
  // which refuses any name that is not a pull request's. The first step of publishing a
  // version failed, on the day of a publication, over a file that is meant to be there.
  it('leaves the release note alone', () => {
    expect(isFragment('RELEASE-NOTE.md')).toBe(false)
  })

  it('ignores what is not markdown', () => {
    expect(isFragment('80-something.txt')).toBe(false)
  })
})
