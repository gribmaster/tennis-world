// Tiny NON-VISUAL smoke check for the repository wiring (Feature 2, Task 5).
//
// This is NOT a UI screen and renders nothing. It exists so the sanctioned
// repository boundary can be exercised end-to-end — env resolution → factory →
// concrete repo → data — from a script, a test, or a server log, before any
// pages exist. It imports through `@/lib/repositories` like real UI code, so it
// also doubles as a live example of the only allowed access pattern.

import { repositories } from '@/lib/repositories';

export interface RepositoriesHealth {
  /** Number of court summaries the wired repository returns. */
  courtCount: number;
  /** Slug of the first court, if any — proof the data round-trips. */
  firstCourtSlug: string | null;
}

/**
 * Exercise the courts repository and report a small health summary. Works against
 * whichever data source is wired (mock or, since Feature 46, the live API). A
 * misconfigured source surfaces as a thrown error — that error IS the signal.
 */
export async function checkRepositories(): Promise<RepositoriesHealth> {
  const courts = await repositories.courts.list();
  return {
    courtCount: courts.length,
    firstCourtSlug: courts[0]?.slug ?? null,
  };
}
