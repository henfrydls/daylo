import { invoke, isTauri } from '@tauri-apps/api/core'

/**
 * Open an address in whatever the person uses for the web.
 *
 * In a browser this is what a link already does, so there is nothing to do and the anchor
 * is left alone. Inside the application an anchor would navigate the webview itself, which
 * replaces Daylo with a web page and leaves no way back: there is no address bar and no
 * back button on a desktop window. So there the click is taken and handed to the system.
 *
 * Whether to call this at all is decided by the caller, synchronously, because a default
 * can only be prevented before it happens and this cannot answer in time.
 */
export async function openLink(url: string): Promise<void> {
  if (!isTauri()) return
  try {
    await invoke('plugin:opener|open_url', { url })
  } catch (error) {
    console.error('[Daylo] a link did not open', error)
  }
}
