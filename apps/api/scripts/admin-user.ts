/* eslint-disable no-console */
//
// TASK_73 — admin bootstrap CLI. No endpoint creates an `AdminUser` (decision 4:
// "No self-signup, no endpoint that creates admins") — this script is the only
// way to mint the first admin, or rotate a password, outside raw SQL.
//
//   pnpm --filter @tennis/api admin:create -- --email you@example.com --role admin
//   pnpm --filter @tennis/api admin:set-password -- --email you@example.com
//
// PASSWORD INPUT: from `ADMIN_PASSWORD` env, or prompted WITHOUT ECHO on a TTY —
// NEVER a CLI argument (a CLI arg would land in shell history / `ps`). Enforces
// the same >= 12 character policy the login DTO does
// (`admin-password.util.ts#ADMIN_PASSWORD_MIN_LENGTH`).
//
// PRODUCTION GUARD: refuses to run under `NODE_ENV=production` unless
// `--yes-i-am-sure` is also passed. Always prints the target DB host/db name
// (never credentials) before doing anything, on every run.
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { ADMIN_PASSWORD_MIN_LENGTH, hashAdminPassword } from '../src/admin/auth/admin-password.util';

const prisma = new PrismaClient();

type Flags = Record<string, string | boolean>;

function parseArgs(argv: string[]): { subcommand: string; flags: Flags } {
  const [subcommand, ...rest] = argv;
  const flags: Flags = {};
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i]!;
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = rest[i + 1];
    if (next !== undefined && !next.startsWith('--')) {
      flags[key] = next;
      i++;
    } else {
      flags[key] = true;
    }
  }
  return { subcommand: subcommand ?? '', flags };
}

/** Host + db name only — NEVER credentials. */
function dbTargetDescription(): string {
  const raw = process.env.DATABASE_URL;
  if (!raw) return '(DATABASE_URL not set)';
  try {
    const url = new URL(raw);
    return `${url.hostname}:${url.port || '5432'}${url.pathname}`;
  } catch {
    return '(unparseable DATABASE_URL)';
  }
}

/** Reads one line from stdin with the terminal echo suppressed (TTY only). */
function promptHiddenPassword(label: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    if (!stdin.isTTY) {
      reject(new Error('No TTY and ADMIN_PASSWORD is not set — cannot prompt for a password.'));
      return;
    }

    process.stdout.write(label);
    let password = '';
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');

    const cleanup = (): void => {
      stdin.removeListener('data', onData);
      stdin.setRawMode(false);
      stdin.pause();
    };

    function onData(chunk: string): void {
      for (const char of chunk) {
        if (char === '\n' || char === '\r' || char === '') {
          cleanup();
          process.stdout.write('\n');
          resolve(password);
          return;
        }
        if (char === '') {
          cleanup();
          process.stdout.write('\n');
          process.exit(1);
        }
        if (char === '' || char === '\b') {
          password = password.slice(0, -1);
          continue;
        }
        password += char;
      }
    }
    stdin.on('data', onData);
  });
}

async function resolvePassword(): Promise<string> {
  const fromEnv = process.env.ADMIN_PASSWORD;
  if (fromEnv && fromEnv.length > 0) return fromEnv;
  return promptHiddenPassword('Admin password (input hidden): ');
}

function assertPasswordPolicy(password: string): void {
  if (password.length < ADMIN_PASSWORD_MIN_LENGTH) {
    throw new Error(`Password must be at least ${ADMIN_PASSWORD_MIN_LENGTH} characters.`);
  }
}

function assertProductionGuard(flags: Flags): void {
  if (process.env.NODE_ENV === 'production' && !flags['yes-i-am-sure']) {
    throw new Error(
      'NODE_ENV=production — refusing to run without --yes-i-am-sure ' +
        '(this writes directly to the production AdminUser table).',
    );
  }
}

function requireEmail(flags: Flags): string {
  const email = typeof flags.email === 'string' ? flags.email.trim().toLowerCase() : '';
  if (!email) throw new Error('--email is required.');
  return email;
}

/** Exported so `verify-admin-courts.ts` can exercise the CLI's own logic
 *  in-process (portable across platforms — no subprocess/shell quoting). */
export async function createAdmin(flags: Flags): Promise<void> {
  const email = requireEmail(flags);
  const role = typeof flags.role === 'string' && flags.role.length > 0 ? flags.role : 'admin';

  assertProductionGuard(flags);
  console.log(`Target database: ${dbTargetDescription()}`);

  const existing = await prisma.adminUser.findUnique({ where: { email } });
  if (existing) {
    throw new Error(`An AdminUser with email "${email}" already exists.`);
  }

  const password = await resolvePassword();
  assertPasswordPolicy(password);
  const passwordHash = await hashAdminPassword(password);

  const created = await prisma.adminUser.create({ data: { email, passwordHash, role } });
  console.log(`Created AdminUser id=${created.id} email=${created.email} role=${created.role}`);
}

export async function setPassword(flags: Flags): Promise<void> {
  const email = requireEmail(flags);

  assertProductionGuard(flags);
  console.log(`Target database: ${dbTargetDescription()}`);

  const existing = await prisma.adminUser.findUnique({ where: { email } });
  if (!existing) {
    throw new Error(`No AdminUser with email "${email}".`);
  }

  const password = await resolvePassword();
  assertPasswordPolicy(password);
  const passwordHash = await hashAdminPassword(password);

  await prisma.adminUser.update({ where: { email }, data: { passwordHash } });
  console.log(`Updated password for AdminUser email=${email}`);
}

async function main(): Promise<void> {
  const { subcommand, flags } = parseArgs(process.argv.slice(2));
  if (subcommand === 'create') {
    await createAdmin(flags);
  } else if (subcommand === 'set-password') {
    await setPassword(flags);
  } else {
    throw new Error(`Unknown subcommand "${subcommand}". Expected "create" or "set-password".`);
  }
}

// Only run as a CLI when invoked directly (`tsx scripts/admin-user.ts …`) —
// NOT when `verify-admin-courts.ts` imports `createAdmin`/`setPassword` to
// exercise this file's own logic in-process (Testing §13).
if (require.main === module) {
  main()
    .catch((err) => {
      console.error(`\n[admin-user] FAILED: ${err instanceof Error ? err.message : String(err)}`);
      process.exitCode = 1;
    })
    .finally(() => {
      void prisma.$disconnect();
    });
}
