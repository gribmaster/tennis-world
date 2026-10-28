import Image from 'next/image';
import type { CollectionDTO } from '@tennis/contracts';
import { BackButton } from '@/components/navigation';
import { CourtDetailShareButton } from '@/features/court-detail';
import { CollectionSaveHeart, type CollectionSaveState } from '@/features/collections';

// CollectionDetailHero — the hero for a single collection (/collections/[slug]).
//
// TASK_60 (v3) RESTYLED, not replaced: a full-bleed mobile hero under the pill nav (like
// Court Detail's), a framed, rounded desktop hero, and real share/save controls on the
// image itself at md+ (desktop ~line 789, mobile ~line 1142 of the respective v3
// prototype files). The old dark contained band + `BackButton`-only chrome is gone.
//
// BOTH `BackButton` INSTANCES LIVE HERE (CLAUDE.md §5) — the mobile pill overlay
// (`label="Collections"`) AND the desktop plain-text link above the frame
// (`label="Back to Collections"`), both `fallbackHref="/collections"`.
// `verify:ux-pending-states` reads THIS file for that pairing.
//
// SAVE STATE IS LIFTED (TASK_60): the hero's md+ heart and the mobile floating bar's
// heart (in `CollectionDetailShell`, the client wrapper that owns the shared
// `useCollectionSaveState()`) must never disagree, so this component takes the shared
// `saveState` as a prop rather than owning its own — exactly like `CourtDetailShell`'s
// hero/footer hearts share one `useCourtSaveState()`.
//
// PRESENTATIONAL & data-driven: renders only from fields on the `collection` DTO.
// `description` moved OUT of this hero and into the body (TASK_60 decision 1) — this
// component never renders it.

const DESKTOP_BACK_CLASSNAME =
  'eyebrow mb-[26px] hidden items-center gap-1.5 text-[13px] normal-case tracking-normal text-stone transition-colors hover:text-ink md:inline-flex';

const MOBILE_BACK_PILL_CLASSNAME =
  'eyebrow inline-flex h-9 items-center gap-1.5 rounded-pill bg-ink/40 px-3.5 text-paper backdrop-blur-[8px] transition-colors hover:bg-ink/55 disabled:opacity-70 md:hidden';

// Desktop share/save circle: 48px, `bg-paper/20` + `backdrop-blur-[8px]` + a
// `border-paper/40` ring (TASK_60 desktop spec).
const DESKTOP_CIRCLE_CLASSNAME =
  'flex h-12 w-12 shrink-0 items-center justify-center rounded-pill border border-paper/40 bg-paper/20 text-paper backdrop-blur-[8px] transition-colors hover:bg-paper/30';

export interface CollectionDetailHeroProps {
  collection: CollectionDTO;
  /** The shared save state (hero heart ↔ mobile bar heart) — see the file header. */
  saveState: CollectionSaveState;
  signedIn: boolean;
}

export function CollectionDetailHero({ collection, saveState, signedIn }: CollectionDetailHeroProps) {
  const countLabel = `${collection.count} ${collection.count === 1 ? 'court' : 'courts'}`;

  return (
    <>
      {/* Desktop-only Back link, above the frame (TASK_60 desktop spec: ~26px below the
          nav pill, matching Court Detail's own desktop back link). */}
      <BackButton
        fallbackHref="/collections"
        label="Back to Collections"
        className={DESKTOP_BACK_CLASSNAME}
      />

      {/* Frame: full-bleed on mobile (under the pill nav + the back pill below), framed
          and rounded at md+. */}
      <div className="relative h-[260px] overflow-hidden md:h-[320px] md:rounded-[24px] md:mb-9">
        <Image
          src={collection.coverImageUrl}
          alt=""
          fill
          priority
          sizes="(max-width: 768px) 100vw, 1240px"
          className="object-cover"
        />

        {/* Mobile overlay: v3's `.img-overlay-top` — keeps the nav pill AND the back pill
            legible against the photo. */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 md:hidden"
          style={{
            background:
              'linear-gradient(180deg, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0) 44%, rgba(0,0,0,0.78) 100%)',
          }}
        />
        {/* Desktop overlay: v3's `.img-overlay`. */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 hidden md:block"
          style={{
            background: 'linear-gradient(180deg, rgba(0,0,0,0) 40%, rgba(0,0,0,0.72) 100%)',
          }}
        />

        {/* Mobile back pill, over the hero (Court Detail's own offset: 72px from the top). */}
        <BackButton
          fallbackHref="/collections"
          label="Collections"
          className={`${MOBILE_BACK_PILL_CLASSNAME} absolute left-4 top-[72px]`}
        />

        <div className="absolute inset-x-5 bottom-4 md:inset-x-8 md:bottom-7 md:flex md:items-end md:justify-between">
          <div>
            <span className="inline-flex rounded-pill bg-ink/50 px-2.5 py-[3px] text-[9px] font-semibold uppercase tracking-[0.1em] text-paper backdrop-blur-[8px] md:px-3 md:py-1 md:text-[10px]">
              {countLabel}
            </span>
            <h1 className="serif mt-2 text-[30px] font-normal leading-[1.1] text-paper md:mt-2.5 md:text-[42px]">
              {collection.name}
            </h1>
          </div>

          {/* md+ only: share + save, over the hero image. */}
          <div className="hidden gap-2.5 md:flex">
            <CourtDetailShareButton courtName={collection.name} className={DESKTOP_CIRCLE_CLASSNAME} />
            <CollectionSaveHeart
              collectionId={collection.id}
              collectionSlug={collection.slug}
              collectionLabel={collection.name}
              initialSaved={saveState.saved}
              signedIn={signedIn}
              state={saveState}
              size={18}
              className={DESKTOP_CIRCLE_CLASSNAME}
              idleColorClassName="text-paper"
            />
          </div>
        </div>
      </div>
    </>
  );
}
