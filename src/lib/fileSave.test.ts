import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { chooseSaveTarget, formatSavedMessage, saveTextFile } from './fileSave'
// Read as text rather than through node:fs: the app's tsconfig limits `types` to
// vite/client on purpose, so Node's typings are not available here, and ?raw is what
// vite/client does declare.
import desktopCapability from '../../src-tauri/capabilities/desktop.json?raw'

// The dialog plugin and the Rust commands only exist inside the desktop app, so both are
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

/** In the desktop app, with a save dialog that can actually open. */
function pretendDesktop() {
  vi.stubGlobal('isTauri', true)
  invoke.mockImplementation((cmd: string) =>
    cmd === 'save_dialog_available' ? Promise.resolve(true) : Promise.resolve(undefined)
  )
}

beforeEach(() => {
  save.mockReset()
  invoke.mockReset()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('chooseSaveTarget', () => {
  it('picks the browser when not running inside Tauri', async () => {
    await expect(chooseSaveTarget()).resolves.toBe('browser')
    expect(invoke).not.toHaveBeenCalled()
  })

  it('picks the dialog when the desktop app says one can open', async () => {
    pretendDesktop()
    await expect(chooseSaveTarget()).resolves.toBe('dialog')
  })

  // save_dialog_available is registered on desktop only, so a rejected invoke is how the
  // Android and iOS apps identify themselves. No user agent sniffing: the UA of an iPad
  // says Macintosh, and the two sides would drift apart the moment either changed.
  it('picks the browser when the command is not registered', async () => {
    vi.stubGlobal('isTauri', true)
    invoke.mockRejectedValue(new Error('Command save_dialog_available not found'))
    await expect(chooseSaveTarget()).resolves.toBe('browser')
  })

  // A desktop app whose dialog cannot open is the one case that must be told to the user.
  it('reports no dialog when the desktop app says none can open', async () => {
    vi.stubGlobal('isTauri', true)
    invoke.mockResolvedValue(false)
    await expect(chooseSaveTarget()).resolves.toBe('no-dialog')
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

  // A Linux file name may legally contain a backslash. Choosing the separator by asking
  // which one appears anywhere gave "my" as the folder and "backup.json" as the name.
  it('does not treat a backslash in a Linux file name as a folder', () => {
    expect(formatSavedMessage('/home/misael/my\\backup.json')).toBe(
      'Saved my\\backup.json in /home/misael'
    )
  })

  it('names the drive when the file sits at the root of one', () => {
    expect(formatSavedMessage('C:\\daylo-backup.json')).toBe('Saved daylo-backup.json in C:')
  })

  it('gives only the name at the root of a unix filesystem', () => {
    expect(formatSavedMessage('/daylo-backup.json')).toBe('Saved daylo-backup.json')
  })

  it('handles a name the user typed without an extension', () => {
    expect(formatSavedMessage('/home/misael/backup')).toBe('Saved backup in /home/misael')
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
    pretendDesktop()
    save.mockResolvedValue('/home/misael/Documents/daylo-backup.json')

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
    pretendDesktop()
    save.mockResolvedValue('/tmp/daylo-export.csv')

    await saveTextFile('a,b', 'daylo-export.csv', 'text/csv')

    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: [expect.objectContaining({ extensions: ['csv'] })],
      })
    )
  })

  // Cancelling is not a failure and must not be reported as one, and above all must not
  // write anything. This is only reachable once the dialog is known to open, which is why
  // a null result can be trusted to mean cancelling.
  it('writes nothing when the user cancels', async () => {
    pretendDesktop()
    save.mockResolvedValue(null)

    const result = await saveTextFile('{}', 'daylo-backup.json', 'application/json')

    expect(invoke).not.toHaveBeenCalledWith('write_text_file', expect.anything())
    expect(result).toEqual({ saved: false, viaDialog: true })
  })

  // The one that matters. save() resolves null when the dialog never opened just as it
  // does when the user cancelled: the plugin returns Option<FilePath> and has no error
  // channel, and rfd returns None after the portal and zenity both fail. Without asking
  // first, an export on a system with no portal would end in a stopped spinner, no file
  // and no message, which is worse than the bug this change exists to fix.
  it('refuses to start when no dialog can open, instead of failing silently', async () => {
    vi.stubGlobal('isTauri', true)
    invoke.mockResolvedValue(false)

    await expect(saveTextFile('{}', 'daylo-backup.json', 'application/json')).rejects.toThrow(
      /save window/i
    )
    expect(save).not.toHaveBeenCalled()
    expect(invoke).not.toHaveBeenCalledWith('write_text_file', expect.anything())
  })

  // Covers the rejection paths the plugin really has: a missing ACL permission, or IPC
  // failing. Not a missing portal, which never reaches this point.
  it('rejects when the dialog call itself fails', async () => {
    pretendDesktop()
    save.mockRejectedValue(new Error('dialog.save not allowed'))

    await expect(saveTextFile('{}', 'daylo-backup.json', 'application/json')).rejects.toThrow(
      /dialog\.save not allowed/
    )
  })

  it('rejects when writing fails, without printing a portal path', async () => {
    vi.stubGlobal('isTauri', true)
    invoke.mockImplementation((cmd: string) =>
      cmd === 'save_dialog_available' ? Promise.resolve(true) : Promise.reject('Permission denied')
    )
    save.mockResolvedValue('/run/user/1000/doc/a1b2c3d4/daylo-backup.json')

    let message = ''
    try {
      await saveTextFile('{}', 'daylo-backup.json', 'application/json')
    } catch (error) {
      message = error instanceof Error ? error.message : String(error)
    }

    expect(message).toMatch(/daylo-backup\.json/)
    expect(message).toMatch(/Permission denied/)
    // The portal's own mount point means nothing to the user and must not be shown,
    // exactly as the success message already avoids it.
    expect(message).not.toMatch(/run\/user/)
  })
})

// The permission is what makes dialog.save reachable at runtime. Nothing in the build
// checks it: without that line the dialog would fail only when a user clicks Export.
describe('the desktop capability', () => {
  it('grants the save dialog permission for the three desktop platforms', () => {
    const capability = JSON.parse(desktopCapability)
    expect(capability.permissions).toContain('dialog:allow-save')
    expect(capability.platforms).toEqual(['linux', 'macOS', 'windows'])
  })
})
