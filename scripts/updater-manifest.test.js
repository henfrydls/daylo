import { describe, it, expect } from 'vitest'
import {
  LONGEST_NOTE,
  PLATFORMS,
  checkReleaseNote,
  compose,
  platformOf,
  previousNoteFrom,
} from './updater-manifest.js'

/** The names the bundler really produces, and the ones for 1.3.0 were measured, not typed
 * from memory: `Daylo_1.3.0_amd64.AppImage` and `Daylo_1.3.0_amd64.deb`, each with a `.sig`
 * beside it. The rest follow the same shape. */
const signatureFor = (name) => ({ name: `${name}.sig`, signature: `signature of ${name}` })

const everyPlatform = [
  signatureFor('Daylo_1.4.0_x64-setup.exe'),
  signatureFor('Daylo_1.4.0_arm64-setup.exe'),
  signatureFor('Daylo_1.4.0_x64.app.tar.gz'),
  signatureFor('Daylo_1.4.0_aarch64.app.tar.gz'),
  signatureFor('Daylo_1.4.0_amd64.AppImage'),
]

const url = (name) => `https://github.com/henfrydls/daylo/releases/download/v1.4.0/${name}`

const manifest = (signatures = everyPlatform) =>
  compose({
    version: '1.4.0',
    pubDate: '2026-09-30T00:00:00Z',
    notes: 'a line about this version',
    signatures,
    downloadUrl: url,
  })

describe('which platform an artifact belongs to', () => {
  it('recognises one artifact per platform', () => {
    expect(platformOf('Daylo_1.4.0_x64-setup.exe.sig')).toBe('windows-x86_64')
    expect(platformOf('Daylo_1.4.0_arm64-setup.exe.sig')).toBe('windows-aarch64')
    expect(platformOf('Daylo_1.4.0_x64.app.tar.gz.sig')).toBe('darwin-x86_64')
    expect(platformOf('Daylo_1.4.0_aarch64.app.tar.gz.sig')).toBe('darwin-aarch64')
    expect(platformOf('Daylo_1.4.0_amd64.AppImage.sig')).toBe('linux-x86_64')
  })

  // The .deb is signed too and it is not in the manifest, which is a decision: it would
  // take the one Linux slot, and updating it runs dpkg through pkexec, which asks for the
  // administrator's password. Somebody who installed the .deb is told where to download
  // instead. If this ever returns a platform, that decision was reversed by accident.
  it('leaves the Debian package out on purpose', () => {
    expect(platformOf('Daylo_1.4.0_amd64.deb.sig')).toBeNull()
  })

  it('ignores what is not an artifact of ours', () => {
    expect(platformOf('SHA256SUMS.txt')).toBeNull()
    expect(platformOf('Daylo-android-arm64.apk')).toBeNull()
  })
})

describe('the manifest', () => {
  it('carries every platform, each pointing at its own artifact', () => {
    const built = manifest()

    expect(Object.keys(built.platforms).sort()).toEqual(Object.keys(PLATFORMS).sort())
    expect(built.platforms['linux-x86_64']).toEqual({
      signature: 'signature of Daylo_1.4.0_amd64.AppImage',
      url: url('Daylo_1.4.0_amd64.AppImage'),
    })
    expect(built.version).toBe('1.4.0')
  })

  // The whole reason this script exists rather than letting the action write the file.
  // Four platforms out of five publishes fine, looks fine, and leaves one platform's
  // worth of people never offered an update again, with nothing going red anywhere.
  it('refuses to be written with a platform missing, and says which', () => {
    const withoutMac = everyPlatform.filter((s) => !s.name.includes('aarch64.app'))

    expect(() => manifest(withoutMac)).toThrowError(/darwin-aarch64/)
  })

  it('names what it did find, so the failure can be read without opening the release', () => {
    expect(() => manifest([signatureFor('Daylo_1.4.0_amd64.AppImage')])).toThrowError(
      /Daylo_1\.4\.0_amd64\.AppImage\.sig/
    )
  })

  // Two artifacts for one platform means somebody added a bundle target and did not
  // decide which of the two the updater serves. Guessing would send half the Linux users
  // a package their installer refuses.
  it('refuses two artifacts for the same platform rather than picking one', () => {
    const twice = [...everyPlatform, signatureFor('Daylo_1.4.0_amd64.AppImage')]

    expect(() => manifest(twice)).toThrowError(/Two artifacts claim linux-x86_64/)
  })
})

describe('the release note', () => {
  it('is what was written, trimmed', () => {
    expect(checkReleaseNote({ note: '  a line  ', previousNote: null })).toBe('a line')
  })

  it('cannot be missing', () => {
    expect(() => checkReleaseNote({ note: '   ', previousNote: null })).toThrowError(/empty/)
    expect(() => checkReleaseNote({ note: null, previousNote: null })).toThrowError(/empty/)
  })

  it('cannot be longer than one line in a small box', () => {
    const tooLong = 'x'.repeat(LONGEST_NOTE + 1)

    expect(() => checkReleaseNote({ note: tooLong, previousNote: null })).toThrowError(
      new RegExp(`${LONGEST_NOTE + 1} characters`)
    )
  })

  it('accepts exactly the limit', () => {
    const exact = 'x'.repeat(LONGEST_NOTE)

    expect(checkReleaseNote({ note: exact, previousNote: null })).toBe(exact)
  })

  // The one that matters. A stale note publishes clean and looks cared for, and tells
  // people about a release they already have. Nothing else in the pipeline would notice.
  it('cannot be the one the previous version already shipped', () => {
    const shipped = 'Daylo now tells you when a new version is out.'

    expect(() => checkReleaseNote({ note: shipped, previousNote: shipped })).toThrowError(
      /word for word/
    )
    expect(() =>
      checkReleaseNote({ note: `  ${shipped}  `, previousNote: shipped })
    ).toThrowError(/word for word/)
  })

  it('is fine when there is no previous version to repeat', () => {
    expect(checkReleaseNote({ note: 'the first one', previousNote: null })).toBe('the first one')
  })
})

// The first release that carries an updater has no published manifest to compare against,
// and the release after a bad night has one it could not reach. Those are not the same
// thing and the difference is the whole point of this.
describe('what the previous version said', () => {
  it('reads the note out of the published manifest', () => {
    const body = JSON.stringify({ version: '1.4.0', notes: 'what 1.4.0 brought' })

    expect(previousNoteFrom({ status: 200, body })).toBe('what 1.4.0 brought')
  })

  // The case of the very first release, which is 1.4.0 itself. It has to pass, or the
  // check written to protect the fifth version breaks the first.
  it('takes 404 as there being no previous version', () => {
    expect(previousNoteFrom({ status: 404, body: 'Not Found' })).toBeNull()
  })

  // And the case that must not be folded into the one above: not knowing.
  it('refuses to guess when the answer was anything else', () => {
    expect(() => previousNoteFrom({ status: 500, body: '' })).toThrowError(/do not know/)
    expect(() => previousNoteFrom({ status: 0, body: '' })).toThrowError(/do not know/)
  })

  it('refuses a manifest it cannot read', () => {
    expect(() => previousNoteFrom({ status: 200, body: '<html>nope' })).toThrowError(/not JSON/)
  })

  // A manifest from before release notes existed. There is nothing to repeat, so there is
  // nothing to refuse.
  it('is nothing when the manifest carries no note', () => {
    expect(previousNoteFrom({ status: 200, body: '{"version":"1.4.0"}' })).toBeNull()
    expect(previousNoteFrom({ status: 200, body: '{"notes":"  "}' })).toBeNull()
  })
})
