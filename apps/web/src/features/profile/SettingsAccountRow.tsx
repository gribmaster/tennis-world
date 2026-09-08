'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { EditProfileModal } from './EditProfileModal';
import { getMutationUserRepository } from '@/lib/repositories.client';

// SettingsAccountRow — the Settings screen's "Account settings" row (TASK_14 decision
// 3): it points at the SAME edit-profile capability as the Profile screen's own Edit
// button, not a second/empty settings surface. Structurally this is
// `ProfileEditTrigger` again (owns its own modal-open state + the save mutation) styled
// as a settings row instead of a pill — the two are intentionally not merged into one
// shared component because their trigger markup differs enough (pill vs. full row with
// a chevron + subcopy slot) that sharing would need a prop-driven trigger renderer for
// no real benefit; the MODAL and the save path are the shared, load-bearing part, and
// both routes to EditProfileModal.

export interface SettingsAccountRowProps {
  name: string;
  email?: string;
  className: string;
}

export function SettingsAccountRow({ name, email, className }: SettingsAccountRowProps) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" className={className}>
        <span className="flex w-full items-center justify-between">
          <span className="block text-[14px] font-normal text-ink">Account settings</span>
          <ChevronGlyph />
        </span>
      </button>

      <EditProfileModal
        open={open}
        name={name}
        email={email}
        onClose={() => setOpen(false)}
        onSave={async (nextName) => {
          await getMutationUserRepository().updateProfile({ name: nextName });
          router.refresh();
        }}
      />
    </>
  );
}

function ChevronGlyph() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="text-stone"
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}
