'use client';

import { useState } from 'react';
import Image from 'next/image';
import { PendingCardLink } from '@/components/navigation';

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

/** A dot's visible 6px circle, wrapped in a transparent >=24px hit target. */
function PaginationDot({
  background,
  onClick,
  label,
}: {
  background: string;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex h-6 w-6 shrink-0 items-center justify-center"
    >
      <span aria-hidden className="h-[6px] w-[6px] rounded-full" style={{ background }} />
    </button>
  );
}

export function HomeHero({ slides }: HomeHeroProps) {
  const [index, setIndex] = useState(0);

  if (slides.length === 0) return null;

  const current = slides[Math.min(index, slides.length - 1)]!;
  const advance = () => setIndex((i) => (i + 1) % slides.length);
  const jumpTo = (i: number) => setIndex(i);
  const showDots = slides.length > 1;

  return (
    <div className="mx-4 mt-[18px] md:mx-auto md:mt-9 md:max-w-[1240px] md:px-10">
      <div className="relative h-[480px] overflow-hidden rounded-[28px] md:h-[600px] md:rounded-[32px] md:shadow-[0_24px_64px_rgba(15,15,15,0.18)]">
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
            />
          ))}

          {/* Same overlay recipe as `CourtCard` — transparent to 40%, then to black 72%. */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background: 'linear-gradient(180deg, rgba(0,0,0,0) 40%, rgba(0,0,0,0.72) 100%)',
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

        {/* Place pill + dots — SIBLINGS of the card link (never inside the <a>), so
            clicking either never navigates. */}

        {/* Mobile: dots split left/right of the pill, each side flex-1. */}
        <div className="absolute inset-x-[18px] bottom-[18px] z-10 flex items-center justify-center gap-2 md:hidden">
          <div className="flex flex-1 justify-end gap-[5px]">
            {showDots
              ? slides.map((slide, i) =>
                  i < index ? (
                    <PaginationDot
                      key={slide.slug}
                      background="rgba(255,255,255,0.85)"
                      onClick={() => jumpTo(i)}
                      label={`Go to slide ${i + 1}`}
                    />
                  ) : null,
                )
              : null}
          </div>
          <button
            type="button"
            onClick={advance}
            className="serif shrink-0 rounded-pill border border-white/40 bg-white/20 px-6 py-[10px] text-[13px] uppercase tracking-[0.16em] text-white backdrop-blur-[10px]"
          >
            {current.place}
          </button>
          <div className="flex flex-1 gap-[5px]">
            {showDots
              ? slides.map((slide, i) =>
                  i > index ? (
                    <PaginationDot
                      key={slide.slug}
                      background="rgba(255,255,255,0.85)"
                      onClick={() => jumpTo(i)}
                      label={`Go to slide ${i + 1}`}
                    />
                  ) : null,
                )
              : null}
          </div>
        </div>

        {/* Desktop: pill, then every dot to its right (active one brighter). */}
        <div className="absolute inset-x-0 bottom-9 z-10 hidden items-center justify-center gap-2.5 md:flex">
          <button
            type="button"
            onClick={advance}
            className="serif shrink-0 rounded-pill border border-white/40 bg-white/20 px-[26px] py-[10px] text-[13px] uppercase tracking-[0.16em] text-white backdrop-blur-[10px]"
          >
            {current.place}
          </button>
          {showDots ? (
            <div className="flex gap-[5px]">
              {slides.map((slide, i) => (
                <PaginationDot
                  key={slide.slug}
                  background={i === index ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.45)'}
                  onClick={() => jumpTo(i)}
                  label={`Go to slide ${i + 1}`}
                />
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
