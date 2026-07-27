'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { GeoPoint } from './geo-distance';

// useGeolocation — the SINGLE browser-geolocation implementation on the Map screen.
//
// Both entry points go through this one hook, mounted ONCE in MapExplorer:
//   • the initial automatic focus-on-nearest-court (fires on mount), and
//   • the manual "nearest court" control the user can click afterwards.
// They therefore share identical permission handling, timeouts, and error mapping —
// there is no second `navigator.geolocation` call site anywhere in the app.
//
// NO DUPLICATE PERMISSION PROMPTS. `locate()` keeps the in-flight promise in a ref and
// returns that SAME promise to any caller that arrives while a request is still open. That
// covers React Strict Mode's deliberate double-invocation of effects in development (the
// second call joins the first request instead of opening a second browser prompt), and it
// also covers a user clicking the manual control while the automatic request is still open.
//
// NO RETRY LOOP. The hook never retries on its own: one browser request per `locate()`
// call, and the automatic caller only ever calls it once (MapExplorer guards with a ref).
// A denial is terminal for the automatic path; only an explicit user click asks again.
//
// PRIVACY. The resolved coordinates are returned to the caller and held only in React
// state/refs for this map session. They are never written to localStorage/sessionStorage/
// cookies, never sent to the API, an analytics endpoint, or the database, and are gone on
// unload. `maximumAge` lets the BROWSER reuse its own recent fix — that is the browser's
// cache, not app persistence.

/** Why a position could not be obtained — drives the small non-blocking message. */
export type GeolocationErrorKind = 'unsupported' | 'denied' | 'unavailable' | 'timeout';

/** Human copy for each failure mode. Deliberately calm: none of these is an app error. */
const ERROR_MESSAGE: Record<GeolocationErrorKind, string> = {
  unsupported: 'Location isn’t available in this browser.',
  denied: 'Location permission denied.',
  unavailable: 'Your location is unavailable right now.',
  timeout: 'Location request timed out.',
};

/** Options tuned for "which court am I near" — city-level accuracy is plenty. */
const POSITION_OPTIONS: PositionOptions = {
  // A coarse fix is enough to pick the nearest court and avoids the slow, battery-hungry
  // GPS path on mobile.
  enableHighAccuracy: false,
  // Bounded wait: the browser rejects with a TIMEOUT error rather than hanging forever,
  // which is what keeps the map's default viewport from being held hostage.
  timeout: 10_000,
  // Accept a fix the browser already has from the last 5 minutes (browser-side cache).
  maximumAge: 300_000,
};

/** Map the DOM `GeolocationPositionError` code onto our narrow error vocabulary. */
function toErrorKind(err: GeolocationPositionError): GeolocationErrorKind {
  switch (err.code) {
    case 1: // PERMISSION_DENIED — also what a Permissions-Policy block surfaces as.
      return 'denied';
    case 3: // TIMEOUT
      return 'timeout';
    case 2: // POSITION_UNAVAILABLE
    default:
      return 'unavailable';
  }
}

export interface GeolocationError {
  readonly kind: GeolocationErrorKind;
  readonly message: string;
}

export interface UseGeolocationResult {
  /** True while a browser position request is open — drives the control's local spinner. */
  readonly pending: boolean;
  /** The last failure, or null. Cleared at the start of each new request. */
  readonly error: GeolocationError | null;
  /**
   * Request the current position. Resolves with the coordinates, or `null` on ANY failure
   * (denied / unavailable / timed out / unsupported / blocked by policy) — it NEVER
   * rejects, so no caller can produce an unhandled rejection.
   */
  readonly locate: () => Promise<GeoPoint | null>;
}

export function useGeolocation(): UseGeolocationResult {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<GeolocationError | null>(null);

  // The open request, shared by every caller until it settles (see "NO DUPLICATE
  // PERMISSION PROMPTS" above). Survives Strict Mode's remount because refs live on the
  // fiber, not on the effect.
  const inFlightRef = useRef<Promise<GeoPoint | null> | null>(null);
  // Guards state updates after the Map screen has been navigated away from.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const locate = useCallback((): Promise<GeoPoint | null> => {
    // Join the request already in flight instead of opening a second one.
    if (inFlightRef.current) return inFlightRef.current;

    // Unsupported browser, or a non-secure context where the API is absent entirely.
    if (typeof window === 'undefined' || !('geolocation' in navigator)) {
      if (mountedRef.current) {
        setError({ kind: 'unsupported', message: ERROR_MESSAGE.unsupported });
      }
      return Promise.resolve(null);
    }

    if (mountedRef.current) {
      setPending(true);
      setError(null);
    }

    const request = new Promise<GeoPoint | null>((resolve) => {
      // `getCurrentPosition` never throws synchronously in practice, but a Permissions-
      // Policy block can surface as a thrown error in some engines — swallow it into the
      // same calm failure path rather than letting it escape as an unhandled error.
      try {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            resolve({ lat: position.coords.latitude, lng: position.coords.longitude });
          },
          (err) => {
            const kind = toErrorKind(err);
            if (mountedRef.current) setError({ kind, message: ERROR_MESSAGE[kind] });
            resolve(null);
          },
          POSITION_OPTIONS,
        );
      } catch {
        if (mountedRef.current) {
          setError({ kind: 'unavailable', message: ERROR_MESSAGE.unavailable });
        }
        resolve(null);
      }
    }).finally(() => {
      // ALWAYS clear pending + the in-flight slot, success or failure, so the manual
      // control can never be left stuck disabled.
      inFlightRef.current = null;
      if (mountedRef.current) setPending(false);
    });

    inFlightRef.current = request;
    return request;
  }, []);

  return { pending, error, locate };
}
