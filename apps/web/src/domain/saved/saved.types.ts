// Saved domain — feature-local supporting types.
//
// As with courts/collections/journal, the data SHAPES (CourtSummaryDTO,
// UserCollectionDTO) are owned by `@tennis/contracts` and are NOT redefined here —
// they are re-exported from this feature's index.ts for convenience.
//
// The Saved repository was READ-ONLY in early Phase 1; the new design wave (Feature 34)
// added a mock-only user-collection mutation seam (create/toggle/rename) — still no
// auth, no backend, no persistence (Decision #11). This file exists for parity with the
// other domains and as the home for any future query-option types (e.g. a
// `SavedListOptions` cap); none are needed yet, so it currently only documents that
// intent. The interface lives in `saved.repository.ts`.

export {};
