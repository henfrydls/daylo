import { save } from '@tauri-apps/plugin-dialog'
import { invoke, isTauri } from '@tauri-apps/api/core'
import { downloadFile } from './dataExport'

export interface SaveResult {
  /** False only when the user closed the dialog without choosing a location. */
  saved: boolean
  /** True when the location was chosen in a native dialog rather than by the browser. */
  viaDialog: boolean
  /** Where the file went. Only known when a dialog chose it. */
  path?: string
}

/**
 * Paths handed back by the XDG document portal. They live under the portal's own mount,
 * not where the user chose to put the file, and they stop existing for them when the app
 * closes, so showing one is worse than showing nothing.
 */
const DOCUMENT_PORTAL_PATH = /^\/run\/(user\/\d+|flatpak)\/doc\//

/**
 * Whether a native save dialog is available. The dialog plugin is registered on desktop
 * only: on Android and iOS the browser download path is kept deliberately, because asking
 * for a dialog that is not there would fail rather than help.
 */
export function isTauriDesktop(): boolean {
  if (!isTauri()) {
    return false
  }
  return !/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
}

/** What to tell the user after a successful save. */
export function formatSavedMessage(path: string): string {
  const separator = path.includes('\\') ? '\\' : '/'
  const cut = path.lastIndexOf(separator)
  const name = cut === -1 ? path : path.slice(cut + 1)
  const folder = cut <= 0 ? '' : path.slice(0, cut)

  if (!folder || DOCUMENT_PORTAL_PATH.test(path)) {
    return `Saved ${name}`
  }
  return `Saved ${name} in ${folder}`
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Write text where the user wants it.
 *
 * In the desktop app the user picks the location, which is the whole point: the browser
 * download path silently puts the file wherever WebKitGTK decides, and inside a Flatpak
 * that is the app's private directory, so a backup would be reported as saved and be
 * impossible to find. On the web the browser keeps deciding, as it should.
 *
 * A dialog that cannot open throws instead of quietly falling back to that same
 * unfindable file. A message the user can act on beats a backup they cannot locate.
 */
export async function saveTextFile(
  content: string,
  filename: string,
  mimeType: string
): Promise<SaveResult> {
  if (!isTauriDesktop()) {
    downloadFile(content, filename, mimeType)
    return { saved: true, viaDialog: false }
  }

  // Offered explicitly so the dialog keeps the extension instead of inventing one.
  const extension = filename.slice(filename.lastIndexOf('.') + 1)

  let path: string | null
  try {
    path = await save({
      defaultPath: filename,
      filters: [{ name: extension.toUpperCase(), extensions: [extension] }],
    })
  } catch (error) {
    throw new Error(`Could not open the save dialog: ${describeError(error)}`)
  }

  if (path === null) {
    return { saved: false, viaDialog: true }
  }

  try {
    await invoke('write_text_file', { path, contents: content })
  } catch (error) {
    throw new Error(`Could not write the file: ${describeError(error)}`)
  }

  return { saved: true, viaDialog: true, path }
}
