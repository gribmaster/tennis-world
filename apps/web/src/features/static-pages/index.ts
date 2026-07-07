// Static-pages feature — public surface (Feature 29).
//
// Presentational components for the static routes /about, /privacy, /terms,
// composed by their server pages (apps/web/src/app/{about,privacy,terms}/page.tsx).
// None of them fetch data or import a repository / @tennis/mock-data — the copy is
// feature-local page chrome (see legal-content.ts), NOT domain data.
export { AboutPage } from './AboutPage';

export { LegalPage } from './LegalPage';
export type { LegalPageProps } from './LegalPage';

export { privacyContent, termsContent } from './legal-content';
export type { LegalContent, LegalSection } from './legal-content';
