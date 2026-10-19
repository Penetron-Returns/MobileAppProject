package expo.modules.clovievoice

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class OnceGuardTest {
  @Test
  fun onlyTheFirstCallbackProceeds() {
    val guard = OnceGuard()
    assertTrue(guard.tryFire())
    assertFalse(guard.tryFire())
    assertFalse(guard.tryFire())
  }

  @Test
  fun aSecondStartOnTheSameRecogniserIsIgnored() {
    val once = StartOnce()
    val first = Any()
    assertTrue(once.claim(first))
    assertFalse(once.claim(first))
  }

  @Test
  fun aNewRecogniserMayStart() {
    val once = StartOnce()
    assertTrue(once.claim(Any()))
    assertTrue(once.claim(Any()))
  }
}
