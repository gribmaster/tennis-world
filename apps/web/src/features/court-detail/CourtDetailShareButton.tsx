'use client';

import { useCallback, useState } from 'react';

// CourtDetailShareButton — the share control in the v2 hero's overlaid row
// (design_v2_stripped.html:1026, the second circular button beside the heart).
//
// PURELY LOCAL (CLAUDE.md §4 rule 10): this touches no repository, no API and no route.
// It hands the CURRENT PAGE URL to the platform share sheet when one exists
// (`navigator.share`), and otherwise copies that URL to the clipboard and shows a brief
// "Copied" acknowledgement. No pending primitive, no spinner — there is nothing in flight
// that the user is waiting on.
//
// It shares `window.location.href` — the court's own public page. It never receives, and
// so can never share, a coordinate or the entitled `directionsUrl`.
//
// The glyph slot is a fixed 16px box and the acknowledgement is a separate absolutely
// positioned bubble, so the control's 36×36 geometry never changes.

function ShareGlyph() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
    </svg>
  );
}

export interface CourtDetailShareButtonProps {
  /** The court name — used for the share sheet's title and the accessible label. */
  courtName: string;
  className?: string;
}

export function CourtDetailShareButton({ courtName, className }: CourtDetailShareButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleClick = useCallback(() => {
    const url = typeof window === 'undefined' ? '' : window.location.href;
    if (!url) return;

    // Platform share sheet where available (mobile Safari/Chrome, some desktops).
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      void navigator.share({ title: courtName, url }).catch(() => {
        // The user dismissing the sheet rejects the promise — not an error worth surfacing.
      });
      return;
    }

    // Fallback: copy the link and acknowledge briefly.
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard
        .writeText(url)
        .then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1600);
        })
        .catch(() => {
          // Clipboard blocked (permissions/insecure origin) — stay silent rather than
          // claiming a copy that didn't happen.
        });
    }
  }, [courtName]);

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={handleClick}
        aria-label={`Share ${courtName}`}
        title="Share"
        className={
          className ??
          'grid h-9 w-9 place-items-center rounded-pill bg-ink/40 text-paper backdrop-blur-[8px] transition-colors hover:bg-ink/55'
        }
      >
        <ShareGlyph />
      </button>
      {copied ? (
        <span
          role="status"
          className="pointer-events-none absolute right-0 top-[calc(100%+6px)] whitespace-nowrap rounded-pill bg-ink/80 px-2 py-1 text-[10px] font-medium text-paper backdrop-blur-[8px]"
        >
          Link copied
        </span>
      ) : null}
    </span>
  );
}
