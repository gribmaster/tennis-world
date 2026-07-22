import { notFound } from 'next/navigation';
import { AppShell, PageContainer } from '@/components/layout';
import { SectionHeader } from '@/components/ui';
import { CourtCard, CourtMeta } from '@/components/court';
import {
  CourtDetailGallery,
  CourtDetailLocationPreview,
  CourtDetailCtaPanel,
} from '@/features/court-detail';
import type { ExactLocationDTO, UserCollectionDTO } from '@tennis/contracts';
import { repositories, AuthRequiredError } from '@/lib/repositories';
import { getRepositoriesForRequest } from '@/lib/repositories.server';

// Court Detail page (`/courts/[slug]`) — the PRD's primary conversion surface and a
// required Phase-1 screen (Decision #15). Built from docs/FEATURE_11_COURT_DETAIL_LAYOUT.md.
//
// This is a SERVER component and the ONLY repository boundary on the screen: it
// fetches the court + related courts and passes everything down as props. The
// feature-local section components stay presentational and never fetch.
//
// AUTH (Feature 57): Court Detail is PUBLIC — it must render for logged-out visitors. The
// court/related reads are public (no auth). The Add-to-Collection menu data (saved
// collections + this court's membership) is PROTECTED; in `api` mode we read it with the
// incoming session cookie. A logged-out visitor's protected reads 401 — we CATCH that
// (never redirect a public page) and degrade the menu to empty + signed-out, so the page
// still renders and the menu prompts sign-in instead of crashing. In MOCK mode the saved
// reads never 401, so `signedIn` is always true there.
//
// ENTITLEMENT (Feature 64): the locked/unlocked state derives ENTIRELY from the REAL
// protected exact-location unlock (`GET /v1/me/courts/:slug/exact-location`, Feature 63) —
// attempted for EVERY court regardless of `court.isLocked` (that flag describes imported
// content, not viewer entitlement), with the same session cookie, and degraded to "locked"
// for a logged-out / non-entitled / unknown viewer (the repo maps 401/403/404 → null). An
// entitled viewer gets back a `directionsUrl` (server-built from the exact coords) that
// wires the real "Get Directions" link. NO Stripe, NO checkout — the paywall CTA is
// unchanged for locked users. The location placeholder still never receives or plots
// lat/lng; only the opaque `directionsUrl` (never the raw coords) reaches the UI, in an
// href. In MOCK mode there is no auth/entitlement seam, so locked courts stay locked.

// Split the blurb the way the prototype does: first sentence becomes an italic serif
// pull-quote, the remainder is body copy. Pure presentational formatting of one
// string — not new data.
function splitBlurb(blurb: string): { pullQuote: string; body: string } {
  const parts = blurb.split('.');
  const pullQuote = parts[0]?.trim() ?? '';
  const body = parts.slice(1).join('.').trim();
  return { pullQuote, body };
}

export default async function CourtDetailPage({
  params,
}: {
  // Next 15: `params` is async and must be awaited.
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const court = await repositories.courts.getBySlug(slug);
  if (!court) {
    // Renders the default framework 404 — no custom not-found page needed (Task 8).
    notFound();
  }

  // `getRelated` keys off the court id (not slug); fetched after the court resolves.
  const related = await repositories.courts.getRelated(court.id, 4);

  // Add-to-Collection menu data (Feature 36), fetched HERE on the server. These are
  // PROTECTED reads (the user's wishlist folders + which of them contain this court). In
  // `api` mode they carry the incoming session cookie; for a logged-out visitor they 401,
  // which we DEGRADE to empty + `signedIn:false` (NEVER redirect — this page is public).
  // The CTA panel forwards `signedIn` to the menu, which then prompts sign-in instead of
  // mutating. A non-auth error still throws (a real fault must not look like "logged out").
  const protectedRepos = await getRepositoriesForRequest();
  let savedCollections: UserCollectionDTO[] = [];
  let memberCollectionIds: string[] = [];
  let initialSaved = false;
  let signedIn = true;
  try {
    [savedCollections, memberCollectionIds, initialSaved] = await Promise.all([
      protectedRepos.saved.getSavedCollections(),
      protectedRepos.saved.getCollectionIdsForCourt(court.id),
      // Standalone saved-court state for the heart button. Same protected read set; a
      // logged-out visitor's 401 degrades the whole block to signed-out (below), so the
      // button prompts sign-in rather than showing a stale pressed state.
      protectedRepos.saved.isCourtSaved(court.id),
    ]);
  } catch (err) {
    if (err instanceof AuthRequiredError) {
      signedIn = false;
    } else {
      throw err;
    }
  }

  // ENTITLEMENT (Feature 64): the locked/unlocked state derives ENTIRELY from the REAL
  // exact-location unlock (`GET /v1/me/courts/:slug/exact-location`, Feature 63) — the
  // single source of truth — NOT `court.isLocked` and NOT `UserProfileDTO.membership`
  // (which would add an extra /v1/me call to this public page). The endpoint IS the
  // membership gate: 200 ⇒ entitled, 401/403/404 ⇒ not (the repo collapses all three to
  // `null`). Derived ONCE here and passed down as props — components never recompute it.
  //
  // Attempted for EVERY court, regardless of `court.isLocked` — that flag describes the
  // imported/seeded content, not the viewer's entitlement, so gating the call on it would
  // make the exact-location/zoom-17 map branch unreachable for any court whose `isLocked`
  // happens to be false even for a genuinely entitled viewer. This runs through the
  // request-scoped `protectedRepos.courts`, which forwards the session cookie in `api`
  // mode; a logged-out or non-entitled visitor's protected read degrades to `null` INSIDE
  // the repo (never an exception, never a redirect — this page is PUBLIC). In MOCK mode
  // the repo always returns `null` (no auth/entitlement seam), so behavior there is
  // unchanged. A real (non-401/403/404) fault still propagates out of the repo.
  const exactLocation: ExactLocationDTO | null =
    await protectedRepos.courts.getExactLocation(court.slug);
  const locked = exactLocation === null;

  const { pullQuote, body } = splitBlurb(court.blurb);
  const locationLine = [court.country, court.region].filter(Boolean).join(' · ');

  return (
    // NOT overHero — the detail hero is a framed image, not a full-bleed one, so the
    // header uses its standard solid bar + content offset. `signedIn` (derived above from
    // the protected saved reads) also points the header user icon at /profile vs /signin.
    <AppShell unlocked={false} signedIn={signedIn}>
      <PageContainer as="article" className="py-section-lg md:py-section-xl">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-[minmax(0,1fr)_360px] md:gap-16 md:items-start">
          {/* ── Left column: media + editorial content ───────────────────────── */}
          <div>
            <CourtDetailGallery
              images={court.images}
              heroImageUrl={court.heroImageUrl}
              courtName={court.name}
            />

            {/* Title block — shown here on mobile; hidden on desktop where the sticky
                rail carries it instead. */}
            <header className="mt-8 md:hidden">
              <p className="eyebrow text-stone">{locationLine}</p>
              <h1 className="display-l mt-3 text-ink">{court.name}</h1>
              <CourtMeta
                surface={court.surface}
                setting={court.setting}
                access={court.access}
                indoorOutdoor={court.indoorOutdoor}
                className="mt-6"
              />
            </header>

            {/* Overview / blurb */}
            <section className="mt-12">
              <p className="eyebrow text-stone">About this court</p>
              {pullQuote ? (
                <p className="serif mt-4 text-[clamp(20px,1.8vw,26px)] italic leading-snug text-ink">
                  “{pullQuote}.”
                </p>
              ) : null}
              {body ? <p className="body-l mt-4 text-graphite">{body}</p> : null}
            </section>

            {/* Location preview — a REAL Leaflet map (Feature 74). LOCKED/free: a
                blurred map centered on the always-public APPROXIMATE geo
                (`approxLat`/`approxLng`) behind the Unlock CTA — no exact coord is
                sent. ENTITLED: the protected exact-location endpoint's `lat`/`lng`
                (a premium, authenticated read — never a public one) plots the exact
                marker, and its server-built `directionsUrl` wires Get Directions. */}
            <section className="mt-12">
              <CourtDetailLocationPreview
                locked={locked}
                courtName={court.name}
                approxLat={court.approxLat}
                approxLng={court.approxLng}
                exactLocation={exactLocation}
              />
            </section>
          </div>

          {/* ── Right column: sticky info rail (desktop) ──────────────────────── */}
          <aside className="md:sticky md:top-[96px]">
            {/* Title block lives in the rail on desktop only. */}
            <div className="hidden md:block">
              <p className="eyebrow text-stone">{locationLine}</p>
              <h1 className="display-l mt-3 text-ink">{court.name}</h1>
              <CourtMeta
                surface={court.surface}
                setting={court.setting}
                access={court.access}
                indoorOutdoor={court.indoorOutdoor}
                className="mt-6"
              />
              <hr className="mt-8 border-hairline" />
            </div>

            <div className="mt-2 md:mt-6">
              <CourtDetailCtaPanel
                locked={locked}
                directionsUrl={exactLocation?.directionsUrl ?? null}
                courtId={court.id}
                courtSlug={court.slug}
                initialSaved={initialSaved}
                collections={savedCollections}
                memberCollectionIds={memberCollectionIds}
                signedIn={signedIn}
              />
            </div>
          </aside>
        </div>

        {/* ── Related courts — reuses CourtCard ───────────────────────────────── */}
        {related.length > 0 ? (
          <section className="mt-section-xl border-t border-hairline pt-section-lg">
            <SectionHeader eyebrow="If you love this, you'll love" title="Related courts" />
            <div className="mt-section grid grid-cols-2 gap-4 md:grid-cols-4">
              {related.map((c) => (
                <CourtCard key={c.id} court={c} href={`/courts/${c.slug}`} />
              ))}
            </div>
          </section>
        ) : null}
      </PageContainer>
    </AppShell>
  );
}
