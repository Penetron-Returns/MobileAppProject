package expo.modules.clovievoice

/**
 * Speaks streamed sentences one group at a time on top of a speaker that cuts off whatever is playing when asked to
 * speak. Sentences that arrive while one is playing are joined into the next group (the speaker queues the sentences
 * inside a group without gaps). [whenIdle] runs a task once nothing is playing or waiting, so the final reply starts
 * after the streamed part. Main thread only. [clear] drops everything, and callbacks from a cleared generation are
 * ignored. Pure: the speaker is injected.
 */
class SpeechQueue(private val speakGroup: (text: String, onStart: () -> Unit, onDone: () -> Unit) -> Unit) {
  private val waiting = ArrayList<String>()
  private val idleTasks = ArrayList<() -> Unit>()
  private var isPlaying = false
  private var generation = 0
  private var onFirstStart: (() -> Unit)? = null

  val isIdle: Boolean get() = !isPlaying && waiting.isEmpty()

  /** `onStart` runs once, when the first sentence of the turn really begins. */
  fun enqueue(sentence: String, onStart: () -> Unit = {}) {
    if (onFirstStart == null) onFirstStart = onStart
    waiting.add(sentence)
    if (!isPlaying) playNext()
  }

  fun whenIdle(task: () -> Unit) {
    if (isIdle) task() else idleTasks.add(task)
  }

  fun clear() {
    generation += 1
    waiting.clear()
    idleTasks.clear()
    isPlaying = false
    onFirstStart = null
  }

  private fun playNext() {
    val text = waiting.joinToString(" ")
    waiting.clear()
    isPlaying = true
    val mine = generation
    val first = onFirstStart
    onFirstStart = { }
    speakGroup(text, { if (mine == generation) first?.invoke() }) {
      if (mine == generation) {
        isPlaying = false
        if (waiting.isNotEmpty()) playNext() else drain()
      }
    }
  }

  private fun drain() {
    val tasks = ArrayList(idleTasks)
    idleTasks.clear()
    tasks.forEach { it() }
  }
}
