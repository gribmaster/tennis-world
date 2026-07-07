// Image URL helper + id map, ported verbatim from the HTML prototypes
// (`/files/*.html`). In Phase 0/1 a CourtImage url is just an opaque absolute URL
// string — the CDN provider is a later, human decision (Architecture Plan §9 Risk
// #9), so nothing here depends on it.

export const U = (id: string, w = 1400): string =>
  `https://images.unsplash.com/${id}?w=${w}&q=80&auto=format&fit=crop`;

export const IMG = {
  clayCourt: 'photo-1554068865-24cecd4e34b8',
  courtAerial: 'photo-1530915534234-66dcdb7e2f5d',
  courtShadow: 'photo-1622279457486-62dcc4a431d6',
  como: 'photo-1599391398131-cd12dfc6c24e',
  capri: 'photo-1571896349842-33c89424de2d',
  med: 'photo-1505142468610-359e7d316be0',
  morocco: 'photo-1539020140153-e479b8c5b1bc',
  bali: 'photo-1537953773345-d172ccf13cf1',
  aspen: 'photo-1551038247-3d9af20df552',
  maldives: 'photo-1582719508461-905c673771fd',
  tokyo: 'photo-1503899036084-c55cdd92da26',
  cotswolds: 'photo-1469474968028-56623f02e42e',
} as const;
