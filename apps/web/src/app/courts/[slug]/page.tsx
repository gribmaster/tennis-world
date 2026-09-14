import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AppShell } from '@/components/layout';
import { BackButton } from '@/components/navigation';
import {
  CourtDetailLocationPreview,
  CourtDetailShell,
  CourtDetailGalleryStrip,
  CourtDetailTagStrip,
  CourtDetailDescription,
  CourtDetailBlurredDescription,
  CourtDetailUnlockCard,
  CourtDetailNearbyStrip,
  CourtDetailReviewCard,
} from '@/features/court-detail';
import { PaywallTrigger } from '@/features/paywall';
import type { CourtDTO, CourtSummaryDTO, ExactLocationDTO, UserCollectionDTO } from '@tennis/contracts';
import { repositories, AuthRequiredError } from '@/lib/repositories';
import { getRepositoriesForRequest } from '@/lib/repositories.server';

// Court Detail page (`/courts/[slug]`) — the PRD's primary conversion surface and a
// required Phase-1 screen (Decision #15). Built from docs/FEATURE_11_COURT_DETAIL_LAYOUT.md,
// and rebuilt for the UNLOCKED reading to the v2 prototype in Feature 78.
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
//
// ── TWO RENDERINGS, ONE GATE (Features 78 + 79) ─────────────────────────────────────────
// The data prologue below — including every line of the entitlement derivation — is
// SHARED and UNCHANGED by both features; only the final `return` forks:
//
//   • `locked === false` → `renderUnlocked()` (Feature 78): the v2 layout — full-bleed hero
//     gallery, the overlapping white card, tag strip, clamped description, two-column
//     location block, gallery strip, nearby courts, sticky footer bar.
//   • `locked === true`  → `renderLocked()` (Feature 79): the SAME v2 shell and the same
//     sections, in the prototype's locked reading — masked title, "Location hidden —
//     Premium only", blurred description, lock overlay on the map, "Address hidden", the
//     dark unlock card, and a sticky footer whose primary action opens the paywall.
//
// Both branches receive `locked` and `directionsUrl` as PROPS from the single computation
// below. Neither re-derives entitlement, neither calls the exact-location endpoint, and no
// component on either path receives a coordinate.
//
// ── THE LOCKED PAGE'S MASKS ARE PRESENTATION, NOT A GATE (Feature 79) ────────────────────
// The locked reading hides the court's NAME as well as its location, description and
// address. Every one of those strings is PUBLIC: `GET /v1/courts/:slug` returns `name`,
// `country`, `region` and `blurb` to every caller, entitled or not, deliberately (these
// pages are indexable), and it will continue to. Nothing is stripped server-side, no field
// was added, and `apps/api` is untouched. What changes is only what this page DISPLAYS —
// the same teaser treatment `components/court/court-display.ts` already applies to locked
// cards. (Note that `courtDisplay` masks off the PUBLIC `isLocked` content flag and is
// deliberately NOT reused here: this page's mask is driven by `locked`, the real
// entitlement result, so the two rules must not be collapsed into one helper.)
//
// The ONE real boundary is the exact `lat`/`lng`, which lives behind
// `GET /v1/me/courts/:slug/exact-location` and never reaches any component on either
// branch. Do not mistake a mask below for that boundary, and do not "harden" one by
// changing the API — that would be an entitlement-model change, out of scope here.

// Per-court page metadata. It uses the court's REAL name for EVERY viewer, locked or not.
//
// WHY THAT IS RIGHT, not cloaking: one page is served identically to everyone — the same
// HTML, the same masks, the same gate. The tab title and the search snippet NAME the thing
// the page is about; the body gates the paid detail. Google, a locked visitor and an
// entitled visitor all see the same title. This is also why it must exist at all: with the
// locked H1 masked, without this the court's name would vanish from the page entirely and
// every court would share one indistinguishable title.
//
// PUBLIC FIELDS ONLY: `name`, `surface`, `country` and `region` — the same fields the
// public `GET /v1/courts/:slug` response carries and that the unlocked page prints in
// plain text. Nothing entitlement-derived is read here: this function makes NO protected
// call, never touches `getExactLocation`, and never sees `directionsUrl`, `lat` or `lng`.
// It uses the PUBLIC `repositories.courts` (not the request-scoped protected repos), so
// there is no session to leak into a cache key.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const court = await repositories.courts.getBySlug(slug);
  // Not found — the page itself will `notFound()`; keep the title generic rather than
  // echoing an unresolved slug back at the browser.
  if (!court) return { title: 'Court — Tennis World' };

  const where = [court.country, court.region].filter(Boolean).join(', ');
  return {
    title: `${court.name} — Tennis World`,
    description: where
      ? `${court.name} — a ${court.surface.toLowerCase()} court in ${where}, from the Tennis World atlas.`
      : `${court.name} — a ${court.surface.toLowerCase()} court from the Tennis World atlas.`,
  };
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

  const locationLine = [court.country, court.region].filter(Boolean).join(' · ');

  const shared = {
    court,
    related,
    locationLine,
    locked,
    exactLocation,
    savedCollections,
    memberCollectionIds,
    initialSaved,
    signedIn,
  };

  return locked ? renderLocked(shared) : renderUnlocked(shared);
}

interface RenderProps {
  court: CourtDTO;
  related: CourtSummaryDTO[];
  locationLine: string;
  locked: boolean;
  exactLocation: ExactLocationDTO | null;
  savedCollections: UserCollectionDTO[];
  memberCollectionIds: string[];
  initialSaved: boolean;
  signedIn: boolean;
}

function PinGlyph() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="shrink-0"
    >
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

// ── UNLOCKED: the v2 prototype layout (Feature 78) ──────────────────────────────────────
function renderUnlocked({
  court,
  related,
  locationLine,
  exactLocation,
  savedCollections,
  memberCollectionIds,
  initialSaved,
  signedIn,
}: RenderProps) {
  // Section gutters follow the prototype's flat 20px on mobile and widen into
  // `.container-page`'s own gutter on desktop, so the card content lines up with the rest
  // of the app instead of hugging a wide screen's edge.
  const gutter = 'px-5 md:px-[clamp(20px,4vw,64px)]';
  const column = 'mx-auto w-full max-w-container';

  return (
    // `overHero` — the v2 hero is a FULL-BLEED image, so the header sits transparently over
    // it (the same treatment Home uses) rather than as a solid bar with a content offset.
    // `signedIn` also points the header user icon at /profile vs /signin.
    <AppShell overHero unlocked signedIn={signedIn}>
      <CourtDetailShell
        images={court.images}
        heroImageUrl={court.heroImageUrl}
        courtName={court.name}
        courtId={court.id}
        courtSlug={court.slug}
        initialSaved={initialSaved}
        signedIn={signedIn}
        collections={savedCollections}
        memberCollectionIds={memberCollectionIds}
        // The opaque, server-built deep link only — never the coordinates behind it.
        directionsUrl={exactLocation?.directionsUrl ?? null}
        backControl={
          // The ONE Back control (CLAUDE.md §5), styled as the hero's over-image pill.
          // NOTE: this app has no standalone `/courts` index route — courts are browsed via
          // the `/map` explorer (list + map), which is the real "all courts" surface, so
          // that's the fallback destination. `verify:ux-pending-states` asserts this exact
          // fallbackHref/label pairing against this file.
          <BackButton
            fallbackHref="/map"
            label="Courts"
            className="eyebrow inline-flex h-9 items-center gap-1.5 rounded-pill bg-ink/40 px-3.5 text-paper backdrop-blur-[8px] transition-colors hover:bg-ink/55 disabled:opacity-70"
          />
        }
      >
        <article>
          {/* Title block (prototype lines 1052–1061). */}
          <header className={`${gutter} pt-5`}>
            <div className={column}>
              <h1 className="serif text-[28px] font-normal leading-[1.15] text-ink md:text-[clamp(28px,3vw,40px)]">
                {court.name}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="flex items-center gap-1 text-[13px] text-stone">
                  <PinGlyph />
                  {locationLine}
                </span>
                {/* The surface chip, reusing the existing `.meta-chip` token. */}
                <span className="meta-chip !py-[3px] !text-[12px]">{court.surface}</span>
              </div>
            </div>
          </header>

          {/* Tag chips — a scrolling row, never a wrapping one (prototype lines 1062–1069).
              Renders nothing at all when the court carries no tags. */}
          <div className="mt-3.5">
            <div className={column}>
              <CourtDetailTagStrip tags={court.tags} />
            </div>
          </div>

          {/* Description with the character clamp + Read more/less (lines 1078–1088). */}
          <div className={`${gutter} mt-4`}>
            <div className={column}>
              <CourtDetailDescription blurb={court.blurb} />
            </div>
          </div>

          <div className={`${gutter} my-5`}>
            <div className={`${column} h-px bg-hairline`} />
          </div>

          {/* Location — the two-column block. Country · region stands in for the
              prototype's invented street address; the model carries no `address` field
              and this feature adds none. The directions href is the SERVER-supplied
              `directionsUrl`; no maps URL is ever built from coordinates here. */}
          <section className={gutter}>
            <div className={column}>
              <CourtDetailLocationPreview
                variant="v2"
                locked={false}
                courtName={court.name}
                approxLat={court.approxLat}
                approxLng={court.approxLng}
                exactLocation={exactLocation}
                locationLine={locationLine}
                heroImageUrl={court.heroImageUrl}
              />
            </div>
          </section>

          {/* Gallery strip — drives the hero image through the shared gallery state. */}
          <section className="mt-5 md:px-[clamp(20px,4vw,64px)]">
            <div className={column}>
              <CourtDetailGalleryStrip />
            </div>
          </section>

          {/* Nearby courts. From `getRelated()` — shared country + surface, not proximity.
              No distance is rendered; see CourtDetailNearbyStrip's header for why. */}
          {related.length > 0 ? (
            <section className="mt-5 md:px-[clamp(20px,4vw,64px)]">
              <div className={column}>
                <div className="mb-3 flex items-baseline justify-between px-5 md:px-0">
                  <h2 className="text-[16px] font-semibold text-ink">Nearby courts</h2>
                </div>
                <CourtDetailNearbyStrip courts={related} />
              </div>
            </section>
          ) : null}

          {/* "Played here? Leave a review" (prototype lines 1154–1166) — Feature 80. It
              sits in the UNLOCKED branch only, where the prototype puts it
              (`{!isLocked && …}`) and where it makes sense: a viewer who cannot be told
              where the court is has not played there. The locked branch keeps
              `CourtDetailUnlockCard` in this exact slot instead.

              COLLECTION ONLY: the card opens a form that collects a rating and a note and
              POSTs them. It displays NO score, NO average and NO review count, and neither
              does anything else on this page or any other — no endpoint returns a review.
              `signedIn` (derived once above) sends a logged-out visitor to /signin rather
              than opening a form whose submit would 401. */}
          <section className={`${gutter} mt-5`}>
            <div className={column}>
              <CourtDetailReviewCard courtSlug={court.slug} signedIn={signedIn} />
            </div>
          </section>
        </article>
      </CourtDetailShell>
    </AppShell>
  );
}

// ── LOCKED: the v2 prototype's locked reading (Feature 79) ──────────────────────────────
// Same shell, same gallery, same Back control, same save/share chrome and the same sticky
// footer as `renderUnlocked()` above — the prototype draws ONE screen and branches inside
// it (`CourtDetailScreen`, `isLocked`, lines 1005–1188), so this is that same structure
// with the prototype's locked strings and controls, not a second layout.
//
// WHAT DIFFERS FROM THE UNLOCKED READING, and only this:
//   • the serif title → "Unlock to reveal court name"      (prototype line 1054)
//   • country · region → "Location hidden — Premium only"  (prototype line 1057)
//   • the description  → the real text, visually blurred   (prototype lines 1073–1077)
//   • the map          → blurred, behind the lock overlay  (prototype line 1100)
//   • the address line → "Address hidden"                  (prototype line 1106)
//   • the directions control → disabled "Unlock location"  (prototype lines 1109–1110)
//   • the dark unlock card replaces the review card        (prototype lines 1169–1176)
//   • the footer's primary action → "Unlock to get directions", opening the paywall
//                                                          (prototype lines 1183–1185)
//
// WHAT DELIBERATELY DOES NOT DIFFER: the surface chip and the tag chips stay VISIBLE. The
// prototype keeps both (`SurfaceLabel` line 1058, the `.h-scroll` of labels 1062–1069) and
// so do we — surface and experience tags are public descriptive metadata, and showing them
// is the whole teaser: they tell a visitor what kind of court this is while the name, the
// place and the description stay behind the membership.
//
// EVERY MASK HERE IS PRESENTATION (see the file header). The real gate is the exact
// coordinate, which is server-side; no coordinate, no `directionsUrl` and no entitlement
// check reaches this branch — `locked` was derived once in the page body above.
//
// NO BILLING BEHAVIOUR (CLAUDE.md §7). Both unlock affordances are `PaywallTrigger`s that
// open the shared modal; the modal owns checkout. No checkout call, plan key, price id,
// publishable key or Stripe.js exists on this path, and nothing here marks anyone premium.
function renderLocked({
  court,
  related,
  savedCollections,
  memberCollectionIds,
  initialSaved,
  signedIn,
}: RenderProps) {
  // The DISPLAYED name. Everything that names this court on the locked page — the H1, the
  // save control's accessible name, the share sheet's title — reads from this ONE string,
  // so the mask cannot leak through one surface while holding on another (the rule
  // Feature 74's HomeCourtSaveHeart established). The real `court.name` is still in the
  // props and is still used for the gallery's image alt text and for `generateMetadata`.
  const maskedName = 'Unlock to reveal court name';

  // The same mask, phrased to read correctly INSIDE a control's accessible name. The H1
  // string is an instruction ("Unlock to reveal court name") and composes badly — "Save
  // Unlock to reveal court name" is not a sentence. Controls that name the court get "this
  // court" instead: it reveals exactly as little, and "Save this court" / "Share this
  // court" / "Show this court image 2" are names a screen-reader user can act on.
  const maskedControlName = 'this court';

  // Same gutters as the unlocked branch — the two readings must line up.
  const gutter = 'px-5 md:px-[clamp(20px,4vw,64px)]';
  const column = 'mx-auto w-full max-w-container';

  return (
    // `overHero` + `unlocked={false}` — the locked page now gets the same full-bleed hero
    // as the unlocked one, so the header sits transparently over it. The header's own CTA
    // still reads as locked.
    <AppShell overHero unlocked={false} signedIn={signedIn}>
      <CourtDetailShell
        locked
        images={court.images}
        heroImageUrl={court.heroImageUrl}
        // REAL name → image alt text only (an image description, not a masked surface).
        courtName={court.name}
        // MASKED name → every control that names the court.
        courtLabel={maskedControlName}
        courtId={court.id}
        courtSlug={court.slug}
        initialSaved={initialSaved}
        signedIn={signedIn}
        collections={savedCollections}
        memberCollectionIds={memberCollectionIds}
        // There is no directions link for a locked viewer, by construction.
        directionsUrl={null}
        primaryAction={
          // Prototype line 1184. Opens the SHARED paywall modal — the same path the unlock
          // card below uses. Opening a modal is local UI, so per CLAUDE.md §4 rule 10 it
          // takes no pending primitive and no spinner.
          <PaywallTrigger
            source="court-detail-locked-footer"
            className="btn btn-primary flex-1 justify-center gap-2"
          >
            Unlock to get directions
          </PaywallTrigger>
        }
        backControl={
          // The ONE Back control (CLAUDE.md §5), identical to the unlocked branch's.
          // NOTE: this app has no standalone `/courts` index route — courts are browsed via
          // the `/map` explorer (list + map), which is the real "all courts" surface, so
          // that's the fallback destination. `verify:ux-pending-states` asserts this exact
          // fallbackHref/label pairing against this file.
          <BackButton
            fallbackHref="/map"
            label="Courts"
            className="eyebrow inline-flex h-9 items-center gap-1.5 rounded-pill bg-ink/40 px-3.5 text-paper backdrop-blur-[8px] transition-colors hover:bg-ink/55 disabled:opacity-70"
          />
        }
      >
        <article>
          {/* Masked title block (prototype lines 1052–1061). Same type, same spacing as
              the unlocked branch — only the two strings change. */}
          <header className={`${gutter} pt-5`}>
            <div className={column}>
              <h1 className="serif text-[28px] font-normal leading-[1.15] text-ink md:text-[clamp(28px,3vw,40px)]">
                {maskedName}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="flex items-center gap-1 text-[13px] text-stone">
                  <PinGlyph />
                  Location hidden — Premium only
                </span>
                {/* The surface chip STAYS — public metadata, and the teaser. */}
                <span className="meta-chip !py-[3px] !text-[12px]">{court.surface}</span>
              </div>
            </div>
          </header>

          {/* Tag chips STAY too — same component, same scrolling row as unlocked. */}
          <div className="mt-3.5">
            <div className={column}>
              <CourtDetailTagStrip tags={court.tags} />
            </div>
          </div>

          {/* Description: the real (public) blurb, visually blurred, with no "Read more"
              control — see CourtDetailBlurredDescription for why this is decoration and
              how it is presented to a screen reader. */}
          <div className={`${gutter} mt-4`}>
            <div className={column}>
              <CourtDetailBlurredDescription blurb={court.blurb} />
            </div>
          </div>

          <div className={`${gutter} my-5`}>
            <div className={`${column} h-px bg-hairline`} />
          </div>

          {/* Location, locked: the blurred APPROXIMATE map behind the lock overlay,
              "Address hidden", and the disabled "Unlock location" control. `approxLat` /
              `approxLng` are the always-public jittered coordinates — the exact pair is
              never fetched for this viewer and never reaches this component. `courtName`
              here is the MASKED string: it would feed a map marker's label, which the
              locked branch does not even plot, and must not carry the real name. */}
          <section className={gutter}>
            <div className={column}>
              <CourtDetailLocationPreview
                variant="v2"
                locked
                courtName={maskedControlName}
                approxLat={court.approxLat}
                approxLng={court.approxLng}
                exactLocation={null}
                heroImageUrl={court.heroImageUrl}
              />
            </div>
          </section>

          {/* Gallery strip — unchanged; the photographs are public. */}
          <section className="mt-5 md:px-[clamp(20px,4vw,64px)]">
            <div className={column}>
              <CourtDetailGalleryStrip />
            </div>
          </section>

          {/* The dark unlock card (prototype lines 1169–1176). It stands where the unlocked
              branch's review card would go — the prototype shows that card only when
              unlocked, and this one only when locked. */}
          <section className={`${gutter} mt-5`}>
            <div className={column}>
              <CourtDetailUnlockCard />
            </div>
          </section>

          {/* Nearby courts — the same strip as unlocked. Its cards apply their OWN masking
              rule (`courtDisplay`, off the public `isLocked` flag), which is independent of
              this page's entitlement result. */}
          {related.length > 0 ? (
            <section className="mt-5 md:px-[clamp(20px,4vw,64px)]">
              <div className={column}>
                <div className="mb-3 flex items-baseline justify-between px-5 md:px-0">
                  <h2 className="text-[16px] font-semibold text-ink">Nearby courts</h2>
                </div>
                <CourtDetailNearbyStrip courts={related} />
              </div>
            </section>
          ) : null}
        </article>
      </CourtDetailShell>
    </AppShell>
  );
}
