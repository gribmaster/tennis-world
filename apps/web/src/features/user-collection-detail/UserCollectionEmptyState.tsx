import Link from 'next/link';

// UserCollectionEmptyState — shown when a wishlist folder has no member courts.
// Ported from files/collection.html's empty branch ("This collection is empty." +
// a line pointing to "Add to Collection" + an "Explore the Map" CTA).
//
// PRESENTATIONAL only — no props, no repository, no @tennis/mock-data. The CTA links
// to the existing /map route so the empty folder is a path forward, not a dead-end.
//
// NOTE: the "Add to Collection" affordance the copy references is a later-feature
// mutation; this component only states it — it renders no add/remove control.

function ArrowRightGlyph() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

export function UserCollectionEmptyState() {
  return (
    <div className="flex flex-col items-center px-5 py-section-xl text-center">
      <h2 className="display-m text-ink">This collection is empty.</h2>
      <p className="body-l mt-3 max-w-[460px] text-stone">
        Add courts from any court page using “Add to Collection.”
      </p>
      <Link href="/map" className="btn btn-primary mt-8 inline-flex">
        Explore the Map
        <ArrowRightGlyph />
      </Link>
    </div>
  );
}
