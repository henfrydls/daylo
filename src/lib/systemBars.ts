/**
 * The Android system bars, handed to the CSS (#198).
 *
 * From Android 15 Daylo is drawn edge to edge, so the status bar and the navigation bar lie
 * over the page. A WebView that knows this says so through env(safe-area-inset-*); an older
 * one says 0, and measured on Android 15's own WebView 124 the three-button bar covered the
 * day sheet's Done, the floating button, the panel, the toasts and the confirmation dialog.
 *
 * MainActivity reads the sizes from Android and exposes them as `DayloSystemBars`. This
 * writes them as two custom properties, and index.css takes the larger of each and env(),
 * so a WebView that does report them is not padded twice. Everywhere else, the browser,
 * the desktop app, there is no bridge and nothing is written.
 */
interface SystemBarsBridge {
  statusTop(): number
  navigationBottom(): number
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

  const root = win.document.documentElement
  const apply = () => {
    root.style.setProperty(
      '--android-status-top',
      px(() => bridge.statusTop())
    )
    root.style.setProperty(
      '--android-navigation-bottom',
      px(() => bridge.navigationBottom())
    )
  }

  apply()
  // MainActivity announces a change; a resize covers the phone being turned before the
  // announcement arrives.
  win.addEventListener('daylo-insets', apply)
  win.addEventListener('resize', apply)
  return () => {
    win.removeEventListener('daylo-insets', apply)
    win.removeEventListener('resize', apply)
  }
}
