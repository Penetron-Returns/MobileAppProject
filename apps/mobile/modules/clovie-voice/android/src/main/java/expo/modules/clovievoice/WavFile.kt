package expo.modules.clovievoice

import java.io.File
import java.io.FileOutputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder

/** Canonical 44-byte-header PCM WAV, 16 kHz mono 16-bit unless told otherwise. */
object WavFile {
  const val HEADER_BYTES = 44

  fun header(dataBytes: Int, sampleRate: Int = 16_000, channels: Int = 1, bitsPerSample: Int = 16): ByteArray {
    val byteRate = sampleRate * channels * bitsPerSample / 8
    return ByteBuffer.allocate(HEADER_BYTES).order(ByteOrder.LITTLE_ENDIAN).apply {
      put("RIFF".toByteArray(Charsets.US_ASCII))
      putInt(36 + dataBytes)
      put("WAVE".toByteArray(Charsets.US_ASCII))
      put("fmt ".toByteArray(Charsets.US_ASCII))
      putInt(16) // PCM fmt chunk size
      putShort(1) // PCM
      putShort(channels.toShort())
      putInt(sampleRate)
      putInt(byteRate)
      putShort((channels * bitsPerSample / 8).toShort())
      putShort(bitsPerSample.toShort())
      put("data".toByteArray(Charsets.US_ASCII))
      putInt(dataBytes)
    }.array()
  }

  fun pcmBytes(samples: ShortArray, count: Int): ByteArray {
    val buffer = ByteBuffer.allocate(count * 2).order(ByteOrder.LITTLE_ENDIAN)
    for (i in 0 until count) buffer.putShort(samples[i])
    return buffer.array()
  }

  /** Writes `count` samples to `file` and returns the file size in bytes. */
  fun write(file: File, samples: ShortArray, count: Int): Long {
    val pcm = pcmBytes(samples, count)
    FileOutputStream(file).use {
      it.write(header(pcm.size))
      it.write(pcm)
    }
    return file.length()
  }
}
