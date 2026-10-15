package expo.modules.clovievoice

import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import java.io.File

/**
 * Build-time settings the config plugin writes into the manifest as
 * `<meta-data>`, so the app can ship a different classifier without code changes.
 */
data class VoiceConfig(
  /** Classifier ONNX: an asset path (e.g. `wakeword/hey_clovie.onnx`) or an absolute file path. */
  val classifier: String,
  /** What the owner says, for the UI. */
  val wakePhrase: String,
  /** URL scheme of the app's deep links (`bookingadmin`). */
  val scheme: String,
) {
  /** All three models must be present, or the feature reports "not configured". */
  fun isComplete(context: Context): Boolean = modelsPresent(context, classifier)

  companion object {
    const val MEL_ASSET = "wakeword/melspectrogram.onnx"
    const val EMBEDDING_ASSET = "wakeword/embedding_model.onnx"
    const val DEFAULT_CLASSIFIER = "wakeword/hey_livekit.onnx"
    private const val PREFIX = "si.nerova.clovie.voice."

    fun read(context: Context): VoiceConfig {
      val meta = try {
        val pm = context.packageManager
        if (Build.VERSION.SDK_INT >= 33) {
          pm.getApplicationInfo(
            context.packageName,
            PackageManager.ApplicationInfoFlags.of(PackageManager.GET_META_DATA.toLong()),
          ).metaData
        } else {
          @Suppress("DEPRECATION")
          pm.getApplicationInfo(context.packageName, PackageManager.GET_META_DATA).metaData
        }
      } catch (_: PackageManager.NameNotFoundException) {
        null
      }
      fun value(key: String, fallback: String) =
        meta?.get(PREFIX + key)?.toString()?.takeIf { it.isNotBlank() } ?: fallback
      return VoiceConfig(
        classifier = value("CLASSIFIER", DEFAULT_CLASSIFIER),
        wakePhrase = value("WAKE_PHRASE", "Hey LiveKit"),
        scheme = value("DEEP_LINK_SCHEME", "bookingadmin"),
      )
    }

    fun modelsPresent(context: Context, classifier: String): Boolean =
      listOf(MEL_ASSET, EMBEDDING_ASSET).all { assetExists(context, it) } &&
        classifierExists(context, classifier)

    fun assetExists(context: Context, path: String): Boolean =
      try {
        context.assets.open(path).close()
        true
      } catch (_: java.io.IOException) {
        false
      }

    fun classifierExists(context: Context, spec: String): Boolean =
      if (File(spec).isAbsolute) File(spec).canRead() else assetExists(context, spec)

    /** Reads a model from an absolute file path or from the app's assets. */
    fun readModel(context: Context, spec: String): ByteArray =
      if (File(spec).isAbsolute) File(spec).readBytes()
      else context.assets.open(spec).use { it.readBytes() }
  }
}
