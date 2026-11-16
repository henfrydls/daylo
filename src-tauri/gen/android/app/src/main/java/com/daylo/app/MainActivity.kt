package com.daylo.app

import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat

class MainActivity : TauriActivity() {
  // The system bars that lie over the page, in CSS pixels (dp, which is what a CSS pixel is
  // in a WebView at device width). Written on the UI thread, read on the JavaBridge thread.
  @Volatile private var statusTop = 0f
  @Volatile private var navigationBottom = 0f
  private var webView: WebView? = null

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)

    // Dark icons on light status bar background (like Instagram)
    val controller = WindowInsetsControllerCompat(window, window.decorView)
    controller.isAppearanceLightStatusBars = true

    // From Android 15 the app is drawn edge to edge (targetSdk 36), so the status bar and
    // the navigation bar lie on top of the WebView. An older WebView does not pass them to
    // the page: env(safe-area-inset-*) is 0 there, and with three buttons the 48 dp bar
    // covered the day sheet's Done (#198). Measured on Android 15's own WebView 124. So
    // the sizes are read here and handed to the page, which takes the larger of these and
    // env(); a WebView that does report them gets the same number from both and nothing is
    // counted twice.
    //
    // On the decor view and passed on untouched: this only reads the insets, and the
    // WebView still receives them, which is how a newer one fills env().
    ViewCompat.setOnApplyWindowInsetsListener(window.decorView) { view, insets ->
      val density = resources.displayMetrics.density
      statusTop = insets.getInsets(WindowInsetsCompat.Type.statusBars()).top / density
      navigationBottom = insets.getInsets(WindowInsetsCompat.Type.navigationBars()).bottom / density
      // A change after the page has loaded (navigation mode switched, the phone turned)
      // is announced; the page reads the numbers again when it hears it.
      webView?.post {
        webView?.evaluateJavascript("window.dispatchEvent(new Event('daylo-insets'))", null)
      }
      ViewCompat.onApplyWindowInsets(view, insets)
    }
  }

  // Called before the first page is loaded, so the bridge is there for the page's first
  // script.
  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)
    this.webView = webView
    webView.addJavascriptInterface(SystemBars(), "DayloSystemBars")
  }

  /** Two numbers and nothing else: nothing on this object takes an argument or acts. */
  inner class SystemBars {
    @JavascriptInterface fun statusTop(): Float = statusTop
    @JavascriptInterface fun navigationBottom(): Float = navigationBottom
  }
}
