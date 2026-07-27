import { PendingCardLink } from '@/components/navigation';

// ProfileStatLink — one clickable cell in the profile stats row (Saved Courts ·
// Collections · Countries). Wraps the existing count/label markup with
// <PendingCardLink> so the whole cell is a link, its dimensions never change while
// pending (the spinner overlay is `absolute inset-0`, scoped to this cell only via
// the shared pending registry), and it gets the standard focus-visible ring used
// elsewhere for keyboard users.

export interface ProfileStatLinkProps {
  href: string;
  value: number;
  label: string;
  ariaLabel: string;
}

export function ProfileStatLink({ href, value, label, ariaLabel }: ProfileStatLinkProps) {
  return (
    <PendingCardLink
      href={href}
      ariaLabel={ariaLabel}
      className="block rounded-sm text-center transition-colors hover:bg-ink/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/40 active:bg-ink/[0.06]"
    >
      <div className="display-m text-ink">{value}</div>
      <div className="eyebrow mt-1.5 text-stone">{label}</div>
    </PendingCardLink>
  );
}
