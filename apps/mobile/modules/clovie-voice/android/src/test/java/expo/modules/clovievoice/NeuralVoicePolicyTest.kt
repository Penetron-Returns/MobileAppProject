package expo.modules.clovievoice

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class NeuralVoicePolicyTest {
  @Test
  fun `neural speaks when its model is loaded and healthy`() {
    assertEquals(EngineChoice.NEURAL, NeuralVoicePolicy.choose(true, false, true, false))
    assertEquals(EngineChoice.NEURAL, NeuralVoicePolicy.choose(true, false, false, false))
  }

  @Test
  fun `system speaks while the neural model is not loaded or has failed`() {
    assertEquals(EngineChoice.SYSTEM, NeuralVoicePolicy.choose(false, false, true, false))
    assertEquals(EngineChoice.SYSTEM, NeuralVoicePolicy.choose(true, true, true, false))
  }

  @Test
  fun `a reply waits when no engine is ready yet and is dropped only when none can ever speak`() {
    assertEquals(EngineChoice.WAIT, NeuralVoicePolicy.choose(false, false, false, false))
    assertEquals(EngineChoice.WAIT, NeuralVoicePolicy.choose(true, true, false, false))
    assertEquals(EngineChoice.NONE, NeuralVoicePolicy.choose(false, false, false, true))
    assertEquals(EngineChoice.NONE, NeuralVoicePolicy.choose(true, true, false, true))
  }

  @Test
  fun `a partial download resumes only when it is smaller than the archive`() {
    assertEquals(500L, NeuralVoicePolicy.resumeOffset(500, 1000))
    assertEquals(0L, NeuralVoicePolicy.resumeOffset(0, 1000))
    assertEquals(0L, NeuralVoicePolicy.resumeOffset(1000, 1000))
    assertEquals(0L, NeuralVoicePolicy.resumeOffset(2000, 1000))
  }

  @Test
  fun `resume is accepted only for a partial-content answer to a range request`() {
    assertTrue(NeuralVoicePolicy.isResumeAccepted(206, 500))
    assertFalse(NeuralVoicePolicy.isResumeAccepted(200, 500))
    assertFalse(NeuralVoicePolicy.isResumeAccepted(206, 0))
  }

  @Test
  fun `archive entries that escape the target folder are rejected`() {
    assertTrue(NeuralVoicePolicy.isSafeEntryName("kokoro-int8-en-v0_19/model.int8.onnx"))
    assertTrue(NeuralVoicePolicy.isSafeEntryName("kokoro-int8-en-v0_19/espeak-ng-data/en_dict"))
    assertFalse(NeuralVoicePolicy.isSafeEntryName("../evil"))
    assertFalse(NeuralVoicePolicy.isSafeEntryName("a/../../evil"))
    assertFalse(NeuralVoicePolicy.isSafeEntryName("/etc/passwd"))
    assertFalse(NeuralVoicePolicy.isSafeEntryName("C:\\windows\\x"))
    assertFalse(NeuralVoicePolicy.isSafeEntryName("a\\..\\b"))
  }

  @Test
  fun `checksum comparison ignores case and rejects a different hash`() {
    assertTrue(NeuralVoicePolicy.isChecksumMatch("ABCdef", "abcDEF"))
    assertFalse(NeuralVoicePolicy.isChecksumMatch("abc", "abd"))
    assertEquals(64, NeuralVoiceModel.SHA256.length)
  }

  @Test
  fun `the model counts as complete only with every required file`() {
    assertTrue(NeuralVoicePolicy.isComplete(NeuralVoiceModel.REQUIRED_FILES.toSet() + "README.md"))
    assertFalse(NeuralVoicePolicy.isComplete(emptySet()))
    assertFalse(NeuralVoicePolicy.isComplete(NeuralVoiceModel.REQUIRED_FILES.toSet() - "voices.bin"))
  }

  @Test
  fun `progress is clamped and zero for an unknown total`() {
    assertEquals(0.5, NeuralVoicePolicy.progress(50, 100), 1e-9)
    assertEquals(1.0, NeuralVoicePolicy.progress(150, 100), 1e-9)
    assertEquals(0.0, NeuralVoicePolicy.progress(10, 0), 1e-9)
  }

  @Test
  fun `thread count stays between two and four`() {
    assertEquals(2, NeuralVoicePolicy.threadsFor(1))
    assertEquals(2, NeuralVoicePolicy.threadsFor(4))
    assertEquals(4, NeuralVoicePolicy.threadsFor(8))
    assertEquals(4, NeuralVoicePolicy.threadsFor(16))
  }
}
