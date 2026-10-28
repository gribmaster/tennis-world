import type { Surface } from '@tennis/contracts';

// SurfaceChip — the small pill that shows a court's surface over its photo. Ported from
// v3's `SurfaceLabel` (TASK_56): colors are per-surface (background/text/border), not a
// single tone, and are defined once here rather than inlined at every call site. `sm` is
// the shared `CourtCard`'s top-left chip; `md` is reserved for Court Detail (TASK_59),
// which reuses this component rather than re-deriving the palette.
//
// v3's prototype also has a Carpet variant; this app's `Surface` enum is only
// `Clay | Hard | Grass` (packages/contracts/src/enums.ts), so Carpet is intentionally
// absent here.

const SURFACE_CLASS: Record<Surface, string> = {
  Clay: 'bg-[#F0E6E0] text-[#8B3A1F] border-[#D4A090]',
  Hard: 'bg-[#E0E8F0] text-[#1A4A70] border-[#90B0C8]',
  Grass: 'bg-[#E4EDE0] text-[#2A5020] border-[#90B878]',
};

const SIZE_CLASS = {
  sm: 'text-[10px] px-2 py-[3px]',
  md: 'text-[12px] px-2.5 py-[5px]',
} as const;

export interface SurfaceChipProps {
  surface: Surface;
  size?: 'sm' | 'md';
  className?: string;
}

export function SurfaceChip({ surface, size = 'sm', className }: SurfaceChipProps) {
  return (
    <span
      className={[
        'inline-flex items-center rounded-pill border font-medium',
        SURFACE_CLASS[surface],
        SIZE_CLASS[size],
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {surface}
    </span>
  );
}
