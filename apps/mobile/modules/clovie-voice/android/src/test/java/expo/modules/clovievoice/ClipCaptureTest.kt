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
  fun endsAfterEightHundredMsOfSilenceFollowingSpeech() {
    val vad = ClipVad()
    assertEquals(ClipDecision.CONTINUE, feed(vad, quiet, 200)) // calibration
    assertEquals(ClipDecision.CONTINUE, feed(vad, loud, 1_000))
    assertTrue(vad.hasSpeech)
    assertEquals(ClipDecision.CONTINUE, feed(vad, quiet, 780))
    assertEquals(ClipDecision.END_OF_SPEECH, feed(vad, quiet, 40))
    assertEquals(1_000L, vad.speechMs)
  }

  @Test
  fun silenceInsideSpeechDoesNotEndTheClipIfSpeechResumes() {
    val vad = ClipVad()
    feed(vad, quiet, 200)
    feed(vad, loud, 500)
    assertEquals(ClipDecision.CONTINUE, feed(vad, quiet, 600))
    assertEquals(ClipDecision.CONTINUE, feed(vad, loud, 500))
    assertEquals(ClipDecision.END_OF_SPEECH, feed(vad, quiet, 1_000))
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
    assertTrue(vad.threshold >= 0.06f)
    feed(vad, 0.03f, 4_000) // loud-ish hum below the threshold is not speech
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
