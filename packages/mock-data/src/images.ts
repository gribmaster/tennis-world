// Image URL helper + id map. Court/article/collection imagery is served from LOCAL
// placeholder files shipped in `apps/web/public/placeholders/*.jpg`, so every URL is
// a root-relative public path (`/placeholders/<file>.jpg`) that resolves identically
// on local dev, staging, and production. No CDN/remote host is involved anymore, so
// nothing here depends on an external provider (Architecture Plan §9 Risk #9, now
// resolved in favour of self-hosted placeholders).
//
// This module is the single source of truth for image paths across `@tennis/mock-data`
// (courts, articles, collections, user-collection covers). The Postgres seed reads the
// same data, so fixing paths here fixes them in BOTH mock mode and the seeded API/DB.

/** Root-relative public path to a placeholder image by bare file name. */
const P = (file: string): string => `/placeholders/${file}`;

/**
 * Every real file in `apps/web/public/placeholders/`. Keep this list in sync with the
 * directory (see `apps/api/prisma/update-court-images.ts`, which hardcodes the same
 * list to rewrite existing DB rows). Order is stable so image assignment is
 * deterministic across re-seeds.
 */
export const PLACEHOLDER_FILES = [
  'aleksandar-kyng-dhkdfFxGHfU-unsplash.jpg',
  'anastasia-chistik--9Vy4fR_Xo0-unsplash.jpg',
  'andrew-heald-6DSoTlwOkZQ-unsplash.jpg',
  'andrew-heald-C1bGTi-rSus-unsplash.jpg',
  'andrew-heald-n9RZ0dCunpY-unsplash.jpg',
  'andrew-heald-q-lz1KZw640-unsplash.jpg',
  'ben-hershey-K9HgyI3qmqA-unsplash.jpg',
  'braden-egli-k_H7OSg_fUs-unsplash.jpg',
  'chris-chondrogiannis-oN_rL__KiiU-unsplash.jpg',
  'christian-tenguan-RNiK93wcz-U-unsplash.jpg',
  'darko-nesic-VZEnVM6c1lY-unsplash.jpg',
  'denis-zelenykh-fd9CLvRae9I-unsplash.jpg',
  'fei-chao-IaRe1EGaMRc-unsplash.jpg',
  'flou-gaupr-TiWoNYXvFIM-unsplash.jpg',
  'gonzalo-facello-RjCo6j0BkU8-unsplash.jpg',
  'guilherme-maggieri-OH5g9IgcMWs-unsplash.jpg',
  'guzman-barquin-GQmYqY2ySLg-unsplash.jpg',
  'hoi-pham-eLZwsPO8cCQ-unsplash.jpg',
  'j-schiemann-Z4Sxy1_3wdY-unsplash.jpg',
  'jeffery-erhunse-6D2Lmtv_X8A-unsplash.jpg',
  'jeffery-erhunse-xvl_cfsMQ8M-unsplash.jpg',
  'john-fornander-4R9CcBdQTEg-unsplash.jpg',
  'john-fornander-y6_SJpU3Alk-unsplash.jpg',
  'jorge-salazar-pY_GFZNKrrc-unsplash.jpg',
  'josephine-gasser-cv83wpGtFtg-unsplash.jpg',
  'josh-calabrese-zcYRw547Dps-unsplash.jpg',
  'julia-kuzenkov-UTLqS1wa104-unsplash.jpg',
  'kateryna-hliznitsova-nYmHWEIh0BM-unsplash.jpg',
  'kevin-mueller-Q-fL04RhuMg-unsplash.jpg',
  'lucas-davies-aG6ByqGXiXg-unsplash.jpg',
  'marcin-skalij-X_e1pVtB1JU-unsplash.jpg',
  'marcos-paulo-prado-nIz3Er4bk3U-unsplash.jpg',
  'mario-gogh-8xaMOOkKNsw-unsplash.jpg',
  'mario-gogh-MpmAzASjUaM-unsplash.jpg',
  'matthias-david-0wbYOLZwDPY-unsplash.jpg',
  'maurits-bausenhart-XtcZbSPVJ3A-unsplash.jpg',
  'moises-alex-WqI-PbYugn4-unsplash.jpg',
  'muktasim-azlan-rjWfNR_AC5g-unsplash.jpg',
  'olya-mn-sMv2NShIRa4-unsplash.jpg',
  'peyman-shojaei-us51mNdqaPk-unsplash.jpg',
  'prashant-gurung-5lA7dgpdHIg-unsplash.jpg',
  'renith-r-A9VpotrPr1k-unsplash.jpg',
  'renith-r-MLU_X1d3ofQ-unsplash.jpg',
  'rodrigo-kugnharski-DnaofMNz0HM-unsplash.jpg',
  'ryan-searle-qjrjJnFypa0-unsplash.jpg',
  'sam-hojati-w6-_hcmVhYA-unsplash.jpg',
  'todd-trapani-sI-p_NLBNr0-unsplash.jpg',
  'valentin-balan-k0aVMMZwqtU-unsplash.jpg',
  'weichao-deng-uVXxcOq95Rc-unsplash.jpg',
] as const;

/** All placeholder image URLs (root-relative public paths), same order as the files. */
export const PLACEHOLDERS: string[] = PLACEHOLDER_FILES.map(P);

/**
 * Deterministic image URL by index, cycling through the pool when there are more
 * consumers than files. Used to distribute distinct images across courts/galleries.
 */
export const placeholder = (index: number): string =>
  PLACEHOLDERS[((index % PLACEHOLDERS.length) + PLACEHOLDERS.length) % PLACEHOLDERS.length]!;

/** Fallback image for any court/card with no image of its own. A real, existing file. */
export const FALLBACK_COURT_IMAGE = P('ben-hershey-K9HgyI3qmqA-unsplash.jpg');

/**
 * Named semantic image slots kept for the non-court consumers that reference imagery
 * by meaning (articles by mood, editorial collections by theme). Each maps to a
 * DISTINCT real placeholder file so pages don't repeat the same photo. Courts assign
 * their own images positionally (see `courts.ts`), spreading across the whole pool.
 */
export const IMG = {
  clayCourt: P('todd-trapani-sI-p_NLBNr0-unsplash.jpg'),
  courtAerial: P('anastasia-chistik--9Vy4fR_Xo0-unsplash.jpg'),
  courtShadow: P('ryan-searle-qjrjJnFypa0-unsplash.jpg'),
  como: P('guilherme-maggieri-OH5g9IgcMWs-unsplash.jpg'),
  capri: P('maurits-bausenhart-XtcZbSPVJ3A-unsplash.jpg'),
  med: P('moises-alex-WqI-PbYugn4-unsplash.jpg'),
  morocco: P('renith-r-A9VpotrPr1k-unsplash.jpg'),
  bali: P('hoi-pham-eLZwsPO8cCQ-unsplash.jpg'),
  aspen: P('julia-kuzenkov-UTLqS1wa104-unsplash.jpg'),
  maldives: P('renith-r-MLU_X1d3ofQ-unsplash.jpg'),
  tokyo: P('mario-gogh-8xaMOOkKNsw-unsplash.jpg'),
  cotswolds: P('john-fornander-4R9CcBdQTEg-unsplash.jpg'),
} as const;

/**
 * Back-compat resolver. Historically built a remote CDN URL from an id + width; now
 * the value passed in is already a final `/placeholders/...` path, so this is an
 * identity pass-through. The `w` (width) argument is accepted and ignored so existing
 * call sites keep compiling. Prefer using `IMG.*` / `PLACEHOLDERS` / `placeholder()`
 * directly in new code.
 */
export const U = (pathOrId: string, _w = 1400): string => pathOrId;
