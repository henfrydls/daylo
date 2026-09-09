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
 * Where a save should go.
 *
 * - `dialog`: the desktop app, and a dialog can actually open.
 * - `browser`: the web build, or the Android and iOS apps, where the browser download is
 *   the right path and always was.
 * - `no-dialog`: the desktop app, but no dialog can open. The one case the user has to be
 *   told about.
 */
export type SaveTarget = 'dialog' | 'browser' | 'no-dialog'

/**
 * Paths handed back by the XDG document portal. They live under the portal's own mount,
 * not where the user chose to put the file, and they stop existing for them when the app
 * closes, so showing one is worse than showing nothing.
 */
const DOCUMENT_PORTAL_PATH = /^\/run\/(user\/\d+|flatpak)\/doc\//

/**
 * Ask the app itself whether a save dialog can open, rather than guessing from the user
 * agent. Two sides guessing the same thing is two places to drift; and the guess would be
 * wrong anyway, since an iPad reports itself as a Macintosh.
 *
 * `save_dialog_available` is registered on desktop only, so a rejected call is how the
 * mobile apps identify themselves.
 */
export async function chooseSaveTarget(): Promise<SaveTarget> {
  if (!isTauri()) {
    return 'browser'
  }

  let available: boolean
  try {
    available = await invoke<boolean>('save_dialog_available')
  } catch {
    return 'browser'
  }

  return available ? 'dialog' : 'no-dialog'
}

/** The file, and the folder it is in when that is a place the user would recognise. */
function describeLocation(path: string): string {
  // The separator comes from the shape of the path, not from which character appears in
  // it. A Linux file name may legally contain a backslash, so both "the one that appears"
  // and "the last one of either" report the folder of "/home/misael/my\backup.json" as
  // "/home/misael/my". An absolute POSIX path is the only one that starts with a slash;
  // everything else here comes from Windows, as "C:\..." or "\\server\share".
  const separator = path.startsWith('/') ? '/' : '\\'
  const cut = path.lastIndexOf(separator)
  const name = cut === -1 ? path : path.slice(cut + 1)
  const folder = cut <= 0 ? '' : path.slice(0, cut)

  if (!folder || DOCUMENT_PORTAL_PATH.test(path)) {
    return name
  }
  return `${name} in ${folder}`
}

/** What to tell the user after a successful save. */
export function formatSavedMessage(path: string): string {
  return `Saved ${describeLocation(path)}`
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Write text where the user wants it.
 *
 * In the desktop app the user picks the location, which is the whole point: the browser
 * download path silently puts the file wherever the webview decides, and inside a Flatpak
 * that is the app's private directory, so a backup would be reported as saved and be
 * impossible to find. On the web the browser keeps deciding, as it should.
 *
 * Whether a dialog can open is settled before one is asked for. It has to be: the plugin
 * returns an optional path with no error channel, and on Linux rfd returns nothing at all
 * when the portal and zenity are both missing, which is indistinguishable from the user
 * cancelling. Finding out afterwards would mean ending an export with a stopped spinner,
 * no file and no message.
 */
export async function saveTextFile(
  content: string,
  filename: string,
  mimeType: string
): Promise<SaveResult> {
  const target = await chooseSaveTarget()

  if (target === 'browser') {
    downloadFile(content, filename, mimeType)
    return { saved: true, viaDialog: false }
  }

  if (target === 'no-dialog') {
    throw new Error(
      'Could not open the save window. Your system does not seem to have one, so nothing was written.'
    )
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
    throw new Error(`Could not open the save window: ${describeError(error)}`)
  }

  if (path === null) {
    return { saved: false, viaDialog: true }
  }

  try {
    await invoke('write_text_file', { path, contents: content })
  } catch (error) {
    // Described the same way as a success, so a document portal path does not leak into
    // the message the user reads.
    throw new Error(`Could not write ${describeLocation(path)}: ${describeError(error)}`)
  }

  return { saved: true, viaDialog: true, path }
}
