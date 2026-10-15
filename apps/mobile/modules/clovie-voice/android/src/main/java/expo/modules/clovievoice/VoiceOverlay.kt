package expo.modules.clovievoice

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Color
import android.graphics.PixelFormat
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.webkit.WebViewClient
import org.json.JSONObject

/**
 * The voice UI: a full-width window over every app, anchored to the bottom, ~40% of the screen
 * tall, that hosts a bundled WebView page (assets/overlay/overlay.html, see
 * scripts/build-voice-overlay.mjs). It needs "Display over other apps". The window ignores touches
 * until `setAction` shows a button, so it never blocks what is underneath while the owner talks.
 *
 * Page API (all called here on the main thread): setState, setLevel, setTranscript, setMessage, setAction.
 * Needs SYSTEM_ALERT_WINDOW; `canShow` says whether the owner granted it.
 */
class VoiceOverlay(context: Context, private val onAction: () -> Unit) {
  private val context = context.applicationContext
  private val main = Handler(Looper.getMainLooper())
  private val windowManager = this.context.getSystemService(WindowManager::class.java)
  private var web: WebView? = null
  private var isAttached = false
  private var isPageReady = false
  private val queued = ArrayList<String>()
  private var params: WindowManager.LayoutParams? = null
  private val meter = LevelMeter()
  private var isMetering = false

  fun canShow(): Boolean = Settings.canDrawOverlays(context)

  /** Loads the page ahead of time, detached, so showing the overlay on a wake word is instant. */
  @SuppressLint("SetJavaScriptEnabled", "JavascriptInterface")
  fun preload() {
    if (web != null || !canShow()) return
    val view = WebView(context).apply {
      setBackgroundColor(Color.TRANSPARENT)
      settings.javaScriptEnabled = true
      settings.allowFileAccess = false // file:///android_asset is always readable
      settings.allowContentAccess = false
      addJavascriptInterface(
        object {
          @JavascriptInterface
          fun onAction() {
            main.post(onAction)
          }
        },
        "ClovieOverlayBridge",
      )
      webViewClient = object : WebViewClient() {
        override fun onPageFinished(view: WebView, url: String) {
          isPageReady = true
          queued.forEach { view.evaluateJavascript(it, null) }
          queued.clear()
        }
      }
      loadUrl(PAGE_URL)
    }
    web = view
  }

  /** Adds the window. Returns false when the permission is missing. */
  fun show(): Boolean {
    if (!canShow()) return false
    if (isAttached) return true
    preload()
    val view = web ?: return false
    val height = (context.resources.displayMetrics.heightPixels * HEIGHT_FRACTION).toInt()
    val layout = WindowManager.LayoutParams(
      WindowManager.LayoutParams.MATCH_PARENT,
      height,
      WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
        WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE or
        WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
      PixelFormat.TRANSLUCENT,
    ).apply { gravity = Gravity.BOTTOM }
    return try {
      windowManager.addView(view, layout)
      params = layout
      isAttached = true
      view.visibility = View.VISIBLE
      true
    } catch (_: RuntimeException) {
      false // permission revoked meanwhile, or no window token
    }
  }

  fun hide() {
    stopMetering()
    val view = web ?: return
    if (isAttached) {
      try {
        windowManager.removeViewImmediate(view)
      } catch (_: RuntimeException) {
        // Already gone.
      }
      isAttached = false
    }
    run("setAction(null);setMessage('');setTranscript('');setLevel(0);setState('idle')")
  }

  fun setState(state: String) {
    run("setState(${JSONObject.quote(state)})")
    if (state == "listening") startMetering() else stopMetering()
  }

  fun setTranscript(text: String) = run("setTranscript(${JSONObject.quote(text)})")

  fun setMessage(text: String) = run("setMessage(${JSONObject.quote(text)})")

  /** Shows a button (and makes the window touchable) or, with null, hides it again. */
  fun setAction(label: String?) {
    run("setAction(${if (label == null) "null" else JSONObject.quote(label)})")
    setTouchable(label != null)
  }

  /** A raw recogniser level in dB; the page gets a smoothed 0..1 at ~30 Hz. */
  fun pushRms(rmsDb: Float) = meter.push(rmsDb)

  fun destroy() {
    hide()
    web?.destroy()
    web = null
    isPageReady = false
  }

  private fun setTouchable(isTouchable: Boolean) {
    val view = web ?: return
    val layout = params ?: return
    layout.flags = if (isTouchable) {
      (layout.flags and WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE.inv()) or
        WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL
    } else {
      layout.flags or WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE
    }
    if (isAttached) windowManager.updateViewLayout(view, layout)
  }

  private fun run(script: String) {
    val view = web
    if (view == null || !isPageReady) {
      queued.add(script)
      return
    }
    view.evaluateJavascript(script, null)
  }

  private val tick = object : Runnable {
    override fun run() {
      if (!isMetering) return
      this@VoiceOverlay.run("setLevel(${"%.3f".format(java.util.Locale.US, meter.next())})")
      main.postDelayed(this, FRAME_MS)
    }
  }

  private fun startMetering() {
    if (isMetering) return
    isMetering = true
    meter.reset()
    main.post(tick)
  }

  private fun stopMetering() {
    isMetering = false
    main.removeCallbacks(tick)
  }

  private companion object {
    const val PAGE_URL = "file:///android_asset/overlay/overlay.html"
    const val HEIGHT_FRACTION = 0.4f
    const val FRAME_MS = 33L // ~30 Hz
  }
}

/** Smooths the recogniser's irregular dB readings into a steady 0..1 level. */
class LevelMeter {
  private var target = 0f
  private var level = 0f

  fun reset() {
    target = 0f
    level = 0f
  }

  /** SpeechRecognizer reports roughly -2 dB (silence) to 10 dB (loud). */
  fun push(rmsDb: Float) {
    target = ((rmsDb + 2f) / 12f).coerceIn(0f, 1f)
  }

  /** One ~33 ms frame: rise quickly, fall slowly. */
  fun next(): Float {
    level += (target - level) * (if (target > level) RISE else FALL)
    target *= DECAY // no new reading means quiet
    return level
  }

  private companion object {
    const val RISE = 0.5f
    const val FALL = 0.2f
    const val DECAY = 0.92f
  }
}
