package expo.modules.clovievoice

import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaFormat
import android.media.MediaMuxer
import android.os.SystemClock
import java.io.File
import java.io.IOException
import java.nio.ByteOrder

/**
 * Encodes PCM16 mono to AAC-LC in an MPEG-4 (m4a) file with the platform `MediaCodec` and `MediaMuxer`: no
 * dependency, no audio focus, no speaker. It streams: [begin] when the clip starts, [append] for each chunk of PCM
 * as it is recorded, [finish] at the end (only the end-of-stream flush is left then). [abort] releases the codec
 * and the muxer and deletes the file; it is safe to call at any time, also twice. Every failure releases
 * everything and surfaces as [IOException] so the caller can fall back to a WAV. One thread at a time.
 * The format maths is in [AudioFormats], which has the unit tests.
 */
class ClipEncoder(private val sampleRate: Int = AudioFormats.SAMPLE_RATE, private val bitRate: Int = AudioFormats.AAC_BIT_RATE) {
  private var codec: MediaCodec? = null
  private var muxer: MediaMuxer? = null
  private var file: File? = null
  private val info = MediaCodec.BufferInfo()
  private var track = -1
  private var isMuxerStarted = false
  private var isOutputDone = false
  private var fed = 0L

  /** One-shot encode of a whole clip: the file is deleted on failure. Returns its size in bytes. */
  @Throws(IOException::class)
  fun encode(samples: ShortArray, count: Int, file: File): Long {
    begin(file)
    append(samples, 0, count)
    return finish()
  }

  @Throws(IOException::class)
  fun begin(file: File) {
    this.file = file
    guarded {
      val format = MediaFormat.createAudioFormat(AudioFormats.AAC_MIME, sampleRate, 1).apply {
        setInteger(MediaFormat.KEY_AAC_PROFILE, MediaCodecInfo.CodecProfileLevel.AACObjectLC)
        setInteger(MediaFormat.KEY_BIT_RATE, bitRate)
        setInteger(MediaFormat.KEY_MAX_INPUT_SIZE, INPUT_BYTES)
      }
      val created = MediaCodec.createEncoderByType(AudioFormats.AAC_MIME)
      codec = created
      created.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
      created.start()
      muxer = MediaMuxer(file.absolutePath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
    }
  }

  /** Queues `count` samples from `offset`. Never idles while an input buffer is free or output is ready. */
  @Throws(IOException::class)
  fun append(samples: ShortArray, offset: Int, count: Int) = guarded {
    val encoder = codec ?: throw IOException("Encoder not started")
    val deadline = SystemClock.elapsedRealtime() + TIMEOUT_MS
    var pos = offset
    val end = offset + count
    while (pos < end) {
      if (SystemClock.elapsedRealtime() > deadline) throw IOException("AAC encode timed out")
      val hasProgress = drain(encoder, 0)
      val index = encoder.dequeueInputBuffer(if (hasProgress) 0 else IDLE_US)
      if (index < 0) continue
      val buffer = encoder.getInputBuffer(index) ?: throw IOException("No encoder input buffer")
      buffer.clear()
      val n = AudioFormats.chunkSamples(end - pos, buffer.capacity())
      buffer.order(ByteOrder.LITTLE_ENDIAN).asShortBuffer().put(samples, pos, n)
      encoder.queueInputBuffer(index, 0, n * 2, AudioFormats.ptsUs(fed, sampleRate), 0)
      fed += n
      pos += n
    }
    drain(encoder, 0)
  }

  /** Sends end-of-stream, drains the rest, closes the file and returns its size. Releases everything. */
  @Throws(IOException::class)
  fun finish(): Long {
    guarded {
      val encoder = codec ?: throw IOException("Encoder not started")
      val deadline = SystemClock.elapsedRealtime() + TIMEOUT_MS
      var isQueued = false
      while (!isQueued) {
        if (SystemClock.elapsedRealtime() > deadline) throw IOException("AAC encode timed out")
        val hasProgress = drain(encoder, 0)
        val index = encoder.dequeueInputBuffer(if (hasProgress) 0 else IDLE_US)
        if (index >= 0) {
          encoder.queueInputBuffer(index, 0, 0, AudioFormats.ptsUs(fed, sampleRate), MediaCodec.BUFFER_FLAG_END_OF_STREAM)
          isQueued = true
        }
      }
      while (!isOutputDone) {
        if (SystemClock.elapsedRealtime() > deadline) throw IOException("AAC encode timed out")
        drain(encoder, IDLE_US)
      }
      if (!isMuxerStarted) throw IOException("Nothing was encoded")
    }
    release()
    return file?.length() ?: 0L
  }

  /** Releases the codec and muxer and deletes the file. Idempotent. */
  fun abort() {
    release()
    file?.delete()
  }

  /** Runs `block`; any failure releases everything, deletes the file and is reported as [IOException]. */
  private inline fun guarded(block: () -> Unit) {
    try {
      block()
    } catch (e: RuntimeException) {
      // IllegalStateException, MediaCodec.CodecException, IllegalArgumentException from a device-specific encoder.
      abort()
      throw IOException("AAC encode failed", e)
    } catch (e: IOException) {
      abort()
      throw e
    }
  }

  /** Writes every ready output; blocks at most `firstWaitUs` for the first one. True when anything happened. */
  private fun drain(encoder: MediaCodec, firstWaitUs: Long): Boolean {
    var hasProgress = false
    var wait = firstWaitUs
    while (!isOutputDone) {
      val index = encoder.dequeueOutputBuffer(info, wait)
      wait = 0
      if (index == MediaCodec.INFO_TRY_AGAIN_LATER) break
      hasProgress = true
      if (index == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
        val out = muxer ?: throw IOException("No muxer")
        track = out.addTrack(encoder.outputFormat)
        out.start()
        isMuxerStarted = true
      } else if (index >= 0) {
        writeOutput(encoder, index)
      }
    }
    return hasProgress
  }

  private fun writeOutput(encoder: MediaCodec, index: Int) {
    val out = encoder.getOutputBuffer(index)
    if (info.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG != 0) info.size = 0 // the muxer writes it from the format
    if (info.size > 0 && out != null) {
      if (!isMuxerStarted) throw IOException("AAC output before its format")
      out.position(info.offset)
      out.limit(info.offset + info.size)
      muxer?.writeSampleData(track, out, info)
    }
    encoder.releaseOutputBuffer(index, false)
    isOutputDone = info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0
  }

  private fun release() {
    val c = codec
    val m = muxer
    codec = null
    muxer = null
    try {
      c?.stop()
    } catch (_: RuntimeException) {
      // Never started or already failed.
    }
    try {
      c?.release()
    } catch (_: RuntimeException) {
      // Already gone.
    }
    try {
      if (isMuxerStarted) m?.stop()
    } catch (_: RuntimeException) {
      // No samples were written.
    }
    try {
      m?.release()
    } catch (_: RuntimeException) {
      // Already gone.
    }
    isMuxerStarted = false
  }

  private companion object {
    const val INPUT_BYTES = 16 * 1024

    /** Only used when an iteration made no progress at all. */
    const val IDLE_US = 2_000L
    const val TIMEOUT_MS = 5_000L
  }
}
