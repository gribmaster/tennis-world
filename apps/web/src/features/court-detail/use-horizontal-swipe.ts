'use client';

import { useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';

// Split out of CourtDetailGallery.tsx (Task 18) alongside gallery-context.tsx, for the
// same reason: CourtDetailGalleryLightbox.tsx needs it without importing
// CourtDetailGallery.tsx, which would create a circular import (CourtDetailGallery.tsx
// renders the lightbox from inside CourtDetailGalleryStrip).

/** Horizontal drag distance (px) that commits a gesture to a slide change. */
const SWIPE_THRESHOLD_PX = 45;

/**
 * Hand-rolled horizontal swipe/drag, shared by the hero band and the lightbox. Returns a
 * `pointerdown` handler for the swipeable element; `pointermove`/`pointerup`/
 * `pointercancel` are tracked on `window` for the duration of one gesture so a fast drag
 * that leaves the element's bounds is still followed to its release.
 *
 * The gesture is only "committed" — and only THEN does it call `preventDefault()` — once
 * horizontal movement crosses `SWIPE_THRESHOLD_PX` and dominates vertical movement. Before
 * that point nothing is prevented, so a plain tap on an overlaid control (back/save/share/
 * "All photos"/dots) still registers as a click, and a vertical drag is left alone so the
 * page keeps scrolling normally (paired with `touch-action: pan-y` on the element in JSX).
 */
export function useHorizontalSwipe(
  enabled: boolean,
  onSwipeLeft: () => void,
  onSwipeRight: () => void,
): (event: ReactPointerEvent<HTMLDivElement>) => void {
  // Tracks the in-flight gesture's teardown so an unmount mid-drag can't leak the window
  // listeners (the normal teardown path is pointerup/pointercancel, not unmount).
  const cleanupRef = useRef<(() => void) | null>(null);
  useEffect(() => () => cleanupRef.current?.(), []);

  return useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!enabled) return;
      // Only the primary mouse button drags; every touch/pen pointer is fine as-is.
      if (event.pointerType === 'mouse' && event.button !== 0) return;

      const pointerId = event.pointerId;
      const startX = event.clientX;
      const startY = event.clientY;
      let committed = false;

      const cleanup = () => {
        cleanupRef.current = null;
        window.removeEventListener('pointermove', handleMove);
        window.removeEventListener('pointerup', handleUp);
        window.removeEventListener('pointercancel', handleCancel);
      };
      cleanupRef.current = cleanup;

      function handleMove(moveEvent: PointerEvent) {
        if (moveEvent.pointerId !== pointerId) return;
        const dx = moveEvent.clientX - startX;
        const dy = moveEvent.clientY - startY;
        if (!committed) {
          if (Math.abs(dx) >= SWIPE_THRESHOLD_PX && Math.abs(dx) > Math.abs(dy)) {
            committed = true;
          } else if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) >= SWIPE_THRESHOLD_PX) {
            // Vertical intent — release the gesture and let the page scroll normally.
            cleanup();
            return;
          }
        }
        if (committed) moveEvent.preventDefault();
      }

      function handleUp(upEvent: PointerEvent) {
        if (upEvent.pointerId !== pointerId) return;
        const dx = upEvent.clientX - startX;
        const wasCommitted = committed;
        cleanup();
        if (!wasCommitted) return;
        if (dx <= -SWIPE_THRESHOLD_PX) onSwipeLeft();
        else if (dx >= SWIPE_THRESHOLD_PX) onSwipeRight();
      }

      function handleCancel(cancelEvent: PointerEvent) {
        if (cancelEvent.pointerId !== pointerId) return;
        cleanup();
      }

      window.addEventListener('pointermove', handleMove);
      window.addEventListener('pointerup', handleUp);
      window.addEventListener('pointercancel', handleCancel);
    },
    [enabled, onSwipeLeft, onSwipeRight],
  );
}
