/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Transpile the workspace packages consumed by the web app.
  transpilePackages: ['@tennis/contracts', '@tennis/mock-data'],
  // All app/court imagery is served from local files under public/placeholders
  // (root-relative `/placeholders/…` paths). The map's OpenStreetMap tiles are
  // loaded by Leaflet directly (not next/image), so they're unaffected by this
  // config. The one remote host is Google's account-photo CDN, for the signed-in
  // user's avatar (`User.avatarUrl` from the Google OAuth `picture` claim) — a
  // narrow remotePattern, not a broad wildcard.
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
      },
    ],
  },
};

export default nextConfig;
