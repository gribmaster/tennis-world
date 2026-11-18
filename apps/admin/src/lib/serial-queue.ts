/**
 * A FIFO queue that runs tasks one at a time, in enqueue order. A rejected
 * task rejects only its own returned promise — it does not stop or skip
 * later tasks in the queue.
 */
export function createSerialQueue() {
  let tail: Promise<void> = Promise.resolve();

  function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const result = tail.then(task);
    tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  return { enqueue };
}
