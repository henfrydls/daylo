import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { checkForUpdate, installFormat, isNewer, takeUpdate, whatWeMayDo } from './updater'

const invoke = vi.hoisted(() => vi.fn())
const check = vi.hoisted(() => vi.fn())

vi.mock('@tauri-apps/api/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tauri-apps/api/core')>()),
  invoke,
  isTauri: () => Boolean((globalThis as { isTauri?: boolean }).isTauri),
}))
vi.mock('@tauri-apps/plugin-updater', () => ({ check }))

beforeEach(() => {
  invoke.mockReset()
  check.mockReset()
  vi.stubGlobal('isTauri', true)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

// Three answers and not two. The third is the one that took a day of reading the plugin to
// be sure of.
describe('what may be offered about this copy', () => {
  it('offers to install the formats that can be replaced in place', () => {
    expect(whatWeMayDo('appimage')).toBe('install')
    expect(whatWeMayDo('nsis')).toBe('install')
    expect(whatWeMayDo('msi')).toBe('install')
    expect(whatWeMayDo('macos')).toBe('install')
  })

  // Updating a .deb runs dpkg through pkexec, which asks for the administrator's password.
  // Daylo does not ask people for that, so it points at the downloads page instead.
  it('points a Debian package at the downloads page instead', () => {
    expect(whatWeMayDo('deb')).toBe('point')
    expect(whatWeMayDo('rpm')).toBe('point')
  })

  // Not timidity. The plugin's installer ends in `_ => install_appimage`, so a format
  // nobody recognised is installed as an AppImage rather than refused. Not offering is how
  // that is prevented rather than inherited.
  it('points, rather than guesses, when nothing says how this was installed', () => {
    expect(whatWeMayDo(null)).toBe('point')
  })

  // The Store updates these copies itself. Telling somebody to go and install what their
  // store is already installing is how a person ends up with two Daylos.
  it('says nothing at all to a copy from the Microsoft Store', () => {
    expect(whatWeMayDo('store')).toBe('silent')
  })

  // The same fact on a third store, and here it is twice true: the Snap Store refreshes
  // its own copies, and a snap is a read-only squashfs, so there is nowhere to write an
  // update even if somebody wanted one. Without this it would fall through to 'point',
  // which is the default for a format nobody recognised, and a copy that keeps itself
  // current would be sent to the downloads page.
  it('says nothing at all to a copy from the Snap Store', () => {
    expect(whatWeMayDo('snap')).toBe('silent')
  })
})

describe('asking how this copy was installed', () => {
  it('reports what the native side says', async () => {
    invoke.mockResolvedValue('appimage')

    await expect(installFormat()).resolves.toBe('appimage')
  })

  it('is nothing where there is no platform to ask', async () => {
    vi.stubGlobal('isTauri', false)

    await expect(installFormat()).resolves.toBeNull()
    expect(invoke).not.toHaveBeenCalled()
  })

  it('is nothing when the command is not there', async () => {
    invoke.mockRejectedValue(new Error('no such command'))

    await expect(installFormat()).resolves.toBeNull()
  })
})

describe('checking for a newer version', () => {
  it('says so when there is one', async () => {
    check.mockResolvedValue({ version: '1.5.0' })

    await expect(checkForUpdate(false)).resolves.toMatchObject({
      kind: 'available',
      version: '1.5.0',
    })
  })

  it('says there is nothing when there is nothing', async () => {
    check.mockResolvedValue(null)

    await expect(checkForUpdate(false)).resolves.toEqual({ kind: 'none' })
  })

  // A check nobody asked for has no business reporting anything. It runs when it runs.
  it('stays quiet when a check nobody asked for fails', async () => {
    check.mockRejectedValue(new Error('error sending request'))

    await expect(checkForUpdate(false)).resolves.toEqual({ kind: 'quiet' })
  })

  // Somebody who pressed something is owed an answer either way.
  it('reports a failure to whoever asked for it', async () => {
    check.mockRejectedValue(new Error('error sending request'))

    await expect(checkForUpdate(true)).resolves.toEqual({ kind: 'failed' })
  })

  // The manifest caught while a release is still being assembled says "none of the
  // fallback platforms were found", which reads like a broken release and is a few minutes
  // of a publication. It used to be swallowed even from somebody who asked, which left the
  // button looking dead. There is one rule instead: whoever asked is told, and the words
  // they are told ("Could not check just now.") are true of exactly this.
  it('tells whoever asked, even about a release still being assembled', async () => {
    check.mockRejectedValue(new Error('none of the fallback platforms were found'))

    await expect(checkForUpdate(true)).resolves.toEqual({ kind: 'failed' })
    await expect(checkForUpdate(false)).resolves.toEqual({ kind: 'quiet' })
  })

  it('never writes anything about the machine into the log', async () => {
    check.mockRejectedValue(new Error('error sending request'))
    const logged = vi.mocked(console.error)

    await checkForUpdate(true)

    const written = logged.mock.calls.flat().map(String).join(' ')
    expect(written).toContain('could not check for updates')
    expect(written).not.toMatch(/\d+\.\d+\.\d+/)
  })

  it('does nothing at all where there is no platform', async () => {
    vi.stubGlobal('isTauri', false)

    await expect(checkForUpdate(true)).resolves.toEqual({ kind: 'none' })
    expect(check).not.toHaveBeenCalled()
  })
})

// Taking the update. The steps matter because the card shows them, and the failures are
// told apart because they mean different things to whoever is reading.
describe('taking an update', () => {
  const anUpdate = (over: Record<string, unknown> = {}) =>
    ({
      version: '1.5.0',
      download: vi.fn().mockResolvedValue(undefined),
      install: vi.fn().mockResolvedValue(undefined),
      ...over,
    }) as never

  it('counts while it downloads, and stops short of a hundred', async () => {
    const said: unknown[] = []
    const update = anUpdate({
      download: vi.fn(async (onEvent: (p: unknown) => void) => {
        onEvent({ event: 'Started', data: { contentLength: 200 } })
        onEvent({ event: 'Progress', data: { chunkLength: 100 } })
        onEvent({ event: 'Progress', data: { chunkLength: 100 } })
      }),
    })

    await takeUpdate(update, (step) => said.push(step))

    expect(said).toContainEqual({ step: 'downloading', percent: 50 })
    // Not 100: the signature is still being checked, and a bar at 100 while something is
    // still happening has stopped telling the truth.
    expect(said).toContainEqual({ step: 'downloading', percent: 99 })
  })

  // No length in the Started event means nothing honest to count.
  it('says it is downloading without a number when there is no total', async () => {
    const said: unknown[] = []
    const update = anUpdate({
      download: vi.fn(async (onEvent: (p: unknown) => void) => {
        onEvent({ event: 'Started', data: {} })
        onEvent({ event: 'Progress', data: { chunkLength: 10 } })
      }),
    })

    await takeUpdate(update, (step) => said.push(step))

    expect(said).toContainEqual({ step: 'downloading', percent: null })
  })

  // The one failure worth naming. download() checks the signature before handing the
  // bytes back, so this is where an artifact signed by somebody else is refused.
  it('names an update that was not signed by our key', async () => {
    const said: { step: string }[] = []
    const update = anUpdate({
      download: vi.fn().mockRejectedValue(new Error('signature verification failed')),
    })

    await takeUpdate(update, (step) => said.push(step))

    expect(said.at(-1)).toEqual({ step: 'unverified' })
  })

  it('tells a download that did not arrive from an install that did not happen', async () => {
    const first: { step: string }[] = []
    await takeUpdate(
      anUpdate({ download: vi.fn().mockRejectedValue(new Error('error sending request')) }),
      (step) => first.push(step)
    )
    expect(first.at(-1)).toEqual({ step: 'download-failed' })

    const second: { step: string }[] = []
    await takeUpdate(anUpdate({ install: vi.fn().mockRejectedValue(new Error('no')) }), (step) =>
      second.push(step)
    )
    expect(second.at(-1)).toEqual({ step: 'install-failed' })
  })

  it('does not try to install what did not download', async () => {
    const update = anUpdate({ download: vi.fn().mockRejectedValue(new Error('no')) })

    await takeUpdate(update, () => {})

    expect(
      (update as unknown as { install: ReturnType<typeof vi.fn> }).install
    ).not.toHaveBeenCalled()
  })
})

describe('the two ways into Android', () => {
  // Play updates its own copies, exactly as the Microsoft Store does, so Daylo says
  // nothing at all there: not an offer, not a notice. Anything else would be telling
  // somebody to go and fetch what their store is already fetching.
  it('says nothing to a copy from Play', () => {
    expect(whatWeMayDo('play')).toBe('silent')
    expect(whatWeMayDo('play')).toBe(whatWeMayDo('store'))
  })

  // The APK cannot replace itself: there is no updater plugin on Android and nothing here
  // installs anything. So it is the same verdict as a .deb, for the same reason, and the
  // card points at the page instead of offering a button that would lie.
  it('points a loose APK at the page, and never offers to install it', () => {
    expect(whatWeMayDo('apk')).toBe('point')
    expect(whatWeMayDo('apk')).not.toBe('install')
  })
})

describe('which version is newer', () => {
  it('reads the numbers rather than the text', () => {
    expect(isNewer('1.5.0', '1.4.2')).toBe(true)
    expect(isNewer('1.4.2', '1.4.2')).toBe(false)
    expect(isNewer('1.4.1', '1.4.2')).toBe(false)
  })

  // The one a string comparison gets wrong, and the reason this is not `>`: "1.10.0" is
  // smaller than "1.9.0" as text and larger as a version. Daylo will reach a tenth minor.
  it('knows ten is more than nine', () => {
    expect(isNewer('1.10.0', '1.9.0')).toBe(true)
    expect(isNewer('1.9.0', '1.10.0')).toBe(false)
    expect(isNewer('2.0.0', '1.99.99')).toBe(true)
  })

  // A `v` prefix and surrounding space are what a manifest or a tag hands over. Anything
  // that is not a version at all is not newer: saying "there is a new one" on the back of
  // something unreadable is the one answer that cannot be taken back.
  it('is not fooled by what a manifest might carry', () => {
    expect(isNewer('v1.5.0', '1.4.2')).toBe(true)
    expect(isNewer(' 1.5.0 ', '1.4.2')).toBe(true)
    expect(isNewer('', '1.4.2')).toBe(false)
    expect(isNewer('latest', '1.4.2')).toBe(false)
    expect(isNewer('1.5.0', '')).toBe(false)
  })

  // Our own tags have never carried one and the comparison does not pretend to understand
  // them. What it must not do is read 1.5.0-beta as newer than 1.5.0.
  it('does not promote a pre-release over the version it precedes', () => {
    expect(isNewer('1.5.0-beta.1', '1.5.0')).toBe(false)
  })
})
