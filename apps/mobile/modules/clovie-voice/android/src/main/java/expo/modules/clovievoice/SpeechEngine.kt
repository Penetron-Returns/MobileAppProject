package expo.modules.clovievoice

/** Receives what an engine did with one sentence. Always called on the main thread. */
interface SpeechEngineListener {
  fun onStart(utteranceId: String)
  fun onDone(utteranceId: String)
  fun onError(utteranceId: String)
}

/**
 * One way of turning a sentence into sound. [VoiceSpeaker] owns the reply (sentence order, focus, callbacks) and
 * asks an engine to speak one sentence at a time. Every implementation honours the same contract: a flushing
 * sentence replaces anything queued, [stop] silences at once and reports nothing for what was cut off, and
 * exactly one of onDone/onError follows each accepted sentence unless it was stopped.
 */
interface SpeechEngine {
  /** Queues `text`; with [flush] anything queued or playing is dropped first. False when it could not be accepted. */
  fun speak(text: String, utteranceId: String, flush: Boolean): Boolean

  /** Cuts speech off now. Pending sentences never report. */
  fun stop()
}
