package expo.modules.clovievoice

import java.util.concurrent.atomic.AtomicBoolean

/** Lets exactly one caller through: the first [tryFire] is true, every later one false. */
class OnceGuard {
  private val fired = AtomicBoolean(false)

  fun tryFire(): Boolean = fired.compareAndSet(false, true)
}

/**
 * Allows one `startListening` per recogniser instance. Some recognisers (Google's) call the
 * support-check callback several times; a second start on the same instance fails with ERROR_CLIENT.
 */
class StartOnce {
  private var started: Any? = null

  fun claim(recognizer: Any): Boolean {
    if (started === recognizer) return false
    started = recognizer
    return true
  }
}
