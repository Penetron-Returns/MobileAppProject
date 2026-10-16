package expo.modules.clovievoice

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class AudioFormatsTest {
  @Test
  fun m4aFilesUploadAsAudioMp4AndEverythingElseAsWav() {
    assertEquals(AudioFormats.M4A, AudioFormats.forFileName("clovie-clip-1.m4a"))
    assertEquals(AudioFormats.M4A, AudioFormats.forFileName("CLIP.M4A"))
    assertEquals(AudioFormats.WAV, AudioFormats.forFileName("clovie-clip-1.wav"))
    assertEquals(AudioFormats.WAV, AudioFormats.forFileName("no-extension"))
    assertEquals("audio/mp4", AudioFormats.M4A.contentType)
  }

  @Test
  fun presentationTimeFollowsTheSampleCount() {
    assertEquals(0L, AudioFormats.ptsUs(0))
    assertEquals(1_000_000L, AudioFormats.ptsUs(16_000))
    assertEquals(64_000L, AudioFormats.ptsUs(1_024))
    assertEquals(4_000_000L, AudioFormats.ptsUs(64_000))
  }

  @Test
  fun chunksFillTheInputBufferInWholeSamplesAndNeverPassTheEnd() {
    assertEquals(8_192, AudioFormats.chunkSamples(64_000, 16_384))
    assertEquals(8_192, AudioFormats.chunkSamples(64_000, 16_385)) // an odd capacity drops the half sample
    assertEquals(300, AudioFormats.chunkSamples(300, 16_384))
    assertEquals(0, AudioFormats.chunkSamples(0, 16_384))
    assertEquals(0, AudioFormats.chunkSamples(-5, 16_384))
  }

  @Test
  fun aFourSecondClipIsAboutSixteenKilobytesAtThirtyTwoKbps() {
    assertEquals(16_000L, AudioFormats.estimatedAacBytes(4_000))
    // The WAV of the same clip is 8x larger.
    assertEquals(128_044L, (4 * AudioFormats.SAMPLE_RATE * 2 + WavFile.HEADER_BYTES).toLong())
  }

  @Test
  fun multipartCarriesTheClipContentType() {
    val text = CloudTranscriber.multipartBody("B", "clovie-clip-1.m4a", byteArrayOf(1, 2), AudioFormats.M4A.contentType)
      .toString(Charsets.ISO_8859_1)
    assertTrue(text.contains("filename=\"clovie-clip-1.m4a\""))
    assertTrue(text.contains("Content-Type: audio/mp4\r\n\r\n"))
  }
}

class ServerTimingTest {
  @Test
  fun readsTheProxyAndNerovaEntries() {
    val timing = ServerTiming.parse("nerova;dur=912, proxy;dur=1034")
    assertEquals(912L, timing.nerovaMs)
    assertEquals(1_034L, timing.proxyMs)
  }

  @Test
  fun roundsFractionsIgnoresOrderCaseAndOtherEntries() {
    val timing = ServerTiming.parse("cache;desc=\"miss\", PROXY;dur=210.6, nerova;desc=x;dur=88.4")
    assertEquals(211L, timing.proxyMs)
    assertEquals(88L, timing.nerovaMs)
  }

  @Test
  fun missingEntriesAreNullNotZero() {
    assertEquals(ServerTiming(210L, null), ServerTiming.parse("proxy;dur=210"))
    assertEquals(ServerTiming.NONE, ServerTiming.parse(null))
    assertEquals(ServerTiming.NONE, ServerTiming.parse(""))
    assertEquals(ServerTiming.NONE, ServerTiming.parse("garbage, ;;, proxy;dur=abc"))
    assertNull(ServerTiming.parse("nerova").nerovaMs)
  }
}

class UploadSegmentTimingTest {
  private var now = 5_000L
  private val logged = ArrayList<Pair<String, Long>>()
  private val recorder = TimingRecorder({ now }) { k, v -> logged.add(k to v) }

  @Test
  fun splitsTheWaitAfterTheClipIntoEncodeUploadProxyAndNerova() {
    recorder.wake()
    now += 4_000
    recorder.clipEnded()
    now += 90
    recorder.encoded(15_800)
    now += 10
    recorder.uploadStarted(16_100)
    now += 1_600
    recorder.uploadFinished(ServerTiming(proxyMs = 1_300, nerovaMs = 900))
    assertEquals(90L, recorder.values["encodeMs"])
    assertEquals(15_800L, recorder.values["clipBytes"])
    assertEquals(100L, recorder.values["uploadStartMs"])
    assertEquals(16_100L, recorder.values["uploadBytes"])
    assertEquals(1_700L, recorder.values["responseMs"])
    assertEquals(1_600L, recorder.values["uploadMs"])
    assertEquals(1_300L, recorder.values["proxyMs"])
    assertEquals(900L, recorder.values["nerovaMs"])
    assertEquals(300L, recorder.values["networkMs"]) // round trip minus the proxy
    assertEquals(400L, recorder.values["proxyOverheadMs"]) // the proxy minus Nerova
  }

  @Test
  fun withoutServerTimingOnlyTheRoundTripIsKnown() {
    recorder.wake()
    recorder.clipEnded()
    recorder.uploadStarted(10)
    now += 700
    recorder.uploadFinished(ServerTiming.NONE)
    assertEquals(700L, recorder.values["uploadMs"])
    assertNull(recorder.values["proxyMs"])
    assertNull(recorder.values["networkMs"])
    assertNull(recorder.values["nerovaMs"])
  }

  @Test
  fun aNerovaTimeLargerThanTheProxyNeverGoesNegative() {
    recorder.wake()
    recorder.clipEnded()
    recorder.uploadStarted(10)
    now += 100
    recorder.uploadFinished(ServerTiming(proxyMs = 50, nerovaMs = 80))
    assertEquals(0L, recorder.values["proxyOverheadMs"])
    assertEquals(50L, recorder.values["networkMs"])
  }

  @Test
  fun wakeClearsTheUploadSegmentsOfTheLastInteraction() {
    recorder.wake()
    recorder.clipEnded()
    recorder.encoded(1)
    recorder.wake()
    now += 5
    recorder.encoded(1)
    assertEquals(-1L, recorder.values["encodeMs"])
  }

  @Test
  fun externalTimingsAreKeptAndLogged() {
    recorder.wake()
    recorder.external("todayMs", 140)
    assertEquals(140L, recorder.values["todayMs"])
    assertTrue(logged.contains("todayMs" to 140L))
  }
}
