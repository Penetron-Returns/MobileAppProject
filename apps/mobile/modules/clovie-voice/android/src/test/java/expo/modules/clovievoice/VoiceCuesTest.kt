package expo.modules.clovievoice

import java.util.Locale
import kotlin.math.abs
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class VoiceCuesTest {
  private fun peak(pcm: ShortArray) = pcm.maxOf { abs(it.toInt()) } / Short.MAX_VALUE.toDouble()

  private fun lowestHz(cue: Cue) = CueScores.notes(cue).minOf { it.frequencyHz }

  private fun highestHz(cue: Cue) = CueScores.notes(cue).maxOf { it.frequencyHz }

  @Test
  fun mapsEachOverlayStateToItsOwnCue() {
    assertEquals(Cue.WAKE, CuePolicy.cueFor("listening"))
    assertEquals(Cue.PROCESSING, CuePolicy.cueFor("processing"))
    assertEquals(Cue.SUCCESS, CuePolicy.cueFor("done"))
    assertEquals(Cue.FAILURE, CuePolicy.cueFor("error"))
    assertNull(CuePolicy.cueFor("hidden"))
  }

  @Test
  fun staysSilentOnlyInTotalSilence() {
    val normal = 2
    val vibrate = 1
    val filterAll = 1
    val filterPriority = 2
    assertTrue(CuePolicy.isAudible(normal, filterAll))
    assertTrue(CuePolicy.isAudible(vibrate, filterAll))
    assertTrue(CuePolicy.isAudible(normal, filterPriority))
    assertFalse(CuePolicy.isAudible(CuePolicy.RINGER_SILENT, filterAll))
    assertFalse(CuePolicy.isAudible(normal, CuePolicy.FILTER_NONE))
  }

  @Test
  fun everyCueRendersExactlyItsDurationAndIsAudible() {
    for (cue in Cue.values()) {
      val pcm = CueSynth.synthesize(cue)
      assertEquals(CueSynth.SAMPLE_RATE * CueScores.durationMs(cue) / 1000, pcm.size)
      assertTrue("$cue is silent", peak(pcm) > 0.02)
    }
  }

  @Test
  fun cuesAreSoftAndNeverClip() {
    for (cue in Cue.values()) assertTrue("$cue too loud", peak(CueSynth.synthesize(cue)) < 0.35)
  }

  @Test
  fun everyNoteFitsInsideItsCue() {
    for (cue in Cue.values()) {
      for (tone in CueScores.notes(cue)) {
        assertTrue("$cue note overruns", tone.startMs + tone.lengthMs <= CueScores.durationMs(cue))
      }
    }
  }

  @Test
  fun cuesStartAndEndOnSilenceSoTheyNeverClick() {
    for (cue in Cue.values()) {
      val pcm = CueSynth.synthesize(cue)
      val tail = pcm.takeLast(20).maxOf { abs(it.toInt()) } / Short.MAX_VALUE.toDouble()
      assertTrue("$cue ends abruptly", tail < 0.005)
      assertEquals("$cue starts abruptly", 0, pcm[0].toInt())
    }
  }

  @Test
  fun successAndFailureAreClearlyDifferent() {
    // Failure is lower than every success note and falls; success rises.
    assertTrue(highestHz(Cue.FAILURE) < lowestHz(Cue.SUCCESS))
    val failure = CueScores.notes(Cue.FAILURE)
    val success = CueScores.notes(Cue.SUCCESS)
    assertTrue(failure.first().frequencyHz > failure.last().frequencyHz)
    assertTrue(success.first().frequencyHz < success.last().frequencyHz)
    assertFalse(CueSynth.synthesize(Cue.SUCCESS).contentEquals(CueSynth.synthesize(Cue.FAILURE)))
  }

  @Test
  fun wakeIsBrighterAndHigherThanTheProcessingCue() {
    assertTrue(lowestHz(Cue.WAKE) > lowestHz(Cue.PROCESSING))
    assertTrue(highestHz(Cue.WAKE) > highestHz(Cue.PROCESSING))
    assertTrue(CueScores.notes(Cue.WAKE).first().frequencyHz < CueScores.notes(Cue.WAKE).last().frequencyHz)
    assertEquals(300, CueScores.WAKE_MS)
  }

  @Test
  fun processingIsQuieterThanWakeAndThePulseQuieterStill() {
    val wake = peak(CueSynth.synthesize(Cue.WAKE))
    val processing = peak(CueSynth.synthesize(Cue.PROCESSING))
    val pulse = peak(CueSynth.synthesize(Cue.PULSE))
    assertTrue(processing < wake)
    assertTrue(pulse < processing)
  }

  @Test
  fun theWaitingPulseStartsAfterAboutOneAndAHalfSecondsAndIsSparse() {
    assertEquals(1_500L, CuePolicy.PULSE_AFTER_MS)
    assertTrue(CuePolicy.PULSE_EVERY_MS > 1_000L)
  }

  @Test
  fun rendersTheSameLengthAtAnotherSampleRate() {
    val pcm = CueSynth.synthesize(Cue.SUCCESS, 22_050)
    assertEquals(22_050 * CueScores.durationMs(Cue.SUCCESS) / 1000, pcm.size)
  }
}

class SpokenReplyTest {
  private val notHeard = "Didn't catch that"
  private val unavailable = "speech_unavailable"

  private fun say(status: String, message: String) = SpokenReply.forOutcome(status, message, notHeard, unavailable)

  @Test
  fun readsTheOutcomeMessageAsIs() {
    assertEquals("Checked in Sipho", say("done", "Checked in Sipho"))
    assertEquals("No more clients today.", say("error", "  No more clients today.  "))
  }

  @Test
  fun neverReadsTheRawTranscriptWhenTheAppIsNeeded() {
    val spoken = say("open_app", "book Thandi Mokoena for Friday")
    assertEquals(SpokenReply.NEEDS_APP_SPOKEN, spoken)
    assertFalse(spoken!!.contains("Thandi"))
    assertEquals(SpokenReply.NEEDS_APP_SPOKEN, say("open_app", ""))
  }

  @Test
  fun givesTheFixedErrorsPlainWording() {
    assertEquals(SpokenReply.NOT_HEARD_SPOKEN, say("error", notHeard))
    assertEquals(SpokenReply.NOT_HEARD_SPOKEN, say("error", ""))
    assertEquals(SpokenReply.SPEECH_UNAVAILABLE_SPOKEN, say("error", unavailable))
  }

  @Test
  fun saysNothingForAnEmptySuccessOrAnUnknownStatus() {
    assertNull(say("done", " "))
    assertNull(say("fallback", "status=500"))
  }

  @Test
  fun cutsAVeryLongMessageShort() {
    assertEquals(200, say("done", "a".repeat(500))!!.length)
  }
}

class SpeechLocalePolicyTest {
  @Test
  fun prefersSouthAfricanEnglish() {
    assertEquals(Locale("en", "ZA"), SpeechLocalePolicy.pick { true })
  }

  @Test
  fun fallsBackToBritishEnglishThenToTheDefault() {
    assertEquals(Locale("en", "GB"), SpeechLocalePolicy.pick { it.country == "GB" })
    assertNull(SpeechLocalePolicy.pick { false })
  }
}
