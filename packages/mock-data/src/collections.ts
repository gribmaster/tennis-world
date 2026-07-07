import type { CollectionDTO } from '@tennis/contracts';
import { COLLECTION_COURTS } from './collection-courts';
import { IMG, U } from './images';

// 6 collections ported from the prototypes (`map.html` COLLECTIONS array).
// `slug` is authored as the routing/seed key (Risk #18). `count` is DERIVED from
// the COLLECTION_COURTS membership mapping (Risk #19) — the prototype's decorative
// count numbers are intentionally discarded.

type CollectionSeed = Omit<CollectionDTO, 'count'>;

const COLLECTION_SEEDS: CollectionSeed[] = [
  {
    id: 'coastal',
    slug: 'coastal-courts',
    name: 'Coastal Courts',
    type: 'editorial',
    coverImageUrl: U(IMG.med, 900),
  },
  {
    id: 'desert',
    slug: 'desert-courts',
    name: 'Desert Courts',
    type: 'editorial',
    coverImageUrl: U(IMG.morocco, 900),
  },
  {
    id: 'hidden',
    slug: 'hidden-resorts',
    name: 'Hidden Resorts',
    type: 'editorial',
    coverImageUrl: U(IMG.bali, 900),
  },
  {
    id: 'historic',
    slug: 'historic-clubs',
    name: 'Historic Clubs',
    type: 'editorial',
    coverImageUrl: U(IMG.cotswolds, 900),
  },
  {
    id: 'mountain',
    slug: 'mountain-courts',
    name: 'Mountain Courts',
    type: 'editorial',
    coverImageUrl: U(IMG.aspen, 900),
  },
  {
    id: 'rooftop',
    slug: 'rooftop-urban',
    name: 'Rooftop & Urban',
    type: 'editorial',
    coverImageUrl: U(IMG.tokyo, 900),
  },
];

const countFor = (collectionSlug: string): number =>
  COLLECTION_COURTS.filter((link) => link.collectionSlug === collectionSlug).length;

export const COLLECTIONS: CollectionDTO[] = COLLECTION_SEEDS.map((c) => ({
  ...c,
  count: countFor(c.slug),
}));
