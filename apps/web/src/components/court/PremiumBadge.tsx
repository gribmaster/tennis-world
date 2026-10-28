// PremiumBadge — the gold "Premium" badge the shared `CourtCard` shows in place of the
// surface chip when a court is masked for this viewer (TASK_56). Same gradient/shape as
// Home's existing "Premium" ribbon (HomeFeaturedCourts/CollectionCourtsGrid's inline
// badge) — that one goes away with Home in TASK_58, so it is left as-is rather than
// migrated to this component now.

function LockGlyph() {
  return (
    <svg
      width="9"
      height="9"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="4" y="10" width="16" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

export function PremiumBadge({ className }: { className?: string }) {
  return (
    <span
      className={[
        'inline-flex items-center gap-1 rounded-pill px-2.5 py-[3px] text-[9px] font-semibold uppercase tracking-caption text-paper',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ background: 'linear-gradient(135deg,#C8A860,#B89968)' }}
    >
      <LockGlyph />
      Premium
    </span>
  );
}
