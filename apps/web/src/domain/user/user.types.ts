// User domain — feature-local supporting types.
//
// As with courts/collections/journal/saved, the data SHAPES (UserProfileDTO,
// MembershipStatus) are owned by `@tennis/contracts` and are NOT redefined here —
// they are re-exported from this domain's index.ts for convenience.
//
// The User repository is deliberately READ-ONLY in Phase 1: there is no auth and no
// login/logout/account mutation (Decision #11). This file exists for parity with the
// other domains and as the home for any future query-option types; none are needed
// yet, so it currently only documents that intent. The interface lives in
// `user.repository.ts`.

export {};
