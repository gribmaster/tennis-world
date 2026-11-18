// TASK_73 — the admin courts API's Supabase Storage driver serves court photos
// from a Supabase project host. Built FROM ENV at build time (never hardcoded):
// when `SUPABASE_IMAGE_HOSTNAME` is unset, no entry is added (the local/`COURT_IMAGE_STORAGE=local`
// dev posture needs none — those urls are root-relative `/uploads/courts/…`, same
// origin as the web app).
const supabaseImageHostname = process.env.SUPABASE_IMAGE_HOSTNAME?.trim();

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Transpile the workspace packages consumed by the web app.
  transpilePackages: ['@tennis/contracts', '@tennis/mock-data'],
  // All app/court imagery is served from local files under public/placeholders
  // (root-relative `/placeholders/…` paths). The map's OpenStreetMap tiles are
  // loaded by Leaflet directly (not next/image), so they're unaffected by this
  // config. Remote hosts: Google's account-photo CDN, for the signed-in user's
  // avatar (`User.avatarUrl` from the Google OAuth `picture` claim), and
  // (conditionally) the Supabase Storage host for admin-uploaded court photos —
  // both narrow remotePatterns, never a broad wildcard.
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
      },
      ...(supabaseImageHostname
        ? [
            {
              protocol: 'https',
              hostname: supabaseImageHostname,
              pathname: '/storage/v1/object/public/**',
            },
          ]
        : []),
    ],
  },
};

export default nextConfig;
