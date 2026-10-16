package expo.modules.clovievoice

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** Where the device voice token and the API base URL live: a few strings. A seam so the logic is unit tested. */
interface KeyValueStore {
  fun get(key: String): String?

  fun put(key: String, value: String)

  fun remove(key: String)
}

/** Encrypts a value at rest. Returns null when the platform cannot (then [VoiceTokenStore] stores it in the private prefs as is). */
interface ValueCipher {
  fun encrypt(plain: String): String?

  fun decrypt(encrypted: String): String?
}

/** What the service needs to upload a clip on its own. */
data class VoiceCredentials(val token: String, val apiUrl: String)

enum class VoiceTokenState(val wire: String) {
  /** No usable token (never set, cleared, or unreadable after a keystore reset). */
  NONE("none"),
  OK("ok"),

  /** The server answered 401: the app must mint a new token the next time it is on screen. */
  REJECTED("rejected"),
}

/**
 * The scoped `cvt_` device voice token the app hands over so the service can upload a clip and the
 * app's JS can use it with no Clerk session (see the backend `voice_device_tokens`). Stored encrypted
 * with an Android Keystore AES-GCM key when the keystore works, else in the app's private
 * SharedPreferences (not readable by other apps). The token is never logged.
 */
class VoiceTokenStore(private val kv: KeyValueStore, private val cipher: ValueCipher) {
  fun save(token: String, apiUrl: String): Boolean {
    val url = normalizeApiUrl(apiUrl)
    if (!token.startsWith(TOKEN_PREFIX) || url == null) return false
    kv.put(K_TOKEN, cipher.encrypt(token)?.let { ENCRYPTED + it } ?: (PLAIN + token))
    kv.put(K_API_URL, url)
    kv.remove(K_REJECTED)
    return true
  }

  fun read(): VoiceCredentials? {
    val stored = kv.get(K_TOKEN) ?: return null
    val url = kv.get(K_API_URL) ?: return null
    val token = when {
      stored.startsWith(ENCRYPTED) -> cipher.decrypt(stored.removePrefix(ENCRYPTED))
      stored.startsWith(PLAIN) -> stored.removePrefix(PLAIN)
      else -> null
    } ?: return null
    return VoiceCredentials(token, url)
  }

  fun state(): VoiceTokenState = when {
    read() == null -> VoiceTokenState.NONE
    kv.get(K_REJECTED) != null -> VoiceTokenState.REJECTED
    else -> VoiceTokenState.OK
  }

  /** The server refused the token (401). Kept, flagged, so the app knows to replace it. */
  fun markRejected() {
    if (read() != null) kv.put(K_REJECTED, "1")
  }

  fun clear() {
    kv.remove(K_TOKEN)
    kv.remove(K_API_URL)
    kv.remove(K_REJECTED)
  }

  companion object {
    const val TOKEN_PREFIX = "cvt_"
    private const val K_TOKEN = "token"
    private const val K_API_URL = "api_url"
    private const val K_REJECTED = "rejected"
    private const val ENCRYPTED = "e:"
    private const val PLAIN = "p:"

    /** http(s) origin plus path without a trailing slash; null when it is not a URL. */
    fun normalizeApiUrl(url: String): String? {
      val trimmed = url.trim().trimEnd('/')
      return if (Regex("^https?://[^/?#\\s]+(/[^?#\\s]*)?$", RegexOption.IGNORE_CASE).matches(trimmed)) trimmed else null
    }

    fun forContext(context: Context): VoiceTokenStore =
      VoiceTokenStore(PrefsKeyValueStore(context.applicationContext), KeystoreCipher())
  }
}

private class PrefsKeyValueStore(context: Context) : KeyValueStore {
  private val prefs = context.getSharedPreferences("clovie_voice_device_token", Context.MODE_PRIVATE)

  override fun get(key: String): String? = prefs.getString(key, null)

  override fun put(key: String, value: String) {
    prefs.edit().putString(key, value).apply()
  }

  override fun remove(key: String) {
    prefs.edit().remove(key).apply()
  }
}

/** AES-256-GCM with a key that never leaves the Android Keystore. Any failure answers null. */
private class KeystoreCipher : ValueCipher {
  override fun encrypt(plain: String): String? = try {
    val cipher = Cipher.getInstance(TRANSFORMATION)
    cipher.init(Cipher.ENCRYPT_MODE, key())
    val sealed = cipher.iv + cipher.doFinal(plain.toByteArray(Charsets.UTF_8))
    Base64.encodeToString(sealed, Base64.NO_WRAP)
  } catch (_: Exception) {
    null
  }

  override fun decrypt(encrypted: String): String? = try {
    val raw = Base64.decode(encrypted, Base64.NO_WRAP)
    val cipher = Cipher.getInstance(TRANSFORMATION)
    cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(TAG_BITS, raw, 0, IV_BYTES))
    String(cipher.doFinal(raw, IV_BYTES, raw.size - IV_BYTES), Charsets.UTF_8)
  } catch (_: Exception) {
    null
  }

  private fun key(): SecretKey {
    val store = KeyStore.getInstance(PROVIDER).apply { load(null) }
    (store.getKey(ALIAS, null) as? SecretKey)?.let { return it }
    val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, PROVIDER)
    generator.init(
      KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
        .setKeySize(256)
        .build(),
    )
    return generator.generateKey()
  }

  private companion object {
    const val PROVIDER = "AndroidKeyStore"
    const val ALIAS = "clovie_voice_device_token_key"
    const val TRANSFORMATION = "AES/GCM/NoPadding"
    const val IV_BYTES = 12
    const val TAG_BITS = 128
  }
}
