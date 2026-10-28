import type { UserCollectionDTO } from '@tennis/contracts';
import { PendingLink } from '@/components/navigation';
import { SavedCollectionRow } from '@/features/saved';

// ProfileCollectionsStrip — the Profile screen's "My collections" strip (TASK_14 point
// 5; restyled TASK_61 §1): the user's OWN wishlist folders (`UserCollectionDTO[]`, from
// `getSavedCollections()` — the SAME read the page already makes for the stats strip's
// Collections count), two layouts for the same single `<ul>`:
//   • mobile: a horizontal-scroll row of `SavedCollectionRow variant="tall"` cards
//     (200×240 cells), matching HomeCollectionsTeaser's strip shape.
//   • md+: a 2-column grid, up to the first 4 folders (v3 `slice(0,4)` — mobile may
//     still scroll the full list).
//
// "View all →" opens Saved's COLLECTIONS tab (`/saved?tab=collections`), not the default
// Courts tab it used to — that's where these folders actually live.
//
// ZERO COLLECTIONS: a deliberate empty state (not an omitted section, not a blank
// strip) — a short prompt + a link into /saved where a folder is actually created (this
// screen has no create-folder control of its own).

export interface ProfileCollectionsStripProps {
  collections: UserCollectionDTO[];
}

export function ProfileCollectionsStrip({ collections }: ProfileCollectionsStripProps) {
  return (
    <section className="mt-9">
      <div className="mb-3 flex items-baseline justify-between gap-4 md:mb-4">
        <h2 className="text-[16px] font-semibold text-ink md:text-[17px]">My collections</h2>
        {collections.length > 0 ? (
          <PendingLink
            href="/saved?tab=collections"
            className="body-s shrink-0 text-stone transition-colors hover:text-ink"
          >
            View all →
          </PendingLink>
        ) : null}
      </div>

      {collections.length === 0 ? (
        <div className="rounded-lg bg-paper px-5 py-8 text-center">
          <p className="body-m text-graphite">You haven’t started a collection yet.</p>
          <PendingLink href="/saved" className="body-s mt-2 inline-block text-ink underline underline-offset-2">
            Start one from Saved
          </PendingLink>
        </div>
      ) : (
        <ul className="no-scrollbar -mr-[clamp(0px,4vw,24px)] flex gap-3 overflow-x-auto pb-1 md:mr-0 md:grid md:grid-cols-2 md:gap-4 md:overflow-visible">
          {collections.map((collection, index) => (
            <li
              key={collection.id}
              className={[
                'h-[240px] w-[200px] shrink-0 md:h-[180px] md:w-auto',
                index >= 4 ? 'md:hidden' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <SavedCollectionRow collection={collection} variant="tall" />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
