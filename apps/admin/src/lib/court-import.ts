import type { AdminCourtImportReportDTO } from '@tennis/contracts';

// ─────────────────────────────────────────────────────────────────────────────
// Pure logic for the "Import courts" page (TASK_80). No React, no DOM — the
// page only wires these together. Mirrors the server-side limits (TASK_79:
// 1 MB body, 1–50 courts per file) so a bad file never reaches the network.
// ─────────────────────────────────────────────────────────────────────────────

export const MAX_IMPORT_BYTES = 1024 * 1024;
export const MAX_IMPORT_COURTS = 50;
/** TASK_82 #1: the server's 1 MB limit applies to the actual request body
 *  (re-serialised, so it differs from the pasted text's own byte size) —
 *  leave a 1 KB margin so a body right at the edge isn't rejected by the
 *  server after this page already said it was fine. */
const BODY_SIZE_MARGIN_BYTES = 1024;
const MAX_BODY_BYTES = MAX_IMPORT_BYTES - BODY_SIZE_MARGIN_BYTES;

/** A fenced code block the agent's chat answer wraps its JSON in — ```json
 *  or a bare ``` — at the very start of the (trimmed) text, TASK_82 #2. */
const FENCE_OPEN_PATTERN = /^```(?:json)?[ \t]*\r?\n/i;
const FENCE_MARKER = '```';

export type ParseImportResult =
  | { ok: true; courts: unknown[]; wrapped: boolean; fenced: boolean }
  | { ok: false; message: string };

/**
 * Parses pasted/loaded text into a `courts` array, applying every
 * client-side guard from the task spec before anything is sent to the API.
 * A bare JSON array is wrapped (`wrapped: true`); a fenced code block (the
 * shape an agent's chat answer comes back in) is unwrapped (`fenced: true`),
 * using only its first block and ignoring any text after the closing fence.
 * Everything else that isn't `{ courts: [...] }` is a clean error, never a
 * thrown exception.
 */
export function parseImportInput(text: string): ParseImportResult {
  const withoutBom = text.length > 0 && text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const trimmed = withoutBom.trim();

  if (trimmed.length === 0) {
    return { ok: false, message: 'Nothing to check — paste JSON or choose a file.' };
  }

  // Cheap first guard, in bytes, on the raw pasted text — the precise guard
  // on the actual request body runs below, once `courts` is known.
  if (new TextEncoder().encode(withoutBom).length > MAX_IMPORT_BYTES) {
    return { ok: false, message: 'File is too large (max 1 MB).' };
  }

  let jsonSource = trimmed;
  let fenced = false;
  const fenceOpenMatch = trimmed.match(FENCE_OPEN_PATTERN);
  if (fenceOpenMatch) {
    const afterOpen = trimmed.slice(fenceOpenMatch[0].length);
    const closeIndex = afterOpen.indexOf(FENCE_MARKER);
    if (closeIndex === -1) {
      return { ok: false, message: 'The JSON block is not closed (missing closing ```).' };
    }
    jsonSource = afterOpen.slice(0, closeIndex);
    fenced = true;
  }

  const parsed = parseJsonWithLineCol(jsonSource, fenced);
  if (!parsed.ok) {
    return { ok: false, message: parsed.message };
  }

  let courts: unknown[];
  let wrapped = false;
  if (Array.isArray(parsed.value)) {
    courts = parsed.value;
    wrapped = true;
  } else if (
    parsed.value !== null &&
    typeof parsed.value === 'object' &&
    Array.isArray((parsed.value as Record<string, unknown>).courts)
  ) {
    courts = (parsed.value as { courts: unknown[] }).courts;
  } else {
    return {
      ok: false,
      message: 'The file must be an object with a courts list (or a plain list of courts).',
    };
  }

  if (courts.length === 0) {
    return { ok: false, message: 'No courts found in the file.' };
  }
  if (courts.length > MAX_IMPORT_COURTS) {
    return { ok: false, message: `At most ${MAX_IMPORT_COURTS} courts per import (found ${courts.length}).` };
  }

  const bodyBytes = new TextEncoder().encode(JSON.stringify({ courts, dryRun: true })).length;
  if (bodyBytes > MAX_BODY_BYTES) {
    return { ok: false, message: 'File is too large (max 1 MB).' };
  }

  return { ok: true, courts, wrapped, fenced };
}

/**
 * The JS engine's own `JSON.parse` message already names the line/column
 * when it can determine one (`"... at position N (line L column C)"`) — we
 * only need to forward it. When it can't (e.g. `"Unexpected token '}'..."`
 * with no position at all), there is no line/column to show, per the task's
 * "when available" rule. Inside a fenced block, that position is relative to
 * the block's own content, so the message says so (TASK_82 #2).
 */
function parseJsonWithLineCol(
  text: string,
  fenced: boolean,
): { ok: true; value: unknown } | { ok: false; message: string } {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    const location = fenced ? ' (line/column relative to the fenced JSON block)' : '';
    return { ok: false, message: `Invalid JSON: ${raw}${location}` };
  }
}

/**
 * Builds the plain-text message an admin pastes back to the agent (decision
 * 5): one line per error, 1-based court numbering, the court's name when
 * known. Empty when the report has no errors.
 */
export function buildAgentErrorMessage(report: AdminCourtImportReportDTO): string {
  const lines: string[] = [];
  for (const item of report.items) {
    if (item.errors.length === 0) continue;
    const label = item.name ? ` ("${item.name.replace(/[\r\n]+/g, ' ')}")` : '';
    for (const error of item.errors) {
      lines.push(`Court ${item.index + 1}${label}: \`${error.path}\` ${error.message}`);
    }
  }
  if (lines.length === 0) return '';
  lines.push('', 'Return the corrected JSON only.');
  return lines.join('\n');
}

/** Formats a finite number as a plain decimal string — never scientific
 *  notation (e.g. `1e-7` becomes `0.0000001`). */
function toPlainDecimal(n: number): string {
  if (Number.isInteger(n)) return n.toString();
  return n.toFixed(10).replace(/0+$/, '').replace(/\.$/, '');
}

/**
 * An OpenStreetMap link for a coordinate pair, or `null` unless both values
 * are finite numbers within range. Callers must gate this on the court
 * having no API-reported error on `lat`/`lng` (the report, not this
 * function, knows which values passed validation).
 */
export function osmLink(lat: unknown, lng: unknown): string | null {
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  const latStr = toPlainDecimal(lat);
  const lngStr = toPlainDecimal(lng);
  return `https://www.openstreetmap.org/?mlat=${latStr}&mlon=${lngStr}#map=14/${latStr}/${lngStr}`;
}

/**
 * A Google Maps search pin for a coordinate pair (TASK_82 #3), or `null`
 * unless both values are finite numbers within range AND their plain
 * `String()` form has no exponent notation (the query string takes the
 * number literally — `"1e-7,1e-7"` is not a coordinate Google understands).
 */
export function googleMapsPinLink(lat: unknown, lng: unknown): string | null {
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  const latStr = String(lat);
  const lngStr = String(lng);
  if (latStr.includes('e') || lngStr.includes('e')) return null;
  return `https://www.google.com/maps/search/?api=1&query=${latStr},${lngStr}`;
}

/** Counts for the "Create N draft courts" confirmation dialog. */
export function summarizeForConfirm(report: AdminCourtImportReportDTO): {
  drafts: number;
  newCountries: number;
  newRegions: number;
} {
  return {
    drafts: report.summary.valid,
    newCountries: report.summary.newCountries,
    newRegions: report.summary.newRegions,
  };
}

/**
 * Whether the latest check's text is still exactly what's in the editor.
 * Exact string equality — a trailing space makes this `false` on purpose
 * (decision 1): the Create button must never fire for text that differs
 * from what was validated, even by whitespace.
 */
export function isCheckCurrent(checkedText: string | null, currentText: string): boolean {
  return checkedText === currentText;
}
