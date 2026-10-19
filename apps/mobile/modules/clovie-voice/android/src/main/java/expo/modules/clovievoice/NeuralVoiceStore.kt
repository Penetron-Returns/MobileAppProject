package expo.modules.clovievoice

import android.content.Context
import android.util.Log
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import org.apache.commons.compress.archivers.tar.TarArchiveInputStream
import org.apache.commons.compress.compressors.bzip2.BZip2CompressorInputStream

/** A snapshot of the model download: `progress` is 0..1. */
data class NeuralVoiceStatus(val state: NeuralVoiceState, val progress: Double)

/**
 * Owns the Kokoro model on disk: downloads the pinned archive on first use (resumable, retried), checks its
 * SHA-256, unpacks it beside the final folder and renames it into place, so a half-finished download or a killed
 * process never leaves a model that looks complete. Nothing here logs a URL's query or any message text.
 */
object NeuralVoiceStore {
  private const val TAG = "ClovieVoice"
  private const val ROOT = "neural-voice"
  private const val ARCHIVE_PART = "model.tar.bz2.part"
  private const val EXTRACT_DIR = "extracting"
  private const val MAX_ATTEMPTS = 4
  private const val CONNECT_TIMEOUT_MS = 15_000
  private const val READ_TIMEOUT_MS = 30_000
  private const val PROGRESS_STEP = 0.01

  private val lock = Any()
  @Volatile private var status = NeuralVoiceStatus(NeuralVoiceState.ABSENT, 0.0)
  @Volatile private var worker: Thread? = null
  private var listener: ((NeuralVoiceStatus) -> Unit)? = null

  /** Where the extracted model lives once ready. */
  fun modelDir(context: Context): File = File(File(context.filesDir, ROOT), NeuralVoiceModel.DIR_NAME)

  fun isReady(context: Context): Boolean {
    val dir = modelDir(context)
    val present = dir.list()?.toSet().orEmpty()
    return NeuralVoicePolicy.isComplete(present)
  }

  fun setListener(onChange: ((NeuralVoiceStatus) -> Unit)?) {
    listener = onChange
  }

  fun status(context: Context): NeuralVoiceStatus {
    if (status.state == NeuralVoiceState.DOWNLOADING) return status
    if (isReady(context)) return NeuralVoiceStatus(NeuralVoiceState.READY, 1.0)
    return status.takeIf { it.state == NeuralVoiceState.FAILED } ?: NeuralVoiceStatus(NeuralVoiceState.ABSENT, 0.0)
  }

  /** Starts the download unless the model is ready or already downloading. Returns at once. */
  fun prepare(context: Context) {
    val app = context.applicationContext
    synchronized(lock) {
      if (isReady(app) || worker?.isAlive == true) return
      publish(NeuralVoiceStatus(NeuralVoiceState.DOWNLOADING, 0.0))
      worker = Thread({ run(app) }, "clovie-neural-download").also { it.isDaemon = true; it.start() }
    }
  }

  private fun run(context: Context) {
    try {
      val root = File(context.filesDir, ROOT).apply { mkdirs() }
      val archive = File(root, ARCHIVE_PART)
      downloadWithRetry(archive)
      if (!NeuralVoicePolicy.isChecksumMatch(sha256(archive), NeuralVoiceModel.SHA256)) {
        archive.delete()
        throw IOException("checksum mismatch")
      }
      install(root, archive, modelDir(context))
      archive.delete()
      publish(NeuralVoiceStatus(NeuralVoiceState.READY, 1.0))
      Log.i(TAG, "neural voice ready")
    } catch (e: Exception) {
      Log.w(TAG, "neural voice download failed: ${e.javaClass.simpleName}")
      publish(NeuralVoiceStatus(NeuralVoiceState.FAILED, status.progress))
    }
  }

  private fun downloadWithRetry(file: File) {
    var last: Exception? = null
    repeat(MAX_ATTEMPTS) { attempt ->
      try {
        download(file)
        return
      } catch (e: IOException) {
        last = e
        Thread.sleep(1_000L shl attempt) // 1s, 2s, 4s, 8s; the partial file is kept, so a retry resumes
      }
    }
    throw last ?: IOException("download failed")
  }

  private fun download(file: File) {
    val total = NeuralVoiceModel.ARCHIVE_BYTES
    var offset = NeuralVoicePolicy.resumeOffset(if (file.exists()) file.length() else 0L, total)
    if (offset == 0L) file.delete()
    if (file.exists() && file.length() == total) return // already complete: only the checksum is left
    val connection = URL(NeuralVoiceModel.URL).openConnection() as HttpURLConnection
    try {
      connection.connectTimeout = CONNECT_TIMEOUT_MS
      connection.readTimeout = READ_TIMEOUT_MS
      if (offset > 0) connection.setRequestProperty("Range", "bytes=$offset-")
      val code = connection.responseCode
      if (code != 200 && code != 206) throw IOException("http $code")
      if (!NeuralVoicePolicy.isResumeAccepted(code, offset)) offset = 0L // the server ignored Range: start over
      var written = offset
      var lastPublished = NeuralVoicePolicy.progress(written, total)
      FileOutputStream(file, offset > 0).use { out ->
        connection.inputStream.use { input ->
          val buffer = ByteArray(64 * 1024)
          while (true) {
            val n = input.read(buffer)
            if (n < 0) break
            out.write(buffer, 0, n)
            written += n
            val progress = NeuralVoicePolicy.progress(written, total)
            if (progress - lastPublished >= PROGRESS_STEP) {
              lastPublished = progress
              publish(NeuralVoiceStatus(NeuralVoiceState.DOWNLOADING, progress))
            }
          }
        }
      }
      if (written < total) throw IOException("truncated") // retried; the next attempt resumes
    } finally {
      connection.disconnect()
    }
  }

  private fun sha256(file: File): String {
    val digest = MessageDigest.getInstance("SHA-256")
    file.inputStream().use { input ->
      val buffer = ByteArray(64 * 1024)
      while (true) {
        val n = input.read(buffer)
        if (n < 0) break
        digest.update(buffer, 0, n)
      }
    }
    return digest.digest().joinToString("") { "%02x".format(it) }
  }

  /** Unpacks into a scratch folder, then renames it into place in one step. */
  private fun install(root: File, archive: File, finalDir: File) {
    val scratch = File(root, EXTRACT_DIR)
    scratch.deleteRecursively()
    scratch.mkdirs()
    archive.inputStream().buffered().use { raw ->
      TarArchiveInputStream(BZip2CompressorInputStream(raw)).use { tar -> extract(tar, scratch) }
    }
    val extracted = File(scratch, NeuralVoiceModel.DIR_NAME)
    if (!NeuralVoicePolicy.isComplete(extracted.list()?.toSet().orEmpty())) throw IOException("incomplete archive")
    finalDir.deleteRecursively()
    if (!extracted.renameTo(finalDir)) throw IOException("rename failed")
    scratch.deleteRecursively()
  }

  private fun extract(tar: TarArchiveInputStream, into: File) {
    val base = into.canonicalPath + File.separator
    while (true) {
      val entry = tar.nextEntry ?: break
      if (!NeuralVoicePolicy.isSafeEntryName(entry.name)) throw IOException("unsafe entry")
      val target = File(into, entry.name)
      if (!target.canonicalPath.startsWith(base)) throw IOException("unsafe entry")
      if (entry.isDirectory) {
        target.mkdirs()
      } else if (entry.isFile) {
        target.parentFile?.mkdirs()
        FileOutputStream(target).use { tar.copyTo(it) }
      }
    }
  }

  private fun publish(next: NeuralVoiceStatus) {
    status = next
    listener?.invoke(next)
  }
}
