package expo.modules.clovievoice

import android.content.Context
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.util.Log
import java.io.File

/** The end of one clip capture. */
sealed interface ClipResult {
  data class Captured(val file: File, val ms: Long, val speechMs: Long, val peakRms: Float, val bytes: Long) : ClipResult

  /** Nothing said within the no-speech timeout. */
  data object NoSpeech : ClipResult

  /** The microphone could not be opened or failed mid-recording. */
  data object Failed : ClipResult
}

/**
 * Records one spoken command with our own `AudioRecord` (16 kHz mono PCM16, VOICE_RECOGNITION, the
 * source the wake word uses and is known to hear the owner) and ends it with [ClipVad]. Writes an m4a (WAV as a fallback)
 * into the cache directory. The wake listener has just released the microphone, so opening it is
 * retried briefly. Logs levels and timings only, never audio or text. `onDone` runs once on the main
 * thread unless `cancel()` was called.
 *
 * The 2 s ring buffer of the wake listener is not prepended: the recorder is reopened a few tens of
 * ms after "Hey Clovie" ends, so the command's first word is not lost in practice.
 */
class ClipCapture(
  private val context: Context,
  /** How long without speech ends the capture; a follow-up (no wake word) allows longer. */
  private val noSpeechMs: Long = ClipVad.NO_SPEECH_MS,
  private val onLevel: (Float) -> Unit,
) {
  private val main = Handler(Looper.getMainLooper())

  @Volatile
  private var isCancelled = false

  fun start(onDone: (ClipResult) -> Unit) {
    isCancelled = false
    Thread({
      val result = record()
      main.post {
        if (isCancelled) (result as? ClipResult.Captured)?.file?.delete() else onDone(result)
      }
    }, "clovie-clip").start()
  }

  /** Stops recording; any partial file is dropped. */
  fun cancel() {
    isCancelled = true
  }

  private fun record(): ClipResult {
    val stamp = System.currentTimeMillis()
    val m4a = File(context.cacheDir, "clovie-clip-$stamp.${AudioFormats.M4A.extension}")
    val session = EncoderSession(m4a)
    try {
      return capture(session, stamp)
    } finally {
      // Cancel, no speech, mic failure or any throw: never leave a codec, muxer or stray file behind.
      session.abortUnlessFinished()
    }
  }

  /** The streamed encoder of one capture; goes null (released) the moment it fails, and the WAV fallback takes over. */
  private class EncoderSession(val file: File) {
    var encoder: ClipEncoder? = null
    var isFinished = false

    fun begin() {
      val next = ClipEncoder()
      encoder = try {
        next.begin(file)
        next
      } catch (e: java.io.IOException) {
        Log.w(TAG, "clip encoder not started (${e.javaClass.simpleName}): will send WAV")
        null
      }
    }

    fun feed(frame: ShortArray, count: Int) {
      val current = encoder ?: return
      try {
        current.append(frame, 0, count)
      } catch (e: java.io.IOException) {
        Log.w(TAG, "clip encoder failed mid-capture (${e.javaClass.simpleName}): will send WAV")
        encoder = null
      }
    }

    /** The m4a size once the end-of-stream flush is done, or null when the encoder is gone or fails now. */
    fun finish(): Long? {
      val current = encoder ?: return null
      return try {
        current.finish().also { isFinished = true }
      } catch (e: java.io.IOException) {
        Log.w(TAG, "clip m4a encode failed (${e.javaClass.simpleName}): sending WAV")
        encoder = null
        null
      }
    }

    fun abortUnlessFinished() {
      if (!isFinished) encoder?.abort()
      encoder = null
    }
  }

  private fun capture(session: EncoderSession, stamp: Long): ClipResult {
    val recorder = open() ?: return ClipResult.Failed
    val vad = ClipVad(noSpeechMs = noSpeechMs)
    val samples = ShortArray(MAX_SAMPLES)
    val frame = ShortArray(FRAME_SAMPLES)
    var count = 0
    var decision = ClipDecision.CONTINUE
    val startedAt = SystemClock.elapsedRealtime()
    session.begin()
    try {
      recorder.startRecording()
      while (!isCancelled && decision == ClipDecision.CONTINUE) {
        val n = recorder.read(frame, 0, FRAME_SAMPLES)
        if (n < 0) return ClipResult.Failed
        val level = ClipVad.rms(frame, n)
        onLevel(ClipVad.meter(level))
        val take = minOf(n, MAX_SAMPLES - count)
        System.arraycopy(frame, 0, samples, count, take)
        count += take
        session.feed(frame, take)
        decision = vad.update(level, n * 1000L / SAMPLE_RATE)
      }
    } catch (_: RuntimeException) {
      return ClipResult.Failed
    } finally {
      try {
        recorder.stop()
      } catch (_: IllegalStateException) {
        // Never started.
      }
      recorder.release()
    }
    if (isCancelled) return ClipResult.Failed
    if (decision == ClipDecision.NO_SPEECH) {
      Log.i(TAG, "clip no speech ms=${vad.elapsedMs} peakRms=${"%.4f".format(java.util.Locale.US, vad.peakRms)}")
      return ClipResult.NoSpeech
    }
    VoiceTimings.clipEnded()
    val (file, bytes) = write(session, stamp, samples, count) ?: return ClipResult.Failed
    VoiceTimings.encoded(bytes) // only the end-of-stream flush (or the WAV fallback) is left after capture ends
    val ms = SystemClock.elapsedRealtime() - startedAt
    Log.i(TAG, "clip captured ms=$ms speechMs=${vad.speechMs} peakRms=${"%.4f".format(java.util.Locale.US, vad.peakRms)} bytes=$bytes")
    return ClipResult.Captured(file, ms, vad.speechMs, vad.peakRms, bytes)
  }

  /**
   * Finishes the streamed AAC in m4a (about an eighth of the WAV, so a much shorter upload), or writes a WAV from
   * the retained PCM when the encoder is missing or failed on this device. Null when even the WAV could not be written.
   */
  private fun write(session: EncoderSession, stamp: Long, samples: ShortArray, count: Int): Pair<File, Long>? {
    session.finish()?.let { return session.file to it }
    val wav = File(context.cacheDir, "clovie-clip-$stamp.${AudioFormats.WAV.extension}")
    return try {
      wav to WavFile.write(wav, samples, count)
    } catch (_: java.io.IOException) {
      wav.delete()
      null
    }
  }

  /** The wake recorder was released moments ago; the HAL can take a few tries to hand the mic over. */
  private fun open(): AudioRecord? {
    val minBuffer = AudioRecord.getMinBufferSize(SAMPLE_RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
    if (minBuffer <= 0) return null
    repeat(OPEN_TRIES) { attempt ->
      if (isCancelled) return null
      try {
        val recorder = AudioRecord(
          MediaRecorder.AudioSource.VOICE_RECOGNITION, SAMPLE_RATE, AudioFormat.CHANNEL_IN_MONO,
          AudioFormat.ENCODING_PCM_16BIT, maxOf(minBuffer, FRAME_SAMPLES * 2 * 4),
        )
        if (recorder.state == AudioRecord.STATE_INITIALIZED) return recorder
        Log.w(TAG, "clip recorder not initialised attempt=${attempt + 1} state=${recorder.state}")
        recorder.release()
      } catch (_: SecurityException) {
        return null
      }
      Thread.sleep(OPEN_RETRY_MS)
    }
    return null
  }

  private companion object {
    const val TAG = "ClovieVoice"
    const val SAMPLE_RATE = 16_000
    const val FRAME_SAMPLES = SAMPLE_RATE / 50 // 20 ms
    const val MAX_SAMPLES = SAMPLE_RATE * 10 + FRAME_SAMPLES
    const val OPEN_TRIES = 5
    const val OPEN_RETRY_MS = 80L
  }
}
