import { invoke, isTauri } from '@tauri-apps/api/core'
import { check, type Update } from '@tauri-apps/plugin-updater'

/**
 * Whether there is a newer version, from this side of the wall.
 *
 * The request itself is made in Rust by the plugin, not here: the app's CSP is
 * `default-src 'none'` with `connect-src 'self' ipc: tauri:`, so the page can reach no host
 * at all. That sentence is in the privacy policy and it stays true because of where this
 * work happens, not because of a promise.
 */

/** How this copy was installed, and therefore what may be offered about updating it. */
export type InstallFormat = 'deb' | 'rpm' | 'appimage' | 'msi' | 'nsis' | 'macos' | 'store'

/**
 * What the screen is allowed to do about an update, which depends on how the app got here.
 *
 * - `install`: offer to do it, because the format can be replaced in place.
 * - `point`: say there is a new version and send somebody to the downloads page. A `.deb`
 *   updates by running dpkg through pkexec, which asks for the administrator's password,
 *   and Daylo does not ask people for that. An unknown format lands here too, and that is
 *   deliberate: the plugin's own installer ends in `_ => install_appimage`, so a format
 *   nobody recognised would be installed as an AppImage rather than refused.
 * - `silent`: say nothing at all. A copy from the Microsoft Store is updated by the Store,
 *   so there is nothing to tell and nothing to do.
 */
export type WhatWeMayDo = 'install' | 'point' | 'silent'

export function whatWeMayDo(format: InstallFormat | null): WhatWeMayDo {
  if (format === 'store') return 'silent'
  if (format === 'appimage' || format === 'nsis' || format === 'msi' || format === 'macos') {
    return 'install'
  }
  return 'point'
}

/** How this copy was installed, or null where nothing packaged it. */
export async function installFormat(): Promise<InstallFormat | null> {
  if (!isTauri()) return null
  try {
    return await invoke<InstallFormat | null>('install_format')
  } catch {
    return null
  }
}

/**
 * Where somebody goes when this copy cannot replace itself.
 *
 * The page that explains the formats, not the list of files: whoever reads this is being
 * asked to pick one, and the releases page asks them to know which of eight is theirs.
 */
export const DOWNLOADS_URL = 'https://daylo.henfrydls.com/#download'

/**
 * Open it through the platform, because a webview told to navigate anywhere does nothing:
 * the app's CSP has no host in it at all. The command is the opener plugin's, the same one
 * the feedback letter uses.
 */
export async function openDownloads(): Promise<void> {
  try {
    await invoke('plugin:opener|open_url', { url: DOWNLOADS_URL })
  } catch (error) {
    console.error('[Daylo] the downloads page did not open', error)
  }
}

/**
 * Come back on the new version. Says whether it happened, because the card has a sentence
 * for the case where it did not.
 */
export async function restartApp(): Promise<boolean> {
  try {
    const { relaunch } = await import('@tauri-apps/plugin-process')
    await relaunch()
    return true
  } catch (error) {
    console.error('[Daylo] the relaunch did not happen', error)
    return false
  }
}

export type UpdateCheck =
  | { kind: 'none' }
  | { kind: 'available'; version: string; update: Update }
  /** Something went wrong and nobody is told, because nobody asked. */
  | { kind: 'quiet' }
  /** Somebody asked for this and it failed, so somebody is owed an answer. */
  | { kind: 'failed' }

/**
 * Ask whether there is something newer.
 *
 * `asked` says whether a person pressed something, and it is the whole of the rule about
 * failures. Nobody is told about a failed automatic check: it runs when it runs, and a
 * person who did not ask for it should not be shown an error about it. Somebody who
 * pressed "Check now" is told, whatever went wrong.
 *
 * There used to be a second rule, for the manifest caught while a release is still being
 * assembled: the plugin says "none of the fallback platforms were found", which reads like
 * a broken release and is a few minutes of a publication. Swallowing that from somebody
 * who had just pressed a button left the button looking dead, and the words they get,
 * "Could not check just now.", are true of exactly that window and claim nothing about it.
 */
export async function checkForUpdate(asked: boolean): Promise<UpdateCheck> {
  if (!isTauri()) return { kind: 'none' }

  try {
    const update = await check()
    if (update === null) return { kind: 'none' }
    return { kind: 'available', version: update.version, update }
  } catch (error) {
    // Without the version or anything about the machine: this line exists to be read in a
    // log, not to describe whoever hit it.
    console.error('[Daylo] could not check for updates', error)
    if (!asked) return { kind: 'quiet' }
    return { kind: 'failed' }
  }
}

/**
 * Take the update: download it, install it, and come back on the new version.
 *
 * `relaunch` on every system, and not only where it is needed. On Windows the installer
 * closes the app and opens it again by itself, so this never runs there; on macOS and the
 * AppImage nothing would happen without it, and the card has already said the app will
 * close and open again. Making that sentence true everywhere was the decision.
 *
 * The steps are reported as they happen because the card shows them, and the failures are
 * told apart because they mean different things to whoever is reading: a download that did
 * not arrive is worth trying again later, an install that did not happen leaves the app
 * exactly as it was, and something that arrived unsigned is the one case where the app
 * refused on purpose.
 */
export type TakeStep =
  | { step: 'downloading'; percent: number | null }
  | { step: 'installing' }
  | { step: 'restart' }
  | { step: 'unverified' }
  | { step: 'download-failed' }
  | { step: 'install-failed' }

export async function takeUpdate(update: Update, say: (step: TakeStep) => void): Promise<void> {
  let total: number | null = null
  let got = 0

  try {
    await update.download((progress) => {
      // The plugin reports three moments, and only the first carries a length. It is
      // optional there, which is why the card has a percentless "Downloading…" at all:
      // without a total there is nothing honest to count.
      if (progress.event === 'Started') {
        total = progress.data.contentLength ?? null
        say({ step: 'downloading', percent: total === null ? null : 0 })
        return
      }
      if (progress.event !== 'Progress') return

      got += progress.data.chunkLength
      say({
        step: 'downloading',
        // Capped at 99: the last step is the signature being checked, and a bar sitting
        // at 100 while something is still happening is a bar that has stopped telling
        // the truth.
        percent: total === null ? null : Math.min(99, Math.floor((got / total) * 100)),
      })
    })
  } catch (error) {
    // The signature is checked inside download, before the bytes are handed back, so this
    // is where an unsigned artifact is refused. It is the one failure worth naming.
    console.error('[Daylo] the update did not download', error)
    const said = String(error).toLowerCase()
    say({ step: said.includes('signature') ? 'unverified' : 'download-failed' })
    return
  }

  say({ step: 'installing' })

  try {
    await update.install()
  } catch (error) {
    console.error('[Daylo] the update did not install', error)
    say({ step: 'install-failed' })
    return
  }

  // A net, not a step. Windows never gets here because its installer has already closed
  // the app; anywhere else, the install worked and only the coming back did not.
  if (!(await restartApp())) say({ step: 'restart' })
}
