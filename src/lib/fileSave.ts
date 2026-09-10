import { save } from '@tauri-apps/plugin-dialog'
import { writeTextFile } from '@tauri-apps/plugin-fs'
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
 * What Android's document picker hands back. It is a handle, not a path: the last segment
 * is an opaque document id, so there is no folder to name and no file name to read out of
 * it. std::fs cannot open one either, which is why writing goes elsewhere on Android.
 */
const CONTENT_URI = /^content:\/\//

/**
 * What the Android picker says when the person backs out of it. The desktop resolves null
 * for the same act; Android rejects, because DialogPlugin.kt calls invoke.reject on
 * RESULT_CANCELED. There is no error code to match on, only this string, so this is a
 * string comparison on purpose. A test pins it so that a change upstream shows up as a
 * failing test rather than as an error toast every time someone closes the picker.
 */
const ANDROID_CANCELLED = /file picker cancelled/i

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

/**
 * The file, and the folder it is in when that is a place the user would recognise.
 *
 * `suggestedName` is the name the save dialog was opened with, and it is the only thing
 * worth saying about an Android document URI, which carries no readable name. If the
 * person renamed the file in the picker, this shows the name they were offered rather
 * than the one they typed; the alternative is saying nothing at all, and the platform
 * gives us no third option without querying the content resolver.
 */
function describeLocation(path: string, suggestedName?: string): string {
  if (CONTENT_URI.test(path)) {
    return suggestedName ?? 'the file'
  }

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
export function formatSavedMessage(path: string, suggestedName?: string): string {
  return `Saved ${describeLocation(path, suggestedName)}`
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
    // Backing out of the Android picker arrives here rather than as a null, and it is not
    // a failure.
    if (ANDROID_CANCELLED.test(describeError(error))) {
      return { saved: false, viaDialog: true }
    }
    throw new Error(`Could not open the save window: ${describeError(error)}`)
  }

  if (path === null) {
    return { saved: false, viaDialog: true }
  }

  try {
    if (CONTENT_URI.test(path)) {
      // Android. The picker returns a document handle, and only the platform knows how to
      // open it, so this goes through the filesystem plugin instead of the app's own
      // command. It needs no path scope: for a URI the plugin skips that check and hands
      // the write to Android.
      await writeTextFile(path, content)
    } else {
      await invoke('write_text_file', { path, contents: content })
    }
  } catch (error) {
    // Described the same way as a success, so neither a document portal path nor an
    // Android document URI leaks into the message the user reads.
    throw new Error(`Could not write ${describeLocation(path, filename)}: ${describeError(error)}`)
  }

  return { saved: true, viaDialog: true, path }
}
