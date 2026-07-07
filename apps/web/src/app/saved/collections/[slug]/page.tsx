import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AppShell } from '@/components/layout';
import { UserCollectionHero, UserCollectionCourtsGrid } from '@/features/user-collection-detail';
import { getRepositoriesForRequest } from '@/lib/repositories.server';
import { loadOrSignIn } from '@/lib/auth-redirect';
import { AuthRequiredError } from '@/lib/repositories';

// User wishlist-collection detail page (`/saved/collections/[slug]`) — a Phase-1
// screen (Feature 33), ported from files/collection.html (singular). This is the
// USER's own folder, reached from the Saved → Collections rows; it is NOT the
// editorial `/collections/[slug]` (FEATURE_32 guardrail — different DTO, different
// repository, back-link to /saved not /collections).
//
// SERVER component and the ONLY repository boundary on the screen: it resolves the
// folder + its member courts by slug, 404s if it doesn't exist, and passes plain DTO
// data down to the hero + courts grid. The page itself never mutates.
//
// Repository method used by THIS page (read-only, Feature 33):
//   • repositories.saved.getUserCollectionBySlug(slug)
//       → UserCollectionWithCourtsDTO | null   (folder + member CourtSummaryDTO[])
//
// RENAME (Feature 37 / 57): the hero mounts a small <UserCollectionRename> client island.
// In `api` mode it calls the protected `PATCH /v1/me/collections/:id` via the browser
// client repo (`credentials:'include'`); in mock mode it calls the in-memory seam. That
// call does NOT happen here — the page stays a pure server read; the island handles the
// mutation and a client-side `router.replace` to the new slug. No server action was added.
//
// AUTH (Feature 57): this is a PRIVATE folder. In `api` mode the read carries the incoming
// session cookie via `getRepositoriesForRequest()`. A logged-out visitor → 401 →
// `redirect('/signin?redirectTo=…')` (via `loadOrSignIn`). An AUTHENTICATED visitor whose
// folder slug doesn't exist → the read returns `null` (the API's 404→null) → `notFound()`.
// In MOCK mode the read never 401s, so it stays the in-memory folder (or 404 on a bad slug).
// Exact lat/lng never reach the UI (the summaries carry approximate geo only).
//
// NOT `overHero` — the folder header is a light back-bar + title, not a full-bleed
// hero, so the header uses its standard solid bar + 72px offset.

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const repositories = await getRepositoriesForRequest();
  // Metadata can't meaningfully redirect; on a logged-out 401 (api mode) just fall back to
  // the generic title — the PAGE component owns the real redirect-to-/signin. A non-auth
  // error still throws (Next surfaces it). A missing folder → generic title.
  let collection = null;
  try {
    collection = await repositories.saved.getUserCollectionBySlug(slug);
  } catch (err) {
    if (!(err instanceof AuthRequiredError)) throw err;
  }
  if (!collection) return { title: 'Collection — Tennis World' };
  return {
    title: `${collection.name} — Saved — Tennis World`,
    description: `Courts in your “${collection.name}” collection.`,
  };
}

export default async function UserCollectionDetailPage({
  params,
}: {
  // Next 15: `params` is async and must be awaited.
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const repositories = await getRepositoriesForRequest();
  // Logged-out (api mode) → redirect to /signin (preserving this URL). Authenticated but
  // unknown slug → `null` → notFound().
  const collection = await loadOrSignIn(
    () => repositories.saved.getUserCollectionBySlug(slug),
    `/saved/collections/${slug}`,
  );
  if (!collection) {
    // Renders the framework 404 — no custom not-found page needed.
    notFound();
  }

  return (
    // Private folder — if it rendered, the visitor is signed in.
    <AppShell unlocked={false} signedIn>
      <UserCollectionHero collection={collection} courtCount={collection.courts.length} />
      <UserCollectionCourtsGrid courts={collection.courts} />
    </AppShell>
  );
}
