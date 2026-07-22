/* eslint-disable no-console */
//
// Court content importer — reads `content/<court-folder>/info.txt` + photos and
// maps them into the existing Prisma Court/CourtImage/Country/Region schema
// (schema.prisma — NOT redesigned here). Safe by default:
//
//   pnpm --filter @tennis/api db:import-courts-content -- --dry-run              (default)
//   pnpm --filter @tennis/api db:import-courts-content -- --resolve-coordinates  (Nominatim, one-time)
//   pnpm --filter @tennis/api db:import-courts-content -- --replace              (explicit mutation)
//
// `--dry-run` is the DEFAULT behavior — running the script with no flags, or with
// `--dry-run`, only parses/validates/plans and prints a report. Nothing is written
// to the DB and no files are copied/deleted, and NO network request is made — the
// only coordinate sources it consults are `content/coordinates.json` (a local file)
// and the Google Maps redirect target (already a network call this script made
// before this feature; still no Nominatim). `--replace` is required to mutate
// anything, and even then it refuses to run if any court fails validation (Step 8
// "never delete old courts unless every new court passes required validation").
//
// `--resolve-coordinates` is a SEPARATE, explicit, one-time local content-import
// utility mode. It is the only mode that talks to OpenStreetMap Nominatim, and it
// ONLY reads/writes `content/coordinates.json` — never the database, never images.
// It must never run as part of the production application (no endpoint, no cron,
// no build step calls it). See `runResolveCoordinates` for the usage-policy
// compliance details (sequential, rate-limited, custom User-Agent, no autocomplete,
// clean stop on 403/429/5xx, permanent caching).
//
// The `--replace` transaction body is intentionally NOT implemented yet (out of
// scope for the current dry-run task). `--replace` currently prints the same plan
// and exits without touching the DB, so it is safe to invoke while the real
// replacement logic is still pending review.
//
// ── Schema recap (see apps/api/prisma/schema.prisma) ─────────────────────────
//   Court: slug(unique) name regionId countryId lat lng approxLat approxLng
//          mapX mapY surface setting access indoorOutdoor isScenic isFeatured
//          isLocked status blurb seedOrder
//   CourtImage: courtId url alt sortOrder isHero
//   Country: id name isoCode(unique) continent
//   Region: id countryId name lat lng
// Dependent tables on delete (Step 8 plan only, not executed): CourtImage,
// CollectionCourt, SavedCourt, UserCollectionCourt, then Court itself.
// ─────────────────────────────────────────────────────────────────────────────

import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { COURTS } from '@tennis/mock-data';

// ── CLI flags ─────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const REPLACE = args.includes('--replace');
const RESOLVE_COORDINATES = args.includes('--resolve-coordinates');
// `--dry-run` (or no flag at all) is the default mode whenever neither of the
// above is passed — see runDryRunOrReplace/runResolveCoordinates dispatch below.

const CONTENT_ROOT = path.resolve(__dirname, '..', '..', '..', 'content');
const WEB_PUBLIC_COURTS_DIR = path.resolve(
  __dirname,
  '..',
  '..',
  'web',
  'public',
  'courts',
);
const COORDINATES_FILE = path.join(CONTENT_ROOT, 'coordinates.json');

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif']);
const PRIMARY_IMAGE_BASENAMES = new Set(['cover', 'hero', 'main']);

// Closed vocabularies mirrored from packages/contracts/src/enums.ts + schema.prisma.
// Do NOT invent new enum values — unmapped tokens are reported, never coerced.
const SURFACE_VALUES = ['Clay', 'Hard', 'Grass'] as const;
type Surface = (typeof SURFACE_VALUES)[number];
const ACCESS_VALUES = ['Resort', 'Club', 'Academy', 'Private'] as const;
type AccessType = (typeof ACCESS_VALUES)[number];
const INDOOR_OUTDOOR_VALUES = ['Indoor', 'Outdoor'] as const;
type IndoorOutdoor = (typeof INDOOR_OUTDOOR_VALUES)[number];

/** Token → surface. Matched case-insensitively against the whole token text. */
const SURFACE_TOKEN_MAP: { pattern: RegExp; value: Surface }[] = [
  { pattern: /\bhard\s*courts?\b/i, value: 'Hard' },
  { pattern: /\bclay\s*courts?\b/i, value: 'Clay' },
  { pattern: /\bgrass\s*courts?\b/i, value: 'Grass' },
];

/** Token → access type. */
const ACCESS_TOKEN_MAP: { pattern: RegExp; value: AccessType }[] = [
  { pattern: /\bprivate\s*club\b/i, value: 'Private' },
  { pattern: /\btennis\s*academy\b/i, value: 'Academy' },
  { pattern: /\bacademy\b/i, value: 'Academy' },
  { pattern: /\bluxury\s*hotel\b/i, value: 'Resort' },
  { pattern: /\bboutique\s*hotell?\b/i, value: 'Resort' },
  { pattern: /\bhotel\b/i, value: 'Resort' },
  { pattern: /\bresort\b/i, value: 'Resort' },
  { pattern: /\bclub\b/i, value: 'Club' },
];

/** Token → indoor/outdoor. Default is Outdoor when nothing matches. */
const INDOOR_TOKEN_PATTERN = /\bindoor\b/i;
const OUTDOOR_TOKEN_PATTERN = /\boutdoor\b/i;

/** Tokens that flag `isScenic = true` (view/scenery descriptors). */
const SCENIC_TOKEN_PATTERN =
  /\b(view|alpine|sea|lake|mountain|hills?|coast|beach|estate|garden|park)\b/i;

/**
 * Tokens that are recognized descriptors but are deliberately NOT surface values
 * (e.g. "floating court" describes the court's setting/construction, not its
 * playing surface — Clay/Hard/Grass are the only valid `Surface` enum values).
 * Matching one of these suppresses the generic "unmapped token" warning for it
 * while still leaving `surface` unset, so the caller can distinguish "no surface
 * token was ever present" from "a token was garbled/unrecognized".
 */
const NON_SURFACE_DESCRIPTOR_PATTERN = /\bfloating\s*courts?\b/i;

interface ParsedInfo {
  raw: Record<string, string>;
  name?: string;
  location?: string;
  mapLink?: string;
  description?: string;
  type?: string;
  typeTokens: string[];
  warnings: string[];
  errors: string[];
}

interface ImageEntry {
  filename: string;
  absPath: string;
  sizeBytes: number;
  readable: boolean;
}

interface CourtPlan {
  folderName: string;
  folderAbsPath: string;
  slug: string;
  slugSource: 'folder' | 'name';
  info: ParsedInfo;
  images: ImageEntry[];
  primaryImage?: ImageEntry;
  displayLocation?: string;
  country?: string;
  region?: string;
  surface?: Surface;
  access?: AccessType;
  indoorOutdoor?: IndoorOutdoor;
  isScenic: boolean;
  unmappedTypeTokens: string[];
  remainingSettingTokens: string[];
  noSurfaceTokenPresent: boolean;
  lat?: number;
  lng?: number;
  approxLat?: number;
  approxLng?: number;
  /** Leaflet initial zoom level for this court's detail map (from content/coordinates.json). */
  zoom?: number;
  coordSource?: string;
  coordMatchLevel?: MatchLevel;
  coordDisplayName?: string;
  coordEvidenceUrl?: string;
  coordNotes?: string;
  warnings: string[];
  errors: string[];
  plannedImageCopies: { from: string; to: string }[];
}

const REQUIRED_KEYS = ['name', 'location', 'map link', 'description', 'type'] as const;
const KNOWN_KEYS = new Set<string>(REQUIRED_KEYS);

// ── info.txt parsing ──────────────────────────────────────────────────────────

/**
 * Splits `info.txt` into top-level `key: value` entries, where a value may be a
 * quoted string spanning multiple lines (paragraph breaks preserved) or an
 * unquoted single-line value. Keys are matched case-insensitively against the
 * known vocabulary (`name`, `location`, `map link`, `description`, `type`).
 */
function splitEntries(text: string): { key: string; rawKey: string; value: string }[] {
  const entries: { key: string; rawKey: string; value: string }[] = [];
  // A new top-level entry starts at the beginning of a line with `<word(s)> :`
  // where the words are drawn from the known key vocabulary (case-insensitive).
  // This lets us tell a real "key:" line apart from a colon inside body text.
  const keyPattern = /^(name|location|map link|description|type)\s*:/i;
  const lines = text.split(/\r\n|\r|\n/);

  let currentRawKey: string | null = null;
  let currentValueLines: string[] = [];

  const flush = (): void => {
    if (currentRawKey === null) return;
    entries.push({
      key: currentRawKey.trim().toLowerCase(),
      rawKey: currentRawKey.trim(),
      value: currentValueLines.join('\n'),
    });
  };

  for (const line of lines) {
    const match = keyPattern.exec(line);
    if (match) {
      flush();
      currentRawKey = match[1]!;
      currentValueLines = [line.slice(match[0].length)];
    } else if (currentRawKey !== null) {
      currentValueLines.push(line);
    }
    // Lines before any recognized key are ignored (no known use case today).
  }
  flush();

  return entries;
}

/**
 * Resolves one raw multiline value blob into a clean string. Handles:
 *  - optional surrounding whitespace around the leading `:`;
 *  - a quoted value (single or multi-line) — strips the matching quotes and
 *    preserves internal blank lines (paragraph breaks) for description/type;
 *  - an unquoted single-line value — trimmed.
 */
function resolveValue(blob: string): string {
  const trimmedLeading = blob.replace(/^[ \t]+/, '');
  const trimmed = trimmedLeading.trim();

  if (trimmed.startsWith('"')) {
    // Find the CLOSING quote — it may be many lines down. We scan the full
    // (untrimmed-at-start) blob from the first `"` to the last `"` in the blob,
    // since description/type values never contain literal embedded quotes in
    // this content set; if a closing quote is genuinely absent we fall back to
    // treating everything after the opening quote as the value (caller may warn).
    const firstQuote = trimmedLeading.indexOf('"');
    const lastQuote = trimmedLeading.lastIndexOf('"');
    if (lastQuote > firstQuote) {
      const inner = trimmedLeading.slice(firstQuote + 1, lastQuote);
      return inner.trim();
    }
    // No closing quote found — strip the leading quote and trim.
    return trimmedLeading.slice(firstQuote + 1).trim();
  }

  return trimmed;
}

/** Normalize a multiline `type` value: join accidental line breaks, split on `·`. */
function parseTypeTokens(value: string): string[] {
  return value
    .split('·')
    .map((t) => t.replace(/\s+/g, ' ').trim())
    .filter((t) => t.length > 0);
}

/** Collapse internal whitespace/newlines in `description` while keeping paragraph breaks. */
function normalizeDescription(value: string): string {
  // Split on 2+ consecutive newlines = paragraph break; collapse intra-paragraph
  // whitespace/newlines to single spaces; rejoin paragraphs with a blank line.
  const paragraphs = value
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter((p) => p.length > 0);
  return paragraphs.join('\n\n');
}

function parseInfoTxt(text: string): ParsedInfo {
  const entries = splitEntries(text);
  const warnings: string[] = [];
  const errors: string[] = [];
  const raw: Record<string, string> = {};
  const seenKeys = new Set<string>();

  for (const { key, rawKey, value } of entries) {
    if (!KNOWN_KEYS.has(key)) {
      warnings.push(`Unknown key "${rawKey}" ignored.`);
      continue;
    }
    if (seenKeys.has(key)) {
      warnings.push(`Duplicate key "${rawKey}" — using the last occurrence.`);
    }
    seenKeys.add(key);
    raw[key] = resolveValue(value);
  }

  for (const required of REQUIRED_KEYS) {
    if (!raw[required] || raw[required]!.length === 0) {
      errors.push(`Missing required field "${required}".`);
    }
  }

  const description = raw.description !== undefined
    ? normalizeDescription(raw.description)
    : undefined;
  const type = raw.type !== undefined ? raw.type.replace(/\s+/g, ' ').trim() : undefined;
  const typeTokens = raw.type !== undefined ? parseTypeTokens(raw.type) : [];

  return {
    raw,
    name: raw.name,
    location: raw.location,
    mapLink: raw['map link'],
    description,
    type,
    typeTokens,
    warnings,
    errors,
  };
}

// ── Slugs ─────────────────────────────────────────────────────────────────────

const URL_SAFE_SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip combining diacritical marks
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Folder name treated as "already URL-safe" only if it needs no character changes. */
function folderNameAsSlugCandidate(folderName: string): string | null {
  const candidate = folderName.toLowerCase();
  return URL_SAFE_SLUG_PATTERN.test(candidate) ? candidate : null;
}

// ── Images ────────────────────────────────────────────────────────────────────

/** Natural sort: numeric runs compare by value, not lexicographically. */
function naturalCompare(a: string, b: string): number {
  const chunk = (s: string) => s.match(/(\d+|\D+)/g) ?? [s];
  const ac = chunk(a);
  const bc = chunk(b);
  const len = Math.max(ac.length, bc.length);
  for (let i = 0; i < len; i++) {
    const x = ac[i] ?? '';
    const y = bc[i] ?? '';
    const xNum = /^\d+$/.test(x);
    const yNum = /^\d+$/.test(y);
    if (xNum && yNum) {
      const diff = Number(x) - Number(y);
      if (diff !== 0) return diff;
    } else if (x !== y) {
      return x < y ? -1 : 1;
    }
  }
  return 0;
}

function collectImages(folderAbsPath: string): { images: ImageEntry[]; warnings: string[] } {
  const warnings: string[] = [];
  const images: ImageEntry[] = [];
  const entries = readdirSync(folderAbsPath, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (entry.name.startsWith('.')) continue; // hidden/system files
    const ext = path.extname(entry.name).toLowerCase();
    if (ext === '.txt') continue; // info.txt and any stray text file
    if (!IMAGE_EXTENSIONS.has(ext)) {
      // e.g. .zip archives shipped alongside photos — ignored, not an image.
      continue;
    }
    const absPath = path.join(folderAbsPath, entry.name);
    let sizeBytes = 0;
    let readable = true;
    try {
      const stat = statSync(absPath);
      sizeBytes = stat.size;
      if (sizeBytes === 0) {
        readable = false;
        warnings.push(`Image "${entry.name}" is zero bytes.`);
      }
    } catch {
      readable = false;
      warnings.push(`Image "${entry.name}" could not be read (stat failed).`);
    }
    images.push({ filename: entry.name, absPath, sizeBytes, readable });
  }

  images.sort((a, b) => naturalCompare(a.filename, b.filename));
  return { images, warnings };
}

function pickPrimaryImage(images: ImageEntry[]): ImageEntry | undefined {
  const readableImages = images.filter((i) => i.readable);
  const named = readableImages.find((i) =>
    PRIMARY_IMAGE_BASENAMES.has(path.parse(i.filename).name.toLowerCase()),
  );
  return named ?? readableImages[0];
}

// ── Location split ────────────────────────────────────────────────────────────

/** Split "CITY, COUNTRY" (or similar) into { display, region, country } without losing the original string. */
function splitLocation(location: string): { display: string; region: string; country: string } {
  const display = location.trim();
  const parts = display.split(',').map((p) => p.trim()).filter((p) => p.length > 0);
  const country = parts.length > 0 ? titleCase(parts[parts.length - 1]!) : display;
  const region = parts.length > 1 ? titleCase(parts.slice(0, -1).join(', ')) : titleCase(display);
  return { display, region, country };
}

function titleCase(value: string): string {
  return value
    .toLowerCase()
    .split(/(\s+|-)/)
    .map((word) => (/^[\s-]+$/.test(word) ? word : word.charAt(0).toUpperCase() + word.slice(1)))
    .join('');
}

// ── Type token → schema field mapping ────────────────────────────────────────

function mapTypeTokens(tokens: string[]): {
  surface?: Surface;
  access?: AccessType;
  indoorOutdoor?: IndoorOutdoor;
  isScenic: boolean;
  unmapped: string[];
  remaining: string[];
  sawNonSurfaceDescriptor: boolean;
} {
  let surface: Surface | undefined;
  let access: AccessType | undefined;
  let indoorOutdoor: IndoorOutdoor | undefined;
  let isScenic = false;
  let sawNonSurfaceDescriptor = false;
  const unmapped: string[] = [];
  const remaining: string[] = [];

  for (const token of tokens) {
    let matched = false;

    if (!surface) {
      const hit = SURFACE_TOKEN_MAP.find((m) => m.pattern.test(token));
      if (hit) {
        surface = hit.value;
        matched = true;
      }
    }
    if (NON_SURFACE_DESCRIPTOR_PATTERN.test(token)) {
      sawNonSurfaceDescriptor = true;
      matched = true;
    }
    if (INDOOR_TOKEN_PATTERN.test(token)) {
      indoorOutdoor = 'Indoor';
      matched = true;
    } else if (OUTDOOR_TOKEN_PATTERN.test(token)) {
      indoorOutdoor = 'Outdoor';
      matched = true;
    }
    if (!access) {
      const hit = ACCESS_TOKEN_MAP.find((m) => m.pattern.test(token));
      if (hit) {
        access = hit.value;
        matched = true;
      }
    }
    if (SCENIC_TOKEN_PATTERN.test(token)) {
      isScenic = true;
      matched = true;
    }

    // A token can legitimately match more than one axis (e.g. "sea view" is
    // scenic AND remains descriptive) — always keep it in `remaining` unless it
    // was FULLY consumed as a bare surface/indoor keyword with nothing left over.
    const isPureSurfaceOrIo =
      /^(hard|clay|grass)\s*courts?$/i.test(token) ||
      /^(indoor|outdoor)( court)?$/i.test(token);
    if (!isPureSurfaceOrIo) {
      remaining.push(token);
    }
    if (!matched) {
      unmapped.push(token);
    }
  }

  return { surface, access, indoorOutdoor, isScenic, unmapped, remaining, sawNonSurfaceDescriptor };
}

// ── Google Maps coordinate resolution ────────────────────────────────────────

interface CoordResult {
  lat?: number;
  lng?: number;
  source?: string;
  /** The address/query text Google resolved the short link to, if extractable. */
  resolvedQuery?: string;
  error?: string;
}

/** Extract lat/lng from a resolved Google Maps URL using known patterns only. */
function extractCoordsFromUrl(url: string): { lat?: number; lng?: number; source?: string } {
  // `@lat,lng,zoom` — the most common pattern in the address bar.
  const at = /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/.exec(url);
  if (at) {
    return { lat: Number(at[1]), lng: Number(at[2]), source: '@lat,lng' };
  }
  // `!3dLAT!4dLNG` — embedded in the data blob of place URLs.
  const bang = /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/.exec(url);
  if (bang) {
    return { lat: Number(bang[1]), lng: Number(bang[2]), source: '!3d!4d' };
  }
  // Query params containing coordinates: `?q=lat,lng` or `&ll=lat,lng` or `&center=lat,lng`.
  const qp = /[?&](?:q|ll|center)=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/.exec(url);
  if (qp) {
    return { lat: Number(qp[1]), lng: Number(qp[2]), source: 'query-param' };
  }
  return {};
}

/** Extract the human-readable address/query Google resolved the short link to (the `q=` param). */
function extractResolvedQuery(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    const q = parsed.searchParams.get('q');
    return q && q.trim().length > 0 ? q.trim() : undefined;
  } catch {
    return undefined;
  }
}

/** Follow redirects for a (possibly shortened) Google Maps link and extract coordinates. */
async function resolveMapLinkCoords(mapLink: string): Promise<CoordResult> {
  try {
    const response = await fetch(mapLink, {
      method: 'GET',
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TennisWorldImporter/1.0)' },
    });
    const finalUrl = response.url || mapLink;
    // Consume/discard body — we only need the resolved URL.
    await response.body?.cancel?.().catch(() => undefined);
    const fromUrl = extractCoordsFromUrl(finalUrl);
    const resolvedQuery = extractResolvedQuery(finalUrl);
    if (fromUrl.lat !== undefined && fromUrl.lng !== undefined) {
      return { ...fromUrl, resolvedQuery };
    }
    return {
      resolvedQuery,
      error: `No recognized coordinate pattern in resolved URL: ${finalUrl}`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { error: `Failed to follow map link "${mapLink}": ${message}` };
  }
}

// ── content/coordinates.json sidecar (deterministic override cache) ─────────
//
// This file is the ONLY thing that can make `--dry-run`/`--replace` resolve
// coordinates without contacting Nominatim (Part 2 requirement: normal runs
// must be deterministic and must never touch the network). It is written
// exclusively by `--resolve-coordinates` (Part 3) and merely READ by every
// other mode. Keys are final court slugs; see `CoordinateOverride` for shape.

type MatchLevel = 'exact-court' | 'venue-level' | 'google-place-pin';

interface CoordinateOverride {
  lat: number;
  lng: number;
  /** Leaflet initial zoom level for this court's detail map. */
  zoom?: number;
  /** e.g. "user-provided", "google-maps-link", "nominatim", "manual-google-maps", "official-site", "official-embedded-map", "openstreetmap", "wikidata", "wikipedia". */
  source: string;
  query?: string; // the query/search string that produced this result (Nominatim path only)
  displayName?: string; // the selected venue/court name, for human review (Nominatim path only)
  matchLevel?: MatchLevel;
  /** Public URL a human can open to verify this selection (required for manually-researched entries). */
  evidenceUrl?: string;
  /** Free-text justification, esp. required when matchLevel is venue-level (why no exact-court point exists). */
  notes?: string;
}

type CoordinatesFile = Record<string, CoordinateOverride>;

function loadCoordinatesFile(): CoordinatesFile {
  if (!existsSync(COORDINATES_FILE)) return {};
  try {
    const raw = readFileSync(COORDINATES_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== 'object' || parsed === null) return {};
    return parsed as CoordinatesFile;
  } catch (err) {
    console.error(`Could not parse ${COORDINATES_FILE}: ${(err as Error).message}`);
    return {};
  }
}

function saveCoordinatesFile(data: CoordinatesFile): void {
  const sorted: CoordinatesFile = {};
  for (const key of Object.keys(data).sort((a, b) => a.localeCompare(b))) {
    sorted[key] = data[key]!;
  }
  writeFileSync(COORDINATES_FILE, `${JSON.stringify(sorted, null, 2)}\n`, 'utf-8');
}

function isValidLatLng(lat: unknown, lng: unknown): lat is number {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

// ── Nominatim resolver (--resolve-coordinates only) ──────────────────────────
//
// Usage-policy compliance (Part 3): sequential (never parallel), >=1.1s between
// requests, descriptive User-Agent, no autocomplete, permanent caching into
// `content/coordinates.json`, clean stop on 403/429/5xx, no rapid retries. This
// resolver is invoked ONLY when `--resolve-coordinates` is passed — never from
// `--dry-run` or `--replace`.

const NOMINATIM_ENDPOINT = 'https://nominatim.openstreetmap.org/search';
const NOMINATIM_MIN_INTERVAL_MS = 1100;
const NOMINATIM_MAX_QUERIES_PER_COURT = 3;

/**
 * User-Agent for Nominatim requests. Prefers an already-configured project URL
 * (checked via env vars a deployed instance of this project would set) over a
 * bare app-identifying string — never invents contact info that doesn't exist.
 */
function buildUserAgent(): string {
  const configuredUrl =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.SITE_URL?.trim();
  const base = 'TennisWorldContentImporter/1.0 (one-time local court-content import tool)';
  return configuredUrl ? `${base} +${configuredUrl}` : base;
}

const USER_AGENT = buildUserAgent();

/** Sleep helper for the mandatory inter-request delay. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface NominatimResult {
  lat: string;
  lon: string;
  display_name: string;
  type?: string;
  class?: string;
  category?: string;
  addresstype?: string;
  name?: string;
}

/** Thrown to cleanly abort the whole --resolve-coordinates run (403/429/5xx). */
class NominatimAbortError extends Error {}

let lastNominatimRequestAt = 0;

/** ISO-3166-1 alpha-2 codes for the countries known to appear in this content set. */
const COUNTRY_CODE_MAP: Record<string, string> = {
  france: 'fr',
  monaco: 'mc',
};

/**
 * A single rate-limited, sequential Nominatim `search` call. Enforces the
 * >=1.1s minimum interval itself so callers never need to coordinate timing.
 * Throws `NominatimAbortError` on 403/429/5xx so the caller can stop the ENTIRE
 * --resolve-coordinates run cleanly (per the usage-policy requirement to never
 * hammer the service after a block/error signal).
 */
async function nominatimSearch(
  query: string,
  countryCode?: string,
): Promise<NominatimResult[]> {
  const elapsed = Date.now() - lastNominatimRequestAt;
  if (elapsed < NOMINATIM_MIN_INTERVAL_MS) {
    await sleep(NOMINATIM_MIN_INTERVAL_MS - elapsed);
  }

  const url = new URL(NOMINATIM_ENDPOINT);
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '5');
  url.searchParams.set('addressdetails', '1');
  if (countryCode) url.searchParams.set('countrycodes', countryCode);

  lastNominatimRequestAt = Date.now();
  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
  });

  if (response.status === 403 || response.status === 429 || response.status >= 500) {
    throw new NominatimAbortError(
      `Nominatim returned HTTP ${response.status} for query "${query}" — stopping all remaining lookups (usage-policy safety stop).`,
    );
  }
  if (!response.ok) {
    throw new Error(`Nominatim returned HTTP ${response.status} for query "${query}".`);
  }

  const body = (await response.json()) as unknown;
  return Array.isArray(body) ? (body as NominatimResult[]) : [];
}

/** Normalize whitespace only — never translate, never invent address text. */
function normalizeQuery(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

/** Tokenize a name into lowercase, diacritic-stripped, stopword-free words. */
function nameTokens(s: string): Set<string> {
  const STOPWORDS = new Set(['de', 'la', 'le', 'du', 'des', 'a', 'the', 'and', 'et']);
  const norm = s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  return new Set(norm.split(' ').filter((w) => w.length > 1 && !STOPWORDS.has(w)));
}

/**
 * Loosely compare two names for "is this plausibly the same place" using
 * token overlap rather than raw substring matching — Nominatim's `name`/
 * `display_name` frequently drops or reorders words the source court name
 * has (e.g. OSM "Mouratoglou Academy" vs source "Mouratoglou Tennis Academy"),
 * so a strict substring check would reject a perfectly good match.
 */
function namesLooselyMatch(a: string, b: string): boolean {
  const ta = nameTokens(a);
  const tb = nameTokens(b);
  if (ta.size === 0 || tb.size === 0) return false;
  const [smaller, larger] = ta.size <= tb.size ? [ta, tb] : [tb, ta];
  let shared = 0;
  for (const token of smaller) {
    if (larger.has(token)) shared++;
  }
  // Require at least half of the shorter name's meaningful tokens to appear in
  // the other name (handles both "subset" and "reordered/trimmed" cases) with a
  // floor of 1 shared token so single distinctive-word names can still match.
  return shared >= Math.max(1, Math.ceil(smaller.size / 2));
}

/** Categories that plausibly represent a tennis facility, sports venue, or hospitality venue. */
const PLAUSIBLE_CATEGORY_PATTERN =
  /(tennis|sport|leisure|hotel|resort|club|attraction|tourism|building|amenity)/i;

/**
 * Bare road/street segments (`highway=*`, `addresstype=road`) are NEVER treated
 * as a venue — Nominatim happily geocodes "the street the hotel is on" even when
 * it has no record of the hotel itself, and accepting that as "venue-level"
 * would silently misrepresent a street centroid as the named place (Part 5:
 * "do not claim that venue-level coordinates identify the exact court surface" —
 * a bare road is weaker still, it doesn't even identify the venue).
 */
const ROAD_ONLY_CATEGORY_PATTERN = /^(highway)$/i;

interface CandidateAssessment {
  result: NominatimResult;
  nameMatches: boolean;
  categoryPlausible: boolean;
  isExactCourtCandidate: boolean;
}

function assessCandidate(result: NominatimResult, courtName: string): CandidateAssessment {
  const isRoadOnly =
    ROAD_ONLY_CATEGORY_PATTERN.test(result.class ?? '') ||
    ROAD_ONLY_CATEGORY_PATTERN.test(result.category ?? '') ||
    result.addresstype === 'road';
  if (isRoadOnly) {
    return { result, nameMatches: false, categoryPlausible: false, isExactCourtCandidate: false };
  }
  const nameMatches = namesLooselyMatch(result.display_name, courtName) || (
    result.name ? namesLooselyMatch(result.name, courtName) : false
  );
  const categoryText = `${result.class ?? ''} ${result.category ?? ''} ${result.type ?? ''} ${result.addresstype ?? ''}`;
  const categoryPlausible = PLAUSIBLE_CATEGORY_PATTERN.test(categoryText);
  const isExactCourtCandidate = /tennis/i.test(categoryText) || /tennis/i.test(result.display_name);
  return { result, nameMatches, categoryPlausible, isExactCourtCandidate };
}

interface ResolveOutcome {
  resolved?: CoordinateOverride;
  ambiguousCandidates?: NominatimResult[];
  error?: string;
  queriesUsed: number;
}

/**
 * Resolve one court's coordinates via Nominatim, trying query candidates in the
 * required order (Part 4) and validating results before accepting them (Part 5).
 * Stops at the first query that yields a clear, confident match. If a query
 * returns multiple plausible-but-different candidates, it reports them as
 * ambiguous rather than guessing.
 */
async function resolveCourtViaNominatim(plan: {
  folderName: string;
  info: ParsedInfo;
  country?: string;
}): Promise<ResolveOutcome> {
  const courtName = plan.info.name ?? plan.folderName;
  const countryCode = plan.country ? COUNTRY_CODE_MAP[plan.country.toLowerCase()] : undefined;

  // Resolve the Google Maps redirect once up front to get its address text —
  // used by candidates #2/#3 below. Coordinate extraction (if any) is handled
  // separately by the existing Google-URL path; here we only want the address.
  let googleResolvedQuery: string | undefined;
  if (plan.info.mapLink) {
    const g = await resolveMapLinkCoords(plan.info.mapLink);
    googleResolvedQuery = g.resolvedQuery;
  }

  const candidates: string[] = [];
  if (plan.info.location) {
    candidates.push(normalizeQuery(`${courtName}, ${plan.info.location}`));
  }
  if (googleResolvedQuery) {
    candidates.push(normalizeQuery(`${courtName}, ${googleResolvedQuery}`));
    candidates.push(normalizeQuery(googleResolvedQuery));
  }
  candidates.push(normalizeQuery(courtName));

  // De-duplicate while preserving order (short courts can produce identical
  // candidate strings across steps).
  const seen = new Set<string>();
  const uniqueCandidates = candidates.filter((c) => {
    if (c.length === 0 || seen.has(c)) return false;
    seen.add(c);
    return true;
  });

  let queriesUsed = 0;
  let lastAmbiguous: NominatimResult[] | undefined;

  for (const query of uniqueCandidates) {
    if (queriesUsed >= NOMINATIM_MAX_QUERIES_PER_COURT) break;
    queriesUsed++;

    // eslint-disable-next-line no-await-in-loop
    const results = await nominatimSearch(query, countryCode);
    if (results.length === 0) continue;

    const assessed = results.map((r) => assessCandidate(r, courtName));
    const plausible = assessed.filter((a) => a.nameMatches || a.categoryPlausible);

    if (plausible.length === 0) continue;

    if (plausible.length === 1) {
      const winner = plausible[0]!;
      if (!isValidLatLng(Number(winner.result.lat), Number(winner.result.lon))) continue;
      return {
        queriesUsed,
        resolved: {
          lat: Number(winner.result.lat),
          lng: Number(winner.result.lon),
          source: 'nominatim',
          query,
          displayName: winner.result.display_name,
          matchLevel: winner.isExactCourtCandidate ? 'exact-court' : 'venue-level',
        },
      };
    }

    // Multiple plausible-but-different candidates — do not guess (Part 5).
    // If they actually all agree closely on coordinates AND the top one has a
    // clearly stronger name match than the rest, prefer it; otherwise, report
    // ambiguity and leave this court unresolved.
    const strongMatches = plausible.filter((a) => a.nameMatches);
    if (strongMatches.length === 1) {
      const winner = strongMatches[0]!;
      if (isValidLatLng(Number(winner.result.lat), Number(winner.result.lon))) {
        return {
          queriesUsed,
          resolved: {
            lat: Number(winner.result.lat),
            lng: Number(winner.result.lon),
            source: 'nominatim',
            query,
            displayName: winner.result.display_name,
            matchLevel: winner.isExactCourtCandidate ? 'exact-court' : 'venue-level',
          },
        };
      }
    }

    lastAmbiguous = plausible.map((a) => a.result);
  }

  if (lastAmbiguous && lastAmbiguous.length > 0) {
    return { queriesUsed, ambiguousCandidates: lastAmbiguous };
  }
  return { queriesUsed, error: `No plausible Nominatim result found for "${courtName}".` };
}

/** ~10km deterministic jitter, matching the project's existing approx-coordinate convention. */
function approxFromExact(lat: number, lng: number, seedKey: string): { approxLat: number; approxLng: number } {
  // Deterministic pseudo-random offset derived from a hash of the seed key, so
  // re-running the importer on the same court always yields the same approx
  // coords (mirrors the existing mock-data convention of small fixed offsets).
  const hash = createHash('sha256').update(seedKey).digest();
  const signLat = hash[0]! % 2 === 0 ? 1 : -1;
  const signLng = hash[1]! % 2 === 0 ? 1 : -1;
  // ~10km ≈ 0.09 degrees latitude; longitude degrees vary with latitude but we
  // keep the same small-fixed-offset convention the current mock data uses
  // (e.g. lat 45.9876 -> approxLat 45.99, i.e. hundredths-of-a-degree rounding).
  const offsetLat = signLat * (0.02 + (hash[2]! / 255) * 0.07);
  const offsetLng = signLng * (0.02 + (hash[3]! / 255) * 0.07);
  return {
    approxLat: Math.round((lat + offsetLat) * 100) / 100,
    approxLng: Math.round((lng + offsetLng) * 100) / 100,
  };
}

/**
 * Deterministic decorative [x%, y%] position for the stylized map canvas
 * (`Court.mapX`/`mapY` — NEVER geo, see schema.prisma Risk #17 note). Derived
 * from a hash of the slug so re-imports are stable; kept away from the 0/100
 * edges so pins never render flush against the canvas border.
 */
function mapCoordsFromSeed(seedKey: string): { mapX: number; mapY: number } {
  const hash = createHash('sha256').update(`mapcoords:${seedKey}`).digest();
  const mapX = 10 + Math.round((hash[0]! / 255) * 80);
  const mapY = 10 + Math.round((hash[1]! / 255) * 80);
  return { mapX, mapY };
}

// ── Per-court planning ────────────────────────────────────────────────────────

async function planCourt(
  folderName: string,
  coordinatesFile: CoordinatesFile,
): Promise<CourtPlan> {
  const folderAbsPath = path.join(CONTENT_ROOT, folderName);
  const warnings: string[] = [];
  const errors: string[] = [];

  const infoPath = path.join(folderAbsPath, 'info.txt');
  let infoText: string;
  try {
    infoText = readFileSync(infoPath, 'utf-8');
  } catch {
    errors.push(`Missing or unreadable info.txt in "${folderName}".`);
    return {
      folderName,
      folderAbsPath,
      slug: slugify(folderName),
      slugSource: 'folder',
      info: { raw: {}, typeTokens: [], warnings: [], errors: [] },
      images: [],
      isScenic: false,
      unmappedTypeTokens: [],
      remainingSettingTokens: [],
      noSurfaceTokenPresent: false,
      warnings,
      errors,
      plannedImageCopies: [],
    };
  }

  const info = parseInfoTxt(infoText);
  warnings.push(...info.warnings);
  errors.push(...info.errors);

  // Slug: prefer the folder name when already URL-safe, else slugify the name.
  const folderSlug = folderNameAsSlugCandidate(folderName);
  const slug = folderSlug ?? slugify(info.name ?? folderName);
  const slugSource: 'folder' | 'name' = folderSlug ? 'folder' : 'name';
  if (!slug) {
    errors.push(`Could not derive a non-empty slug for "${folderName}".`);
  }

  const { images, warnings: imageWarnings } = collectImages(folderAbsPath);
  warnings.push(...imageWarnings);
  if (images.length === 0) {
    errors.push(`No images found for "${folderName}".`);
  }
  const readableCount = images.filter((i) => i.readable).length;
  if (images.length > 0 && readableCount === 0) {
    errors.push(`All images for "${folderName}" are unreadable or zero-byte.`);
  }
  const primaryImage = pickPrimaryImage(images);

  let displayLocation: string | undefined;
  let country: string | undefined;
  let region: string | undefined;
  if (info.location) {
    const split = splitLocation(info.location);
    displayLocation = split.display;
    country = split.country;
    region = split.region;
  }

  let surface: Surface | undefined;
  let access: AccessType | undefined;
  let indoorOutdoor: IndoorOutdoor | undefined;
  let isScenic = false;
  let unmappedTypeTokens: string[] = [];
  let remainingSettingTokens: string[] = [];
  let noSurfaceTokenPresent = false;
  if (info.typeTokens.length > 0) {
    const mapped = mapTypeTokens(info.typeTokens);
    surface = mapped.surface;
    access = mapped.access;
    indoorOutdoor = mapped.indoorOutdoor;
    isScenic = mapped.isScenic;
    unmappedTypeTokens = mapped.unmapped;
    remainingSettingTokens = mapped.remaining;
    if (!surface) {
      if (mapped.sawNonSurfaceDescriptor) {
        // e.g. "floating court" — a real, correctly-spelled descriptor that is
        // a setting/construction detail, not a Clay/Hard/Grass playing surface.
        // Do NOT invent a surface from the description; report distinctly from
        // a garbled/unrecognized token so the two cases aren't conflated.
        noSurfaceTokenPresent = true;
        errors.push(
          `No playing-surface token present for "${folderName}" — "type" describes the court's setting ` +
            `(e.g. "floating court") but names no Clay/Hard/Grass surface. Tokens: ${JSON.stringify(info.typeTokens)}`,
        );
      } else {
        errors.push(
          `Could not map any "type" token to a known Surface (Clay/Hard/Grass) for "${folderName}". Tokens: ${JSON.stringify(info.typeTokens)}`,
        );
      }
    }
  }

  // Coordinate resolution order (Part 6): (1) content/coordinates.json override,
  // (2) coordinates directly extractable from the Google Maps redirect target,
  // (3) validation error. Normal dry-run/--replace NEVER contact Nominatim —
  // that only happens under the separate --resolve-coordinates mode.
  let lat: number | undefined;
  let lng: number | undefined;
  let approxLat: number | undefined;
  let approxLng: number | undefined;
  let zoom: number | undefined;
  let coordSource: string | undefined;
  let coordMatchLevel: MatchLevel | undefined;
  let coordDisplayName: string | undefined;
  let coordEvidenceUrl: string | undefined;
  let coordNotes: string | undefined;

  const override = slug ? coordinatesFile[slug] : undefined;
  if (override && isValidLatLng(override.lat, override.lng)) {
    lat = override.lat;
    lng = override.lng;
    zoom = typeof override.zoom === 'number' && Number.isFinite(override.zoom) ? override.zoom : undefined;
    coordSource = override.source;
    coordMatchLevel = override.matchLevel;
    coordDisplayName = override.displayName;
    coordEvidenceUrl = override.evidenceUrl;
    coordNotes = override.notes;
  } else if (info.mapLink) {
    const coords = await resolveMapLinkCoords(info.mapLink);
    if (coords.lat !== undefined && coords.lng !== undefined) {
      lat = coords.lat;
      lng = coords.lng;
      coordSource = coords.source;
    } else {
      errors.push(
        `Could not resolve coordinates for "${folderName}" from map link "${info.mapLink}": ${coords.error ?? 'unknown error'}. ` +
          `Run --resolve-coordinates to populate content/coordinates.json via Nominatim.`,
      );
    }
  } else {
    errors.push(`No "map link" present for "${folderName}" — cannot resolve coordinates.`);
  }

  if (lat !== undefined && lng !== undefined) {
    const approx = approxFromExact(lat, lng, slug || folderName);
    approxLat = approx.approxLat;
    approxLng = approx.approxLng;
  }

  const plannedImageCopies = images
    .filter((i) => i.readable)
    .map((i) => ({
      from: i.absPath,
      to: path.join(WEB_PUBLIC_COURTS_DIR, slug || slugify(folderName), i.filename),
    }));

  return {
    folderName,
    folderAbsPath,
    slug,
    slugSource,
    info,
    images,
    primaryImage,
    displayLocation,
    country,
    region,
    surface,
    access,
    indoorOutdoor,
    isScenic,
    unmappedTypeTokens,
    remainingSettingTokens,
    noSurfaceTokenPresent,
    lat,
    lng,
    approxLat,
    approxLng,
    zoom,
    coordSource,
    coordMatchLevel,
    coordDisplayName,
    coordEvidenceUrl,
    coordNotes,
    warnings,
    errors,
    plannedImageCopies,
  };
}

// ── Report ────────────────────────────────────────────────────────────────────

function printReport(plans: CourtPlan[]): boolean {
  const totalFolders = plans.length;
  const totalImages = plans.reduce((sum, p) => sum + p.images.length, 0);

  console.log('═══════════════════════════════════════════════════════════════');
  console.log(' Court content import — DRY RUN REPORT');
  console.log('═══════════════════════════════════════════════════════════════\n');

  console.log(`Court folders found: ${totalFolders}`);
  console.log(`Total images found: ${totalImages}\n`);

  const userProvidedCount = plans.filter((p) => p.coordSource === 'user-provided' && p.lat !== undefined).length;
  const zoom17Count = plans.filter((p) => p.zoom === 17).length;
  console.log(`Coordinates loaded from user-provided data: ${userProvidedCount}/${totalFolders}`);
  console.log(`Courts with zoom: 17: ${zoom17Count}/${totalFolders}\n`);

  // Slug collision detection (within this import batch).
  const slugCounts = new Map<string, string[]>();
  for (const p of plans) {
    if (!p.slug) continue;
    const list = slugCounts.get(p.slug) ?? [];
    list.push(p.folderName);
    slugCounts.set(p.slug, list);
  }
  for (const [slug, folders] of slugCounts) {
    if (folders.length > 1) {
      for (const p of plans) {
        if (p.slug === slug) {
          p.errors.push(
            `Slug collision: "${slug}" is also produced by folder(s) ${folders.filter((f) => f !== p.folderName).join(', ')}.`,
          );
        }
      }
    }
  }

  // Slug collision against the EXISTING seeded dataset (@tennis/mock-data COURTS,
  // the seed's source of truth — Court.slug is @unique in Postgres). A `--replace`
  // run is expected to remove the old courts first, but we still surface this so
  // the operator knows which "new" courts are actually re-imports of an existing
  // slug (same court, refreshed content) vs. a genuine slug clash to rename.
  const existingSlugs = new Map(COURTS.map((c) => [c.slug, c] as const));
  for (const p of plans) {
    if (!p.slug) continue;
    const existing = existingSlugs.get(p.slug);
    if (existing) {
      p.warnings.push(
        `Slug "${p.slug}" already exists in the current seeded dataset (court id "${existing.id}", ${existing.country}). ` +
          `--replace would remove that existing court and its images before creating this one — confirm this is the same venue.`,
      );
    }
  }

  console.log('── Courts ────────────────────────────────────────────────────');
  for (const p of plans) {
    console.log(`\n▸ ${p.folderName}`);
    console.log(`  name:        ${p.info.name ?? '(missing)'}`);
    console.log(`  slug:        ${p.slug || '(none)'}  [source: ${p.slugSource}]`);
    console.log(`  location:    ${p.displayLocation ?? '(missing)'}`);
    console.log(`  country:     ${p.country ?? '(unresolved)'}`);
    console.log(`  region:      ${p.region ?? '(unresolved)'}`);
    console.log(`  type tokens: ${JSON.stringify(p.info.typeTokens)}`);
    console.log(
      `  → surface: ${p.surface ?? '(unmapped)'}  access: ${p.access ?? '(unmapped)'}  indoor/outdoor: ${p.indoorOutdoor ?? 'Outdoor (default)'}  scenic: ${p.isScenic}`,
    );
    if (p.remainingSettingTokens.length > 0) {
      console.log(`  setting tokens (→ Court.setting): ${JSON.stringify(p.remainingSettingTokens)}`);
    }
    if (p.unmappedTypeTokens.length > 0) {
      console.log(`  ⚠ unmapped type tokens: ${JSON.stringify(p.unmappedTypeTokens)}`);
    }
    console.log(`  slug:        ${p.slug || '(none)'}`);
    console.log(
      `  lat/lng:     ${p.lat !== undefined ? `${p.lat}, ${p.lng}` : '(unresolved)'}`,
    );
    console.log(`  zoom:        ${p.zoom ?? '(none)'}`);
    console.log(`  coord source: ${p.coordSource ?? '(none)'}`);
    console.log(`  match level: ${p.coordMatchLevel ?? '(n/a)'}`);
    console.log(`  selected display name: ${p.coordDisplayName ?? '(n/a)'}`);
    if (p.coordEvidenceUrl) {
      console.log(`  evidence: ${p.coordEvidenceUrl}`);
    }
    if (p.coordNotes) {
      console.log(`  notes: ${p.coordNotes}`);
    }
    if (p.approxLat !== undefined) {
      console.log(`  approx coords: ${p.approxLat}, ${p.approxLng}`);
    }
    console.log(`  images: ${p.images.length} found, primary = ${p.primaryImage?.filename ?? '(none)'}`);
    if (p.warnings.length > 0) {
      for (const w of p.warnings) console.log(`  ⚠ WARNING: ${w}`);
    }
    if (p.errors.length > 0) {
      for (const e of p.errors) console.log(`  ✗ ERROR: ${e}`);
    }
  }

  console.log('\n── Image copy plan ──────────────────────────────────────────');
  console.log(`Planned destination root: apps/web/public/courts/<slug>/<filename>`);
  console.log(`Database URL pattern:     /courts/<slug>/<filename>\n`);
  for (const p of plans) {
    for (const copy of p.plannedImageCopies) {
      const rel = (abs: string) => path.relative(path.resolve(__dirname, '..', '..', '..'), abs);
      console.log(`  COPY  ${rel(copy.from)}  →  ${rel(copy.to)}`);
    }
  }

  console.log('\n── Replacement plan (--replace; NOT executed by this run) ──────');
  console.log('Would DELETE (only if every new court validates):');
  console.log('  - CourtImage rows for existing courts');
  console.log('  - CollectionCourt rows referencing existing courts');
  console.log('  - SavedCourt rows referencing existing courts');
  console.log('  - UserCollectionCourt rows referencing existing courts');
  console.log('  - Court rows (existing courts)');
  console.log('  - Old local image directories under apps/web/public/courts/<slug>/ (importer-managed only)');
  console.log('Would NOT touch: User, Entitlement, ProcessedWebhookEvent, SavedCourt-unrelated');
  console.log('  data, UserCollection (folder itself), Article, AdminUser, MagicLinkToken,');
  console.log('  ConsultationRequest, Collection (editorial collections themselves).');
  console.log('Would CREATE (all wrapped in one transaction, rolled back entirely on any error):');
  console.log('  - Country rows (upsert by isoCode) for any new countries');
  console.log('  - Region rows (upsert by country+name) for any new regions');
  console.log(`  - Court rows: ${plans.length}`);
  console.log(`  - CourtImage rows: ${totalImages}`);

  const allErrors = plans.flatMap((p) => p.errors);
  const allWarnings = plans.flatMap((p) => p.warnings);

  console.log('\n── Summary ───────────────────────────────────────────────────');
  console.log(`Warnings: ${allWarnings.length}`);
  console.log(`Errors:   ${allErrors.length}`);

  const ready = allErrors.length === 0;
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(ready ? ' RESULT: READY TO REPLACE' : ' RESULT: NOT READY');
  if (!ready) {
    console.log(' Blockers:');
    for (const p of plans) {
      for (const e of p.errors) console.log(`   - [${p.folderName}] ${e}`);
    }
  }
  console.log('═══════════════════════════════════════════════════════════════');

  return ready;
}

function readContentFolders(): string[] {
  return readdirSync(CONTENT_ROOT, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b));
}

/**
 * `--resolve-coordinates`: populates/updates `content/coordinates.json` via
 * Nominatim. Read-only with respect to the database and images — it never
 * touches Postgres and never copies/deletes any file under `content/` or
 * `apps/web/public`. Skips any slug that already has a valid cached override
 * (permanent caching, Part 3). Runs strictly sequentially with the mandatory
 * inter-request delay enforced inside `nominatimSearch`.
 */
async function runResolveCoordinates(): Promise<void> {
  console.log('Mode: --resolve-coordinates\n');
  console.log(`User-Agent: ${USER_AGENT}\n`);

  const folders = readContentFolders();
  const coordinatesFile = loadCoordinatesFile();

  // First pass: parse just enough (name/location/map link + slug) without
  // touching Nominatim, so we know exactly which slugs still need resolving.
  const basics: {
    folderName: string;
    slug: string;
    info: ParsedInfo;
    country?: string;
  }[] = [];
  for (const folderName of folders) {
    const folderAbsPath = path.join(CONTENT_ROOT, folderName);
    let infoText: string;
    try {
      infoText = readFileSync(path.join(folderAbsPath, 'info.txt'), 'utf-8');
    } catch {
      console.log(`⚠ Skipping "${folderName}" — missing/unreadable info.txt.`);
      continue;
    }
    const info = parseInfoTxt(infoText);
    const folderSlug = folderNameAsSlugCandidate(folderName);
    const slug = folderSlug ?? slugify(info.name ?? folderName);
    const country = info.location ? splitLocation(info.location).country : undefined;
    basics.push({ folderName, slug, info, country });
  }

  let resolvedCount = 0;
  let skippedCached = 0;
  let ambiguousCount = 0;
  let failedCount = 0;
  let aborted = false;

  for (const court of basics) {
    if (aborted) break;

    const existing = coordinatesFile[court.slug];
    if (existing && isValidLatLng(existing.lat, existing.lng)) {
      console.log(`▸ ${court.folderName} — already cached (${existing.matchLevel}), skipping.`);
      skippedCached++;
      continue;
    }

    console.log(`▸ ${court.folderName} (slug: ${court.slug})`);
    try {
      // eslint-disable-next-line no-await-in-loop
      const outcome = await resolveCourtViaNominatim(court);
      console.log(`  queries used: ${outcome.queriesUsed}`);

      if (outcome.resolved) {
        coordinatesFile[court.slug] = outcome.resolved;
        saveCoordinatesFile(coordinatesFile); // persist immediately after each success
        console.log(
          `  ✓ RESOLVED (${outcome.resolved.matchLevel}): ${outcome.resolved.lat}, ${outcome.resolved.lng}`,
        );
        console.log(`    query: "${outcome.resolved.query}"`);
        console.log(`    display name: ${outcome.resolved.displayName}`);
        if (outcome.resolved.matchLevel === 'venue-level') {
          console.log(
            '    NOTE: venue-level coordinates — Nominatim had no separate tennis-court object;',
          );
          console.log('    this is the mapped venue location, not a confirmed exact court position.');
        }
        resolvedCount++;
      } else if (outcome.ambiguousCandidates) {
        ambiguousCount++;
        console.log(`  ⚠ AMBIGUOUS — multiple plausible results, leaving unresolved:`);
        for (const c of outcome.ambiguousCandidates.slice(0, 3)) {
          const shortName =
            c.display_name.length > 80 ? `${c.display_name.slice(0, 77)}...` : c.display_name;
          console.log(`    - ${shortName}  (${c.lat}, ${c.lon})`);
        }
      } else {
        failedCount++;
        console.log(`  ✗ UNRESOLVED: ${outcome.error ?? 'no result'}`);
      }
    } catch (err) {
      if (err instanceof NominatimAbortError) {
        console.error(`\n✗ ${err.message}`);
        console.error('Stopping --resolve-coordinates now (usage-policy safety stop).');
        aborted = true;
      } else {
        failedCount++;
        console.log(`  ✗ ERROR: ${(err as Error).message}`);
      }
    }
    console.log('');
  }

  console.log('── Summary ──────────────────────────────────────────────────');
  console.log(`Resolved this run: ${resolvedCount}`);
  console.log(`Already cached (skipped): ${skippedCached}`);
  console.log(`Ambiguous (left unresolved): ${ambiguousCount}`);
  console.log(`Failed/unresolved: ${failedCount}`);
  console.log(`Coordinates file: ${COORDINATES_FILE}`);
  if (aborted) {
    process.exitCode = 1;
  }
}

// ── Replacement (--replace only) ─────────────────────────────────────────────
//
// Reuses the SAME slugify/country/region id scheme as prisma/seed.ts so the new
// France courts attach to the EXISTING `france` Country row rather than creating
// a duplicate. Everything DB-side happens inside one `prisma.$transaction` — if
// any step throws, Postgres rolls back the whole thing and nothing is left
// half-replaced. Image files are copied AFTER the transaction commits (file
// copies aren't transactional, so we only touch the filesystem once the DB
// side is known-good) and old importer-managed image directories are removed
// only after a successful commit + copy, never before.

const CONTINENT_BY_COUNTRY: Record<string, string> = {
  Italy: 'Europe',
  Spain: 'Europe',
  France: 'Europe',
  Monaco: 'Europe',
  Portugal: 'Europe',
  UK: 'Europe',
  Morocco: 'Africa',
  Indonesia: 'Asia',
  Japan: 'Asia',
  Maldives: 'Asia',
  USA: 'Americas',
};

const ISO_CODE_BY_COUNTRY: Record<string, string> = {
  Italy: 'IT',
  Spain: 'ES',
  France: 'FR',
  Monaco: 'MC',
  Portugal: 'PT',
  UK: 'GB',
  Morocco: 'MA',
  Indonesia: 'ID',
  Japan: 'JP',
  Maldives: 'MV',
  USA: 'US',
};

const countryId = (country: string): string => slugify(country);
const regionId = (country: string, region: string): string => slugify(`${country}-${region}`);

/** Builds the Court.setting free-text value from the leftover (non-surface/access/indoor) type tokens. */
function buildSetting(plan: CourtPlan): string {
  const tokens = plan.remainingSettingTokens.filter((t) => t.length > 0);
  return tokens.length > 0 ? tokens.join(' · ') : plan.displayLocation ?? plan.folderName;
}

async function runReplace(plans: CourtPlan[]): Promise<void> {
  const prisma = new PrismaClient();
  try {
    console.log('\n── Executing --replace ──────────────────────────────────────');

    const newSlugs = new Set(plans.map((p) => p.slug));

    await prisma.$transaction(async (tx) => {
      // 1) Delete dependent rows + old Court rows for courts we are about to
      //    replace: (a) any existing court whose slug collides with a new one,
      //    and (b) — since this importer's content is the FULL replacement set —
      //    every court currently in the DB, matching the task's "remove old
      //    court records" instruction. FK-safe order: children before parents.
      const existingCourts = await tx.court.findMany({ select: { id: true, slug: true } });
      const existingCourtIds = existingCourts.map((c) => c.id);

      if (existingCourtIds.length > 0) {
        await tx.courtImage.deleteMany({ where: { courtId: { in: existingCourtIds } } });
        await tx.collectionCourt.deleteMany({ where: { courtId: { in: existingCourtIds } } });
        await tx.savedCourt.deleteMany({ where: { courtId: { in: existingCourtIds } } });
        await tx.userCollectionCourt.deleteMany({ where: { courtId: { in: existingCourtIds } } });
        await tx.court.deleteMany({ where: { id: { in: existingCourtIds } } });
      }

      // 2) Upsert Country/Region rows for the new content (France already
      //    exists from the mock seed; upsert is a no-op there, and creates any
      //    genuinely new region, e.g. "france-saint-tropez").
      const countryNames = new Set(plans.map((p) => p.country!));
      for (const name of countryNames) {
        const continent = CONTINENT_BY_COUNTRY[name];
        const isoCode = ISO_CODE_BY_COUNTRY[name];
        if (!continent || !isoCode) {
          throw new Error(
            `Replace: missing continent/isoCode mapping for country "${name}". Add it to CONTINENT_BY_COUNTRY/ISO_CODE_BY_COUNTRY in this script.`,
          );
        }
        const data = { name, isoCode, continent: continent as never };
        await tx.country.upsert({
          where: { id: countryId(name) },
          create: { id: countryId(name), ...data },
          update: data,
        });
      }

      const seenRegions = new Set<string>();
      for (const p of plans) {
        const key = `${p.country}::${p.region}`;
        if (seenRegions.has(key)) continue;
        seenRegions.add(key);
        const data = {
          name: p.region!,
          lat: p.approxLat!,
          lng: p.approxLng!,
          countryId: countryId(p.country!),
        };
        await tx.region.upsert({
          where: { id: regionId(p.country!, p.region!) },
          create: { id: regionId(p.country!, p.region!), ...data },
          update: data,
        });
      }

      // 3) Create the new Court + CourtImage rows.
      for (let i = 0; i < plans.length; i++) {
        const p = plans[i]!;
        const { mapX, mapY } = mapCoordsFromSeed(p.slug);
        const courtData = {
          slug: p.slug,
          name: p.info.name!,
          countryId: countryId(p.country!),
          regionId: regionId(p.country!, p.region!),
          lat: p.lat!,
          lng: p.lng!,
          approxLat: p.approxLat!,
          approxLng: p.approxLng!,
          mapLinkUrl: p.info.mapLink ?? null,
          mapX,
          mapY,
          surface: p.surface as never,
          setting: buildSetting(p),
          access: (p.access ?? 'Resort') as never,
          indoorOutdoor: (p.indoorOutdoor ?? 'Outdoor') as never,
          isScenic: p.isScenic,
          isFeatured: false,
          // Locked by default so the page-level entitlement gate (courts/[slug]/page.tsx)
          // actually calls the protected exact-location endpoint for these courts —
          // an unlocked court never fetches it, so the exact-coordinate/zoom-17 map
          // branch would otherwise be unreachable regardless of viewer entitlement.
          isLocked: true,
          status: 'published' as never,
          blurb: p.info.description!,
          seedOrder: i,
        };
        const court = await tx.court.create({ data: courtData });

        const orderedImages = p.images.filter((img) => img.readable);
        for (let sortOrder = 0; sortOrder < orderedImages.length; sortOrder++) {
          const img = orderedImages[sortOrder]!;
          const isHero = img === p.primaryImage;
          await tx.courtImage.create({
            data: {
              courtId: court.id,
              url: `/courts/${p.slug}/${img.filename}`,
              alt: `${p.info.name} — photo ${sortOrder + 1}`,
              sortOrder,
              isHero,
            },
          });
        }
      }
    }, { timeout: 30000, maxWait: 10000 });

    console.log('Database transaction committed.');

    // 4) Copy image files AFTER the DB commit succeeds.
    let copied = 0;
    for (const p of plans) {
      const destDir = path.join(WEB_PUBLIC_COURTS_DIR, p.slug);
      mkdirSync(destDir, { recursive: true });
      for (const copy of p.plannedImageCopies) {
        copyFileSync(copy.from, copy.to);
        copied++;
      }
    }
    console.log(`Copied ${copied} image files into ${WEB_PUBLIC_COURTS_DIR}.`);

    // 5) Remove old importer-managed image directories that are NOT part of
    //    the new slug set (stale directories from a previous import run).
    if (existsSync(WEB_PUBLIC_COURTS_DIR)) {
      const existingDirs = readdirSync(WEB_PUBLIC_COURTS_DIR, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => e.name);
      for (const dir of existingDirs) {
        if (!newSlugs.has(dir)) {
          rmSync(path.join(WEB_PUBLIC_COURTS_DIR, dir), { recursive: true, force: true });
          console.log(`Removed stale image directory: ${dir}`);
        }
      }
    }

    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log(` REPLACE COMPLETE — ${plans.length} courts, ${copied} images.`);
    console.log('═══════════════════════════════════════════════════════════════');
  } catch (err) {
    console.error('\n✗ --replace FAILED — the database transaction was rolled back, no rows were changed.');
    console.error(err);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

// ── Entry point ───────────────────────────────────────────────────────────────

async function runDryRunOrReplace(): Promise<void> {
  console.log(`Mode: ${REPLACE ? '--replace requested' : '--dry-run (default)'}\n`);

  let folders: string[];
  try {
    folders = readContentFolders();
  } catch (err) {
    console.error(`Could not read content root "${CONTENT_ROOT}":`, err);
    process.exitCode = 1;
    return;
  }

  // `content/coordinates.json` is the ONLY coordinate source a normal dry-run/
  // --replace run may use besides the Google Maps URL itself — loading it here
  // is a local file read, never a network call (Part 2 determinism guarantee).
  const coordinatesFile = loadCoordinatesFile();

  const plans: CourtPlan[] = [];
  for (const folder of folders) {
    // eslint-disable-next-line no-await-in-loop
    const plan = await planCourt(folder, coordinatesFile);
    plans.push(plan);
  }

  const ready = printReport(plans);

  if (REPLACE) {
    if (!ready) {
      console.log(
        '\n--replace requested but validation failed — refusing to mutate the database. Fix the errors above and re-run.',
      );
      process.exitCode = 1;
      return;
    }
    await runReplace(plans);
    return;
  }

  process.exitCode = ready ? 0 : 1;
}

async function main(): Promise<void> {
  if (RESOLVE_COORDINATES) {
    await runResolveCoordinates();
    return;
  }
  await runDryRunOrReplace();
}

main().catch((err) => {
  console.error('Importer failed:', err);
  process.exitCode = 1;
});
