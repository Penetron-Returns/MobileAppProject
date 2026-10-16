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
 * Encodes a PCM16 mono clip to AAC-LC in an MPEG-4 (m4a) file with the platform `MediaCodec` and
 * `MediaMuxer`: no dependency, no audio focus, no speaker. Blocking (about the clip's length in the worst
 * case, typically well under it): call it off the main thread. Throws [IOException] on any failure so the
 * caller can fall back to a WAV. The format maths is in [AudioFormats], which has the unit tests.
 */
class ClipEncoder(private val sampleRate: Int = AudioFormats.SAMPLE_RATE, private val bitRate: Int = AudioFormats.AAC_BIT_RATE) {

  /** Writes `count` samples to `file` as m4a and returns its size in bytes. The file is deleted on failure. */
  @Throws(IOException::class)
  fun encode(samples: ShortArray, count: Int, file: File): Long {
    try {
      run(samples, count, file)
    } catch (e: RuntimeException) {
      // IllegalStateException, MediaCodec.CodecException, IllegalArgumentException from a device-specific encoder.
      file.delete()
      throw IOException("AAC encode failed", e)
    } catch (e: IOException) {
      file.delete()
      throw e
    }
    return file.length()
  }

  private fun run(samples: ShortArray, count: Int, file: File) {
    var codec: MediaCodec? = null
    var muxer: MediaMuxer? = null
    var isMuxerStarted = false
    try {
      val format = MediaFormat.createAudioFormat(AudioFormats.AAC_MIME, sampleRate, 1).apply {
        setInteger(MediaFormat.KEY_AAC_PROFILE, MediaCodecInfo.CodecProfileLevel.AACObjectLC)
        setInteger(MediaFormat.KEY_BIT_RATE, bitRate)
        setInteger(MediaFormat.KEY_MAX_INPUT_SIZE, INPUT_BYTES)
      }
      codec = MediaCodec.createEncoderByType(AudioFormats.AAC_MIME)
      codec.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
      codec.start()
      muxer = MediaMuxer(file.absolutePath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)

      val info = MediaCodec.BufferInfo()
      val deadline = SystemClock.elapsedRealtime() + TIMEOUT_MS
      var fed = 0
      var isInputDone = false
      var isOutputDone = false
      var track = -1
      while (!isOutputDone) {
        if (SystemClock.elapsedRealtime() > deadline) throw IOException("AAC encode timed out")
        if (!isInputDone) isInputDone = feed(codec, samples, count, fed).also { fed += it.fedSamples }.isDone
        val index = codec.dequeueOutputBuffer(info, POLL_US)
        when {
          index == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> {
            track = muxer.addTrack(codec.outputFormat)
            muxer.start()
            isMuxerStarted = true
          }
          index >= 0 -> {
            val out = codec.getOutputBuffer(index)
            if (info.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG != 0) info.size = 0 // the muxer writes it from the format
            if (info.size > 0 && out != null) {
              if (!isMuxerStarted) throw IOException("AAC output before its format")
              out.position(info.offset)
              out.limit(info.offset + info.size)
              muxer.writeSampleData(track, out, info)
            }
            codec.releaseOutputBuffer(index, false)
            isOutputDone = info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0
          }
        }
      }
      if (!isMuxerStarted) throw IOException("Nothing was encoded")
    } finally {
      try {
        codec?.stop()
      } catch (_: RuntimeException) {
        // Never started or already failed.
      }
      codec?.release()
      try {
        if (isMuxerStarted) muxer?.stop()
      } catch (_: RuntimeException) {
        // No samples were written.
      }
      muxer?.release()
    }
  }

  private class Fed(val fedSamples: Int, val isDone: Boolean)

  /** Queues the next chunk of PCM (or the end-of-stream marker once all of it is queued), if an input buffer is free. */
  private fun feed(codec: MediaCodec, samples: ShortArray, count: Int, fed: Int): Fed {
    val index = codec.dequeueInputBuffer(POLL_US)
    if (index < 0) return Fed(0, false)
    val buffer = codec.getInputBuffer(index) ?: throw IOException("No encoder input buffer")
    buffer.clear()
    val n = AudioFormats.chunkSamples(count - fed, buffer.capacity())
    val pts = AudioFormats.ptsUs(fed.toLong(), sampleRate)
    if (n == 0) {
      codec.queueInputBuffer(index, 0, 0, pts, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
      return Fed(0, true)
    }
    buffer.order(ByteOrder.LITTLE_ENDIAN).asShortBuffer().put(samples, fed, n)
    codec.queueInputBuffer(index, 0, n * 2, pts, 0)
    return Fed(n, false)
  }

  private companion object {
    const val INPUT_BYTES = 16 * 1024
    const val POLL_US = 10_000L
    const val TIMEOUT_MS = 5_000L
  }
}
