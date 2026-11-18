import type { AdminCourtImageDTO } from '@tennis/contracts';
import { apiFetch } from './api-client';

// ─────────────────────────────────────────────────────────────────────────────
// Court images — plain helper calls (TASK_74 decision 4 + §3 "Photos panel"),
// not a Refine resource: uploads are multipart, reorder takes the full id
// list, and "make hero" is a PATCH with `isHero: true` (setting `false` is
// rejected by the API — you promote a different image instead).
// ─────────────────────────────────────────────────────────────────────────────

export function uploadCourtImage(courtId: string, file: File, alt?: string): Promise<AdminCourtImageDTO> {
  const form = new FormData();
  form.append('file', file);
  if (alt) form.append('alt', alt);
  return apiFetch<AdminCourtImageDTO>(`/admin/courts/${courtId}/images`, {
    method: 'POST',
    body: form,
  });
}

export function patchCourtImage(
  courtId: string,
  imageId: string,
  patch: { alt?: string | null; isHero?: true },
): Promise<AdminCourtImageDTO> {
  return apiFetch<AdminCourtImageDTO>(`/admin/courts/${courtId}/images/${imageId}`, {
    method: 'PATCH',
    body: patch,
  });
}

export function reorderCourtImages(courtId: string, imageIds: string[]): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>(`/admin/courts/${courtId}/images/order`, {
    method: 'PUT',
    body: { imageIds },
  });
}

export function deleteCourtImage(courtId: string, imageId: string): Promise<void> {
  return apiFetch<void>(`/admin/courts/${courtId}/images/${imageId}`, { method: 'DELETE' });
}

const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

/** Client-side pre-check only — the API is the real gate (415/413 shown verbatim). */
export function preflightCourtImage(file: File): string | null {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
    return `"${file.name}" is not a JPEG, PNG, or WebP image.`;
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return `"${file.name}" is larger than 8 MB.`;
  }
  return null;
}
