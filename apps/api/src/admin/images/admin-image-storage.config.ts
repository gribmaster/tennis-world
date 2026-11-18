// ─────────────────────────────────────────────────────────────────────────────
// Court image storage configuration (TASK_73, decision 14) — chooses between
// the two drivers (`admin-image-storage.ts`) by `COURT_IMAGE_STORAGE`.
//
// DEFAULTS / BOOT GUARD:
//   - `local`    : dev/CI only. Default when `NODE_ENV !== 'production'`.
//   - `supabase` : the production driver.
//   - In PRODUCTION the value MUST be set explicitly; an unset value is a boot
//     failure (never a silent `local` fallback in prod), and an explicit
//     `local` in production is ALSO refused — both throw here, which runs from
//     `AdminModule.register()`'s provider factory during `NestFactory.create()`,
//     crashing boot (matching the `loadStagingDemoAuthConfig` idiom).
//   - Supabase credentials (`SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`) are
//     NEVER required at boot — an incomplete Supabase config is a clean 503 at
//     UPLOAD time (`AdminImagesService`), so the rest of the API (and every
//     non-upload admin route) is unaffected by a missing key.
// ─────────────────────────────────────────────────────────────────────────────

export type CourtImageStorageKind = 'supabase' | 'local';

export interface SupabaseStorageSettings {
  /** e.g. `https://<project>.supabase.co`. Empty string when unset. */
  url: string;
  /** Server-only secret — NEVER logged, never returned in any response. */
  serviceRoleKey: string;
  bucket: string;
}

export interface AdminImageStorageConfig {
  kind: CourtImageStorageKind;
  /** Present only when `kind === 'supabase'`; may still be incomplete (checked at upload time). */
  supabase?: SupabaseStorageSettings;
}

function strEnv(raw: string | undefined): string | undefined {
  const v = raw?.trim();
  return v && v.length > 0 ? v : undefined;
}

export function loadAdminImageStorageConfig(env: NodeJS.ProcessEnv = process.env): AdminImageStorageConfig {
  const isProduction = env.NODE_ENV === 'production';
  const raw = strEnv(env.COURT_IMAGE_STORAGE)?.toLowerCase();

  let kind: CourtImageStorageKind;
  if (raw === 'supabase' || raw === 'local') {
    kind = raw;
  } else if (raw === undefined) {
    if (isProduction) {
      throw new Error(
        'COURT_IMAGE_STORAGE must be set explicitly ("supabase" or "local") in production.',
      );
    }
    kind = 'local';
  } else {
    throw new Error(`Invalid COURT_IMAGE_STORAGE="${raw}". Expected "supabase" or "local".`);
  }

  if (isProduction && kind === 'local') {
    throw new Error(
      'COURT_IMAGE_STORAGE=local is refused in production (dev/CI only) — use "supabase".',
    );
  }

  return {
    kind,
    ...(kind === 'supabase'
      ? {
          supabase: {
            url: strEnv(env.SUPABASE_URL) ?? '',
            serviceRoleKey: strEnv(env.SUPABASE_SERVICE_ROLE_KEY) ?? '',
            bucket: strEnv(env.SUPABASE_STORAGE_BUCKET) ?? 'court-images',
          },
        }
      : {}),
  };
}

/** DI token for the singleton {@link AdminImageStorageConfig} provided by `AdminModule.register()`. */
export const ADMIN_IMAGE_STORAGE_CONFIG = 'ADMIN_IMAGE_STORAGE_CONFIG';
