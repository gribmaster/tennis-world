// Real CollectionCourt membership mapping (Architecture Plan §9 Risk #19).
//
// The HTML prototypes only declared decorative `count` numbers (14/22/11…) that
// exceed the 12-court dataset and authored NO membership. This mapping is the
// ground truth: collection counts are DERIVED from it, and Phase-1's collection
// detail page resolves its court list through it. It also seeds the Postgres
// CollectionCourt join table in Phase 2 with zero drift.
//
// Membership is assigned from each court's setting/surface so the groupings read
// sensibly. A court may belong to more than one collection.

export interface CollectionCourtLink {
  collectionSlug: string;
  courtSlug: string;
  sortOrder: number;
}

export const COLLECTION_COURTS: CollectionCourtLink[] = [
  // Coastal Courts — lakefront / cliffside / island / coastal
  { collectionSlug: 'coastal-courts', courtSlug: 'grand-hotel-tremezzo', sortOrder: 0 },
  { collectionSlug: 'coastal-courts', courtSlug: 'hotel-punta-tragara', sortOrder: 1 },
  { collectionSlug: 'coastal-courts', courtSlug: 'cheval-blanc-randheli', sortOrder: 2 },
  { collectionSlug: 'coastal-courts', courtSlug: 'hotel-du-cap-eden-roc', sortOrder: 3 },
  { collectionSlug: 'coastal-courts', courtSlug: 'monte-carlo-country-club', sortOrder: 4 },

  // Desert Courts — walled garden / arid settings
  { collectionSlug: 'desert-courts', courtSlug: 'royal-mansour', sortOrder: 0 },

  // Hidden Resorts — jungle / island / vineyard seclusion
  { collectionSlug: 'hidden-resorts', courtSlug: 'como-shambhala-estate', sortOrder: 0 },
  { collectionSlug: 'hidden-resorts', courtSlug: 'cheval-blanc-randheli', sortOrder: 1 },
  { collectionSlug: 'hidden-resorts', courtSlug: 'six-senses-douro', sortOrder: 2 },
  { collectionSlug: 'hidden-resorts', courtSlug: 'belmond-la-residencia', sortOrder: 3 },

  // Historic Clubs — club access / heritage venues
  { collectionSlug: 'historic-clubs', courtSlug: 'monte-carlo-country-club', sortOrder: 0 },
  { collectionSlug: 'historic-clubs', courtSlug: 'soho-farmhouse', sortOrder: 1 },

  // Mountain Courts — alpine / mountain village
  { collectionSlug: 'mountain-courts', courtSlug: 'the-little-nell', sortOrder: 0 },
  { collectionSlug: 'mountain-courts', courtSlug: 'belmond-la-residencia', sortOrder: 1 },

  // Rooftop & Urban — rooftop / city settings
  { collectionSlug: 'rooftop-urban', courtSlug: 'aman-tokyo', sortOrder: 0 },
];
