import type { UserCollectionDTO } from '@tennis/contracts';
import { PendingLink } from '@/components/navigation';
import { SavedCollectionRow } from '@/features/saved';

// ProfileCollectionsStrip — the Profile screen's "My collections" strip (TASK_14 point
// 5), ported from the v2 prototype's ProfileScreen (`new design/
// tennis_world_v2_standalone.html` lines 1452-1470): a horizontally-scrolling row of
// the user's OWN wishlist folders (`UserCollectionDTO[]`, from `getSavedCollections()`
// — the SAME read the page already makes for the stats strip's Collections count).
//
// Reuses `SavedCollectionRow` (features/saved) unchanged — the card treatment,
// PendingCardLink navigation, and the designed empty-folder art for a folder with no
// `coverImageUrls` are all identical to the Saved → Collections tab; this strip just
// lays a horizontal-scroll row of them, matching HomeCollectionsTeaser's strip shape.
//
// ZERO COLLECTIONS: a deliberate empty state (not an omitted section, not a blank
// strip) — a short prompt + a link into /saved where a folder is actually created (this
// screen has no create-folder control of its own).

export interface ProfileCollectionsStripProps {
  collections: UserCollectionDTO[];
}

export function ProfileCollectionsStrip({ collections }: ProfileCollectionsStripProps) {
  return (
    <section className="mt-8">
      <div className="mb-3 flex items-baseline justify-between gap-4">
        <h2 className="text-[16px] font-semibold text-ink">My collections</h2>
        {collections.length > 0 ? (
          <PendingLink href="/saved" className="body-s shrink-0 text-stone transition-colors hover:text-ink">
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
        <ul className="no-scrollbar -mr-[clamp(0px,4vw,24px)] flex gap-3 overflow-x-auto pb-1">
          {collections.map((collection) => (
            <li key={collection.id} className="w-[150px] shrink-0">
              <SavedCollectionRow collection={collection} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
