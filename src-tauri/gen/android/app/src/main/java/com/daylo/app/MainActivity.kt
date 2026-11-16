package com.daylo.app

import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat

class MainActivity : TauriActivity() {
  // What the system bars cover of the page, in CSS pixels (dp, which is what a CSS pixel is
  // in a WebView at device width): top, bottom, left, right. Written on the UI thread, read
  // on the JavaBridge thread, so the array is replaced, never changed in place.
  @Volatile private var covered = floatArrayOf(0f, 0f, 0f, 0f)

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)

    // Dark icons on light status bar background (like Instagram)
    val controller = WindowInsetsControllerCompat(window, window.decorView)
    controller.isAppearanceLightStatusBars = true
  }

  // Called before the first page is loaded, so the bridge is there for the page's first
  // script.
  //
  // From Android 15 the app is drawn edge to edge (targetSdk 36), so the status bar and the
  // navigation bar lie on top of the WebView. An older WebView does not pass them to the
  // page: env(safe-area-inset-*) is 0 there, and with three buttons the 48 dp bar covered
  // the day sheet's Done (#198). Measured on Android 15's own WebView 124. So the sizes are
  // read here and handed to the page, which takes the larger of these and env(); a WebView
  // that does report them gets the same number from both and nothing is counted twice.
  //
  // On the WebView and not on the window: what reaches the WebView is only what lies over
  // it. Below Android 15 the window is not edge to edge, the bars sit beside the page and
  // nothing reaches here; read from the window instead, they would be added as empty space
  // on every phone that is not on Android 15. The same holds for split screen, where only
  // the bar that touches Daylo's half lies over it. In landscape with three buttons the bar
  // is on a side, which is why left and right are passed too.
  //
  // The insets are passed on untouched, which is how a newer WebView still fills env().
  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)
    webView.addJavascriptInterface(SystemBars(), "DayloSystemBars")
    ViewCompat.setOnApplyWindowInsetsListener(webView) { view, insets ->
      val density = resources.displayMetrics.density
      val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
      val next = floatArrayOf(
        bars.top / density,
        bars.bottom / density,
        bars.left / density,
        bars.right / density,
      )
      // Insets are applied again for many reasons that change nothing here, the keyboard
      // among them. Only a real change is announced; the page reads the numbers again when
      // it hears it.
      if (!next.contentEquals(covered)) {
        covered = next
        view.post {
          (view as WebView).evaluateJavascript(
            "window.dispatchEvent(new Event('daylo-insets'))",
            null,
          )
        }
      }
      ViewCompat.onApplyWindowInsets(view, insets)
    }
    ViewCompat.requestApplyInsets(webView)
  }

  /** Four numbers and nothing else: nothing on this object takes an argument or acts. */
  inner class SystemBars {
    @JavascriptInterface fun statusTop(): Float = covered[0]
    @JavascriptInterface fun navigationBottom(): Float = covered[1]
    @JavascriptInterface fun navigationLeft(): Float = covered[2]
    @JavascriptInterface fun navigationRight(): Float = covered[3]
  }
}
