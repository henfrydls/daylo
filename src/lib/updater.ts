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

export type UpdateCheck =
  | { kind: 'none' }
  | { kind: 'available'; version: string; update: Update }
  /** Something went wrong and nobody is told. See `isPassing`. */
  | { kind: 'quiet' }
  /** Somebody asked for this and it failed, so somebody is owed an answer. */
  | { kind: 'failed' }

/**
 * Failures that are not worth a word on screen.
 *
 * The one that matters is the manifest arriving while a release is still being assembled:
 * the plugin says "none of the fallback platforms were found", which reads like a broken
 * release and is a few minutes of a publication. Our own release workflow writes the
 * manifest once, at the end, so this should not happen to us; it is recognised anyway
 * because the window belongs to GitHub's caches as much as to us, and because an automatic
 * check that nobody asked for has no business reporting anything.
 *
 * Text and not a type, because the plugin gives no code for it.
 */
function isPassing(error: unknown): boolean {
  const said = String(error).toLowerCase()
  return said.includes('none of the fallback platforms') || said.includes('platforms were found')
}

/**
 * Ask whether there is something newer.
 *
 * `asked` says whether a person pressed something. Nobody is told about a failed automatic
 * check: it runs when it runs, and a person who did not ask for it should not be shown an
 * error about it. Somebody who pressed "Check now" is owed an answer either way.
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
    if (!asked || isPassing(error)) return { kind: 'quiet' }
    return { kind: 'failed' }
  }
}
