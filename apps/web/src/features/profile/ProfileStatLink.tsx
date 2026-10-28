import { PendingCardLink } from '@/components/navigation';

// ProfileStatLink — one clickable cell in the profile stats row (Saved Courts ·
// Collections · Countries). Wraps the icon/count/label markup with <PendingCardLink> so
// the whole cell is a link, its dimensions never change while pending (the spinner
// overlay is `absolute inset-0`, scoped to this cell only via the shared pending
// registry), and it gets the standard focus-visible ring used elsewhere for keyboard
// users.
//
// TASK_61: adds the cell's icon (one of `saved-glyphs`' three, ink-coloured, above the
// number) and drops `py` from this inner link so the PARENT (`ProfileStats`) owns the
// cell's vertical padding uniformly — the whole `py` box stays one tap target either way.

export interface ProfileStatLinkProps {
  href: string;
  value: number;
  label: string;
  ariaLabel: string;
  icon: (props: { size?: number }) => React.ReactElement;
}

export function ProfileStatLink({ href, value, label, ariaLabel, icon: Icon }: ProfileStatLinkProps) {
  return (
    <PendingCardLink
      href={href}
      ariaLabel={ariaLabel}
      className="flex flex-col items-center rounded-sm text-center transition-colors hover:bg-ink/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/40 active:bg-ink/[0.06]"
    >
      <span className="text-ink md:hidden">
        <Icon size={14} />
      </span>
      <span className="hidden text-ink md:inline-flex">
        <Icon size={15} />
      </span>
      <div className="my-1.5 text-[22px] font-bold leading-none text-ink md:text-[20px]">{value}</div>
      <div className="text-[10px] text-stone md:text-[11px]">{label}</div>
    </PendingCardLink>
  );
}
