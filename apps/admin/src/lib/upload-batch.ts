/**
 * Tracks an in-flight batch of serial uploads without touching React state
 * from inside a state updater (TASK_78 fix 2 — `setPendingUploads((n) => ...)`
 * calling `onChanged()` is a side effect inside a pure updater, which React
 * may invoke twice in StrictMode and warns about when it triggers another
 * component's update mid-render).
 *
 * All counting lives here, in a plain ref-held closure. The caller reports
 * the resulting pending count to React with a plain `setState(value)` call
 * (never a functional updater) and `onDrained` fires from `finish()`'s own
 * call stack — the queued task's `finally` — once the batch empties.
 */
export interface UploadBatchTrackerOptions {
  /** Called with the new pending count every time it changes. */
  onPendingChange: (pending: number) => void;
  /** Called once per drained batch, only if at least one upload in it
   *  succeeded — never when every upload in the batch failed. */
  onDrained: (hadSuccess: boolean) => void;
}

export interface UploadBatchTracker {
  /** Call when a file is handed to the upload queue. */
  start(): void;
  /** Call when a queued file's upload settles (from its `finally`). */
  finish(success: boolean): void;
}

export function createUploadBatchTracker({
  onPendingChange,
  onDrained,
}: UploadBatchTrackerOptions): UploadBatchTracker {
  let pending = 0;
  let hadSuccess = false;

  function start(): void {
    pending += 1;
    onPendingChange(pending);
  }

  function finish(success: boolean): void {
    if (success) hadSuccess = true;
    pending -= 1;
    onPendingChange(pending);

    if (pending === 0) {
      const drainedWithSuccess = hadSuccess;
      hadSuccess = false;
      if (drainedWithSuccess) {
        onDrained(true);
      }
    }
  }

  return { start, finish };
}
