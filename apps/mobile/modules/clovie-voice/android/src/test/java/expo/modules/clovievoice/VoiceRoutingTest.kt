package expo.modules.clovievoice

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class VoiceRoutingTest {
  @Test
  fun showsTheDrawerOnlyWhenTheAppIsOnScreenAndJsCanDrawIt() {
    assertEquals(SurfaceKind.IN_APP, VoiceRouting.surfaceFor(isAppForeground = true, isUiAttached = true))
  }

  @Test
  fun usesTheOverlayWhenTheAppIsInTheBackground() {
    assertEquals(SurfaceKind.OVERLAY, VoiceRouting.surfaceFor(isAppForeground = false, isUiAttached = true))
  }

  @Test
  fun usesTheOverlayWhenNoDrawerIsMountedEvenInTheForeground() {
    // The companion is off or not on the plan: nothing in JS would draw the events.
    assertEquals(SurfaceKind.OVERLAY, VoiceRouting.surfaceFor(isAppForeground = true, isUiAttached = false))
    assertEquals(SurfaceKind.OVERLAY, VoiceRouting.surfaceFor(isAppForeground = false, isUiAttached = false))
  }

  @Test
  fun mapsOverlayStatesToTheStatesJsDraws() {
    assertEquals("listening", VoiceRouting.uiStateFor("listening"))
    assertEquals("thinking", VoiceRouting.uiStateFor("processing"))
    for (finished in listOf("done", "error", "request")) assertEquals("speaking", VoiceRouting.uiStateFor(finished))
    assertNull(VoiceRouting.uiStateFor("unknown"))
  }

  @Test
  fun presenceStartsOutOfTheAppSoAHeadlessStartUsesTheOverlay() {
    AppPresence.setForeground(false)
    AppPresence.setUiAttached(false)
    assertFalse(AppPresence.isForeground)
    assertFalse(AppPresence.isUiAttached)
    AppPresence.setForeground(true)
    AppPresence.setUiAttached(true)
    assertTrue(AppPresence.isForeground && AppPresence.isUiAttached)
    AppPresence.setForeground(false)
    AppPresence.setUiAttached(false)
  }
}
