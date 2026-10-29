'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { PendingCardLink } from '@/components/navigation';

// Autoplay interval (TASK_67). The cross-fade (400ms) and the pill glide (350ms) both
// fit comfortably inside it.
const HERO_AUTOPLAY_MS = 3500;

// HomeHero — the v3 "Atlas" hero carousel (TASK_58). Replaces the v2 fixed-image band
// entirely: a floating, inset card over the page background with 4 cross-fading court
// photos, a giant serif "ATLAS" title, and a place pill + dot pagination.
//
// Ported from both v3 prototypes' `HomeScreen` hero (values only, not scaffolding):
//   • desktop: tennis_world_desktop_standalone4.html HomeScreen, ~line 292
//   • mobile:  tennis_world_v17_standalone.html HomeScreen, ~line 368
//
// DATA: the page (`app/page.tsx`) picks the 4 slides SERVER-SIDE (unlocked courts,
// featured first) and hands this component only what it needs to render — never the
// whole court list. See that file's `selectHeroSlides` for the selection rule and its
// safety net for the odd case where the catalogue has no unlocked courts at all.
//
// INTERACTIVITY WITHOUT NESTING (CLAUDE.md §4): the whole card is a `PendingCardLink` to
// the current slide's court page. The place pill (advances the slide) and the dots
// (jump to a slide) are rendered as SIBLINGS of that link, positioned with `z-10`, never
// inside the anchor — clicking either must not navigate, and there is no `<button>`
// inside an `<a>` anywhere in this tree. The pill/dots are purely local UI (no
// network/navigation), so neither uses a `Pending*` primitive (CLAUDE.md §4 rule 10).
//
// CROSS-FADE: all 4 images render stacked (`absolute inset-0`), the active one at
// `opacity-100`, the rest at `opacity-0`, transitioning over ~400ms. Nothing unmounts on
// slide change, so there is no remount flash. `motion-reduce:` disables the transition
// for `prefers-reduced-motion` visitors.
//
// ARROWS + AUTOPLAY (TASK_67): prev/next arrow buttons are additional siblings of the
// `PendingCardLink`, same reasoning as the pill/dots above. Autoplay schedules one
// `setTimeout` per slide (effect keyed on `[index, enabled]`), so any index change —
// arrow, dot, pill, or autoplay itself — restarts the 1500ms countdown. `enabled` folds
// in reduced-motion, page visibility, viewport intersection, "all images loaded", and a
// `paused` flag driven by pointer/focus interaction on the card (see handlers below).

export interface HomeHeroSlide {
  /** Court slug — the hero card navigates to `/courts/{slug}`. */
  slug: string;
  /** `court.heroImageUrl`, resolved server-side. */
  imageUrl: string;
  /** Place pill text — `court.region` (falls back to `court.country`), or "Premium" for
   *  the masked safety-net case. Rendered uppercase via CSS, not uppercased in data. */
  place: string;
  /** Accessible name for the card link — the court's real name, or "Premium Court". */
  alt: string;
}

export interface HomeHeroProps {
  slides: HomeHeroSlide[];
}

/** The prototype's crossed-racket crest mark (`<svg viewBox="0 0 40 40">`). */
function CrestMark({ size, strokeWidth }: { size: number; strokeWidth: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      stroke="#fff"
      strokeWidth={strokeWidth}
      aria-hidden
    >
      <g transform="rotate(-25 20 20)">
        <ellipse cx="20" cy="12" rx="8" ry="10" />
        <line x1="20" y1="22" x2="20" y2="34" />
      </g>
      <g transform="rotate(25 20 20)">
        <ellipse cx="20" cy="12" rx="8" ry="10" />
        <line x1="20" y1="22" x2="20" y2="34" />
      </g>
    </svg>
  );
}

/** Chevron glyph for the prev/next arrows — same visual weight as the crest. */
function ChevronGlyph({ direction }: { direction: 'left' | 'right' }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d={direction === 'left' ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'}
      />
    </svg>
  );
}

/**
 * One pagination dot — absolutely positioned inside the sliding row at `x` (a CSS
 * `calc()` expression referencing the row's `--slot`/`--pill-w` custom properties; see
 * the row's comment below). The dot under the active slide stays mounted (never
 * removed) so the pill can glide back off it without a remount flash — it just goes
 * `opacity: 0`, `pointer-events: none`, and drops out of the tab order (TASK_66).
 */
function PaginationDot({
  x,
  hidden,
  onClick,
  label,
}: {
  x: string;
  hidden: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-hidden={hidden || undefined}
      tabIndex={hidden ? -1 : undefined}
      style={{
        transform: `translateX(${x})`,
        opacity: hidden ? 0 : 1,
        pointerEvents: hidden ? 'none' : undefined,
      }}
      className="group absolute left-0 top-0 flex h-full w-[var(--slot)] items-center justify-center [transition:transform_350ms_cubic-bezier(0.4,0,0.2,1),opacity_200ms_ease] motion-reduce:[transition:none]"
    >
      <span
        aria-hidden
        className="h-[6px] w-[6px] rounded-full bg-white/60 transition-colors group-hover:bg-white/95"
      />
    </button>
  );
}

export function HomeHero({ slides }: HomeHeroProps) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  // Conservative defaults so the server render and the first client render match
  // exactly (TASK_67 decision 8); effects below correct each one after mount.
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [pageVisible, setPageVisible] = useState(false);
  const [inViewport, setInViewport] = useState(false);
  const [loadedSlugs, setLoadedSlugs] = useState<Set<string>>(() => new Set());
  const cardRef = useRef<HTMLDivElement>(null);

  const showControls = slides.length > 1;
  const allImagesLoaded = loadedSlugs.size >= slides.length;
  const enabled =
    showControls && !prefersReducedMotion && pageVisible && inViewport && allImagesLoaded && !paused;

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setPrefersReducedMotion(mediaQuery.matches);
    update();
    mediaQuery.addEventListener('change', update);
    return () => mediaQuery.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    const update = () => setPageVisible(document.visibilityState === 'visible');
    update();
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);

  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setInViewport(entry!.isIntersecting), {
      threshold: 0.3,
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const timer = setTimeout(() => {
      setIndex((i) => (i + 1) % slides.length);
    }, HERO_AUTOPLAY_MS);
    return () => clearTimeout(timer);
  }, [index, enabled, slides.length]);

  if (slides.length === 0) return null;

  const current = slides[Math.min(index, slides.length - 1)]!;
  const advance = () => setIndex((i) => (i + 1) % slides.length);
  const jumpTo = (i: number) => setIndex(i);
  const goPrev = () => setIndex((i) => (i - 1 + slides.length) % slides.length);
  const goNext = () => setIndex((i) => (i + 1) % slides.length);
  const showDots = slides.length > 1;

  const markLoaded = (slug: string) => {
    setLoadedSlugs((prev) => (prev.has(slug) ? prev : new Set(prev).add(slug)));
  };

  // Interaction pausing (TASK_67 decision 9) — handlers live on the outer card
  // wrapper, not on each control, and React's onFocus/onBlur bubble like
  // focusin/focusout so they fire for any descendant.
  const handlePointerEnter = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse') setPaused(true);
  };
  const handlePointerLeave = () => setPaused(false);
  const handlePointerDown = () => setPaused(true);
  const handlePointerUpOrCancel = () => setPaused(false);
  const handleFocus = (e: React.FocusEvent<HTMLDivElement>) => {
    const target = e.target;
    if (target instanceof HTMLElement && target.matches(':focus-visible')) setPaused(true);
  };
  const handleBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    const next = e.relatedTarget as Node | null;
    if (!next || !e.currentTarget.contains(next)) setPaused(false);
  };

  return (
    <div className="mx-4 mt-[18px] md:mx-auto md:mt-9 md:max-w-[1240px] md:px-10">
      <div
        ref={cardRef}
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUpOrCancel}
        onPointerCancel={handlePointerUpOrCancel}
        onFocus={handleFocus}
        onBlur={handleBlur}
        className="relative h-[480px] overflow-hidden rounded-[28px] md:h-[600px] md:rounded-[32px] md:shadow-[0_24px_64px_rgba(15,15,15,0.18)]"
      >
        <PendingCardLink
          href={`/courts/${current.slug}`}
          ariaLabel={current.alt}
          className="absolute inset-0 block h-full"
        >
          {slides.map((slide, i) => (
            <Image
              key={slide.slug}
              src={slide.imageUrl}
              alt=""
              fill
              priority={i === 0}
              sizes="(min-width: 1280px) 1240px, 100vw"
              className="object-cover transition-opacity duration-[400ms] motion-reduce:transition-none"
              style={{ opacity: i === index ? 1 : 0 }}
              onLoad={() => markLoaded(slide.slug)}
              onError={() => markLoaded(slide.slug)}
            />
          ))}

          {/* Same overlay recipe as `CourtCard` — transparent to 40%, then to black 72%. */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background: 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.72) 100%)',
            }}
          />

          {/* Crest mark — two sizes via CSS visibility, since stroke-width can't be
              expressed as a Tailwind breakpoint variant on an inline-styled SVG attr. */}
          <span className="absolute inset-x-0 top-[26px] flex justify-center md:hidden">
            <CrestMark size={32} strokeWidth={1.3} />
          </span>
          <span className="absolute inset-x-0 top-9 hidden justify-center md:flex">
            <CrestMark size={36} strokeWidth={1.2} />
          </span>

          {/* Giant title — the page <h1>. Mobile: left-aligned, mid-height, no vertical
              centering transform. Desktop: centered both ways. */}
          <h1 className="serif absolute left-[18px] right-[18px] top-1/2 text-[60px] font-medium leading-[0.95] tracking-[0.01em] text-white md:inset-x-0 md:-translate-y-1/2 md:text-center md:text-[76px] md:leading-[0.92]">
            ATLAS
          </h1>
        </PendingCardLink>

        {/* Prev/next arrows — SIBLINGS of the card link (CLAUDE.md §4 rule 10: purely
            local UI, no Pending* primitive). Mobile: 30px circles in the bottom row,
            flanking the pill/dots control, inset 6px from the card edge. Desktop: 48px
            circles vertically centred at the card's left/right edges (TASK_67). */}
        {showControls ? (
          <button
            type="button"
            onClick={goPrev}
            aria-label="Previous slide"
            className="absolute bottom-[23px] left-[6px] z-10 flex h-[30px] w-[30px] items-center justify-center rounded-full border border-white/40 bg-white/20 text-white backdrop-blur-[10px] transition-colors hover:bg-white/30 md:bottom-auto md:left-6 md:top-1/2 md:h-12 md:w-12 md:-translate-y-1/2"
          >
            <ChevronGlyph direction="left" />
          </button>
        ) : null}

        {/* Place pill + dots — SIBLINGS of the card link (never inside the <a>), so
            clicking either never navigates. One row for both breakpoints (TASK_66): the
            pill sits at the active slide's position in a fixed-width, centred row, and
            glides onto the next dot's position when the slide changes, while the dots
            on either side slide aside to make room — nothing mounts/unmounts, so the
            motion is smooth and compositor-only (`transform`/`opacity` only).
            `--slot` is the 28px dot hit-target width; `--pill-w` is a fixed width sized
            to the longest real place label ("Douro Valley") per breakpoint so the row
            never changes width when the label changes.
            `pointer-events-none` on this full-width outer row (re-enabled on the
            centred inner group) so its invisible edges don't steal clicks from the
            TASK_67 arrows, which sit in that same space outside the centred content. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-[18px] z-10 flex justify-center md:bottom-9">
          <div
            role="group"
            aria-label="Hero slides"
            className="pointer-events-auto relative h-10 [--pill-w:168px] [--slot:28px] md:[--pill-w:172px]"
            style={{
              width:
                slides.length > 1
                  ? `calc(var(--pill-w) + ${slides.length - 1} * var(--slot))`
                  : 'var(--pill-w)',
            }}
          >
            <button
              type="button"
              onClick={advance}
              style={{ transform: `translateX(calc(${index} * var(--slot)))` }}
              className="serif absolute left-0 top-0 flex h-full w-[var(--pill-w)] items-center justify-center rounded-pill border border-white/40 bg-white/20 px-6 text-[13px] uppercase tracking-[0.16em] text-white backdrop-blur-[10px] [transition:transform_350ms_cubic-bezier(0.4,0,0.2,1),opacity_200ms_ease] motion-reduce:[transition:none] md:px-[26px]"
            >
              <span className="min-w-0 truncate">{current.place}</span>
            </button>

            {showDots
              ? slides.map((slide, i) => {
                  const hidden = i === index;
                  const x =
                    i < index
                      ? `calc(${i} * var(--slot))`
                      : i > index
                        ? `calc(${i} * var(--slot) + (var(--pill-w) - var(--slot)))`
                        : `calc(${index} * var(--slot))`;
                  return (
                    <PaginationDot
                      key={slide.slug}
                      x={x}
                      hidden={hidden}
                      onClick={() => jumpTo(i)}
                      label={`Go to slide ${i + 1}`}
                    />
                  );
                })
              : null}
          </div>
        </div>

        {showControls ? (
          <button
            type="button"
            onClick={goNext}
            aria-label="Next slide"
            className="absolute bottom-[23px] right-[6px] z-10 flex h-[30px] w-[30px] items-center justify-center rounded-full border border-white/40 bg-white/20 text-white backdrop-blur-[10px] transition-colors hover:bg-white/30 md:bottom-auto md:right-6 md:top-1/2 md:h-12 md:w-12 md:-translate-y-1/2"
          >
            <ChevronGlyph direction="right" />
          </button>
        ) : null}
      </div>
    </div>
  );
}
