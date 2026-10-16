package expo.modules.clovievoice

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class SttPolicyTest {
  private val first = SttAttempt(localeIndex = 0, useOnDevice = true)

  @Test
  fun namesEveryRecogniserErrorCode() {
    assertEquals("NO_MATCH", SttErrors.name(7))
    assertEquals("RECOGNIZER_BUSY", SttErrors.name(8))
    assertEquals("LANGUAGE_UNAVAILABLE", SttErrors.name(13))
    assertEquals("UNKNOWN_99", SttErrors.name(99))
  }

  @Test
  fun missingFirstLanguageFallsBackToTheNextOne() {
    val next = SttPolicy.next(SttErrors.LANGUAGE_UNAVAILABLE, 100, first, 2) as SttNext.Retry
    assertEquals(1, next.attempt.localeIndex)
    assertTrue(next.attempt.useOnDevice)
    assertEquals(0L, next.delayMs)
  }

  @Test
  fun missingLastLanguageOnDeviceFallsBackToTheDefaultRecogniser() {
    val last = SttAttempt(1, true, 2)
    val next = SttPolicy.next(SttErrors.LANGUAGE_NOT_SUPPORTED, 100, last, 2) as SttNext.Retry
    assertEquals(0, next.attempt.localeIndex)
    assertEquals(false, next.attempt.useOnDevice)
  }

  @Test
  fun missingLastLanguageOnTheDefaultRecogniserGivesUp() {
    val last = SttAttempt(1, false, 3)
    assertEquals(SttNext.GiveUp("error"), SttPolicy.next(SttErrors.LANGUAGE_UNAVAILABLE, 100, last, 2))
  }

  @Test
  fun busyRecogniserRetriesOnTheDefaultRecogniserAfterADelay() {
    val next = SttPolicy.next(SttErrors.RECOGNIZER_BUSY, 150, first, 2) as SttNext.Retry
    assertEquals(false, next.attempt.useOnDevice)
    assertEquals(SttPolicy.RETRY_DELAY_MS, next.delayMs)
    assertEquals(2, next.attempt.number)
  }

  @Test
  fun aFastNoMatchIsRetriedOnceBecauseTheMicrophoneWasLikelyStarved() {
    assertTrue(SttPolicy.next(SttErrors.NO_MATCH, 154, first, 2) is SttNext.Retry)
    val second = first.copy(number = 2)
    assertEquals(SttNext.GiveUp("no_speech"), SttPolicy.next(SttErrors.NO_MATCH, 154, second, 2))
  }

  @Test
  fun aSlowNoMatchIsGenuineSilence() {
    assertEquals(SttNext.GiveUp("no_speech"), SttPolicy.next(SttErrors.SPEECH_TIMEOUT, 5_000, first, 2))
  }

  @Test
  fun missingPermissionNeverRetries() {
    assertEquals(SttNext.GiveUp("permission"), SttPolicy.next(SttErrors.INSUFFICIENT_PERMISSIONS, 10, first, 2))
  }

  @Test
  fun givesUpAfterTheAttemptCap() {
    val capped = first.copy(number = SttPolicy.MAX_ATTEMPTS)
    assertEquals(SttNext.GiveUp("error"), SttPolicy.next(SttErrors.AUDIO, 10, capped, 2))
  }
}

class InteractionPolicyTest {
  @Test
  fun handsFreeRearmsAndOneShotStops() {
    assertEquals(InteractionPolicy.After.REARM, InteractionPolicy.after(isHandsFree = true))
    assertEquals(InteractionPolicy.After.STOP, InteractionPolicy.after(isHandsFree = false))
  }

  @Test
  fun rearmRetriesBackOffThenGiveUp() {
    assertEquals(400L, InteractionPolicy.rearmRetryDelayMs(1))
    assertEquals(1_200L, InteractionPolicy.rearmRetryDelayMs(3))
    assertNull(InteractionPolicy.rearmRetryDelayMs(4))
    assertNull(InteractionPolicy.rearmRetryDelayMs(0))
  }
}

class TimingRecorderTest {
  private var now = 1_000_000L
  private val logged = ArrayList<Pair<String, Long>>()
  private val recorder = TimingRecorder({ now }) { k, v -> logged.add(k to v) }

  @Test
  fun measuresEachStepFromOneClock() {
    recorder.wake()
    now += 20
    recorder.overlayShown()
    now += 9
    recorder.sttStarted()
    now += 700
    recorder.sttFinished()
    recorder.commandStarted()
    now += 300
    recorder.commandDone()
    assertEquals(20L, recorder.values["wakeToOverlayMs"])
    assertEquals(29L, recorder.values["wakeToSttStartMs"])
    assertEquals(700L, recorder.values["sttMs"])
    assertEquals(300L, recorder.values["commandMs"])
    assertEquals(1_029L, recorder.values["totalMs"])
  }

  @Test
  fun aCommandThatNeverStartedIsMinusOneNotGarbage() {
    recorder.wake()
    now += 800
    recorder.sttStarted()
    recorder.sttFinished()
    recorder.commandDone()
    assertEquals(-1L, recorder.values["commandMs"])
    assertEquals(800L, recorder.values["totalMs"])
  }

  @Test
  fun aSttThatNeverStartedIsMinusOne() {
    recorder.wake()
    recorder.sttFinished()
    assertEquals(-1L, recorder.values["sttMs"])
  }

  @Test
  fun wakeClearsTheStartsOfTheLastInteraction() {
    recorder.wake()
    recorder.commandStarted()
    recorder.wake()
    recorder.commandDone()
    assertEquals(-1L, recorder.values["commandMs"])
  }
}
