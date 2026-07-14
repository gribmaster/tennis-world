/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Transpile the workspace packages consumed by the web app.
  transpilePackages: ['@tennis/contracts', '@tennis/mock-data'],
  // All app/court imagery is now served from local files under public/placeholders
  // (root-relative `/placeholders/…` paths), so next/image needs no remote host
  // allow-list. The map's OpenStreetMap tiles are loaded by Leaflet directly (not
  // next/image), so they're unaffected by this config.
};

export default nextConfig;
