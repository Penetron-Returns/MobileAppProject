package expo.modules.clovievoice

import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ClipVadTest {
  private val quiet = 0.002f
  private val loud = 0.08f

  /** Feeds `ms` of constant level in 20 ms frames; returns the first non-CONTINUE decision, or CONTINUE. */
  private fun feed(vad: ClipVad, rms: Float, ms: Long): ClipDecision {
    var left = ms
    while (left > 0) {
      val decision = vad.update(rms, 20)
      if (decision != ClipDecision.CONTINUE) return decision
      left -= 20
    }
    return ClipDecision.CONTINUE
  }

  @Test
  fun endsAfterTwelveHundredMsOfSilenceFollowingSpeech() {
    val vad = ClipVad()
    assertEquals(ClipDecision.CONTINUE, feed(vad, quiet, 200)) // calibration
    assertEquals(ClipDecision.CONTINUE, feed(vad, loud, 1_000))
    assertTrue(vad.hasSpeech)
    assertEquals(ClipDecision.CONTINUE, feed(vad, quiet, 1_180))
    assertEquals(ClipDecision.END_OF_SPEECH, feed(vad, quiet, 40))
    // 1 s of loud frames plus the 300 ms hangover after the last one.
    assertEquals(1_300L, vad.speechMs)
  }

  @Test
  fun neverEndsSoonerThanOneAndAHalfSecondsAfterSpeechStarted() {
    val vad = ClipVad()
    feed(vad, quiet, 200)
    feed(vad, loud, 200) // a short word, starting 200 ms into the clip...
    // ...then silence: 1.2 s of it is enough only once 1.5 s have passed since the word began.
    assertEquals(ClipDecision.CONTINUE, feed(vad, quiet, 1_280))
    assertEquals(ClipDecision.END_OF_SPEECH, feed(vad, quiet, 20))
    assertEquals(1_500L, vad.elapsedMs - 200L)
  }

  @Test
  fun silenceInsideSpeechDoesNotEndTheClipIfSpeechResumes() {
    val vad = ClipVad()
    feed(vad, quiet, 200)
    feed(vad, loud, 500)
    assertEquals(ClipDecision.CONTINUE, feed(vad, quiet, 1_000))
    assertEquals(ClipDecision.CONTINUE, feed(vad, loud, 500))
    assertEquals(ClipDecision.END_OF_SPEECH, feed(vad, quiet, 1_500))
  }

  /** Frame energies for "client has arrived": words with soft syllable valleys and short pauses between them. */
  private fun sentence(): List<Pair<Float, Long>> = listOf(
    0.0926f to 120L, 0.030f to 60L, 0.060f to 100L, 0.009f to 80L, // "cli-ent"
    0.020f to 160L, 0.007f to 140L, // pause
    0.050f to 120L, 0.012f to 60L, 0.070f to 140L, // "has"
    0.006f to 300L, // pause (below threshold)
    0.040f to 100L, 0.011f to 80L, 0.065f to 100L, 0.015f to 80L, 0.050f to 160L, // "a-rri-ved"
  )

  @Test
  fun aSentenceWithPausesBetweenWordsDoesNotEndEarlyAndEndsAfterTheLastWord() {
    val vad = ClipVad()
    feed(vad, 0.003f, 200)
    for ((rms, ms) in sentence()) {
      assertEquals("ended mid-sentence at " + vad.elapsedMs + " ms", ClipDecision.CONTINUE, feed(vad, rms, ms))
    }
    assertTrue(vad.hasSpeech)
    assertEquals(ClipDecision.CONTINUE, feed(vad, 0.003f, 1_160))
    assertEquals(ClipDecision.END_OF_SPEECH, feed(vad, 0.003f, 40))
    // Most of the sentence counts as speech, not the 820 ms the old threshold saw.
    assertTrue("speechMs=" + vad.speechMs, vad.speechMs >= 1_600)
  }

  @Test
  fun softSpeechAboveTheAdaptiveThresholdStillCounts() {
    val vad = ClipVad()
    feed(vad, 0.003f, 200)
    assertEquals(0.0075f, vad.threshold, 0.0001f) // floor x 2.5
    feed(vad, 0.010f, 400) // a quiet talker, below the old floor + 0.012 threshold
    assertTrue(vad.hasSpeech)
  }

  @Test
  fun aVeryQuietRoomStillUsesTheAbsoluteMinimumThreshold() {
    val vad = ClipVad()
    feed(vad, 0.0005f, 200)
    assertEquals(ClipVad.MIN_THRESHOLD, vad.threshold, 0f)
    feed(vad, 0.005f, 3_000) // hiss under the minimum
    assertFalse(vad.hasSpeech)
  }

  @Test
  fun hangoverKeepsTheTailOfAWordCountedAsSpeechButNotMore() {
    val vad = ClipVad()
    feed(vad, quiet, 200)
    feed(vad, loud, 200)
    feed(vad, quiet, 100)
    assertEquals(300L, vad.speechMs)
    feed(vad, quiet, 400)
    assertEquals(500L, vad.speechMs) // 200 loud + 300 hangover
  }

  @Test
  fun givesUpAfterFourSecondsWithNoSpeech() {
    val vad = ClipVad()
    assertEquals(ClipDecision.CONTINUE, feed(vad, quiet, 3_980))
    assertEquals(ClipDecision.NO_SPEECH, vad.update(quiet, 20))
    assertFalse(vad.hasSpeech)
  }

  @Test
  fun aClickShorterThanTheConfirmWindowIsNotSpeech() {
    val vad = ClipVad()
    feed(vad, quiet, 200)
    feed(vad, loud, 60)
    assertFalse(vad.hasSpeech)
    assertEquals(ClipDecision.NO_SPEECH, feed(vad, quiet, 5_000))
  }

  @Test
  fun stopsAtTenSecondsOfContinuousSpeech() {
    val vad = ClipVad()
    feed(vad, quiet, 200)
    assertEquals(ClipDecision.MAX_LENGTH, feed(vad, loud, 20_000))
    assertEquals(10_000L, vad.elapsedMs)
  }

  @Test
  fun calibratesOnTheQuietestEarlyFrameSoImmediateSpeechStillCounts() {
    val vad = ClipVad()
    vad.update(loud, 20) // owner already talking when the clip starts
    feed(vad, quiet, 180)
    assertEquals(quiet, vad.floor, 0.0001f)
    feed(vad, loud, 200)
    assertTrue(vad.hasSpeech)
  }

  @Test
  fun aNoisyRoomRaisesTheSpeechThresholdAboveItsFloor() {
    val vad = ClipVad()
    feed(vad, 0.02f, 200)
    assertTrue(vad.threshold >= 0.0499f)
    feed(vad, 0.03f, 3_000) // loud-ish hum below the threshold is not speech
    assertFalse(vad.hasSpeech)
  }

  @Test
  fun rmsOfFullScaleSquareWaveIsOneAndSilenceIsZero() {
    assertEquals(1f, ClipVad.rms(ShortArray(100) { Short.MIN_VALUE }, 100), 0.0001f)
    assertEquals(0f, ClipVad.rms(ShortArray(100), 100), 0f)
    assertEquals(0f, ClipVad.rms(ShortArray(0), 0), 0f)
  }

  @Test
  fun meterIsClampedToUnitRange() {
    assertEquals(0f, ClipVad.meter(0f), 0f)
    assertEquals(1f, ClipVad.meter(0.9f), 0f)
    assertEquals(0.3f, ClipVad.meter(0.05f), 0.0001f)
  }
}

class WavFileTest {
  private fun u32(b: ByteArray, at: Int) = ByteBuffer.wrap(b, at, 4).order(ByteOrder.LITTLE_ENDIAN).int
  private fun u16(b: ByteArray, at: Int) = ByteBuffer.wrap(b, at, 2).order(ByteOrder.LITTLE_ENDIAN).short.toInt()

  @Test
  fun headerDescribes16kHzMono16BitPcm() {
    val h = WavFile.header(32_000)
    assertEquals(WavFile.HEADER_BYTES, h.size)
    assertEquals("RIFF", String(h, 0, 4, Charsets.US_ASCII))
    assertEquals(36 + 32_000, u32(h, 4))
    assertEquals("WAVEfmt ", String(h, 8, 8, Charsets.US_ASCII))
    assertEquals(16, u32(h, 16))
    assertEquals(1, u16(h, 20)) // PCM
    assertEquals(1, u16(h, 22)) // mono
    assertEquals(16_000, u32(h, 24))
    assertEquals(32_000, u32(h, 28)) // byte rate
    assertEquals(2, u16(h, 32)) // block align
    assertEquals(16, u16(h, 34))
    assertEquals("data", String(h, 36, 4, Charsets.US_ASCII))
    assertEquals(32_000, u32(h, 40))
  }

  @Test
  fun writesHeaderThenLittleEndianSamples() {
    val file = File.createTempFile("clip", ".wav")
    try {
      val size = WavFile.write(file, shortArrayOf(1, -2, 0x1234, 99), 3)
      assertEquals(WavFile.HEADER_BYTES + 6L, size)
      val bytes = file.readBytes()
      assertEquals(6, u32(bytes, 40))
      assertEquals(1, u16(bytes, 44))
      assertEquals(-2, u16(bytes, 46))
      assertEquals(0x1234, u16(bytes, 48))
    } finally {
      file.delete()
    }
  }
}
