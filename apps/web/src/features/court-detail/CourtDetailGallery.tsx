'use client';

import { useCallback, useMemo, useState, type KeyboardEvent } from 'react';
import type { CourtImageDTO } from '@tennis/contracts';
import { CourtImage } from '@/components/court';

// CourtDetailGallery — the lead image + thumbnail strip for the Court Detail page,
// ported from the gallery in the prototype's inline `CourtDetail` (map.html/home.html).
//
// PRESENTATIONAL & data-driven (Phase 1 §4): receives the court's images + name via
// props, renders from them only. No repository, no @tennis/mock-data, no fetching.
//
// INTERACTIVE (this change): a small `'use client'` gallery. The active image is
// local component state; clicking a thumbnail selects it, Prev/Next cycle (with
// wraparound), and ArrowLeft/ArrowRight do the same when the wrapper is focused.
// The props are unchanged, so the page (a server component) is untouched — it still
// passes `images` / `heroImageUrl` / `courtName` and renders this at the client
// boundary. Styling and the `CourtImage` framing are kept exactly as before.

export interface CourtDetailGalleryProps {
  /** The court's gallery images (CourtDTO.images). May be empty. */
  images: CourtImageDTO[];
  /** Fallback single image if `images` is empty (CourtDTO.heroImageUrl). */
  heroImageUrl: string;
  /** Court name, used for the lead image alt text. */
  courtName: string;
}

/** One resolved slide: a URL plus its (optional) authored alt text. */
interface Slide {
  url: string;
  alt?: string;
}

/**
 * Resolve the ordered, de-duplicated slide list from the court's images.
 * Hero-flagged image first, then by `sortOrder`, then declaration order. Duplicate
 * URLs are dropped so a hero that also appears in `images` isn't shown twice. When
 * there are no images we synthesize a single slide from `heroImageUrl` (which itself
 * may be empty — `CourtImage` then renders its real placeholder fallback).
 */
function resolveSlides(images: CourtImageDTO[], heroImageUrl: string): Slide[] {
  const ordered = [...images].sort((a, b) => {
    if (a.isHero !== b.isHero) return a.isHero ? -1 : 1;
    return a.sortOrder - b.sortOrder;
  });

  const seen = new Set<string>();
  const slides: Slide[] = [];
  for (const img of ordered) {
    if (seen.has(img.url)) continue;
    seen.add(img.url);
    slides.push({ url: img.url, alt: img.alt });
  }

  // No gallery images: fall back to the hero image as a single slide.
  if (slides.length === 0) {
    slides.push({ url: heroImageUrl, alt: undefined });
  }

  return slides;
}

export function CourtDetailGallery({ images, heroImageUrl, courtName }: CourtDetailGalleryProps) {
  const slides = useMemo(() => resolveSlides(images, heroImageUrl), [images, heroImageUrl]);
  const [activeIndex, setActiveIndex] = useState(0);

  // Guard the index against slide-count changes (e.g. re-render with fewer images).
  const safeIndex = activeIndex < slides.length ? activeIndex : 0;
  // `resolveSlides` always yields at least one slide, so this is never undefined.
  const active = slides[safeIndex] ?? slides[0]!;
  const hasMultiple = slides.length > 1;

  const goPrev = useCallback(() => {
    setActiveIndex((i) => (i - 1 + slides.length) % slides.length);
  }, [slides.length]);

  const goNext = useCallback(() => {
    setActiveIndex((i) => (i + 1) % slides.length);
  }, [slides.length]);

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (!hasMultiple) return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goPrev();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        goNext();
      }
    },
    [hasMultiple, goPrev, goNext],
  );

  // Meaningful main-image alt: authored alt when present, else a positional label.
  const activeAlt = active.alt?.trim() || `${courtName} court image ${safeIndex + 1}`;

  return (
    <div
      id="court-gallery"
      tabIndex={0}
      aria-label="Court image gallery"
      onKeyDown={onKeyDown}
      className="outline-none focus-visible:ring-2 focus-visible:ring-ink/40"
    >
      <div className="relative aspect-[16/10] overflow-hidden bg-ivory">
        <CourtImage
          src={active.url}
          alt={activeAlt}
          aspectClassName="aspect-[16/10]"
          withOverlay={false}
          priority
          sizes="(max-width: 1024px) 100vw, 66vw"
        />

        {hasMultiple ? (
          <>
            <button
              type="button"
              onClick={goPrev}
              aria-label="Previous image"
              className="absolute left-3 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-white/85 text-ink shadow-sm transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/50"
            >
              <span aria-hidden>‹</span>
            </button>
            <button
              type="button"
              onClick={goNext}
              aria-label="Next image"
              className="absolute right-3 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-white/85 text-ink shadow-sm transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/50"
            >
              <span aria-hidden>›</span>
            </button>
          </>
        ) : null}
      </div>

      {hasMultiple ? (
        <ul className="no-scrollbar mt-2.5 flex gap-2 overflow-x-auto">
          {slides.map((slide, i) => {
            const isActive = i === safeIndex;
            return (
              <li key={`${slide.url}-${i}`} className="shrink-0">
                <button
                  type="button"
                  onClick={() => setActiveIndex(i)}
                  aria-label={`Show image ${i + 1}`}
                  aria-current={isActive ? 'true' : undefined}
                  className={[
                    'block overflow-hidden rounded-sm transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/50',
                    isActive
                      ? 'opacity-100 ring-2 ring-ink'
                      : 'opacity-60 hover:opacity-100',
                  ].join(' ')}
                >
                  <CourtImage
                    src={slide.url}
                    alt=""
                    aspectClassName="h-12 w-[72px]"
                    withOverlay={false}
                    sizes="72px"
                  />
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
