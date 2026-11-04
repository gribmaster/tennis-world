'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { PendingCardLink } from '@/components/navigation';

// Autoplay interval (TASK_67). The cross-fade (400ms) and the dot-strip slide (350ms,
// TASK_68) both fit comfortably inside it.
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
// `setTimeout` per slide (effect keyed on `[pos, enabled]` — TASK_70's ring position,
// see below), so any change — arrow, dot, pill, or autoplay itself — restarts the
// 3500ms countdown. `enabled` folds in reduced-motion, page visibility, viewport
// intersection, "all images loaded", and a `paused` flag driven by pointer/focus
// interaction on the card (see handlers below).
//
// PILL + DOTS (TASK_68): the place pill never moves — it sits at the row's fixed
// horizontal centre at every index, at every width. Only the dot strip slides under it.
//
// ENDLESS DOT RING (TASK_70): the strip always shows exactly `SIDE = min(3, N - 1)`
// dots on each side of the pill, never fewer — on slide 1 the left side repeats the
// same other slides the right side would show later, rather than sitting empty. State
// is an UNBOUNDED ring position `pos` (not a 0..N-1 index); `index = pos mod N` is
// derived for everything that renders a single slide (photo, pill label, card link).
// Dots are virtual, keyed by absolute position `pos + d` rather than by slide, so the
// same slide can appear as two distinct dot elements (one on each side) at once. Every
// control moves `pos` by a signed delta (arrows/pill/autoplay: ±1; a dot: its own
// offset `d`), so the strip always glides that many slots with no wrap-around "hop".

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
 * One pagination dot — absolutely positioned at `x` (a CSS `calc()` expression
 * referencing the row's `--slot`/`--pill-w` custom properties; see the row's comment
 * below). TASK_70: dots are now *virtual*, keyed by an absolute ring position, not by
 * slide — the same slide can appear as two different dot elements at once (once on
 * each side). `interactive` is false for the two outermost "staging" dots
 * (`|d| = SIDE + 1`, opacity 0, just outside the visible row, fading in/out as the
 * strip advances) AND for the dot parked at the pill's dead centre (`d = 0`, opacity 0,
 * fully covered by the pill's opaque/blurred body) — that centre dot stays mounted
 * across the whole cycle purely so the elements on either side of it have something to
 * transition smoothly FROM/TO instead of popping in/out unmounted (see the row's
 * comment for why). `ariaHidden` covers those two plus every left-side dot (a
 * pointer/touch-only duplicate of a slide also reachable via a right-side dot, so it is
 * dropped from the Tab order to avoid a duplicate stop).
 */
function PaginationDot({
  x,
  opacity,
  ariaHidden,
  interactive,
  onClick,
  label,
  slideIndex,
}: {
  x: string;
  opacity: number;
  ariaHidden: boolean;
  interactive: boolean;
  onClick: () => void;
  label: string;
  slideIndex: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-hidden={ariaHidden || undefined}
      tabIndex={ariaHidden ? -1 : undefined}
      data-slide={slideIndex}
      style={{
        transform: `translateX(${x})`,
        opacity,
        pointerEvents: interactive ? undefined : 'none',
      }}
      className="group absolute left-0 top-0 flex h-full w-[var(--slot)] items-center justify-center [transition-property:transform,opacity] [transition-duration:350ms,200ms] [transition-timing-function:cubic-bezier(0.4,0,0.2,1),ease] motion-reduce:[transition:none]"
    >
      <span
        aria-hidden
        className="h-[6px] w-[6px] rounded-full bg-white/60 transition-colors group-hover:bg-white/95"
      />
    </button>
  );
}

export function HomeHero({ slides }: HomeHeroProps) {
  // TASK_70: `pos` is an UNBOUNDED ring position (may be negative or exceed
  // slides.length) — the actual slide shown is `index = pos mod N` (below). Every
  // control moves `pos` by a signed delta instead of setting `index` directly, so the
  // dot strip always glides the matching number of slots with no wrap-around "hop".
  const [pos, setPos] = useState(0);
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
      setPos((p) => p + 1);
    }, HERO_AUTOPLAY_MS);
    return () => clearTimeout(timer);
  }, [pos, enabled]);

  if (slides.length === 0) return null;

  const slideCount = slides.length;
  const index = ((pos % slideCount) + slideCount) % slideCount;
  const current = slides[index]!;
  const advance = () => setPos((p) => p + 1);
  const goPrev = () => setPos((p) => p - 1);
  const goNext = () => setPos((p) => p + 1);
  const showDots = slideCount > 1;

  // Row geometry (TASK_70, decisions 2 & 5). Always SIDE dots on each side of the fixed
  // pill — SIDE = min(3, N - 1) so a dot can never land back on the active slide — and
  // the row reserves exactly that many slots on each side, so its width stays constant.
  const SIDE = Math.min(3, slideCount - 1);
  const dotX = (d: number) => {
    if (d < 0) return `calc(${SIDE + d} * var(--slot))`;
    if (d > 0) return `calc(${SIDE} * var(--slot) + var(--pill-w) + ${d - 1} * var(--slot))`;
    return `calc(${SIDE} * var(--slot) + (var(--pill-w) - var(--slot)) / 2)`;
  };
  // Virtual dot offsets, left to right: -(SIDE+1) .. +(SIDE+1), INCLUDING 0.
  //
  // Decision 4 as literally written excludes v = pos (the active slide "has no dot").
  // Tried that first; it produces a real pop, caught by this task's own "verify this
  // actually shows no pop... and adjust the margin of extra rendered positions if it
  // does" check (decision 4): the slot immediately right of the pill (d = +1) is NOT
  // covered by the pill (the pill is many slots wide, but d = ±1 sit just outside its
  // edge) — so when that dot becomes active, excluding v = pos unmounts it mid-air with
  // no fade-out, and the dot vacating d = 0 would have to pop into existence at d = -1
  // with no prior mounted state to transition from (no fade-in). Rendering d = 0 too —
  // hidden at the pill's dead centre, fully covered by its opaque/blurred body, exactly
  // like TASK_68's old "active dot" slot — keeps that element mounted across the whole
  // cycle, so both transitions (d = +1 → 0 and 0 → -1) are ordinary opacity/transform
  // animations on an already-mounted node instead of a mount/unmount pop.
  const dotOffsets: number[] = [];
  for (let d = -(SIDE + 1); d <= SIDE + 1; d++) {
    dotOffsets.push(d);
  }

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
          <h1 className="serif absolute left-[18px] right-[18px] top-1/2 text-[60px] font-medium leading-[0.95] tracking-[0.01em] text-white md:inset-x-0 md:-translate-y-1/2 text-center md:text-[76px] md:leading-[0.92]">
            ATLAS
          </h1>
        </PendingCardLink>

        {/* Prev/next arrows — SIBLINGS of the card link (CLAUDE.md §4 rule 10: purely
            local UI, no Pending* primitive). Vertically centred on the card at every
            width (TASK_68 — supersedes the TASK_67 bottom-row mobile placement, which
            only existed to clear the left-aligned title; the title is centred now and
            the wider dot row above no longer leaves room beside it). Mobile: 36px
            circles, inset 8px from the card edge. Desktop: 48px circles, inset 24px. */}
        {showControls ? (
          <button
            type="button"
            onClick={goPrev}
            aria-label="Previous slide"
            className="absolute left-2 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-white/40 bg-white/20 text-white backdrop-blur-[10px] transition-colors hover:bg-white/30 md:left-6 md:h-12 md:w-12"
          >
            <ChevronGlyph direction="left" />
          </button>
        ) : null}

        {/* Place pill + dots — SIBLINGS of the card link (never inside the <a>), so
            clicking either never navigates. One row for both breakpoints: the pill is
            fixed at the row's horizontal centre (TASK_68 — it is never translated, so
            its centre equals the card's centre at every index).
            TASK_70: the dot strip is an ENDLESS RING, not a strip bounded by the first/
            last slide — always exactly `SIDE` VISIBLE dots on each side of the pill,
            keyed by an absolute ring position (`pos + d`, not by slide), so the same
            slide can render as two different dot elements (one on each side) and the
            strip never runs out of dots to show near either end. Advancing moves every
            dot exactly one slot in the matching direction (via `transform`); nothing
            mounts/unmounts mid-row — the two staging dots just outside the row
            (`|d| = SIDE + 1`) AND the one dot parked at the pill's dead centre
            (`d = 0`, covered by the pill) all render at `opacity: 0` so every element
            that's about to become visible (or that just stopped being) already exists
            to transition smoothly into/out of view instead of popping.
            `--slot` is the dot hit-target width; `--pill-w` is a fixed width sized to
            the longest real place label ("Douro Valley") per breakpoint so the row
            never changes width when the label changes.
            `pointer-events-none` on this full-width outer row (re-enabled on the
            centred inner group) so its invisible edges don't steal clicks from the
            arrows, which sit in that same space outside the centred content. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-[18px] z-10 flex justify-center md:bottom-9">
          <div
            role="group"
            aria-label="Hero slides"
            className="pointer-events-auto relative h-10 overflow-visible [--pill-w:152px] [--slot:24px] md:[--pill-w:172px] md:[--slot:28px]"
            style={{
              width:
                slideCount > 1
                  ? `calc(var(--pill-w) + ${2 * SIDE} * var(--slot))`
                  : 'var(--pill-w)',
            }}
          >
            <button
              type="button"
              onClick={advance}
              style={{ left: `calc(${SIDE} * var(--slot))` }}
              className="serif absolute top-0 z-10 flex h-full w-[var(--pill-w)] items-center justify-center rounded-pill border border-white/40 bg-white/20 px-4 text-[13px] uppercase tracking-[0.16em] text-white backdrop-blur-[10px] md:px-[26px]"
            >
              <span className="min-w-0 truncate">{current.place}</span>
            </button>

            {showDots
              ? dotOffsets.map((d) => {
                  const v = pos + d;
                  const slideIndexForV = ((v % slideCount) + slideCount) % slideCount;
                  const absD = Math.abs(d);
                  const isOuter = absD === SIDE + 1;
                  const isCenter = d === 0;
                  const opacity =
                    isOuter || isCenter ? 0 : absD === 1 ? 1 : absD === 2 ? 0.75 : 0.5;
                  return (
                    <PaginationDot
                      key={v}
                      x={dotX(d)}
                      opacity={opacity}
                      ariaHidden={d <= 0 || isOuter}
                      interactive={!isOuter && !isCenter}
                      onClick={() => setPos(v)}
                      label={`Go to slide ${slideIndexForV + 1}`}
                      slideIndex={slideIndexForV}
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
            className="absolute right-2 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-white/40 bg-white/20 text-white backdrop-blur-[10px] transition-colors hover:bg-white/30 md:right-6 md:h-12 md:w-12"
          >
            <ChevronGlyph direction="right" />
          </button>
        ) : null}
      </div>
    </div>
  );
}
