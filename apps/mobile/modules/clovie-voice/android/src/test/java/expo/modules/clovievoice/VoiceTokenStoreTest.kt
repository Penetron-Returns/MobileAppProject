package expo.modules.clovievoice

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

private class MapStore : KeyValueStore {
  val map = mutableMapOf<String, String>()

  override fun get(key: String): String? = map[key]

  override fun put(key: String, value: String) {
    map[key] = value
  }

  override fun remove(key: String) {
    map.remove(key)
  }
}

/** Reversible stand-in for the keystore cipher; `null` models a device whose keystore is unusable. */
private class FakeCipher(var available: Boolean = true) : ValueCipher {
  override fun encrypt(plain: String): String? = if (available) plain.reversed() + "#sealed" else null

  override fun decrypt(encrypted: String): String? =
    if (available && encrypted.endsWith("#sealed")) encrypted.removeSuffix("#sealed").reversed() else null
}

class VoiceTokenStoreTest {
  private val token = "cvt_abcDEF123_-xyz"
  private val url = "https://proj.supabase.co/functions/v1/api"

  @Test
  fun saveThenReadRoundTripsAndNeverStoresThePlainToken() {
    val kv = MapStore()
    val store = VoiceTokenStore(kv, FakeCipher())
    assertTrue(store.save(token, url))
    assertEquals(VoiceCredentials(token, url), store.read())
    assertFalse(kv.map.values.any { it.contains(token) })
  }

  @Test
  fun fallsBackToThePrivatePrefsWhenTheKeystoreCannotEncrypt() {
    val kv = MapStore()
    val store = VoiceTokenStore(kv, FakeCipher(available = false))
    assertTrue(store.save(token, url))
    assertEquals(token, store.read()?.token)
  }

  @Test
  fun anUnreadableCiphertextIsTreatedAsNoToken() {
    val kv = MapStore()
    val cipher = FakeCipher()
    val store = VoiceTokenStore(kv, cipher)
    store.save(token, url)
    cipher.available = false // keystore reset: the key is gone
    assertNull(store.read())
    assertEquals(VoiceTokenState.NONE, store.state())
  }

  @Test
  fun stateIsNoneThenOkThenRejectedAndASaveClearsTheRejection() {
    val store = VoiceTokenStore(MapStore(), FakeCipher())
    assertEquals(VoiceTokenState.NONE, store.state())
    store.save(token, url)
    assertEquals(VoiceTokenState.OK, store.state())
    store.markRejected()
    assertEquals(VoiceTokenState.REJECTED, store.state())
    assertEquals("rejected", store.state().wire)
    store.save("cvt_newtoken", url)
    assertEquals(VoiceTokenState.OK, store.state())
  }

  @Test
  fun markRejectedWithoutATokenDoesNothing() {
    val store = VoiceTokenStore(MapStore(), FakeCipher())
    store.markRejected()
    assertEquals(VoiceTokenState.NONE, store.state())
  }

  @Test
  fun clearForgetsEverything() {
    val kv = MapStore()
    val store = VoiceTokenStore(kv, FakeCipher())
    store.save(token, url)
    store.markRejected()
    store.clear()
    assertNull(store.read())
    assertTrue(kv.map.isEmpty())
  }

  @Test
  fun refusesAnythingThatIsNotADeviceTokenOrAnHttpUrl() {
    val store = VoiceTokenStore(MapStore(), FakeCipher())
    assertFalse(store.save("eyJhbGciOiJSUzI1NiJ9.clerk.jwt", url)) // a Clerk JWT must never be stored here
    assertFalse(store.save(token, "not a url"))
    assertFalse(store.save(token, "ftp://host/api"))
    assertNull(store.read())
  }

  @Test
  fun normalisesTheApiUrlWithoutATrailingSlash() {
    assertEquals("https://h.co/functions/v1/api", VoiceTokenStore.normalizeApiUrl(" https://h.co/functions/v1/api/ "))
    assertEquals("http://10.0.2.2:54321/functions/v1/api", VoiceTokenStore.normalizeApiUrl("http://10.0.2.2:54321/functions/v1/api"))
    assertNull(VoiceTokenStore.normalizeApiUrl(""))
  }
}

class CloudTranscriberTest {
  @Test
  fun multipartHasOneAudioPartAndNoLanguageField() {
    val wav = byteArrayOf(1, 2, 3, 4)
    val text = CloudTranscriber.multipartBody("BOUND", "clip.wav", wav).toString(Charsets.ISO_8859_1)
    assertTrue(text.startsWith("--BOUND\r\nContent-Disposition: form-data; name=\"audio\"; filename=\"clip.wav\"\r\n"))
    assertTrue(text.contains("Content-Type: audio/wav\r\n\r\n"))
    assertTrue(text.endsWith("\r\n--BOUND--\r\n"))
    assertFalse(text.contains("language"))
    assertEquals(1, Regex("--BOUND\r\n").findAll(text).count())
  }

  @Test
  fun readsTheApiErrorCodeOrUnknown() {
    assertEquals(
      "UNAUTHENTICATED",
      CloudTranscriber.errorCode("""{"error":{"code":"UNAUTHENTICATED","message":"Invalid or revoked device token"}}"""),
    )
    assertEquals("UNKNOWN", CloudTranscriber.errorCode("<html>502</html>"))
    assertEquals("UNKNOWN", CloudTranscriber.errorCode(null))
  }

  @Test
  fun failureLogsStatusAndCodeOnly() {
    assertEquals("status=401 code=UNAUTHENTICATED", CloudResult.Failure(401, "UNAUTHENTICATED").describe())
    assertEquals("status=0 code=NETWORK_ERROR", CloudResult.Failure(0, "NETWORK_ERROR").describe())
  }
}
