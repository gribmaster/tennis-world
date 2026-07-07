import type { AccessType, IndoorOutdoor, Surface } from '@tennis/contracts';

// CourtMeta — the row of `.meta-chip` pills the prototypes use to summarize a
// court's attributes (surface · setting · access · indoor/outdoor). It is the same
// chip treatment Map's list rows and Court Detail use, so it lives here as a shared
// court primitive rather than being re-implemented per screen.
//
// Data-driven and presentational: it takes the individual attribute values as
// props (not a whole court object) and renders only the chips whose value is
// present. Each value is real domain data (a Surface/AccessType enum or the
// free-text `setting`), passed in by the caller — no attribute label is invented
// here beyond the human-facing "Indoor"/"Outdoor" which IS the enum value itself.

export interface CourtMetaProps {
  surface?: Surface;
  /** Free-text setting, e.g. "Lakefront", "Cliffside". */
  setting?: string;
  access?: AccessType;
  indoorOutdoor?: IndoorOutdoor;
  className?: string;
}

export function CourtMeta({
  surface,
  setting,
  access,
  indoorOutdoor,
  className,
}: CourtMetaProps) {
  // Preserve the prototype's chip order: surface, setting, access, indoor/outdoor.
  const chips = [surface, setting, access, indoorOutdoor].filter(
    (value): value is string => Boolean(value),
  );

  if (chips.length === 0) return null;

  const classes = ['flex flex-wrap items-center gap-2', className ?? '']
    .filter(Boolean)
    .join(' ');

  return (
    <ul className={classes}>
      {chips.map((value) => (
        <li key={value} className="meta-chip">
          {value}
        </li>
      ))}
    </ul>
  );
}
