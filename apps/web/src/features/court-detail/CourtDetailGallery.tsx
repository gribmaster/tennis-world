'use client';

import { useCallback, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';
import Image from 'next/image';
import type { CourtImageDTO } from '@tennis/contracts';
import { CourtDetailGalleryLightbox } from './CourtDetailGalleryLightbox';
import { FALLBACK_IMAGE, GalleryContext, useGallery, type GalleryContextValue, type Slide } from './gallery-context';
import { useHorizontalSwipe } from './use-horizontal-swipe';

// CourtDetailGallery — the Court Detail image gallery, rebuilt to the v2 prototype
// (design_v2_stripped.html `CourtDetailScreen`, lines 1013–1049 for the hero band and
// 1116–1125 for the "Gallery" thumbnail strip).
//
// WHAT SURVIVED THE REDESIGN (this component pre-dates Feature 78):
//   • `resolveSlides` — the hero-first / sortOrder / de-duplicated slide resolution,
//     and its `heroImageUrl` single-slide fallback. Unchanged, it is the data rule.
//   • The `activeIndex` client state, its `safeIndex` guard against a shrinking slide
//     list, and the ArrowLeft/ArrowRight keyboard navigation with wraparound.
//   • The props (`images`, `heroImageUrl`, `courtName`) — the page still passes exactly
//     these, so the server boundary is untouched. Feature 79 added one OPTIONAL prop,
//     `courtLabel`: the name as DISPLAYED, which the thumbnail buttons use for their
//     accessible names so the locked page's masked title cannot leak through the
//     accessibility tree. Image ALT text still uses the real `courtName` — an alt
//     describes the photograph and is not one of the masked surfaces.
//
// WHAT WAS REWRITTEN: all of the chrome. The old 16/10 framed image + prev/next arrow
// buttons + inline thumbnail rail became the prototype's full-bleed 320px hero band with
// the top-and-bottom overlay gradient, the overlaid control row, the "N / M" counter chip,
// the "All photos" affordance, the dot pager whose active dot widens to 20px, and a
// SEPARATE "Gallery" thumbnail strip that lives further down the page.
//
// WHY IT SPLIT INTO THREE EXPORTS: in the v2 layout the hero band and the thumbnail strip
// are no longer adjacent — the title, tags, description and location block sit between
// them — but they share one `activeIndex`. So the state moved into a provider
// (`CourtDetailGalleryProvider`) that the page wraps around that whole region, and the two
// rendered pieces (`CourtDetailGalleryHero`, `CourtDetailGalleryStrip`) read it from
// context. There is still exactly ONE gallery.
//
// PURELY LOCAL UI (CLAUDE.md §4 rule 10): dots, thumbnails and the "All photos" control
// only change which image is displayed. No navigation, no mutation, no API call — so no
// pending primitive, no spinner, and no `disabled` state.
//
// PRESENTATIONAL & data-driven: props only. No repository, no @tennis/mock-data, no
// fetching. It never receives or renders a coordinate.
//
// TASK 18: the hero band now also accepts a horizontal drag/swipe (Pointer Events) that
// drives the same `goPrev`/`goNext` the dots already implement — see `useHorizontalSwipe`
// below, shared with the new `CourtDetailGalleryLightbox`. The thumbnail strip no longer
// writes to the shared `activeIndex` on click: it opens the lightbox (its OWN local state)
// at the clicked photo instead, so the hero band is never affected by the strip.

export interface CourtDetailGalleryProps {
  /** The court's gallery images (CourtDTO.images). May be empty. */
  images: CourtImageDTO[];
  /** Fallback single image if `images` is empty (CourtDTO.heroImageUrl). */
  heroImageUrl: string;
  /** Court name, used for the lead image alt text. */
  courtName: string;
}

/**
 * Resolve the ordered, de-duplicated slide list from the court's images.
 * Hero-flagged image first, then by `sortOrder`, then declaration order. Duplicate
 * URLs are dropped so a hero that also appears in `images` isn't shown twice. When
 * there are no images we synthesize a single slide from `heroImageUrl` (which itself
 * may be empty — the frame then renders the shared placeholder fallback).
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

export interface CourtDetailGalleryProviderProps extends CourtDetailGalleryProps {
  /**
   * The DISPLAYED court name, for the thumbnail buttons' accessible names. Omitted ⇒
   * `courtName` (Feature 78's behaviour, unchanged for the unlocked page).
   */
  courtLabel?: string;
  children: ReactNode;
}

/**
 * Holds the shared active-image state for the hero band and the thumbnail strip, which
 * the v2 layout separates by several sections. Wrap the whole Court Detail body in it.
 */
export function CourtDetailGalleryProvider({
  images,
  heroImageUrl,
  courtName,
  courtLabel,
  children,
}: CourtDetailGalleryProviderProps) {
  const slides = useMemo(() => resolveSlides(images, heroImageUrl), [images, heroImageUrl]);
  const [activeIndex, setActiveIndex] = useState(0);

  // Guard the index against slide-count changes (e.g. re-render with fewer images).
  const safeIndex = activeIndex < slides.length ? activeIndex : 0;

  const value = useMemo<GalleryContextValue>(
    () => ({ slides, activeIndex: safeIndex, setActiveIndex, courtName, courtLabel: courtLabel ?? courtName }),
    [slides, safeIndex, courtName, courtLabel],
  );

  return <GalleryContext.Provider value={value}>{children}</GalleryContext.Provider>;
}

function ImageGlyph({ size = 12 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  );
}

export interface CourtDetailGalleryHeroProps {
  /**
   * The overlaid control row's left slot — the shared `BackButton` (CLAUDE.md §5). The
   * page owns it so the harness-asserted `fallbackHref="/map"` / label `Courts` pairing
   * stays in page.tsx.
   */
  backControl?: ReactNode;
  /** The overlaid control row's right slot — the save + share controls. */
  actions?: ReactNode;
}

/**
 * The full-bleed hero band: prototype `height:320` (line 1014), the `.img-overlay-top`
 * gradient (line 88), the overlaid control row, the "N / M" counter chip and "All photos"
 * affordance (lines 1032–1039), and the dot pager whose active dot widens (lines 1041–1046).
 */
export function CourtDetailGalleryHero({ backControl, actions }: CourtDetailGalleryHeroProps) {
  const { slides, activeIndex, setActiveIndex, courtName } = useGallery();
  const active = slides[activeIndex] ?? slides[0]!;
  const hasMultiple = slides.length > 1;

  const goPrev = useCallback(() => {
    setActiveIndex((activeIndex - 1 + slides.length) % slides.length);
  }, [activeIndex, setActiveIndex, slides.length]);

  const goNext = useCallback(() => {
    setActiveIndex((activeIndex + 1) % slides.length);
  }, [activeIndex, setActiveIndex, slides.length]);

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

  // Drag left ⇒ next, drag right ⇒ prev — same wraparound as the dots/keyboard above.
  const onPointerDown = useHorizontalSwipe(hasMultiple, goNext, goPrev);

  // Meaningful main-image alt: authored alt when present, else a positional label.
  const activeAlt = active.alt?.trim() || `${courtName} court image ${activeIndex + 1}`;

  return (
    <div
      id="court-gallery"
      tabIndex={0}
      aria-label="Court image gallery"
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      // Prototype `height:320`; allowed to grow on wide screens so the band doesn't read
      // as a letterbox strip on desktop, the same hedge HomeHero makes. `touch-pan-y` lets
      // the browser keep handling vertical scroll natively while the swipe hook above owns
      // horizontal drag (only `preventDefault`s once a drag commits, so a plain tap on any
      // overlaid control below is unaffected).
      className="relative h-[320px] w-full touch-pan-y overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-paper/70 md:h-[clamp(320px,42vw,480px)]"
    >
      <Image
        // Keyed so a slide change remounts the element and re-runs the fade-in
        // (prototype `key={imgIdx} className="fade-in"`, line 1015).
        key={active.url}
        src={active.url || FALLBACK_IMAGE}
        alt={activeAlt}
        fill
        priority
        sizes="100vw"
        className="animate-[tw-fade-in_300ms_ease_both] object-cover"
      />

      {/* `.img-overlay-top` (prototype line 88), stop for stop: dark at the top so the
          transparent AppHeader and the control row stay legible, clear through the
          middle, heavy at the bottom for the counter/pager chrome. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0) 44%, rgba(0,0,0,0.78) 100%)',
        }}
      />

      {/* Overlaid control row. The prototype also draws a wordmark here (line 1021) — in
          the real app that is AppHeader, rendered transparently over this band via
          AppShell's `overHero`, so building a second one here is deliberately skipped.
          Its fake iOS StatusBar (line 1017) is discarded outright (intake §4).
          Offset below the 72px AppHeader so the two rows never collide. */}
      <div className="absolute inset-x-0 top-[72px] flex items-center justify-between gap-3 px-4 md:px-[clamp(20px,4vw,64px)]">
        <div className="flex items-center">{backControl}</div>
        <div className="flex items-center gap-2">{actions}</div>
      </div>

      {/* Counter chip, bottom-left (prototype lines 1032–1037). */}
      <div className="pointer-events-none absolute bottom-3 left-4 flex items-center gap-1 rounded-pill bg-ink/50 px-2.5 py-1 text-paper backdrop-blur-[8px] md:left-[clamp(20px,4vw,64px)]">
        <ImageGlyph />
        <span className="text-[11px] font-medium">
          {activeIndex + 1} / {slides.length}
        </span>
      </div>

      {/* "All photos" — scrolls to the Gallery strip further down the page. A same-page
          anchor, not navigation, so no pending primitive (§4 rule 10). */}
      <a
        href="#court-gallery-strip"
        className="absolute bottom-3 right-4 inline-flex items-center gap-[5px] rounded-pill bg-ink/50 px-2.5 py-1 text-[10px] font-medium text-paper backdrop-blur-[8px] transition-colors hover:bg-ink/65 md:right-[clamp(20px,4vw,64px)]"
      >
        <ImageGlyph size={11} />
        All photos
      </a>

      {/* Dot pager (prototype lines 1041–1046): 6px dots, the active one widening to 20px
          over 200ms. Real buttons, not the prototype's clickable <div>s. */}
      {hasMultiple ? (
        <div className="absolute inset-x-0 bottom-[50px] flex justify-center gap-[5px]">
          {slides.map((slide, i) => {
            const isActive = i === activeIndex;
            return (
              <button
                key={`${slide.url}-${i}`}
                type="button"
                onClick={() => setActiveIndex(i)}
                aria-label={`Show image ${i + 1} of ${slides.length}`}
                aria-current={isActive ? 'true' : undefined}
                className={[
                  'h-[6px] rounded-[3px] bg-paper/90 transition-[width] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-paper',
                  isActive ? 'w-5' : 'w-[6px]',
                ].join(' ')}
              />
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

/**
 * The "Gallery" thumbnail strip (prototype lines 1116–1125): 90×72 thumbs in a
 * horizontally scrolling row, the one matching the hero's current image at full opacity
 * with an ink border.
 *
 * TASK 18: clicking a thumbnail no longer touches the shared `activeIndex` — it used to
 * call the same `setActiveIndex` the hero's dots use, which silently re-pointed the hero
 * band instead of opening anything. It now opens `CourtDetailGalleryLightbox` at the
 * clicked photo via its OWN local state (`lightboxIndex`, below); the hero band is
 * unaffected by opening, navigating within, or closing it. `isActive`/`aria-current` still
 * read the shared `activeIndex` — purely a read, to keep showing which thumbnail matches
 * the hero's current photo.
 */
export function CourtDetailGalleryStrip() {
  // `courtLabel`, NOT `courtName`: these are CONTROLS, and their accessible names must
  // say what the page displays. The images' own alt text (the hero, above) keeps the real
  // name — an alt describes the photograph, it is not a masked surface.
  const { slides, activeIndex, courtLabel } = useGallery();
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  if (slides.length < 2) return null;

  return (
    <div id="court-gallery-strip" className="scroll-mt-[88px]">
      <h2 className="mb-3 px-5 text-[16px] font-semibold text-ink md:px-0">Gallery</h2>
      <ul className="no-scrollbar flex gap-2 overflow-x-auto px-5 pb-[2px] md:px-0">
        {slides.map((slide, i) => {
          const isActive = i === activeIndex;
          return (
            <li key={`${slide.url}-${i}`} className="shrink-0">
              <button
                type="button"
                onClick={() => setLightboxIndex(i)}
                aria-label={`Show ${courtLabel} image ${i + 1}`}
                aria-current={isActive ? 'true' : undefined}
                className={[
                  // Fixed 90×72 box (prototype `.gallery-thumb`) — the border is always
                  // 2px, only its colour changes, so selecting never reflows the row.
                  'relative block h-[72px] md:h-[150px] w-[90px] md:w-[150px] overflow-hidden rounded-md border-2 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/50',
                  isActive ? 'border-ink opacity-100' : 'border-transparent opacity-75 hover:opacity-100',
                ].join(' ')}
              >
                <Image
                  src={slide.url || FALLBACK_IMAGE}
                  alt=""
                  fill
                  sizes="90px"
                  className="object-cover"
                />
              </button>
            </li>
          );
        })}
      </ul>

      <CourtDetailGalleryLightbox
        open={lightboxIndex !== null}
        initialIndex={lightboxIndex ?? 0}
        onClose={() => setLightboxIndex(null)}
      />
    </div>
  );
}
