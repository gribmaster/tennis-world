// HeartIcon — the ONE heart glyph for every "save this court to favourites" control
// (TASK_69). Reference: the path/stroke that used to live only in CourtSaveButton's
// local `HeartGlyph`. `filled` toggles the saved look (currentColor fill vs none); the
// host control supplies color via `currentColor` (text-* className) as before.

export interface HeartIconProps {
  filled: boolean;
  size?: number;
  className?: string;
}

export function HeartIcon({ filled, size = 16, className }: HeartIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="2.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}
