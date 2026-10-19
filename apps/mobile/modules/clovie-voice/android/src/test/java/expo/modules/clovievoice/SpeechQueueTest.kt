package expo.modules.clovievoice

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SpeechQueueTest {
  private class Group(val text: String, val onStart: () -> Unit, val onDone: () -> Unit)

  private val spoken = ArrayList<Group>()
  private val queue = SpeechQueue { text, onStart, onDone -> spoken.add(Group(text, onStart, onDone)) }

  @Test
  fun speaksTheFirstSentenceAtOnce() {
    queue.enqueue("Hello there.")
    assertEquals(listOf("Hello there."), spoken.map { it.text })
  }

  @Test
  fun joinsSentencesThatArriveWhileOneIsPlayingIntoTheNextGroup() {
    queue.enqueue("One.")
    queue.enqueue("Two.")
    queue.enqueue("Three.")
    assertEquals(listOf("One."), spoken.map { it.text })
    spoken[0].onDone()
    assertEquals(listOf("One.", "Two. Three."), spoken.map { it.text })
  }

  @Test
  fun firstStartRunsOnceForTheFirstGroupOnly() {
    var starts = 0
    queue.enqueue("One.") { starts++ }
    queue.enqueue("Two.") { starts += 10 }
    spoken[0].onStart()
    spoken[0].onDone()
    spoken[1].onStart()
    assertEquals(1, starts)
  }

  @Test
  fun whenIdleRunsAtOnceWhenNothingPlaysAndAfterTheLastGroupOtherwise() {
    var ran = 0
    queue.whenIdle { ran++ }
    assertEquals(1, ran)
    queue.enqueue("One.")
    queue.whenIdle { ran++ }
    assertEquals(1, ran)
    spoken[0].onDone()
    assertEquals(2, ran)
    assertTrue(queue.isIdle)
  }

  @Test
  fun clearDropsQueuedSentencesIdleTasksAndLateCallbacks() {
    var ran = 0
    queue.enqueue("One.")
    queue.enqueue("Two.")
    queue.whenIdle { ran++ }
    queue.clear()
    spoken[0].onDone()
    assertEquals(1, spoken.size)
    assertEquals(0, ran)
    assertTrue(queue.isIdle)
    queue.enqueue("Fresh.")
    assertEquals("Fresh.", spoken.last().text)
    assertFalse(queue.isIdle)
  }
}
