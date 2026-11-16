/**
 * The Android system bars, handed to the CSS (#198).
 *
 * From Android 15 Daylo is drawn edge to edge, so the status bar and the navigation bar lie
 * over the page. A WebView that knows this says so through env(safe-area-inset-*); an older
 * one says 0, and measured on Android 15's own WebView 124 the three-button bar covered the
 * day sheet's Done, the floating button, the panel, the toasts and the confirmation dialog.
 *
 * MainActivity reads what the bars cover of the WebView and exposes it as `DayloSystemBars`.
 * This writes it as four custom properties, and index.css takes the larger of each and
 * env(), so a WebView that does report them is not padded twice. Everywhere else, the
 * browser, the desktop app, there is no bridge and nothing is written.
 */
interface SystemBarsBridge {
  statusTop(): number
  navigationBottom(): number
  navigationLeft?(): number
  navigationRight?(): number
}

/** A size in CSS pixels, or 0px for anything that is not one. */
function px(read: () => number): string {
  let value: number
  try {
    value = Number(read())
  } catch {
    value = 0
  }
  return `${Number.isFinite(value) && value > 0 ? value : 0}px`
}

/** Starts following the bars. Returns the function that stops. */
export function followSystemBars(win: Window): () => void {
  const bridge = (win as Window & { DayloSystemBars?: SystemBarsBridge }).DayloSystemBars
  if (!bridge) return () => {}

  const style = win.document.documentElement.style
  // Written only when it changed: each write makes the browser work out the styles again,
  // and a value that did not change is work for nothing.
  const set = (name: string, value: string) => {
    if (style.getPropertyValue(name) !== value) style.setProperty(name, value)
  }
  const apply = () => {
    set(
      '--android-status-top',
      px(() => bridge.statusTop())
    )
    set(
      '--android-navigation-bottom',
      px(() => bridge.navigationBottom())
    )
    set(
      '--android-navigation-left',
      px(() => bridge.navigationLeft?.() ?? 0)
    )
    set(
      '--android-navigation-right',
      px(() => bridge.navigationRight?.() ?? 0)
    )
  }

  apply()
  // MainActivity announces a change, and only a change (the phone turned, the navigation
  // mode switched, split screen). Nothing listens to resize: the keyboard resizes the page
  // on every frame it moves, and each read is a synchronous call across the bridge.
  win.addEventListener('daylo-insets', apply)
  return () => win.removeEventListener('daylo-insets', apply)
}
