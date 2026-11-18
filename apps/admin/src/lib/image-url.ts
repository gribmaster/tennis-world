// ─────────────────────────────────────────────────────────────────────────────
// Resolve a stored court-image URL into something a thumbnail can render
// (TASK_74 §"Photos panel"). Three shapes come back from the API:
//   - absolute (Supabase Storage, production)         → use as-is
//   - root-relative `/uploads/...` (local storage dev) → prefix VITE_WEB_BASE_URL
//   - legacy `/courts/...` or `/placeholders/...`      → same prefixing rule
// If VITE_WEB_BASE_URL is unset, a root-relative URL can't be resolved to
// anything real — callers should show a neutral placeholder with the raw URL
// as text instead of attempting an <img> that will just 404.
// ─────────────────────────────────────────────────────────────────────────────

export function resolveImageSrc(url: string, webBaseUrl: string | undefined): string | null {
  if (/^https?:\/\//i.test(url)) return url;
  if (!webBaseUrl) return null;
  return `${webBaseUrl.replace(/\/+$/, '')}${url.startsWith('/') ? url : `/${url}`}`;
}
