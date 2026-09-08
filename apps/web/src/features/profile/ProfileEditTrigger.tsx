'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { EditProfileModal } from './EditProfileModal';
import { getMutationUserRepository } from '@/lib/repositories.client';

// ProfileEditTrigger — the "Edit profile" pill (ProfileHeader) that opens
// EditProfileModal, mirroring PaywallTrigger's shape: ONE client island that owns its
// own open/close state locally and renders both the trigger button and the modal.
//
// SAVE: routes the PATCH through `getMutationUserRepository()` (Feature 81/82) — the
// browser-direct HTTP repo normally, or a server action in staging demo mode (no
// session cookie there), matching the existing saved-collection mutation pattern. On
// success it calls `router.refresh()` so the server-rendered name (this component's own
// `name` prop, AppHeader's account icon, etc.) picks up the new value from the next
// `/v1/me` read — this component does not hold its own copy of the profile as UI state.

export interface ProfileEditTriggerProps {
  name: string;
  email?: string;
}

export function ProfileEditTrigger({ name, email }: ProfileEditTriggerProps) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="btn btn-secondary mt-2.5 h-8 gap-1.5 rounded-pill px-3.5 text-[11px]"
      >
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden
        >
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
        </svg>
        Edit profile
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
