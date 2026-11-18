import type { AuthProvider } from '@refinedev/core';
import type { AdminDTO } from '@tennis/contracts';
import { apiFetch } from './api-client';
import { ApiError } from './api-error';

export interface LoginVariables {
  email: string;
  password: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// authProvider (TASK_74 decision 3) — thin wrapper over the TASK_73 admin auth
// endpoints. The httpOnly cookie IS the session; this module never stores the
// `accessToken` the login response carries (no browser-storage persistence).
// `check` is what `<Authenticated>` calls to decide whether to redirect a
// direct URL hit to `/login`; `onError` is what every data hook calls on a
// failed request, which is the second (redundant but harmless) path to the
// same redirect — `apiFetch`'s 401 handler is the first and the one place that
// actually performs the navigation (see `api-client.ts`).
// ─────────────────────────────────────────────────────────────────────────────

export const authProvider: AuthProvider = {
  login: async ({ email, password }: LoginVariables) => {
    try {
      await apiFetch('/admin/auth/login', {
        method: 'POST',
        body: { email, password },
      });
      return { success: true, redirectTo: '/courts' };
    } catch (err) {
      return {
        success: false,
        error: new Error(err instanceof ApiError ? err.message : 'Sign in failed.'),
      };
    }
  },

  logout: async () => {
    try {
      await apiFetch('/admin/auth/logout', { method: 'POST' });
    } catch {
      // Clear client state regardless of whether the API call itself succeeded.
    }
    return { success: true, redirectTo: '/login' };
  },

  check: async () => {
    try {
      await apiFetch<AdminDTO>('/admin/auth/me');
      return { authenticated: true };
    } catch {
      return { authenticated: false, redirectTo: '/login' };
    }
  },

  onError: async (error: unknown) => {
    if (error instanceof ApiError && error.statusCode === 401) {
      return { logout: true, redirectTo: '/login' };
    }
    return {};
  },

  getIdentity: async (): Promise<AdminDTO> => {
    return apiFetch<AdminDTO>('/admin/auth/me');
  },
};
