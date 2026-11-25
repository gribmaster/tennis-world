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

import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCoordinatesFromMapLink } from '../src/lib/maps-link-parser';
import { createSerialQueue } from '../src/lib/serial-queue';
import { createUploadBatchTracker } from '../src/lib/upload-batch';
import { slugify as adminSlugify } from '../src/lib/slugify';
// Relative import of the API's OWN slugify, harness-only (never from app code) —
// asserts the admin UI's auto-slug matches the API's rule byte for byte.
import { slugify as apiSlugify } from '../../api/src/courts/court-derived-fields';
import { buildCourtPatch, type CourtFormValues } from '../src/lib/court-patch';
import { apiFetch, setUnauthorizedHandler } from '../src/lib/api-client';
import { ApiError, NETWORK_ERROR_MESSAGE } from '../src/lib/api-error';
import { dataProvider } from '../src/lib/data-provider';
import {
  buildAgentErrorMessage,
  googleMapsPinLink,
  isCheckCurrent,
  osmLink,
  parseImportInput,
  summarizeForConfirm,
} from '../src/lib/court-import';
import { importCourts } from '../src/lib/court-import-api';
import type { AdminCourtDetailDTO, AdminCourtImportReportDTO, AdminCourtListResponseDTO } from '@tennis/contracts';

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

  console.log('\n6. Serial upload queue (TASK_77)\n');

  function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Runs strictly in enqueue order, even with staggered delays that would
  // otherwise let a later, faster task finish first.
  {
    const queue = createSerialQueue();
    const order: number[] = [];
    const tasks = [
      queue.enqueue(async () => {
        await delay(30);
        order.push(1);
        return 1;
      }),
      queue.enqueue(async () => {
        await delay(10);
        order.push(2);
        return 2;
      }),
      queue.enqueue(async () => {
        await delay(20);
        order.push(3);
        return 3;
      }),
    ];
    const settled = await Promise.all(tasks);
    expectEqual('queue runs tasks strictly in enqueue order', order, [1, 2, 3]);
    expectEqual('each promise settles with its own task result', settled, [1, 2, 3]);
  }

  // Max observed concurrency is 1 — a shared counter never rises above 1
  // while tasks with staggered delays are in flight.
  {
    const queue = createSerialQueue();
    let active = 0;
    let maxActive = 0;
    const tasks = [15, 5, 10].map((ms) =>
      queue.enqueue(async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await delay(ms);
        active -= 1;
      }),
    );
    await Promise.all(tasks);
    expectEqual('max observed concurrency is 1', maxActive, 1);
  }

  // A rejecting task rejects only its own promise and does not block later tasks.
  {
    const queue = createSerialQueue();
    const order: string[] = [];
    const p1 = queue.enqueue(async () => {
      order.push('a');
      throw new Error('task a failed');
    });
    const p2 = queue.enqueue(async () => {
      await delay(5);
      order.push('b');
      return 'b';
    });
    let p1Rejected = false;
    let p1Message: string | undefined;
    try {
      await p1;
    } catch (err) {
      p1Rejected = true;
      p1Message = err instanceof Error ? err.message : undefined;
    }
    const p2Result = await p2;
    expectTrue('a rejecting task rejects only its own promise', p1Rejected);
    expectEqual('the rejection carries the task\'s own error', p1Message, 'task a failed');
    expectEqual('later tasks still run after an earlier rejection', p2Result, 'b');
    expectEqual('tasks still ran in enqueue order despite the rejection', order, ['a', 'b']);
  }

  // Enqueuing after the queue has already drained still works.
  {
    const queue = createSerialQueue();
    const first = await queue.enqueue(async () => 'first');
    expectEqual('enqueue works before any drain', first, 'first');
    const second = await queue.enqueue(async () => 'second');
    expectEqual('enqueue after the queue has drained still works', second, 'second');
  }

  console.log('\n7. Upload batch tracker (TASK_78 fix 2)\n');

  // onDrained fires exactly once per drained batch, carrying hadSuccess = true.
  {
    const calls: string[] = [];
    const tracker = createUploadBatchTracker({
      onPendingChange: (n) => calls.push(`pending:${n}`),
      onDrained: (hadSuccess) => calls.push(`drained:${hadSuccess}`),
    });
    tracker.start();
    tracker.start();
    tracker.finish(true);
    tracker.finish(true);
    expectEqual(
      'onDrained fires exactly once per drained batch, after the pending count hits 0',
      calls,
      ['pending:1', 'pending:2', 'pending:1', 'pending:0', 'drained:true'],
    );
  }

  // finish(false) for every file in the batch -> onDrained never fires.
  {
    const calls: string[] = [];
    const tracker = createUploadBatchTracker({
      onPendingChange: (n) => calls.push(`pending:${n}`),
      onDrained: (hadSuccess) => calls.push(`drained:${hadSuccess}`),
    });
    tracker.start();
    tracker.start();
    tracker.finish(false);
    tracker.finish(false);
    expectTrue(
      'onDrained never fires when every file in the batch failed',
      !calls.some((c) => c.startsWith('drained')),
      JSON.stringify(calls),
    );
    expectEqual('onPendingChange still reports the drain to 0', calls, ['pending:1', 'pending:2', 'pending:1', 'pending:0']);
  }

  // Mixed success/failure -> fires once with hadSuccess = true.
  {
    const calls: string[] = [];
    const tracker = createUploadBatchTracker({
      onPendingChange: (n) => calls.push(`pending:${n}`),
      onDrained: (hadSuccess) => calls.push(`drained:${hadSuccess}`),
    });
    tracker.start();
    tracker.start();
    tracker.start();
    tracker.finish(false);
    tracker.finish(true);
    tracker.finish(false);
    const drainedCalls = calls.filter((c) => c.startsWith('drained'));
    expectEqual('mixed success/failure fires onDrained exactly once, with hadSuccess = true', drainedCalls, ['drained:true']);
  }

  // A second batch after a drain behaves independently (no leftover state).
  {
    const calls: string[] = [];
    const tracker = createUploadBatchTracker({
      onPendingChange: (n) => calls.push(`pending:${n}`),
      onDrained: (hadSuccess) => calls.push(`drained:${hadSuccess}`),
    });
    tracker.start();
    tracker.finish(true);
    tracker.start();
    tracker.finish(false);
    const drainedCalls = calls.filter((c) => c.startsWith('drained'));
    expectEqual(
      'a second batch after a drain behaves independently (no leftover hadSuccess)',
      drainedCalls,
      ['drained:true'],
    );
  }

  // Callbacks are never invoked re-entrantly (no call nests inside another's
  // call stack) — assert call ORDER with a log that records enter/exit of
  // each callback.
  {
    const log: string[] = [];
    let depth = 0;
    let maxDepth = 0;
    function wrap(label: string, fn: (...args: never[]) => void) {
      return (...args: never[]) => {
        depth += 1;
        maxDepth = Math.max(maxDepth, depth);
        log.push(`enter:${label}`);
        fn(...args);
        log.push(`exit:${label}`);
        depth -= 1;
      };
    }
    const tracker = createUploadBatchTracker({
      onPendingChange: wrap('onPendingChange', () => undefined),
      onDrained: wrap('onDrained', () => undefined),
    });
    tracker.start();
    tracker.finish(true);
    expectTrue('no callback is ever invoked re-entrantly from inside another', maxDepth === 1, JSON.stringify(log));
    expectEqual(
      'onPendingChange(0) fully returns before onDrained is called',
      log,
      ['enter:onPendingChange', 'exit:onPendingChange', 'enter:onPendingChange', 'exit:onPendingChange', 'enter:onDrained', 'exit:onDrained'],
    );
  }

  console.log('\n8. No side effects inside a setState updater (CourtPhotosPanel.tsx)\n');

  {
    const panelSource = readFileSync(
      path.join(ADMIN_ROOT, 'src', 'components', 'CourtPhotosPanel.tsx'),
      'utf8',
    );
    // Flag any `set\w+((arg) => ...)` whose own body — found by balancing
    // parens from the call's opening `(` to its matching close, not a fixed
    // char window (which would false-positive on unrelated code that happens
    // to follow a short updater) — calls `onChanged(`.
    const offenders: string[] = [];
    const callOpenPattern = /set\w+\(/g;
    let m: RegExpExecArray | null;
    while ((m = callOpenPattern.exec(panelSource))) {
      const openParenIndex = m.index + m[0].length - 1;
      const argStart = panelSource.slice(openParenIndex + 1, openParenIndex + 50);
      if (!/^\s*\(?\w*\)?\s*=>/.test(argStart)) continue; // not an updater function

      let depth = 0;
      let i = openParenIndex;
      for (; i < panelSource.length; i++) {
        if (panelSource[i] === '(') depth++;
        else if (panelSource[i] === ')') {
          depth--;
          if (depth === 0) break;
        }
      }
      const callText = panelSource.slice(openParenIndex, i + 1);
      if (/onChanged\(/.test(callText)) {
        offenders.push(panelSource.slice(m.index, m.index + 60));
      }
    }
    expectTrue(
      'no setState updater function body calls onChanged(...)',
      offenders.length === 0,
      offenders.join(' | '),
    );
  }

  console.log('\n9. Court import — parseImportInput (TASK_80)\n');

  {
    const r1 = parseImportInput(JSON.stringify({ courts: [{ name: 'A' }, { name: 'B' }] }));
    expectTrue('valid object parses ok', r1.ok && r1.courts.length === 2 && !r1.wrapped);

    const r2 = parseImportInput(JSON.stringify([{ name: 'A' }]));
    expectTrue('bare array is wrapped', r2.ok && r2.wrapped === true && r2.courts.length === 1);

    const r3 = parseImportInput('');
    expectTrue('empty string is a clean error', !r3.ok);

    const r4 = parseImportInput('   \n\t  ');
    expectTrue('whitespace-only is a clean error', !r4.ok);

    const r5 = parseImportInput('{ "courts": [}');
    expectTrue('invalid JSON is a clean error', !r5.ok);

    // A trailing comma is a case where V8's own JSON.parse message carries a
    // line/column ("... at position N (line L column C)") — forwarded as-is
    // ("when available", per the task spec; not every invalid-JSON message
    // carries one, e.g. the r5 case above).
    const r5b = parseImportInput('{"courts": [{"a":1,}]}');
    expectTrue(
      'invalid JSON message carries line and column when the parser provides one',
      !r5b.ok && /line \d+ column \d+/.test(r5b.message),
      !r5b.ok ? r5b.message : undefined,
    );

    const r6 = parseImportInput(JSON.stringify({ notCourts: [] }));
    expectTrue('object without a courts array is a clean error', !r6.ok);

    const r7 = parseImportInput(JSON.stringify({ courts: 'nope' }));
    expectTrue('courts not an array is a clean error', !r7.ok);

    const r8 = parseImportInput(JSON.stringify({ courts: [] }));
    expectTrue('0 courts is a clean error', !r8.ok);

    const fiftyOne = Array.from({ length: 51 }, (_, i) => ({ name: `Court ${i}` }));
    const r9 = parseImportInput(JSON.stringify({ courts: fiftyOne }));
    expectTrue('51 courts is a clean error', !r9.ok);

    const tooBig = JSON.stringify({ courts: [{ blurb: 'x'.repeat(1024 * 1024 + 1) }] });
    const r10 = parseImportInput(tooBig);
    expectEqual('> 1 MB text message', !r10.ok ? r10.message : undefined, 'File is too large (max 1 MB).');

    for (const bad of ['null', '42', '"a string"']) {
      const r = parseImportInput(bad);
      expectTrue(`top-level JSON ${bad} is a clean error, not a crash`, !r.ok);
    }

    const bom = `﻿${JSON.stringify({ courts: [{ name: 'A' }] })}`;
    const r11 = parseImportInput(bom);
    expectTrue('a leading BOM is stripped and the JSON still parses', r11.ok);

    const crlf = '{\r\n  "courts": [\r\n    { "name": "A" }\r\n  ]\r\n}';
    const r12 = parseImportInput(crlf);
    expectTrue('Windows line endings parse ok', r12.ok);

    const longLine = JSON.stringify({ courts: [{ name: 'A'.repeat(5000) }] });
    const r13 = parseImportInput(longLine);
    expectTrue('a very long single line parses ok', r13.ok);
  }

  console.log('\n10. Court import — buildAgentErrorMessage (TASK_80)\n');

  {
    const report: AdminCourtImportReportDTO = {
      dryRun: true,
      ok: false,
      summary: { total: 3, valid: 1, invalid: 2, newCountries: 0, newRegions: 0, warnings: 0 },
      items: [
        {
          index: 0,
          name: 'Alpha',
          slug: 'alpha',
          status: 'ok',
          errors: [],
          warnings: [],
          resolved: { country: 'existing', region: 'existing', isLocked: true },
          sources: [],
          notes: null,
        },
        {
          index: 1,
          name: null,
          slug: null,
          status: 'error',
          errors: [{ path: 'name', message: 'name is required.' }],
          warnings: [],
          resolved: { country: null, region: null, isLocked: null },
          sources: [],
          notes: null,
        },
        {
          index: 2,
          name: 'Gamma "Court"\nWith a newline',
          slug: null,
          status: 'error',
          errors: [
            { path: 'surface', message: 'must be one of: Clay, Hard, Grass.' },
            { path: 'tags[1]', message: 'unknown tag "Foo".' },
          ],
          warnings: [],
          resolved: { country: null, region: null, isLocked: null },
          sources: [],
          notes: null,
        },
      ],
    };
    const expected = [
      'Court 2: `name` name is required.',
      'Court 3 ("Gamma "Court" With a newline"): `surface` must be one of: Clay, Hard, Grass.',
      'Court 3 ("Gamma "Court" With a newline"): `tags[1]` unknown tag "Foo".',
      '',
      'Return the corrected JSON only.',
    ].join('\n');
    expectEqual('message is 1-based, names courts without a name "Court N", preserves paths', buildAgentErrorMessage(report), expected);
    expectTrue('message is plain text (no markdown/HTML beyond backticks)', !/<[a-z]/i.test(buildAgentErrorMessage(report)));

    const emptyReport: AdminCourtImportReportDTO = {
      dryRun: true,
      ok: true,
      summary: { total: 1, valid: 1, invalid: 0, newCountries: 0, newRegions: 0, warnings: 0 },
      items: [
        {
          index: 0,
          name: 'A',
          slug: 'a',
          status: 'ok',
          errors: [],
          warnings: [],
          resolved: { country: 'existing', region: 'existing', isLocked: true },
          sources: [],
          notes: null,
        },
      ],
    };
    expectEqual('an all-ok report produces an empty string', buildAgentErrorMessage(emptyReport), '');
  }

  console.log('\n11. Court import — osmLink (TASK_80)\n');

  {
    expectEqual(
      'valid coordinates -> exact expected URL',
      osmLink(45.4642, 9.19),
      'https://www.openstreetmap.org/?mlat=45.4642&mlon=9.19#map=14/45.4642/9.19',
    );
    expectEqual(
      'negative coordinates',
      osmLink(-33.8688, 151.2093),
      'https://www.openstreetmap.org/?mlat=-33.8688&mlon=151.2093#map=14/-33.8688/151.2093',
    );
    expectEqual('NaN -> null', osmLink(Number.NaN, 9), null);
    expectEqual('Infinity -> null', osmLink(45, Number.POSITIVE_INFINITY), null);
    expectEqual('out-of-range latitude -> null', osmLink(200, 9), null);
    expectEqual('out-of-range longitude -> null', osmLink(45, 200), null);
    expectEqual('a string -> null', osmLink('45', 9), null);
    expectEqual(
      'no scientific notation for very small numbers',
      osmLink(1e-7, 1e-7),
      'https://www.openstreetmap.org/?mlat=0.0000001&mlon=0.0000001#map=14/0.0000001/0.0000001',
    );
  }

  console.log('\n12. Court import — summarizeForConfirm / isCheckCurrent (TASK_80)\n');

  {
    const sampleReport: AdminCourtImportReportDTO = {
      dryRun: true,
      ok: true,
      summary: { total: 4, valid: 4, invalid: 0, newCountries: 2, newRegions: 3, warnings: 1 },
      items: [],
    };
    expectEqual('summarizeForConfirm reads the summary counts', summarizeForConfirm(sampleReport), {
      drafts: 4,
      newCountries: 2,
      newRegions: 3,
    });

    expectTrue('isCheckCurrent true for identical text', isCheckCurrent('abc', 'abc'));
    expectTrue('isCheckCurrent false for a trailing space', !isCheckCurrent('abc', 'abc '));
    expectTrue('isCheckCurrent false when nothing has been checked yet', !isCheckCurrent(null, 'abc'));
  }

  console.log('\n13. Court import — wiring through apiFetch (TASK_80)\n');

  {
    const okReport: AdminCourtImportReportDTO = {
      dryRun: true,
      ok: true,
      summary: { total: 1, valid: 1, invalid: 0, newCountries: 0, newRegions: 0, warnings: 0 },
      items: [],
    };
    stubFetch({ status: 200, body: okReport });
    await importCourts([{ name: 'A' }], true);
    expectTrue('Check sets credentials: include', captured[0]?.init.credentials === 'include');
    expectEqual(
      'Check sets X-Tennis-Admin: 1',
      (captured[0]?.init.headers as Record<string, string>)?.['X-Tennis-Admin'],
      '1',
    );
    expectEqual(
      'Check sends { courts, dryRun: true }',
      JSON.parse(String(captured[0]?.init.body)),
      { courts: [{ name: 'A' }], dryRun: true },
    );

    stubFetch({ status: 201, body: { ...okReport, dryRun: false } });
    await importCourts([{ name: 'A' }], false);
    expectEqual('Create sends dryRun: false', JSON.parse(String(captured[0]?.init.body)).dryRun, false);

    const errorReport: AdminCourtImportReportDTO = {
      dryRun: false,
      ok: false,
      summary: { total: 1, valid: 0, invalid: 1, newCountries: 0, newRegions: 0, warnings: 0 },
      items: [
        {
          index: 0,
          name: 'A',
          slug: 'a',
          status: 'error',
          errors: [{ path: 'slug', message: 'slug "a" already exists.' }],
          warnings: [],
          resolved: { country: null, region: null, isLocked: null },
          sources: [],
          notes: null,
        },
      ],
    };
    stubFetch({ status: 422, body: errorReport });
    let caught422: ApiError | undefined;
    try {
      await importCourts([{ name: 'A' }], false);
    } catch (err) {
      caught422 = err instanceof ApiError ? err : undefined;
    }
    expectTrue(
      '422 surfaces the full report body, not just a message',
      JSON.stringify(caught422?.body) === JSON.stringify(errorReport),
    );

    stubFetch({ status: 413, body: { message: 'Request entity too large' } });
    let caught413: ApiError | undefined;
    try {
      await importCourts([{ name: 'A' }], true);
    } catch (err) {
      caught413 = err instanceof ApiError ? err : undefined;
    }
    expectEqual('413 maps to statusCode 413', caught413?.statusCode, 413);

    (globalThis as { fetch: typeof fetch }).fetch = (async () =>
      new Response(JSON.stringify({ message: 'Too Many Requests' }), {
        status: 429,
        headers: { 'Retry-After': '42' },
      })) as typeof fetch;
    let caught429: ApiError | undefined;
    try {
      await importCourts([{ name: 'A' }], true);
    } catch (err) {
      caught429 = err instanceof ApiError ? err : undefined;
    }
    expectEqual('429 surfaces Retry-After as retryAfterSeconds', caught429?.retryAfterSeconds, 42);

    stubFetch({ throws: true });
    let networkMessage2: string | undefined;
    try {
      await importCourts([{ name: 'A' }], true);
    } catch (err) {
      networkMessage2 = err instanceof ApiError ? err.message : undefined;
    }
    expectEqual('a network failure on import becomes "Can\'t reach the server"', networkMessage2, NETWORK_ERROR_MESSAGE);
  }

  console.log('\n14. Court import — source scans (TASK_80, extends section 4)\n');

  {
    const newFiles = [
      path.join(ADMIN_ROOT, 'src', 'pages', 'CourtImportPage.tsx'),
      path.join(ADMIN_ROOT, 'src', 'lib', 'court-import.ts'),
      path.join(ADMIN_ROOT, 'src', 'lib', 'court-import-api.ts'),
    ];

    const blankTargetOffenders: string[] = [];
    for (const file of newFiles) {
      const content = readFileSync(file, 'utf8');
      const anchorTags = content.match(/<a\b[^>]*>/g) ?? [];
      for (const tag of anchorTags) {
        if (tag.includes('target="_blank"') && !tag.includes('rel="noopener noreferrer"')) {
          blankTargetOffenders.push(`${path.basename(file)}: ${tag}`);
        }
      }
    }
    expectTrue(
      'every target="_blank" anchor in the new files has rel="noopener noreferrer"',
      blankTargetOffenders.length === 0,
      blankTargetOffenders.join(' | '),
    );

    const apiImportOffenders = newFiles.filter((f) => /apps\/api|\.\.\/\.\.\/api\//.test(readFileSync(f, 'utf8')));
    expectTrue(
      'the new import page/lib files import nothing from apps/api',
      apiImportOffenders.length === 0,
      apiImportOffenders.join(', '),
    );

    const directFetchOffenders = sourceFiles.filter(
      (f) => !f.endsWith(path.join('lib', 'api-client.ts')) && /\bfetch\(/.test(readFileSync(f, 'utf8')),
    );
    expectTrue(
      'no direct fetch( outside api-client.ts',
      directFetchOffenders.length === 0,
      directFetchOffenders.map((f) => path.relative(ADMIN_ROOT, f)).join(', '),
    );
  }

  console.log('\n15. Kit copy step (TASK_80)\n');

  {
    const scriptPath = path.join(ADMIN_ROOT, 'scripts', 'copy-court-import-kit.mjs');
    const realKitDir = path.resolve(ADMIN_ROOT, '..', '..', 'docs', 'court-import');
    const tmpBase = mkdtempSync(path.join(os.tmpdir(), 'court-import-kit-'));

    const badSrc = path.join(tmpBase, 'src-missing');
    const badDest = path.join(tmpBase, 'dest-missing');
    mkdirSync(badSrc, { recursive: true });
    writeFileSync(path.join(badSrc, 'court-import.schema.json'), '{}');
    writeFileSync(path.join(badSrc, 'AGENT_PROMPT.md'), 'x');
    writeFileSync(path.join(badSrc, 'example.json'), '{}');
    // CLIENT_GUIDE.ru.md is deliberately left out.
    const failRun = spawnSync(process.execPath, [scriptPath, badSrc, badDest], { encoding: 'utf8' });
    expectTrue(
      'copy script exits non-zero when a source file is missing',
      failRun.status !== 0,
      `exit ${failRun.status}: ${failRun.stderr}`,
    );
    expectTrue(
      "copy script's error message names the missing file",
      failRun.stderr.includes('CLIENT_GUIDE.ru.md'),
      failRun.stderr,
    );
    expectTrue('nothing was copied to the dest dir on failure', !existsSync(badDest));

    const goodDest = path.join(tmpBase, 'dest-ok');
    const okRun = spawnSync(process.execPath, [scriptPath, realKitDir, goodDest], { encoding: 'utf8' });
    expectTrue('copy script exits 0 on a normal run', okRun.status === 0, okRun.stderr);

    const kitFiles = ['court-import.schema.json', 'AGENT_PROMPT.md', 'example.json', 'CLIENT_GUIDE.ru.md'];
    for (const f of kitFiles) {
      const src = readFileSync(path.join(realKitDir, f));
      const destPath = path.join(goodDest, f);
      const dest = existsSync(destPath) ? readFileSync(destPath) : null;
      expectTrue(`${f} exists under the dest dir and is byte-identical to docs/court-import`, dest !== null && src.equals(dest));
    }

    rmSync(tmpBase, { recursive: true, force: true });
  }

  console.log('\n16. Court import — TASK_82 amendments\n');

  {
    // #1a: the pre-parse guard measures UTF-8 BYTES, not JS string length —
    // a multi-byte-heavy text can be well under 1,048,576 "characters" yet
    // over the byte limit.
    const multiByteValue = '€'.repeat(400_000); // '€' is 3 bytes in UTF-8, 1 UTF-16 code unit
    const multiByteText = JSON.stringify({ courts: [{ pad: multiByteValue }] });
    expectTrue(
      'multi-byte text under 1 MB in characters but over in UTF-8 bytes is rejected',
      multiByteText.length < 1_048_576 && !parseImportInput(multiByteText).ok,
    );

    // #1b: the 1 KB margin applies to the RE-SERIALISED request body
    // (`{ courts, dryRun: true }`), not the pasted text — calibrate the
    // padding needed to land exactly on the boundary rather than guessing.
    const MAX_BODY_BYTES_EXPECTED = 1024 * 1024 - 1024;
    function bodyBytesForPad(padLength: number): number {
      return new TextEncoder().encode(JSON.stringify({ courts: [{ pad: 'x'.repeat(padLength) }], dryRun: true }))
        .length;
    }
    function rawTextForPad(padLength: number): string {
      return JSON.stringify({ courts: [{ pad: 'x'.repeat(padLength) }] });
    }
    const overheadBytes = bodyBytesForPad(0);
    const padAtLimit = MAX_BODY_BYTES_EXPECTED - overheadBytes;
    const atLimitResult = parseImportInput(rawTextForPad(padAtLimit));
    expectTrue(
      'a request body landing exactly on the 1 KB margin boundary is accepted',
      atLimitResult.ok,
      atLimitResult.ok ? undefined : atLimitResult.message,
    );
    const overLimitResult = parseImportInput(rawTextForPad(padAtLimit + 1));
    expectTrue(
      'a request body one byte past the 1 KB margin boundary is rejected',
      !overLimitResult.ok,
    );

    // #2: fenced code blocks (an agent's chat answer).
    const sampleCourts = [{ name: 'A' }];
    const sampleJson = JSON.stringify({ courts: sampleCourts });

    const fencedWithTag = parseImportInput(`\`\`\`json\n${sampleJson}\n\`\`\``);
    expectTrue(
      'a ```json fenced block is parsed, with fenced: true',
      fencedWithTag.ok && fencedWithTag.fenced && !fencedWithTag.wrapped && fencedWithTag.courts.length === 1,
    );

    const fencedBare = parseImportInput(`\`\`\`\n${sampleJson}\n\`\`\``);
    expectTrue('a bare ``` fenced block (no "json" tag) is parsed', fencedBare.ok && fencedBare.fenced);

    const fencedCrlf = parseImportInput(`\`\`\`json\r\n${sampleJson}\r\n\`\`\``);
    expectTrue('a fenced block with Windows (CRLF) line endings is parsed', fencedCrlf.ok && fencedCrlf.fenced);

    const fencedWithTrailingNote = parseImportInput(
      `\`\`\`json\n${sampleJson}\n\`\`\`\n\nCOULD NOT VERIFY: Some Court (no official source found)`,
    );
    expectTrue(
      'text after the closing fence (a "COULD NOT VERIFY:" note) is ignored',
      fencedWithTrailingNote.ok && fencedWithTrailingNote.fenced && fencedWithTrailingNote.courts.length === 1,
    );

    const unterminated = parseImportInput(`\`\`\`json\n${sampleJson}`);
    expectEqual(
      'an unterminated fence is a clean error naming the missing close',
      unterminated.ok ? undefined : unterminated.message,
      'The JSON block is not closed (missing closing ```).',
    );

    const proseBeforeFence = parseImportInput(`Here is the file:\n\`\`\`json\n${sampleJson}\n\`\`\``);
    expectTrue(
      'prose before the fence falls back to the normal invalid-JSON message',
      !proseBeforeFence.ok && proseBeforeFence.message.startsWith('Invalid JSON:'),
      proseBeforeFence.ok ? undefined : proseBeforeFence.message,
    );

    const bomPlusFence = parseImportInput(`﻿\`\`\`json\n${sampleJson}\n\`\`\``);
    expectTrue('a BOM followed by a fenced block is parsed', bomPlusFence.ok && bomPlusFence.fenced);

    const twoFencedBlocks = parseImportInput(
      `\`\`\`json\n${JSON.stringify({ courts: [{ name: 'First' }] })}\n\`\`\`\n\`\`\`json\n${JSON.stringify({ courts: [{ name: 'Second' }] })}\n\`\`\``,
    );
    expectTrue(
      'two fenced blocks: only the first is used',
      twoFencedBlocks.ok &&
        twoFencedBlocks.fenced &&
        (twoFencedBlocks.courts[0] as { name: string }).name === 'First',
    );

    const fencedBareArray = parseImportInput(`\`\`\`json\n${JSON.stringify([{ name: 'A' }])}\n\`\`\``);
    expectTrue(
      'a fenced block containing a bare array is both wrapped and fenced',
      fencedBareArray.ok && fencedBareArray.fenced && fencedBareArray.wrapped,
    );

    // #3: googleMapsPinLink.
    expectEqual(
      'googleMapsPinLink: typical coordinates',
      googleMapsPinLink(45.4642, 9.19),
      'https://www.google.com/maps/search/?api=1&query=45.4642,9.19',
    );
    expectEqual(
      'googleMapsPinLink: negative coordinates',
      googleMapsPinLink(-33.8688, 151.2093),
      'https://www.google.com/maps/search/?api=1&query=-33.8688,151.2093',
    );
    expectEqual('googleMapsPinLink: zero is a valid coordinate', googleMapsPinLink(0, 0), 'https://www.google.com/maps/search/?api=1&query=0,0');
    expectEqual('googleMapsPinLink: out-of-range -> null', googleMapsPinLink(200, 9), null);
    expectEqual('googleMapsPinLink: NaN -> null', googleMapsPinLink(Number.NaN, 9), null);
    expectEqual('googleMapsPinLink: tiny numbers (1e-7) -> null (exponent form)', googleMapsPinLink(1e-7, 1e-7), null);
  }

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
