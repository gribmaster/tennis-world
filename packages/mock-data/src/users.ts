import type { UserCollectionDTO, UserProfileDTO } from '@tennis/contracts';
import { COURTS } from './courts';

// Representative mock user profile(s) ported from profile.html (Eleanor Morgan,
// initials "EM", "Explorer · Free"). Consumed by the Phase-1 mock user
// repository. The real User/Entitlement backend does not exist until Phase 4.

export const MOCK_USERS: UserProfileDTO[] = [
  {
    id: 'user-eleanor',
    name: 'Eleanor Morgan',
    initials: 'EM',
    membership: 'free',
  },
];

/** The single profile the Phase-1 mock UserRepository returns as "current user." */
export const DEFAULT_MOCK_USER: UserProfileDTO = MOCK_USERS[0]!;

/** Default saved court slugs from profile.html's initial savedSet. */
export const DEFAULT_SAVED_COURT_SLUGS: string[] = [
  'grand-hotel-tremezzo',
  'belmond-la-residencia',
  'soho-farmhouse',
];

/**
 * A mock wishlist folder plus its membership. `courtIds` (the courts in the folder)
 * is the seed-only join the mock SavedRepository resolves into `CourtSummaryDTO[]`
 * for the per-folder detail page (`/saved/collections/[slug]`). It is NOT part of the
 * minimal `UserCollectionDTO` wire shape — there is no folder-membership table in
 * Phase 1, so the membership lives here as authored seed data. Real folders/membership
 * arrive in Phase 4 (Decision #11).
 */
export type UserCollectionSeed = UserCollectionDTO & {
  /** Court ids (matching COURTS[].id) that belong to this folder. */
  courtIds: string[];
};

/** Cover thumbnails for a folder row: the hero images of its first few member courts. */
function coversFor(courtIds: string[], take = 3): string[] {
  return courtIds
    .map((id) => COURTS.find((c) => c.id === id))
    .filter((c): c is (typeof COURTS)[number] => c !== undefined)
    .slice(0, take)
    .map((c) => c.heroImageUrl);
}

/**
 * Mock wishlist folders ("user collections") ported from saved.html / collection.html
 * (`Summer in Italy`, `Hidden Honeymoon`) with the same membership as the prototype's
 * `USER_COLLECTIONS`. These are the user's OWN folders, NOT the editorial COLLECTIONS.
 *
 * Each folder carries a stable `slug` (the `/saved/collections/[slug]` routing key)
 * and a `courtIds` membership list; `count` is derived to match the membership, and the
 * cover thumbnails are the member courts' hero images. Real folders arrive in Phase 4.
 */
const SUMMER_ITALY_COURT_IDS = ['tremezzo', 'tragara', 'edenroc', 'monte', 'sixsenses'];
const HIDDEN_HONEYMOON_COURT_IDS = ['cheval', 'como', 'aman'];

export const DEFAULT_USER_COLLECTIONS: UserCollectionSeed[] = [
  {
    id: 'wishlist-summer-italy',
    slug: 'summer-italy',
    name: 'Summer in Italy',
    count: SUMMER_ITALY_COURT_IDS.length,
    courtIds: SUMMER_ITALY_COURT_IDS,
    coverImageUrls: coversFor(SUMMER_ITALY_COURT_IDS),
  },
  {
    id: 'wishlist-hidden-honeymoon',
    slug: 'hidden-honeymoon',
    name: 'Hidden Honeymoon',
    count: HIDDEN_HONEYMOON_COURT_IDS.length,
    courtIds: HIDDEN_HONEYMOON_COURT_IDS,
    coverImageUrls: coversFor(HIDDEN_HONEYMOON_COURT_IDS),
  },
];
