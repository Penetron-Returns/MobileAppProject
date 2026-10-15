package expo.modules.clovievoice

import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.os.Handler
import android.os.Looper
import android.os.SystemClock

/**
 * Captures the microphone and runs the wake-word engine over a rolling 2 s window,
 * like the Swift SDK's `WakeWordListener`: 16 kHz mono PCM16 into a ring buffer, a
 * prediction every other 80 ms read (~160 ms), and the gate's threshold and cooldown.
 *
 * On a detection the recorder is released before `onWake` runs (on the main thread),
 * because the speech recogniser needs the microphone next. Call `stop()` from any thread.
 */
class WakeWordListener(
  private val engine: WakeWordEngine,
  private val gate: WakeWordGate,
  private val onWake: () -> Unit,
  private val onError: (String) -> Unit,
) {
  private val main = Handler(Looper.getMainLooper())

  @Volatile
  private var running = false
  private var thread: Thread? = null

  fun start() {
    if (running) return
    running = true
    thread = Thread(::loop, "clovie-wakeword").also { it.start() }
  }

  fun stop() {
    running = false
    val t = thread ?: return
    thread = null
    if (t !== Thread.currentThread()) t.join(JOIN_TIMEOUT_MS)
  }

  private fun loop() {
    val recorder = createRecorder() ?: run {
      running = false
      main.post { onError(VoiceError.AUDIO_FAILED) }
      return
    }
    val ring = ShortArray(RING_SAMPLES)
    val chunk = ShortArray(HOP_SAMPLES)
    var write = 0
    var filled = 0
    var reads = 0
    var failures = 0
    var detected = false
    var failed: String? = null
    try {
      recorder.startRecording()
      while (running) {
        val n = recorder.read(chunk, 0, HOP_SAMPLES)
        if (n < 0) {
          failed = VoiceError.AUDIO_FAILED
          break
        }
        for (i in 0 until n) {
          ring[write] = chunk[i]
          write = (write + 1) % RING_SAMPLES
        }
        filled = minOf(filled + n, RING_SAMPLES)
        reads++
        if (filled < RING_SAMPLES || reads % READS_PER_PREDICTION != 0) continue

        try {
          val score = engine.score(chronological(ring, write))
          failures = 0
          if (gate.accept(score, SystemClock.elapsedRealtime())) {
            detected = true
            break
          }
        } catch (_: Exception) {
          // Like the reference listener, ride out a bad chunk, but not a broken model.
          if (++failures >= MAX_CONSECUTIVE_FAILURES) {
            failed = VoiceError.INFERENCE_FAILED
            break
          }
        }
      }
    } catch (_: Exception) {
      failed = VoiceError.AUDIO_FAILED
    } finally {
      try {
        recorder.stop()
      } catch (_: IllegalStateException) {
        // Never started.
      }
      recorder.release()
    }
    val wasRunning = running
    running = false
    val reason = failed
    when {
      reason != null -> main.post { onError(reason) }
      detected && wasRunning -> main.post { onWake() }
    }
  }

  private fun createRecorder(): AudioRecord? {
    val minBuffer = AudioRecord.getMinBufferSize(
      WakeWordEngine.SAMPLE_RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT,
    )
    if (minBuffer <= 0) return null
    val bytes = maxOf(minBuffer, HOP_SAMPLES * 2 * 4)
    return try {
      AudioRecord(
        MediaRecorder.AudioSource.VOICE_RECOGNITION,
        WakeWordEngine.SAMPLE_RATE,
        AudioFormat.CHANNEL_IN_MONO,
        AudioFormat.ENCODING_PCM_16BIT,
        bytes,
      ).takeIf { it.state == AudioRecord.STATE_INITIALIZED }
    } catch (_: SecurityException) {
      null // RECORD_AUDIO was revoked
    }
  }

  /** The ring buffer oldest-first: `write` is where the next sample goes, so also the oldest. */
  private fun chronological(ring: ShortArray, write: Int): ShortArray {
    val out = ShortArray(ring.size)
    val tail = ring.size - write
    System.arraycopy(ring, write, out, 0, tail)
    System.arraycopy(ring, 0, out, tail, write)
    return out
  }

  private companion object {
    const val RING_SAMPLES = WakeWordEngine.SAMPLE_RATE * 2 // 2 s window
    const val HOP_SAMPLES = WakeWordEngine.SAMPLE_RATE / 100 * 8 // 80 ms
    const val READS_PER_PREDICTION = 2
    const val MAX_CONSECUTIVE_FAILURES = 20
    const val JOIN_TIMEOUT_MS = 1_000L
  }
}
