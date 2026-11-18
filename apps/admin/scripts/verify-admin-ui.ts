/* eslint-disable no-console */
//
// TASK_74 — admin UI verification (DETERMINISTIC, no network, no running API).
// This repo has no jest/vitest; it follows the `verify:*` script convention
// (see CLAUDE.md §2). Covers the PURE LOGIC only, per the task's Testing
// section:
//   1. Maps-link parser — table-driven cases.
//   2. Slug helper — equality against the API's own `slugify` for samples
//      including diacritics, `&`, `'`, digits, and leading/trailing punctuation.
//   3. Data-provider mapping — `apiFetch` headers/credentials/401/422/network
//      behavior (injected `fetch` stub) + the PATCH-diff helper.
//   4. No token persistence — a source scan of apps/admin/src.
//   5. Env scan — no VITE_* name containing SECRET/KEY/TOKEN/PASSWORD.
//
// Run: pnpm --filter @tennis/admin verify:admin-ui

import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCoordinatesFromMapLink } from '../src/lib/maps-link-parser';
import { slugify as adminSlugify } from '../src/lib/slugify';
// Relative import of the API's OWN slugify, harness-only (never from app code) —
// asserts the admin UI's auto-slug matches the API's rule byte for byte.
import { slugify as apiSlugify } from '../../api/src/courts/court-derived-fields';
import { buildCourtPatch, type CourtFormValues } from '../src/lib/court-patch';
import { apiFetch, setUnauthorizedHandler } from '../src/lib/api-client';
import { ApiError, NETWORK_ERROR_MESSAGE } from '../src/lib/api-error';
import { dataProvider } from '../src/lib/data-provider';
import type { AdminCourtDetailDTO, AdminCourtListResponseDTO } from '@tennis/contracts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ADMIN_ROOT = path.resolve(__dirname, '..');

// ── Tiny assertion harness (matches the sibling verify-*.ts scripts) ───────
interface CheckResult {
  readonly name: string;
  readonly ok: boolean;
  readonly detail?: string;
}
const results: CheckResult[] = [];

function record(name: string, ok: boolean, detail?: string): void {
  results.push({ name, ok, detail });
  const tag = ok ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m';
  console.log(`  ${tag}  ${name}`);
  if (!ok && detail) console.log(`        ${detail}`);
}

function expectEqual(name: string, actual: unknown, expected: unknown): void {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  record(name, ok, ok ? undefined : `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function expectTrue(name: string, ok: boolean, detail?: string): void {
  record(name, ok, detail);
}

async function main(): Promise<void> {
  console.log('\n1. Maps-link parser\n');

  const PLACE_PIN_LINK =
    'https://www.google.com/maps/place/x/@45.0,9.0,15z/data=!4m5!3m4!1s0x0:0x0!8m2!3d45.4642!4d9.19';

  const parserCases: Array<{ name: string; url: string; expected: { lat: number; lng: number } | null }> = [
    { name: 'viewport centre (@lat,lng,zoom)', url: 'https://maps.google.com/maps/@45.4642,9.1900,15z', expected: { lat: 45.4642, lng: 9.19 } },
    { name: 'place pin (!3d!4d)', url: 'https://www.google.com/maps/place/x/data=!3d45.4642!4d9.19', expected: { lat: 45.4642, lng: 9.19 } },
    { name: 'query ?q=lat,lng', url: 'https://www.google.com/maps?q=45.4642,9.19', expected: { lat: 45.4642, lng: 9.19 } },
    { name: 'query ?ll=lat,lng', url: 'https://maps.google.com/maps?ll=45.4642,9.19', expected: { lat: 45.4642, lng: 9.19 } },
    { name: 'negative coordinates', url: 'https://maps.google.com/maps/@-33.8688,151.2093,17z', expected: { lat: -33.8688, lng: 151.2093 } },
    { name: 'out-of-range latitude rejected', url: 'https://maps.google.com/maps/@200.0,9.0,15z', expected: null },
    { name: 'out-of-range longitude rejected', url: 'https://maps.google.com/maps?q=45.0,200.0', expected: null },
    { name: 'short link goo.gl -> unreadable', url: 'https://goo.gl/maps/abc123', expected: null },
    { name: 'short link maps.app.goo.gl -> unreadable', url: 'https://maps.app.goo.gl/abc123', expected: null },
    { name: 'garbage -> unreadable', url: 'not a url at all', expected: null },
    { name: 'place pin wins over viewport centre when both present', url: PLACE_PIN_LINK, expected: { lat: 45.4642, lng: 9.19 } },
  ];

  for (const c of parserCases) {
    expectEqual(c.name, parseCoordinatesFromMapLink(c.url), c.expected);
  }

  console.log('\n2. Slug helper vs. API slugify\n');

  const slugSamples = [
    'Château de la Messardière',
    'Hôtel du Cap-Eden-Roc',
    'Monte-Carlo Country Club',
    "Smith & Sons' Court",
    'Court #42',
    '  Leading and trailing punctuation!!  ',
    'Évian Royal Resort',
    'São Paulo Tennis Club',
    'Älskade Tennisbana',
    'Straße Court Berlin',
    'Ñandú Club de Tenis',
  ];
  for (const name of slugSamples) {
    expectEqual(`slugify("${name}") matches API`, adminSlugify(name), apiSlugify(name));
  }

  console.log('\n3. Data-provider mapping\n');

  interface CapturedRequest {
    url: string;
    init: RequestInit;
  }
  let captured: CapturedRequest[] = [];
  let unauthorizedCalls = 0;
  setUnauthorizedHandler(() => {
    unauthorizedCalls += 1;
  });

  function stubFetch(response: { status: number; body?: unknown } | { throws: true }) {
    captured = [];
    (globalThis as { fetch: typeof fetch }).fetch = (async (url: unknown, init?: RequestInit) => {
      captured.push({ url: String(url), init: init ?? {} });
      if ('throws' in response) {
        throw new TypeError('network down');
      }
      const text = response.body === undefined ? '' : JSON.stringify(response.body);
      return new Response(text, { status: response.status }) as unknown as Response;
    }) as typeof fetch;
  }

  // GET: credentials included, no CSRF header.
  stubFetch({ status: 200, body: { ok: true } });
  await apiFetch('/admin/courts/abc');
  expectTrue('GET sets credentials: include', captured[0]?.init.credentials === 'include');
  expectTrue('GET has no X-Tennis-Admin header', !(captured[0]?.init.headers as Record<string, string>)?.['X-Tennis-Admin']);

  // POST: credentials included, CSRF header present.
  stubFetch({ status: 200, body: { ok: true } });
  await apiFetch('/admin/courts', { method: 'POST', body: { name: 'x' } });
  expectTrue('POST sets credentials: include', captured[0]?.init.credentials === 'include');
  expectEqual(
    'POST sets X-Tennis-Admin: 1',
    (captured[0]?.init.headers as Record<string, string>)?.['X-Tennis-Admin'],
    '1',
  );

  // 401 -> central handler invoked, rejects.
  stubFetch({ status: 401 });
  unauthorizedCalls = 0;
  let threw401 = false;
  try {
    await apiFetch('/admin/auth/me');
  } catch (err) {
    threw401 = err instanceof ApiError && err.statusCode === 401;
  }
  expectTrue('401 triggers the central unauthorized handler exactly once', unauthorizedCalls === 1);
  expectTrue('401 rejects with ApiError(statusCode: 401)', threw401);

  // 422 -> missing[] surfaced.
  stubFetch({ status: 422, body: { message: 'Cannot publish: missing required fields.', missing: ['blurb', 'lat'] } });
  let missing: string[] | undefined;
  try {
    await apiFetch('/admin/courts/abc', { method: 'PATCH', body: { status: 'published' } });
  } catch (err) {
    missing = err instanceof ApiError ? err.missing : undefined;
  }
  expectEqual('422 surfaces missing[]', missing, ['blurb', 'lat']);

  // Network failure -> "Can't reach the server".
  stubFetch({ throws: true });
  let networkMessage: string | undefined;
  try {
    await apiFetch('/admin/courts');
  } catch (err) {
    networkMessage = err instanceof ApiError ? err.message : undefined;
  }
  expectEqual("network failure becomes \"Can't reach the server\"", networkMessage, NETWORK_ERROR_MESSAGE);

  setUnauthorizedHandler(null);

  // getList mapping: items -> data, total -> total.
  const listBody: AdminCourtListResponseDTO = {
    items: [
      {
        id: 'c1',
        slug: 'court-one',
        name: 'Court One',
        status: 'draft',
        isLocked: false,
        isFeatured: false,
        country: { id: 'co1', name: 'France' },
        region: { id: 'r1', name: 'Riviera' },
        heroImageUrl: null,
        imageCount: 0,
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ],
    page: 1,
    pageSize: 25,
    total: 1,
  };
  stubFetch({ status: 200, body: listBody });
  const listResult = await dataProvider.getList({
    resource: 'courts',
    pagination: { currentPage: 1, pageSize: 25 },
    filters: [{ field: 'q', operator: 'contains', value: 'one' }],
  });
  expectEqual('getList maps items -> data', listResult.data, listBody.items);
  expectEqual('getList maps total -> total', listResult.total, listBody.total);
  expectTrue('getList forwards the q filter as a query param', captured[0]?.url.includes('q=one'));

  // buildCourtPatch: only the changed field is included.
  const original: AdminCourtDetailDTO = {
    id: 'c1',
    slug: 'court-one',
    name: 'Court One',
    status: 'draft',
    isLocked: false,
    isFeatured: false,
    countryId: 'co1',
    regionId: 'r1',
    country: { id: 'co1', name: 'France' },
    region: { id: 'r1', name: 'Riviera' },
    surface: 'Clay',
    setting: 'Resort',
    access: 'Resort',
    indoorOutdoor: 'Outdoor',
    isScenic: false,
    blurb: 'A lovely court.',
    tags: [],
    lat: 43.0,
    lng: 7.0,
    mapLinkUrl: null,
    approxLat: 43.02,
    approxLng: 7.02,
    mapX: 50,
    mapY: 50,
    seedOrder: 1,
    images: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
  const formValues: CourtFormValues = {
    name: original.name,
    slug: original.slug,
    countryId: original.countryId,
    regionId: original.regionId,
    lat: original.lat,
    lng: original.lng,
    mapLinkUrl: '',
    surface: original.surface,
    setting: original.setting,
    access: original.access,
    indoorOutdoor: original.indoorOutdoor,
    isScenic: original.isScenic,
    isFeatured: original.isFeatured,
    isLocked: original.isLocked,
    status: original.status,
    blurb: 'A newly rewritten blurb.',
    tags: original.tags,
  };
  const patch = buildCourtPatch(original, formValues);
  expectEqual('buildCourtPatch includes only the changed field', Object.keys(patch), ['blurb']);
  expectEqual('buildCourtPatch carries the new value', patch.blurb, 'A newly rewritten blurb.');

  console.log('\n4. No token persistence / no dangerouslySetInnerHTML\n');

  const sourceFiles = listFilesRecursive(path.join(ADMIN_ROOT, 'src')).filter(
    (f) => f.endsWith('.ts') || f.endsWith('.tsx'),
  );
  const forbiddenPatterns: Array<{ label: string; pattern: RegExp }> = [
    { label: 'localStorage', pattern: /\blocalStorage\b/ },
    { label: 'sessionStorage', pattern: /\bsessionStorage\b/ },
    { label: 'document.cookie', pattern: /document\.cookie/ },
    { label: 'dangerouslySetInnerHTML', pattern: /dangerouslySetInnerHTML/ },
  ];
  for (const { label, pattern } of forbiddenPatterns) {
    const offenders = sourceFiles.filter((f) => pattern.test(readFileSync(f, 'utf8')));
    expectTrue(
      `no "${label}" in apps/admin/src`,
      offenders.length === 0,
      offenders.map((f) => path.relative(ADMIN_ROOT, f)).join(', '),
    );
  }

  console.log('\n5. Env scan\n');

  const envExample = readFileSync(path.join(ADMIN_ROOT, '.env.example'), 'utf8');
  const viteEnvNames = [...envExample.matchAll(/^(VITE_[A-Z0-9_]+)=/gm)].map((m) => m[1]!);
  expectTrue('at least one VITE_ variable found to check', viteEnvNames.length > 0);
  const secretish = /SECRET|KEY|TOKEN|PASSWORD/;
  const offendingNames = viteEnvNames.filter((n) => secretish.test(n));
  expectEqual('no VITE_* name contains SECRET/KEY/TOKEN/PASSWORD', offendingNames, []);

  console.log(`\nTotal checks: ${results.length}   Passed: ${results.filter((r) => r.ok).length}   Failed: ${results.filter((r) => !r.ok).length}\n`);

  const failed = results.filter((r) => !r.ok);
  if (failed.length > 0) {
    console.log('Failing checks:');
    for (const f of failed) console.log(`  - ${f.name}${f.detail ? ` (${f.detail})` : ''}`);
    process.exit(1);
  }
  console.log('\x1b[32mVERIFICATION PASSED — admin UI (TASK_74).\x1b[0m\n');
}

function listFilesRecursive(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...listFilesRecursive(full));
    } else {
      files.push(full);
    }
  }
  return files;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
