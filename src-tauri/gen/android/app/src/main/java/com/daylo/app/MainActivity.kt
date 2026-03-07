package com.daylo.app

import android.os.Bundle
import android.graphics.Color
import androidx.core.view.WindowInsetsControllerCompat

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)

    // Set emerald status bar color programmatically
    window.statusBarColor = Color.parseColor("#10B981")

    // Use light (white) icons on emerald background
    val controller = WindowInsetsControllerCompat(window, window.decorView)
    controller.isAppearanceLightStatusBars = false
  }
}
