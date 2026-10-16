package expo.modules.clovievoice

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class SttPolicyTest {
  private val first = SttAttempt(SttStep.ON_DEVICE)

  @Test
  fun namesEveryRecogniserErrorCode() {
    assertEquals("NO_MATCH", SttErrors.name(7))
    assertEquals("RECOGNIZER_BUSY", SttErrors.name(8))
    assertEquals("LANGUAGE_UNAVAILABLE", SttErrors.name(13))
    assertEquals("UNKNOWN_99", SttErrors.name(99))
  }

  @Test
  fun triesOnDeviceThenDefaultThenNoLocaleThenGoogle() {
    assertEquals(
      listOf(SttStep.ON_DEVICE, SttStep.DEFAULT_LOCALE, SttStep.DEFAULT_NO_LOCALE, SttStep.GOOGLE_NO_LOCALE),
      SttPolicy.ORDER,
    )
    assertTrue(SttStep.ON_DEVICE.useOnDevice)
    assertTrue(SttStep.DEFAULT_LOCALE.hasLocale)
    assertEquals(false, SttStep.DEFAULT_NO_LOCALE.hasLocale)
    assertTrue(SttStep.GOOGLE_NO_LOCALE.isGoogle)
  }

  @Test
  fun languageErrorsWalkTheStepsInOrder() {
    for (code in listOf(SttErrors.LANGUAGE_NOT_SUPPORTED, SttErrors.LANGUAGE_UNAVAILABLE)) {
      var attempt = first
      val seen = mutableListOf(attempt.step)
      while (true) {
        val next = SttPolicy.next(code, 100, attempt) as? SttNext.Retry ?: break
        assertEquals(0L, next.delayMs)
        attempt = next.attempt
        seen.add(attempt.step)
      }
      assertEquals(SttPolicy.ORDER, seen)
      assertEquals(SttNext.GiveUp("language"), SttPolicy.next(code, 100, attempt))
    }
  }

  @Test
  fun skippingAStepMovesOnWithoutAnError() {
    val next = SttPolicy.skip(first) as SttNext.Retry
    assertEquals(SttStep.DEFAULT_LOCALE, next.attempt.step)
    assertEquals(2, next.attempt.number)
    assertEquals(SttNext.GiveUp("language"), SttPolicy.skip(SttAttempt(SttStep.GOOGLE_NO_LOCALE, 4)))
  }

  @Test
  fun busyRecogniserLeavesOnDeviceAfterADelay() {
    val next = SttPolicy.next(SttErrors.RECOGNIZER_BUSY, 150, first) as SttNext.Retry
    assertEquals(SttStep.DEFAULT_LOCALE, next.attempt.step)
    assertEquals(SttPolicy.RETRY_DELAY_MS, next.delayMs)
    assertEquals(2, next.attempt.number)
  }

  @Test
  fun busyRecogniserOnTheDefaultOneRetriesTheSameStep() {
    val next = SttPolicy.next(SttErrors.RECOGNIZER_BUSY, 150, SttAttempt(SttStep.DEFAULT_NO_LOCALE, 3)) as SttNext.Retry
    assertEquals(SttStep.DEFAULT_NO_LOCALE, next.attempt.step)
  }

  @Test
  fun aFastNoMatchIsRetriedOnceBecauseTheMicrophoneWasLikelyStarved() {
    assertTrue(SttPolicy.next(SttErrors.NO_MATCH, 154, first) is SttNext.Retry)
    assertEquals(SttNext.GiveUp("no_speech"), SttPolicy.next(SttErrors.NO_MATCH, 154, first.copy(number = 2)))
  }

  @Test
  fun aSlowNoMatchIsGenuineSilence() {
    assertEquals(SttNext.GiveUp("no_speech"), SttPolicy.next(SttErrors.SPEECH_TIMEOUT, 5_000, first))
  }

  @Test
  fun missingPermissionNeverRetries() {
    assertEquals(SttNext.GiveUp("permission"), SttPolicy.next(SttErrors.INSUFFICIENT_PERMISSIONS, 10, first))
  }

  @Test
  fun givesUpAfterTheAttemptCap() {
    assertEquals(5, SttPolicy.MAX_ATTEMPTS)
    val capped = SttAttempt(SttStep.DEFAULT_NO_LOCALE, SttPolicy.MAX_ATTEMPTS)
    assertEquals(SttNext.GiveUp("error"), SttPolicy.next(SttErrors.AUDIO, 10, capped))
    assertEquals(SttNext.GiveUp("language"), SttPolicy.next(SttErrors.LANGUAGE_UNAVAILABLE, 10, capped))
  }

  @Test
  fun choosesTheBestEnglishFromWhatThePhoneReports() {
    assertEquals("en-ZA", SttLanguages.choose(listOf("en-US", "en-ZA", "fr-FR")))
    assertEquals("en-GB", SttLanguages.choose(listOf("en-US", "en_GB")))
    assertEquals("en-US", SttLanguages.choose(listOf("de-DE", "en-US")))
    assertEquals("en-AU", SttLanguages.choose(listOf("de-DE", "en-AU")))
    assertEquals("en-GB", SttLanguages.choose(listOf("en_GB")))
    assertNull(SttLanguages.choose(listOf("de-DE", "fr-FR")))
    assertNull(SttLanguages.choose(emptyList()))
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

class CloudFallbackTest {
  @Test
  fun recogniserIsOnlyAFallbackBeforeAClipIsCaptured() {
    assertEquals(AfterCloudFailure.Recogniser, CloudFallback.afterFailure(false, false, 0, 0))
    assertEquals(AfterCloudFailure.Recogniser, CloudFallback.afterFailure(false, true, 1, 0))
  }

  @Test
  fun aCapturedClipSpeaksAnErrorInsteadOfListeningToSilence() {
    assertEquals(AfterCloudFailure.SpeakError(false), CloudFallback.afterFailure(true, false, 0, 0))
  }

  @Test
  fun aFollowUpKeepsListeningWithinTheTurnCap() {
    assertEquals(AfterCloudFailure.SpeakError(true), CloudFallback.afterFailure(true, true, 2, 0))
    assertEquals(AfterCloudFailure.SpeakError(false), CloudFallback.afterFailure(true, true, FollowUp.BASE_TURNS, 0))
    assertEquals(AfterCloudFailure.SpeakError(true), CloudFallback.afterFailure(true, true, FollowUp.BASE_TURNS, 1))
  }

  @Test
  fun anErrorOnlyListensAgainWhenItAsksTo() {
    assertTrue(FollowUp.shouldListenAgain("error", true, 1, 0))
    assertFalse(FollowUp.shouldListenAgain("error", false, 1, 0))
    assertFalse(FollowUp.shouldListenAgain("open_app", true, 1, 0))
  }
}

class UploadPolicyTest {
  @Test
  fun aFreshProcessIsNeverStale() {
    assertFalse(UploadPolicy.isStale(UploadPolicy.UNSET, 1_000_000L))
  }

  @Test
  fun aConnectionIdleForTenSecondsIsStale() {
    assertFalse(UploadPolicy.isStale(1_000L, 1_000L + UploadPolicy.IDLE_MS - 1))
    assertTrue(UploadPolicy.isStale(1_000L, 1_000L + UploadPolicy.IDLE_MS))
    assertTrue(UploadPolicy.isStale(5_770L, 35_770L)) // the 30 s follow-up gap from the device test
  }

  @Test
  fun retriesOnceAndOnlyWhenTheServerWasNeverReached() {
    val network = CloudResult.Failure(0, "NETWORK_ERROR")
    assertTrue(UploadPolicy.shouldRetry(1, network))
    assertFalse(UploadPolicy.shouldRetry(2, network))
    assertFalse(UploadPolicy.shouldRetry(1, CloudResult.Failure(401, "UNAUTHENTICATED")))
    assertFalse(UploadPolicy.shouldRetry(1, CloudResult.Failure(0, "CLIENT_ERROR")))
    assertFalse(UploadPolicy.shouldRetry(1, CloudResult.Text("hi")))
  }
}
