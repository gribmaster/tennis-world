'use client';

import { createContext, useContext } from 'react';

// The Court Detail gallery's shared state — split out of CourtDetailGallery.tsx (Task 18)
// so CourtDetailGalleryLightbox.tsx can read it WITHOUT importing CourtDetailGallery.tsx,
// which would create a circular import (CourtDetailGallery.tsx renders the lightbox from
// inside CourtDetailGalleryStrip). Next's dev-mode webpack throws
// `__webpack_modules__[moduleId] is not a function` at runtime on that cycle even though a
// production build doesn't catch it — this leaf module is the fix, not a speculative split.

/** One resolved slide: a URL plus its (optional) authored alt text. */
export interface Slide {
  url: string;
  alt?: string;
}

/** Same fallback file CourtImage uses, so an empty URL never renders a blank frame. */
export const FALLBACK_IMAGE = '/placeholders/ben-hershey-K9HgyI3qmqA-unsplash.jpg';

export interface GalleryContextValue {
  slides: Slide[];
  activeIndex: number;
  setActiveIndex: (i: number) => void;
  /** The REAL court name — image ALT TEXT only (a description of the photograph). */
  courtName: string;
  /**
   * The court name AS DISPLAYED by the host page (Feature 79) — the real name unlocked,
   * the masked placeholder locked. Used for controls' ACCESSIBLE NAMES, so a masked title
   * cannot leak through the accessibility tree. Falls back to `courtName`.
   */
  courtLabel: string;
}

export const GalleryContext = createContext<GalleryContextValue | null>(null);

/** Read the shared gallery state. `CourtDetailGalleryLightbox` reads `slides`/`courtName`/
 *  `courtLabel` from this but must NEVER call the returned `setActiveIndex` — that would
 *  re-point the hero band, which is why it keeps its own local index instead. */
export function useGallery(): GalleryContextValue {
  const ctx = useContext(GalleryContext);
  if (!ctx) {
    throw new Error('CourtDetailGallery pieces must render inside <CourtDetailGalleryProvider>.');
  }
  return ctx;
}
