package com.lexicon.app

// Tracked copy. `scripts/android-prepare.mjs` writes this over the generated
// MainActivity.kt, which `tauri android init` would otherwise regenerate
// without the lifecycle signals below. Edit this file, not the generated one.

import android.os.Bundle
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge

class MainActivity : TauriActivity() {
  private var webView: WebView? = null

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
  }

  override fun onWebViewCreate(webView: WebView) {
    this.webView = webView
  }

  /**
   * Tell the page the app is leaving or returning. The WebView will not: it
   * reports `visibilityState` "visible" in the background and fires no
   * visibilitychange, so a game would keep its clock running behind the home
   * screen and a share would wait unseen in the inbox. The web side listens
   * in src/lib/app-lifecycle.ts.
   *
   * Pause is sent before super.onPause(), which pauses the WebView itself.
   */
  override fun onPause() {
    signal("lexicon:pause")
    super.onPause()
  }

  override fun onResume() {
    super.onResume()
    signal("lexicon:resume")
  }

  private fun signal(event: String) {
    webView?.evaluateJavascript("window.dispatchEvent(new Event('$event'))", null)
  }
}
