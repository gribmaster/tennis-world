#!/usr/bin/env node
// Copies the court-import agent kit — single source of truth `docs/court-import/`
// (TASK_79) — into `apps/admin/public/court-import/` so the admin app can serve
// the same files it links for download, with no second hand-maintained copy
// (TASK_80 decision 6). Runs as `predev`/`prebuild`. Fails the build with a
// clear, non-zero exit when a source file is missing.
//
// Accepts optional `[srcDir] [destDir]` args (used by `verify:admin-ui` to
// point this at a temp directory without touching the real kit or public/).

import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const KIT_FILES = ['court-import.schema.json', 'AGENT_PROMPT.md', 'example.json', 'CLIENT_GUIDE.ru.md'];

export function copyCourtImportKit(srcDir, destDir) {
  const missing = KIT_FILES.filter((file) => !existsSync(path.join(srcDir, file)));
  if (missing.length > 0) {
    throw new Error(`copy-court-import-kit: missing source file(s) in ${srcDir}: ${missing.join(', ')}`);
  }

  mkdirSync(destDir, { recursive: true });
  for (const file of KIT_FILES) {
    copyFileSync(path.join(srcDir, file), path.join(destDir, file));
  }
}

function main() {
  const srcDir = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(__dirname, '../../../docs/court-import');
  const destDir = process.argv[3] ? path.resolve(process.argv[3]) : path.resolve(__dirname, '../public/court-import');

  try {
    copyCourtImportKit(srcDir, destDir);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
  console.log(`copy-court-import-kit: copied ${KIT_FILES.length} file(s) from ${srcDir} to ${destDir}`);
}

// Guarded so importing this module (as the verify harness does, to reuse
// `copyCourtImportKit`/`KIT_FILES` against temp directories) never triggers a
// real copy as a side effect — only running the file directly does.
if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  main();
}
