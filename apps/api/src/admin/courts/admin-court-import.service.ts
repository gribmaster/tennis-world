import { ConflictException, Injectable, Logger, UnprocessableEntityException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate, type ValidationError } from 'class-validator';
import { Prisma } from '@prisma/client';
import type {
  AdminCourtImportIssueDTO,
  AdminCourtImportItemResultDTO,
  AdminCourtImportReportDTO,
} from '@tennis/contracts';
import { PrismaService } from '../../prisma/prisma.service';
import { approxFromExact, mapCoordsFromSeed } from '../../courts/court-derived-fields';
import { assertCourtLatLngNotZeroZero, resolveCourtSlug } from './admin-court-pure';
import { validateAdminTags } from './admin-courts.dto';
import { validateMapLinkUrl } from './admin-map-link.util';
import { COURT_TAGS } from '../../courts/court-tags';
import { logAdminMutation } from '../admin-mutation-logger';
import { ImportCourtItemDTO } from './admin-court-import.dto';

// ─────────────────────────────────────────────────────────────────────────────
// AdminCourtImportService (TASK_79) — the dry-run/commit engine behind
// `POST /v1/admin/courts/import`. See docs/TASK_79_COURT_IMPORT_API.md.
//
// Two passes over the same input, both re-run byte-for-byte inside the commit
// lock (decision 2):
//   1. SHAPE (`validateShape`): per item, `plainToInstance` + `validate()` on
//      `ImportCourtItemDTO` (whitelist + forbidNonWhitelisted — an unknown key,
//      including `status`/`images`, is a clean per-item error, never a 500),
//      plus `validateBusinessShape` for the few rules a decorator cannot
//      express (tag vocabulary with the exact index, 0/0, ≤7-decimal-place
//      lat/lng, blurb paragraph count).
//   2. RESOLUTION (`resolveItems`): DB-dependent — country/region
//      lookup-or-plan, slug collision (DB + in-file), the "possible duplicate"
//      warning. Takes a Prisma client parameter so the EXACT SAME code runs
//      for the read-only dry-run pass and the re-run-inside-the-lock commit
//      pass.
//
// Pure per-field math (slug derivation, approx/mapXY, tag/mapLinkUrl rules) is
// NOT reimplemented here — it is the exact same shared code
// `AdminCourtsService.create()` calls (`admin-court-pure.ts`,
// `validateAdminTags`, `validateMapLinkUrl`), so a court created via import and
// one created via `POST /v1/admin/courts` with equivalent inputs produce
// identical derived fields (Testing §9).
// ─────────────────────────────────────────────────────────────────────────────

/** A fixed, arbitrary advisory-lock key for "court import" (decision 2) — not
 *  user input, just a constant that serializes concurrent imports against each
 *  other. Must be the FIRST statement of the commit transaction. */
const IMPORT_ADVISORY_LOCK_KEY = 7_913_079;

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

type DbClient = Prisma.TransactionClient;

interface ShapeOk {
  index: number;
  raw: Record<string, unknown>;
  item: ImportCourtItemDTO;
  shapeErrors: [];
}
interface ShapeFail {
  index: number;
  raw: unknown;
  item?: undefined;
  shapeErrors: AdminCourtImportIssueDTO[];
}
type ShapeResult = ShapeOk | ShapeFail;

interface ResolvedItem {
  index: number;
  name: string | null;
  slug: string | null;
  errors: AdminCourtImportIssueDTO[];
  warnings: AdminCourtImportIssueDTO[];
  resolvedCountry: 'existing' | 'create' | null;
  resolvedRegion: 'existing' | 'create' | null;
  resolvedIsLocked: boolean | null;
  sources: string[];
  notes: string | null;
  write?: WritePlan;
}

interface WritePlan {
  slug: string;
  name: string;
  isoCode: string;
  countryExistingId: string | null;
  regionKey: string;
  regionExistingId: string | null;
  lat: number;
  lng: number;
  mapLinkUrl: string | null;
  surface: ImportCourtItemDTO['surface'];
  access: ImportCourtItemDTO['access'];
  indoorOutdoor: ImportCourtItemDTO['indoorOutdoor'];
  setting: string;
  isScenic: boolean;
  tags: string[];
  blurb: string;
  isLocked: boolean;
  isFeatured: boolean;
}

interface PlannedCountry {
  name: string;
  isoCode: string;
  continent: string;
  firstIndex: number;
}
interface PlannedRegion {
  countryIso: string;
  name: string;
  lat: number;
  lng: number;
  firstIndex: number;
}

interface ResolveOutcome {
  items: ResolvedItem[];
  plannedCountries: Map<string, PlannedCountry>;
  plannedRegions: Map<string, PlannedRegion>;
}

interface CountryLite {
  id: string;
  name: string;
  isoCode: string;
  continent: string;
}
interface CourtDupCandidate {
  slug: string;
  name: string;
  countryId: string;
}

/** Everything `resolveOne` needs to resolve a single item WITHOUT itself
 *  touching the database — loaded once per `resolveItems()` call by a fixed,
 *  N-independent set of queries (TASK_81 decision 2). Keyed maps use the same
 *  case-insensitive/upper-cased normalisation as the original per-item
 *  queries so behaviour stays byte-identical. */
interface PreloadedLookups {
  countryByIso: Map<string, CountryLite>;
  countriesByNameLower: Map<string, CountryLite[]>;
  /** `${existingCountryId}::${regionNameLower}` -> region id */
  regionsByKey: Map<string, string>;
  existingSlugs: Set<string>;
  /** `${existingCountryId}::${nameLower}` -> candidate courts (possible duplicates) */
  dupByCountryAndName: Map<string, CourtDupCandidate[]>;
  /** per-item slug candidate, pre-computed so the slug DB lookup can be batched */
  slugCandidates: Map<number, { slug: string } | { error: string }>;
}

@Injectable()
export class AdminCourtImportService {
  private readonly logger = new Logger('AdminCourtImport');

  constructor(private readonly prisma: PrismaService) {}

  /** `courts` MUST be the UNTRANSFORMED raw array from `req.body` — not the
   *  `class-transformer`-cloned array class-validator's `ValidationPipe`
   *  produces for `@Body()`. That clone silently drops a literal `__proto__`
   *  OWN key while copying each item (`target[key] = value` for key
   *  `"__proto__"` sets the prototype instead of a data property — the usual
   *  JS object-literal/assignment special case), which would make the
   *  "`__proto__` is a forbidden key" check below unreachable in practice.
   *  Reading the pre-transform body sidesteps that entirely; everything else
   *  about each item is still re-validated from scratch here regardless. */
  async run(courts: unknown[], dryRun: boolean, adminId: string): Promise<AdminCourtImportReportDTO> {
    const shapes = await Promise.all(courts.map((raw, index) => this.validateShape(raw, index)));

    if (dryRun) {
      const outcome = await this.resolveItems(shapes, this.prisma);
      const report = this.buildReport(true, outcome);
      this.logBatch(adminId, report);
      return report;
    }

    let report: AdminCourtImportReportDTO | undefined;
    try {
      report = await this.prisma.$transaction(
        async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(${IMPORT_ADVISORY_LOCK_KEY}::bigint)`;

          const outcome = await this.resolveItems(shapes, tx);
          if (outcome.items.some((r) => r.errors.length > 0)) {
            throw new UnprocessableEntityException(this.buildReport(false, outcome));
          }

          const courtIds = await this.writeAll(tx, outcome);
          return this.buildReport(false, outcome, courtIds);
        },
        { timeout: 20_000 },
      );
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('A concurrent import committed first — re-run this import.');
      }
      throw err;
    }

    this.logBatch(adminId, report);
    for (const item of report.items) {
      if (item.courtId) {
        logAdminMutation({ adminId, action: 'court.import', targetType: 'Court', targetId: item.courtId });
      }
    }
    return report;
  }

  // ── Pass 1: shape ──────────────────────────────────────────────────────────

  private async validateShape(raw: unknown, index: number): Promise<ShapeResult> {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      return { index, raw, shapeErrors: [{ path: '', message: 'Each court must be a JSON object.' }] };
    }
    const record = raw as Record<string, unknown>;

    const forbiddenKey = this.findForbiddenKey(record);
    if (forbiddenKey) {
      return { index, raw: record, shapeErrors: [{ path: forbiddenKey, message: `Key "${forbiddenKey}" is not allowed.` }] };
    }

    const instance = plainToInstance(ImportCourtItemDTO, record);
    const validationErrors = await validate(instance, { whitelist: true, forbidNonWhitelisted: true });
    // Always run BOTH passes and merge — a court with several unrelated
    // mistakes (e.g. a bad enum AND an unknown tag) must report all of them,
    // not just whichever pass ran first.
    const allErrors = [...this.flattenValidationErrors(validationErrors), ...this.validateBusinessShape(instance)];
    if (allErrors.length > 0) {
      return { index, raw: record, shapeErrors: allErrors };
    }

    return { index, raw: record, item: instance, shapeErrors: [] };
  }

  private findForbiddenKey(record: Record<string, unknown>): string | undefined {
    for (const key of Object.keys(record)) {
      if (FORBIDDEN_KEYS.has(key)) return key;
    }
    const country = record.country;
    if (typeof country === 'object' && country !== null && !Array.isArray(country)) {
      for (const key of Object.keys(country as Record<string, unknown>)) {
        if (FORBIDDEN_KEYS.has(key)) return key;
      }
    }
    return undefined;
  }

  private flattenValidationErrors(errors: ValidationError[], prefix = ''): AdminCourtImportIssueDTO[] {
    const issues: AdminCourtImportIssueDTO[] = [];
    for (const error of errors) {
      const path = prefix ? `${prefix}.${error.property}` : error.property;
      if (error.children && error.children.length > 0) {
        issues.push(...this.flattenValidationErrors(error.children, path));
        continue;
      }
      for (const message of Object.values(error.constraints ?? {})) {
        issues.push({ path, message });
      }
    }
    return issues;
  }

  /** Rules `class-validator` decorators cannot express cleanly: tag vocabulary
   *  (with the exact offending index), lat/lng 0/0 + ≤7-decimal-place, and the
   *  blurb paragraph count. Shape-only — never touches the database. */
  private validateBusinessShape(item: ImportCourtItemDTO): AdminCourtImportIssueDTO[] {
    const issues: AdminCourtImportIssueDTO[] = [];

    // Each check below is guarded by the field's own basic runtime type —
    // `class-validator`'s pass already reports a type/shape error for a
    // wrong-typed field, so these just avoid crashing on it (e.g. calling
    // `.forEach` on a non-array `tags`), not double-reporting it.
    if (Array.isArray(item.tags)) {
      item.tags.forEach((tag, i) => {
        if (typeof tag === 'string' && !(COURT_TAGS as readonly string[]).includes(tag)) {
          issues.push({ path: `tags[${i}]`, message: `Unknown tag "${tag}". Allowed: ${COURT_TAGS.join(', ')}.` });
        }
      });
    }

    if (typeof item.lat === 'number' && typeof item.lng === 'number') {
      try {
        assertCourtLatLngNotZeroZero(item.lat, item.lng);
      } catch (err) {
        issues.push({ path: 'lat', message: this.messageOf(err) });
      }
      if (decimalPlaces(item.lat) > 7) {
        issues.push({ path: 'lat', message: 'lat must have at most 7 decimal places.' });
      }
      if (decimalPlaces(item.lng) > 7) {
        issues.push({ path: 'lng', message: 'lng must have at most 7 decimal places.' });
      }
    }

    if (typeof item.blurb === 'string') {
      const paragraphs = item.blurb
        .trim()
        .split(/\n\s*\n/)
        .filter((p) => p.trim().length > 0);
      if (paragraphs.length < 1 || paragraphs.length > 6) {
        issues.push({
          path: 'blurb',
          message: `blurb must contain 1-6 paragraphs separated by a blank line (found ${paragraphs.length}).`,
        });
      }
    }

    return issues;
  }

  // ── Pass 2: DB-dependent resolution (same code for dry run and the re-run
  // inside the commit lock) ───────────────────────────────────────────────────

  private async resolveItems(shapes: ShapeResult[], db: DbClient): Promise<ResolveOutcome> {
    const plannedCountries = new Map<string, PlannedCountry>();
    const plannedRegions = new Map<string, PlannedRegion>();
    const seenSlugs = new Map<string, number>();
    const seenNameCountry = new Map<string, { index: number; slug: string }>();

    const lookups = await this.preloadLookups(shapes, db);

    const items: ResolvedItem[] = [];
    for (const shape of shapes) {
      if (!shape.item) {
        items.push({
          index: shape.index,
          name: this.bestEffortString(shape.raw, 'name'),
          slug: this.bestEffortString(shape.raw, 'slug'),
          errors: shape.shapeErrors,
          warnings: [],
          resolvedCountry: null,
          resolvedRegion: null,
          resolvedIsLocked: null,
          sources: [],
          notes: null,
        });
        continue;
      }

      items.push(this.resolveOne(shape.item, shape.index, lookups, plannedCountries, plannedRegions, seenSlugs, seenNameCountry));
    }
    return { items, plannedCountries, plannedRegions };
  }

  /** Loads everything `resolveOne` needs with a FIXED, small number of
   *  queries, independent of how many items are in the file (TASK_81
   *  decision 2) — as opposed to the ~4-5 sequential per-item queries this
   *  replaced. Same queries, same `DbClient`, for both the dry-run pass and
   *  the re-run-inside-the-advisory-lock commit pass. */
  private async preloadLookups(shapes: ShapeResult[], db: DbClient): Promise<PreloadedLookups> {
    const okShapes = shapes.filter((s): s is ShapeOk => Boolean(s.item));

    // All countries, once — the table is small and bounded by the real
    // number of countries, not by the size of the import file, so this one
    // query covers both the by-isoCode lookup and the by-name clash check.
    const allCountries: CountryLite[] = await db.country.findMany({
      select: { id: true, name: true, isoCode: true, continent: true },
    });
    const countryByIso = new Map<string, CountryLite>();
    const countriesByNameLower = new Map<string, CountryLite[]>();
    for (const c of allCountries) {
      countryByIso.set(c.isoCode, c);
      const key = c.name.toLowerCase();
      const arr = countriesByNameLower.get(key);
      if (arr) arr.push(c);
      else countriesByNameLower.set(key, [c]);
    }

    const existingCountryIds = new Set<string>();
    for (const shape of okShapes) {
      const found = countryByIso.get(shape.item.country.isoCode.toUpperCase());
      if (found) existingCountryIds.add(found.id);
    }

    const regionsByKey = new Map<string, string>();
    if (existingCountryIds.size > 0) {
      const regions = await db.region.findMany({
        where: { countryId: { in: [...existingCountryIds] } },
        select: { id: true, countryId: true, name: true },
      });
      for (const r of regions) {
        const key = `${r.countryId}::${r.name.toLowerCase()}`;
        if (!regionsByKey.has(key)) regionsByKey.set(key, r.id);
      }
    }

    // Slug candidates are pure (no DB) — compute them up front so the slug
    // existence check below can be a single batched query.
    const slugCandidates = new Map<number, { slug: string } | { error: string }>();
    const candidateSlugs = new Set<string>();
    for (const shape of okShapes) {
      try {
        const candidate = resolveCourtSlug(shape.item.slug, shape.item.name.trim());
        slugCandidates.set(shape.index, { slug: candidate });
        candidateSlugs.add(candidate);
      } catch (err) {
        slugCandidates.set(shape.index, { error: this.messageOf(err) });
      }
    }

    const existingSlugs = new Set<string>();
    if (candidateSlugs.size > 0) {
      const courts = await db.court.findMany({ where: { slug: { in: [...candidateSlugs] } }, select: { slug: true } });
      for (const c of courts) existingSlugs.add(c.slug);
    }

    const dupByCountryAndName = new Map<string, CourtDupCandidate[]>();
    if (existingCountryIds.size > 0) {
      const courts: CourtDupCandidate[] = await db.court.findMany({
        where: { countryId: { in: [...existingCountryIds] } },
        select: { slug: true, name: true, countryId: true },
      });
      for (const c of courts) {
        const key = `${c.countryId}::${c.name.toLowerCase()}`;
        const arr = dupByCountryAndName.get(key);
        if (arr) arr.push(c);
        else dupByCountryAndName.set(key, [c]);
      }
    }

    return { countryByIso, countriesByNameLower, regionsByKey, existingSlugs, dupByCountryAndName, slugCandidates };
  }

  private resolveOne(
    item: ImportCourtItemDTO,
    index: number,
    lookups: PreloadedLookups,
    plannedCountries: Map<string, PlannedCountry>,
    plannedRegions: Map<string, PlannedRegion>,
    seenSlugs: Map<string, number>,
    seenNameCountry: Map<string, { index: number; slug: string }>,
  ): ResolvedItem {
    const errors: AdminCourtImportIssueDTO[] = [];
    const warnings: AdminCourtImportIssueDTO[] = [];
    const name = item.name.trim();
    const isoCode = item.country.isoCode.toUpperCase();

    // ── Country ──
    let resolvedCountry: 'existing' | 'create' | null = null;
    let countryExistingId: string | null = null;

    const dbCountry = lookups.countryByIso.get(isoCode);
    if (dbCountry) {
      resolvedCountry = 'existing';
      countryExistingId = dbCountry.id;
      if (
        dbCountry.name.toLowerCase() !== item.country.name.trim().toLowerCase() ||
        dbCountry.continent !== item.country.continent
      ) {
        warnings.push({
          path: 'country',
          message: `Country "${isoCode}" already exists as "${dbCountry.name}" (${dbCountry.continent}); the given name/continent were not applied.`,
        });
      }
    } else {
      const nameClash = (lookups.countriesByNameLower.get(item.country.name.trim().toLowerCase()) ?? []).find(
        (c) => c.isoCode !== isoCode,
      );
      if (nameClash) {
        errors.push({
          path: 'country.name',
          message: `Country name "${item.country.name.trim()}" already exists under a different isoCode ("${nameClash.isoCode}").`,
        });
      } else {
        resolvedCountry = 'create';
        const planned = plannedCountries.get(isoCode);
        if (planned) {
          if (
            planned.name.toLowerCase() !== item.country.name.trim().toLowerCase() ||
            planned.continent !== item.country.continent
          ) {
            warnings.push({
              path: 'country',
              message: `Country "${isoCode}" will be created from item ${planned.firstIndex}; this item's name/continent were not applied.`,
            });
          }
        } else {
          plannedCountries.set(isoCode, {
            name: item.country.name.trim(),
            isoCode,
            continent: item.country.continent,
            firstIndex: index,
          });
        }
      }
    }

    // ── Region ──
    let resolvedRegion: 'existing' | 'create' | null = null;
    let regionExistingId: string | null = null;
    const regionName = item.region.trim();
    const regionKey = `${isoCode}::${regionName.toLowerCase()}`;

    if (resolvedCountry === 'existing' && countryExistingId) {
      const dbRegionId = lookups.regionsByKey.get(`${countryExistingId}::${regionName.toLowerCase()}`);
      if (dbRegionId) {
        resolvedRegion = 'existing';
        regionExistingId = dbRegionId;
      }
    }
    if (resolvedCountry !== null && resolvedRegion === null) {
      resolvedRegion = 'create';
      if (!plannedRegions.has(regionKey)) {
        plannedRegions.set(regionKey, { countryIso: isoCode, name: regionName, lat: item.lat, lng: item.lng, firstIndex: index });
      }
    }

    // ── Slug ──
    let slug: string | null = null;
    const slugResult = lookups.slugCandidates.get(index);
    if (slugResult && 'error' in slugResult) {
      errors.push({ path: 'slug', message: slugResult.error });
    } else if (slugResult) {
      const candidate = slugResult.slug;
      if (lookups.existingSlugs.has(candidate)) {
        errors.push({ path: 'slug', message: `slug "${candidate}" already exists.` });
      } else if (seenSlugs.has(candidate)) {
        errors.push({
          path: 'slug',
          message: `slug "${candidate}" is already used by item ${seenSlugs.get(candidate)}.`,
        });
      } else {
        seenSlugs.set(candidate, index);
        slug = candidate;
      }
    }

    // ── Tags / mapLinkUrl (reuse the shared validators verbatim — pass-1
    // shape validation already rejected an unknown tag or non-string entry,
    // so `validateAdminTags` cannot throw here) ──
    const tags = validateAdminTags(item.tags ?? []);
    let mapLinkUrl: string | null = null;
    try {
      mapLinkUrl = validateMapLinkUrl(item.mapLinkUrl ?? null);
    } catch (err) {
      errors.push({ path: 'mapLinkUrl', message: this.messageOf(err) });
    }

    // ── Possible-duplicate warning (name + country, different slug) ──
    if (slug) {
      const nameCountryKey = `${name.toLowerCase()}|${isoCode}`;
      if (resolvedCountry === 'existing' && countryExistingId) {
        const dbDup = (lookups.dupByCountryAndName.get(`${countryExistingId}::${name.toLowerCase()}`) ?? []).find(
          (c) => c.slug !== slug,
        );
        if (dbDup) {
          warnings.push({
            path: 'name',
            message: `Possible duplicate: a court named "${name}" already exists in this country (slug "${dbDup.slug}").`,
          });
        }
      }
      const seen = seenNameCountry.get(nameCountryKey);
      if (seen && seen.slug !== slug) {
        warnings.push({
          path: 'name',
          message: `Possible duplicate: item ${seen.index} has the same name and country with a different slug ("${seen.slug}").`,
        });
      } else if (!seen) {
        seenNameCountry.set(nameCountryKey, { index, slug });
      }
    }

    const isLocked = item.isLocked ?? true;

    const result: ResolvedItem = {
      index,
      name,
      slug,
      errors,
      warnings,
      resolvedCountry,
      resolvedRegion,
      resolvedIsLocked: isLocked,
      sources: item.sources,
      notes: item.notes?.trim() || null,
    };

    if (errors.length === 0 && slug) {
      result.write = {
        slug,
        name,
        isoCode,
        countryExistingId,
        regionKey,
        regionExistingId,
        lat: item.lat,
        lng: item.lng,
        mapLinkUrl,
        surface: item.surface,
        access: item.access,
        indoorOutdoor: item.indoorOutdoor,
        setting: item.setting.trim(),
        isScenic: item.isScenic ?? false,
        tags,
        blurb: item.blurb.trim(),
        isLocked,
        isFeatured: item.isFeatured ?? false,
      };
    }
    return result;
  }

  // ── Commit: create countries, then regions, then courts (file order) ──────

  private async writeAll(tx: DbClient, outcome: ResolveOutcome): Promise<Map<number, string>> {
    const { items, plannedCountries, plannedRegions } = outcome;

    const countryIdByIso = new Map<string, string>();
    for (const r of items) {
      if (r.write?.countryExistingId) countryIdByIso.set(r.write.isoCode, r.write.countryExistingId);
    }
    for (const [iso, planned] of plannedCountries) {
      const created = await tx.country.create({
        data: { name: planned.name, isoCode: planned.isoCode, continent: planned.continent as never },
      });
      countryIdByIso.set(iso, created.id);
    }

    const regionIdByKey = new Map<string, string>();
    for (const r of items) {
      if (r.write?.regionExistingId) regionIdByKey.set(r.write.regionKey, r.write.regionExistingId);
    }
    for (const [key, planned] of plannedRegions) {
      const countryId = countryIdByIso.get(planned.countryIso);
      if (!countryId) continue;
      const created = await tx.region.create({
        data: { countryId, name: planned.name, lat: planned.lat, lng: planned.lng },
      });
      regionIdByKey.set(key, created.id);
    }

    const maxRow = await tx.court.aggregate({ _max: { seedOrder: true } });
    let nextSeedOrder = (maxRow._max.seedOrder ?? -1) + 1;

    const courtIds = new Map<number, string>();
    const plans = items
      .filter((r): r is ResolvedItem & { write: WritePlan } => Boolean(r.write))
      .sort((a, b) => a.index - b.index);

    for (const r of plans) {
      const { write } = r;
      const countryId = countryIdByIso.get(write.isoCode);
      const regionId = write.regionExistingId ?? regionIdByKey.get(write.regionKey);
      if (!countryId || !regionId) {
        throw new Error(`Import write plan for item ${r.index} could not resolve country/region id.`);
      }
      const { approxLat, approxLng } = approxFromExact(write.lat, write.lng, write.slug);
      const { mapX, mapY } = mapCoordsFromSeed(write.slug);

      const created = await tx.court.create({
        data: {
          slug: write.slug,
          name: write.name,
          countryId,
          regionId,
          lat: write.lat,
          lng: write.lng,
          approxLat,
          approxLng,
          mapLinkUrl: write.mapLinkUrl,
          mapX,
          mapY,
          surface: write.surface as never,
          setting: write.setting,
          access: write.access as never,
          indoorOutdoor: write.indoorOutdoor as never,
          isScenic: write.isScenic,
          isFeatured: write.isFeatured,
          isLocked: write.isLocked,
          status: 'draft',
          blurb: write.blurb,
          tags: write.tags,
          seedOrder: nextSeedOrder,
        },
        select: { id: true },
      });
      nextSeedOrder += 1;
      courtIds.set(r.index, created.id);
    }

    return courtIds;
  }

  // ── Report assembly ─────────────────────────────────────────────────────────

  private buildReport(dryRun: boolean, outcome: ResolveOutcome, courtIds?: Map<number, string>): AdminCourtImportReportDTO {
    const items: AdminCourtImportItemResultDTO[] = outcome.items.map((r) => ({
      index: r.index,
      name: r.name,
      slug: r.slug,
      status: r.errors.length > 0 ? 'error' : 'ok',
      errors: r.errors,
      warnings: r.warnings,
      resolved: { country: r.resolvedCountry, region: r.resolvedRegion, isLocked: r.resolvedIsLocked },
      sources: r.sources,
      notes: r.notes,
      ...(courtIds?.get(r.index) ? { courtId: courtIds.get(r.index) } : {}),
    }));

    return {
      dryRun,
      ok: outcome.items.every((r) => r.errors.length === 0),
      summary: {
        total: outcome.items.length,
        valid: items.filter((i) => i.status === 'ok').length,
        invalid: items.filter((i) => i.status === 'error').length,
        newCountries: outcome.plannedCountries.size,
        newRegions: outcome.plannedRegions.size,
        warnings: outcome.items.reduce((sum, r) => sum + r.warnings.length, 0),
      },
      items,
    };
  }

  private logBatch(adminId: string, report: AdminCourtImportReportDTO): void {
    this.logger.log(
      `adminId=${adminId} action=court.import dryRun=${report.dryRun} items=${report.summary.total} ` +
        `valid=${report.summary.valid} invalid=${report.summary.invalid} newCountries=${report.summary.newCountries} ` +
        `newRegions=${report.summary.newRegions} warnings=${report.summary.warnings}`,
    );
  }

  private bestEffortString(raw: unknown, key: 'name' | 'slug'): string | null {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
    const value = (raw as Record<string, unknown>)[key];
    return typeof value === 'string' ? value : null;
  }

  private messageOf(err: unknown): string {
    if (err && typeof err === 'object' && 'message' in err) {
      const message = (err as { message: unknown }).message;
      return typeof message === 'string' ? message : String(message);
    }
    return String(err);
  }
}

function decimalPlaces(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const str = Math.abs(value).toString();
  const dot = str.indexOf('.');
  return dot === -1 ? 0 : str.length - dot - 1;
}
