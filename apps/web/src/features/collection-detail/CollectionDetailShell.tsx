'use client';

import type { ReactNode } from 'react';
import type { CollectionDTO } from '@tennis/contracts';
import { PendingLink } from '@/components/navigation';
import { PaywallTrigger } from '@/features/paywall';
import { CourtDetailShareButton } from '@/features/court-detail';
import { CollectionSaveHeart, useCollectionSaveState } from '@/features/collections';
import { CollectionDetailHero } from './CollectionDetailHero';

// CollectionDetailShell — the CLIENT shell for Collection Detail (TASK_60). It exists for
// exactly one reason: the save control appears TWICE (the desktop hero heart, inside
// `CollectionDetailHero`, and the mobile floating action bar's heart, built here) and the
// two must never disagree. Both render off ONE `useCollectionSaveState()` call made here
// and passed down — mirrors `CourtDetailShell`'s reason for existing.
//
// IT OWNS NO DATA. `collection`, `signedIn`, `initialSaved` and `mapCta` all arrive as
// PROPS from `app/collections/[slug]/page.tsx`, which is still the only repository
// boundary on this screen. `children` is the SERVER-rendered description/divider/courts
// grid (`app/collections/[slug]/page.tsx` composes it) — this shell only decides where it
// sits; it never builds that content itself.
//
// MAP CTA (TASK_60 decision 7): `mapCta` is computed ONCE in page.tsx from
// `courtDisplay(...).masked` + `signedIn` and handed down as a plain string — this shell
// only renders the three card/button readings, it never re-derives entitlement.
//
// LAYOUT: the hero sits ABOVE a two-column body (not as a grid column itself, unlike
// Court Detail's shell) — `children` (col 1) and the sticky map card (col 2, md+ only)
// are the two grid items; the mobile floating bar is a THIRD, separate sibling outside
// the `max-w-[1240px]` container, exactly like Court Detail's own floating bar.

export type CollectionMapCta = 'guest' | 'unlock' | 'map';

const MAP_CTA_COPY: Record<CollectionMapCta, { title: string; text: string; label: string }> = {
  guest: {
    title: 'See it on the map',
    text: 'Sign in to explore these courts on the map.',
    label: 'Sign in to view the map',
  },
  unlock: {
    title: 'Unlock the full atlas',
    text:
      'Premium courts in this collection stay hidden — names, locations and map pins — until you unlock full access.',
    label: 'Unlock Full Access',
  },
  map: {
    title: 'See it on the map',
    text: 'Explore these courts, and every other court in the atlas, on the map.',
    label: 'Show the map',
  },
};

/** The one primary-action control, rendered at a given render site's shape. */
function MapCtaButton({ mapCta, className }: { mapCta: CollectionMapCta; className: string }) {
  const { label } = MAP_CTA_COPY[mapCta];

  if (mapCta === 'guest') {
    return (
      <PendingLink href="/signin?redirectTo=/map" className={className}>
        {label}
      </PendingLink>
    );
  }
  if (mapCta === 'unlock') {
    return (
      <PaywallTrigger source="collection-detail" className={className}>
        {label}
      </PaywallTrigger>
    );
  }
  return (
    <PendingLink href="/map" className={className}>
      {label}
    </PendingLink>
  );
}

// Mobile floating-bar circle: 48px, `bg-ink/5`, no border — identical to Court Detail's
// own `MOBILE_CIRCLE`.
const MOBILE_CIRCLE_CLASSNAME =
  'grid h-12 w-12 shrink-0 place-items-center rounded-pill bg-ink/5 text-ink transition-colors hover:bg-ink/10';

export interface CollectionDetailShellProps {
  collection: CollectionDTO;
  signedIn: boolean;
  /** Server-computed saved state, seeding the shared toggle. */
  initialSaved: boolean;
  mapCta: CollectionMapCta;
  /** The description/divider/courts-grid body — SERVER content from page.tsx. */
  children: ReactNode;
}

export function CollectionDetailShell({
  collection,
  signedIn,
  initialSaved,
  mapCta,
  children,
}: CollectionDetailShellProps) {
  // ONE save state, both heart instances. See the header note.
  const saveState = useCollectionSaveState({
    collectionId: collection.id,
    collectionSlug: collection.slug,
    initialSaved,
    signedIn,
  });

  const { title, text } = MAP_CTA_COPY[mapCta];

  return (
    <>
      {/* TASK_60: `overHero` stays, so this wrapper adds back the nav-offset top padding
          at md+ only — the hero is no longer full-bleed under the floating pill there
          (same reasoning as `CourtDetailShell`). */}
      <div className="md:pt-[var(--nav-offset)]">
        <div className="mx-auto w-full max-w-[1240px] md:px-14 md:pb-20">
          <CollectionDetailHero collection={collection} saveState={saveState} signedIn={signedIn} />

          <div className="md:grid md:grid-cols-[1fr_320px] md:items-start md:gap-12">
            {/* The "white card" — a real box at mobile (background/rounded top/negative
                margin overlap onto the hero, with bottom room for the floating bar), flat
                at md+ where it's just the grid's column-1 content. */}
            <div className="relative -mt-4 rounded-t-[20px] bg-paper pb-[112px] md:mt-0 md:rounded-none md:bg-transparent md:pb-0">
              {children}
            </div>

            {/* Desktop-only sticky map card, column 2. */}
            <div className="hidden md:sticky md:top-[calc(var(--nav-offset)+20px)] md:block">
              <div className="rounded-[16px] bg-paper p-6 shadow-[0_2px_16px_rgba(15,15,15,0.06)]">
                <p className="serif text-[20px] font-normal text-ink">{title}</p>
                <p className="mb-[18px] mt-2 text-[13px] leading-[1.5] text-stone">{text}</p>
                <MapCtaButton mapCta={mapCta} className="btn btn-primary w-full justify-center" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Floating glass action bar (TASK_60), mobile only — must be the last child of the
          page wrapper so it pins while scrolling and releases above the shared Footer
          (CLAUDE.md §4 rule 4), exactly like Court Detail's own bar. */}
      <div className="glass-surface sticky bottom-[18px] z-30 mx-4 flex items-center gap-2 rounded-pill p-[7px] pb-[calc(7px+env(safe-area-inset-bottom))] shadow-[0_16px_40px_rgba(15,15,15,0.18),0_2px_10px_rgba(15,15,15,0.08)] md:hidden">
        <MapCtaButton mapCta={mapCta} className="btn btn-primary flex-1 justify-center rounded-pill !h-12" />
        <CourtDetailShareButton courtName={collection.name} className={MOBILE_CIRCLE_CLASSNAME} />
        <CollectionSaveHeart
          collectionId={collection.id}
          collectionSlug={collection.slug}
          collectionLabel={collection.name}
          initialSaved={initialSaved}
          signedIn={signedIn}
          state={saveState}
          size={18}
          className={MOBILE_CIRCLE_CLASSNAME}
          idleColorClassName="text-ink"
        />
      </div>
    </>
  );
}
