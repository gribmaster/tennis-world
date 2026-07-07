import type { ReactNode } from 'react';

// Badge — small caption-style label. Covers the badge treatments the prototypes
// use: the "LOCKED" pill over court imagery (graphite), the gold "LIFETIME MEMBER"
// membership badge (Profile), and a neutral default for free-tier/status labels.
// Tones, not full variants — kept intentionally minimal (shell foundation only).
export type BadgeTone = 'neutral' | 'locked' | 'gold';

const TONE_CLASS: Record<BadgeTone, string> = {
  // Neutral status label on the bone/ivory surface.
  neutral: 'border border-mist text-stone',
  // Locked-court pill: solid graphite over photography.
  locked: 'bg-graphite text-paper',
  // Premium membership badge: thin gold border + gold text.
  gold: 'border border-gold text-gold',
};

export interface BadgeProps {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
}

export function Badge({ children, tone = 'neutral', className }: BadgeProps) {
  const classes = [
    'eyebrow inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1',
    TONE_CLASS[tone],
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return <span className={classes}>{children}</span>;
}
