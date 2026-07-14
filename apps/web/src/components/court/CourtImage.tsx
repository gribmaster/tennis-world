import Image from 'next/image';
import type { ReactNode } from 'react';

// CourtImage — the framed, cover-cropped hero/court photo used by CourtCard (and
// reusable by the future Court Detail gallery). It owns three things the prototypes
// always pair with court photography:
//   • a fixed aspect ratio so cards tile evenly in a grid/carousel,
//   • `object-cover` so images never distort,
//   • the bottom-up darkening gradient (`.img-overlay` in the prototypes) that keeps
//     white overlay text legible against any photo.
//
// It is purely presentational and data-agnostic: it receives a `src`/`alt` string,
// never a court object, so it can frame any image. Overlay content (name, badges,
// save heart) is passed in as `children` and positioned by the caller — this keeps
// CourtImage free of court-specific layout.
//
// Uses `next/image` with `fill` (court image URLs are root-relative local paths
// under `/placeholders/…`, served from apps/web/public); the parent sets the box,
// this fills it. If a caller passes an empty/missing `src`, we fall back to a real
// placeholder file so the frame is never blank or broken.

/** Fallback used when a court has no image. A real file in public/placeholders. */
const FALLBACK_IMAGE = '/placeholders/ben-hershey-K9HgyI3qmqA-unsplash.jpg';

export interface CourtImageProps {
  src: string;
  alt: string;
  /** Tailwind aspect-ratio utility, e.g. `aspect-[4/5]` (default) or `aspect-[3/2]`. */
  aspectClassName?: string;
  /**
   * Bottom-up dark gradient for overlay-text legibility. On by default; turn off
   * when the image stands alone with no text over it.
   */
  withOverlay?: boolean;
  /** `sizes` hint for responsive loading; defaults to a sensible card width. */
  sizes?: string;
  /** Whether to prioritize loading (above-the-fold hero usage). */
  priority?: boolean;
  /** Absolutely-positioned overlay content (eyebrow, name, badges, save heart). */
  children?: ReactNode;
  className?: string;
}

export function CourtImage({
  src,
  alt,
  aspectClassName = 'aspect-[4/5]',
  withOverlay = true,
  sizes = '(max-width: 768px) 80vw, (max-width: 1280px) 33vw, 400px',
  priority = false,
  children,
  className,
}: CourtImageProps) {
  const classes = ['relative overflow-hidden', aspectClassName, className ?? '']
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes}>
      <Image
        src={src || FALLBACK_IMAGE}
        alt={alt}
        fill
        sizes={sizes}
        priority={priority}
        // Slow zoom on hover mirrors `.court-card:hover img { scale(1.04) }`.
        className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04]"
      />
      {withOverlay ? (
        <div
          aria-hidden
          // `.img-overlay`: transparent → 72% black bottom-up.
          className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent from-40% to-black/70"
        />
      ) : null}
      {children}
    </div>
  );
}
