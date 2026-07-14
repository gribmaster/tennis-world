// @tennis/mock-data — reusable mock dataset ported from the HTML prototypes
// (Architecture Plan Decision #5). Consumed by apps/web's mock repositories in
// Phase 1 and by apps/api's seed script in Phase 2, so the two are provably the
// same data. DATA ONLY — no filtering/transformation logic lives here (that
// belongs in the Phase-1 mock repository adapters).

export {
  U,
  IMG,
  PLACEHOLDER_FILES,
  PLACEHOLDERS,
  placeholder,
  FALLBACK_COURT_IMAGE,
} from './images';
export { COURTS } from './courts';
export { COLLECTIONS } from './collections';
export { COLLECTION_COURTS, type CollectionCourtLink } from './collection-courts';
export { ARTICLES } from './articles';
export {
  MOCK_USERS,
  DEFAULT_MOCK_USER,
  DEFAULT_SAVED_COURT_SLUGS,
  DEFAULT_USER_COLLECTIONS,
  type UserCollectionSeed,
} from './users';
export { SITE_STATS } from './site-stats';
export { PAYWALL_COPY, type PaywallBenefit } from './paywall-copy';
