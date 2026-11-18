import { randomBytes, scrypt as scryptCallback, timingSafeEqual, type ScryptOptions } from 'node:crypto';
import { promisify } from 'node:util';

// ─────────────────────────────────────────────────────────────────────────────
// Admin password hashing (TASK_73, decision 3) — `crypto.scrypt`, no new
// dependency. Stored format: `scrypt$N$r$p$<saltB64>$<hashB64>`.
//
// scrypt params (N=16384, r=8, p=1, 16-byte salt, 64-byte derived key) cost
// ~16 MiB of memory per call (128 * N * r bytes) — comfortably under Node's
// default 32 MiB `maxmem` for `crypto.scrypt`.
//
// TIMING: `verifyAdminPassword` always runs a full scrypt derivation before
// comparing (via `timingSafeEqual`), and `AdminAuthService.login` compares
// against {@link dummyAdminPasswordHash} for an unknown email — so a login
// attempt costs the same scrypt work whether or not the email exists, closing
// off a timing oracle for account enumeration.
// ─────────────────────────────────────────────────────────────────────────────

// `promisify` picks the (password, salt, keylen, callback) overload by
// default when inferring types for an overloaded function — cast to the
// (…, options, callback) overload we actually call with.
const scrypt = promisify(scryptCallback) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: ScryptOptions,
) => Promise<Buffer>;

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SALT_BYTES = 16;
const KEY_LENGTH = 64;

/** Admin password policy (decision: ≥ 12 characters). Enforced by the login DTO
 *  and the bootstrap CLI, never by this module alone. */
export const ADMIN_PASSWORD_MIN_LENGTH = 12;

/** Hash a plaintext admin password into the `scrypt$N$r$p$salt$hash` wire format. */
export async function hashAdminPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const derived = (await scrypt(password, salt, KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  })) as Buffer;
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString('base64')}$${derived.toString('base64')}`;
}

/**
 * Verify a plaintext password against a stored `scrypt$...` hash. Returns
 * `false` (never throws) for a malformed stored value — a corrupt row should
 * fail closed, not 500.
 */
export async function verifyAdminPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, nRaw, rRaw, pRaw, saltB64, hashB64] = parts;
  const n = Number(nRaw);
  const r = Number(rRaw);
  const p = Number(pRaw);
  if (!Number.isFinite(n) || !Number.isFinite(r) || !Number.isFinite(p)) return false;

  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(saltB64!, 'base64');
    expected = Buffer.from(hashB64!, 'base64');
  } catch {
    return false;
  }
  if (expected.length === 0) return false;

  const derived = (await scrypt(password, salt, expected.length, { N: n, r, p })) as Buffer;
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}

let dummyHashPromise: Promise<string> | undefined;

/**
 * A fixed, precomputed dummy hash to compare against when the login email
 * doesn't match any `AdminUser` row — so an unknown-email attempt still burns
 * one real scrypt derivation (see the module comment above). Computed once and
 * cached for the life of the process.
 */
export function dummyAdminPasswordHash(): Promise<string> {
  if (!dummyHashPromise) {
    dummyHashPromise = hashAdminPassword('dummy-password-never-used-x7f2kd91');
  }
  return dummyHashPromise;
}
