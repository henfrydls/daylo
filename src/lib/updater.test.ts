import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { checkForUpdate, installFormat, whatWeMayDo } from './updater'

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

  // The manifest caught while a release is still being assembled. It reads like a broken
  // release and is a few minutes of a publication, so it is not reported even to somebody
  // who asked.
  it('stays quiet about a release still being assembled, even when asked', async () => {
    check.mockRejectedValue(new Error('none of the fallback platforms were found'))

    await expect(checkForUpdate(true)).resolves.toEqual({ kind: 'quiet' })
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
