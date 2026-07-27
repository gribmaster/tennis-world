'use client';

import { useState } from 'react';
import Image from 'next/image';

// UserAvatar — the one reusable user-identity chip (photo-or-initials). Renders the
// user's Google profile photo (`avatarUrl`) when available and loadable, falling back
// to the existing ink-circle serif-initials treatment (ProfileHeader's original
// markup) otherwise. Both states render the SAME fixed-size circular box so there is
// no layout shift while the image loads or if it fails.
//
// FALLBACK RULE: avatarUrl missing → initials. avatarUrl present but the image errors
// (404, expired Google URL, network) → initials, via local `useState` flipped in
// `onError` — it does not retry the failed URL.

const SIZE_CLASS = {
  sm: 'h-[18px] w-[18px]',
  md: 'h-11 w-11',
  lg: 'h-20 w-20',
} as const;

const TEXT_CLASS = {
  sm: 'text-[8px]',
  md: 'text-[15px]',
  lg: 'text-[30px]',
} as const;

const SIZE_PX = { sm: 18, md: 44, lg: 80 } as const;

export interface UserAvatarProps {
  name: string;
  initials: string;
  avatarUrl?: string | null;
  size?: keyof typeof SIZE_CLASS;
  className?: string;
  /**
   * Decorative compact use (e.g. next to a name that already identifies the user):
   * pass `true` to render empty alt text instead of "{name} profile photo".
   */
  decorative?: boolean;
}

export function UserAvatar({
  name,
  initials,
  avatarUrl,
  size = 'md',
  className,
  decorative = false,
}: UserAvatarProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = Boolean(avatarUrl) && !imageFailed;

  const boxClass = [
    'relative flex shrink-0 items-center justify-center overflow-hidden rounded-pill bg-ink text-bone',
    SIZE_CLASS[size],
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={boxClass} aria-hidden={showImage ? undefined : true}>
      {showImage ? (
        <Image
          src={avatarUrl as string}
          alt={decorative ? '' : `${name} profile photo`}
          fill
          sizes={`${SIZE_PX[size]}px`}
          className="object-cover"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <span className={`serif font-normal ${TEXT_CLASS[size]}`}>{initials}</span>
      )}
    </div>
  );
}
