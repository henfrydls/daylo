import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { isTauriDesktop, formatSavedMessage, saveTextFile } from './fileSave'

// The dialog plugin and the Rust command only exist inside the desktop app, so both are
// replaced here. What is asserted is which of them gets called with what, because that is
// the whole behaviour: on the desktop the user picks the location, on the web the browser
// keeps deciding it.
const save = vi.hoisted(() => vi.fn())
const invoke = vi.hoisted(() => vi.fn())
vi.mock('@tauri-apps/plugin-dialog', () => ({ save }))
// Only invoke is replaced: isTauri() stays the real one so the detection under test is
// the library's, driven by the same global Tauri injects.
vi.mock('@tauri-apps/api/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tauri-apps/api/core')>()),
  invoke,
}))

const DESKTOP_UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'
const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36'

function pretendTauri(userAgent: string) {
  vi.stubGlobal('isTauri', true)
  Object.defineProperty(window.navigator, 'userAgent', {
    value: userAgent,
    configurable: true,
  })
}

beforeEach(() => {
  save.mockReset()
  invoke.mockReset()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('isTauriDesktop', () => {
  it('is false in a plain browser', () => {
    expect(isTauriDesktop()).toBe(false)
  })

  it('is true inside the desktop app', () => {
    pretendTauri(DESKTOP_UA)
    expect(isTauriDesktop()).toBe(true)
  })

  // Android keeps the browser download path on purpose: the save dialog plugin is not
  // registered there, so asking for it would fail rather than help.
  it('is false inside the Android app', () => {
    pretendTauri(ANDROID_UA)
    expect(isTauriDesktop()).toBe(false)
  })

  it('is false inside the iOS app', () => {
    pretendTauri('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15')
    expect(isTauriDesktop()).toBe(false)
  })
})

describe('formatSavedMessage', () => {
  it('names the file and the folder it went to', () => {
    expect(formatSavedMessage('/home/misael/Downloads/daylo-backup-2026-09-09.json')).toBe(
      'Saved daylo-backup-2026-09-09.json in /home/misael/Downloads'
    )
  })

  it('names the folder on Windows paths too', () => {
    expect(formatSavedMessage('C:\\Users\\henfry\\Documents\\daylo-backup.json')).toBe(
      'Saved daylo-backup.json in C:\\Users\\henfry\\Documents'
    )
  })

  // Inside a Flatpak the portal hands back a path under its own mount point. Printing it
  // would be worse than printing nothing: it is not where the user chose to put the file
  // and it does not exist for them once the app closes.
  it('gives only the name when the path comes from the document portal', () => {
    expect(formatSavedMessage('/run/user/1000/doc/a1b2c3d4/daylo-backup.json')).toBe(
      'Saved daylo-backup.json'
    )
  })

  it('gives only the name for the flatpak document mount', () => {
    expect(formatSavedMessage('/run/flatpak/doc/ff01/daylo-backup.json')).toBe(
      'Saved daylo-backup.json'
    )
  })
})

describe('saveTextFile in a browser', () => {
  it('downloads through the browser and says no dialog was involved', async () => {
    const click = vi.fn()
    const anchor = document.createElement('a')
    anchor.click = click
    vi.spyOn(document, 'createElement').mockReturnValueOnce(anchor)
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:fake'),
      revokeObjectURL: vi.fn(),
    })

    const result = await saveTextFile('{}', 'daylo-backup.json', 'application/json')

    expect(click).toHaveBeenCalled()
    expect(save).not.toHaveBeenCalled()
    expect(result).toEqual({ saved: true, viaDialog: false })
  })
})

describe('saveTextFile in the desktop app', () => {
  it('asks where to save and writes to the chosen path', async () => {
    pretendTauri(DESKTOP_UA)
    save.mockResolvedValue('/home/misael/Documents/daylo-backup.json')
    invoke.mockResolvedValue(undefined)

    const result = await saveTextFile('{"a":1}', 'daylo-backup.json', 'application/json')

    expect(save).toHaveBeenCalledWith(expect.objectContaining({ defaultPath: 'daylo-backup.json' }))
    expect(invoke).toHaveBeenCalledWith('write_text_file', {
      path: '/home/misael/Documents/daylo-backup.json',
      contents: '{"a":1}',
    })
    expect(result).toEqual({
      saved: true,
      viaDialog: true,
      path: '/home/misael/Documents/daylo-backup.json',
    })
  })

  it('offers the right extension so the dialog does not invent one', async () => {
    pretendTauri(DESKTOP_UA)
    save.mockResolvedValue('/tmp/daylo-export.csv')
    invoke.mockResolvedValue(undefined)

    await saveTextFile('a,b', 'daylo-export.csv', 'text/csv')

    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: [expect.objectContaining({ extensions: ['csv'] })],
      })
    )
  })

  // Cancelling is not a failure and must not be reported as one, and above all must not
  // write anything.
  it('writes nothing when the user cancels', async () => {
    pretendTauri(DESKTOP_UA)
    save.mockResolvedValue(null)

    const result = await saveTextFile('{}', 'daylo-backup.json', 'application/json')

    expect(invoke).not.toHaveBeenCalled()
    expect(result).toEqual({ saved: false, viaDialog: true })
  })

  // With no portal on the system the dialog cannot open. That has to surface as an error
  // the caller can show, never as a silent fallback to a file the user cannot find: the
  // whole point of this change is that a backup nobody can locate is worse than a message.
  it('rejects when the dialog cannot be opened', async () => {
    pretendTauri(DESKTOP_UA)
    save.mockRejectedValue(new Error('no portal'))

    await expect(saveTextFile('{}', 'daylo-backup.json', 'application/json')).rejects.toThrow(
      /save dialog/i
    )
    expect(invoke).not.toHaveBeenCalled()
  })

  it('rejects when writing the chosen path fails', async () => {
    pretendTauri(DESKTOP_UA)
    save.mockResolvedValue('/read-only/daylo-backup.json')
    invoke.mockRejectedValue('Permission denied')

    await expect(saveTextFile('{}', 'daylo-backup.json', 'application/json')).rejects.toThrow(
      /Permission denied/
    )
  })
})
