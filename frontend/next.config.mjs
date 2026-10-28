/**
 * The web app is exported as static files (frontend/out) and served by the API
 * on the same address: one service, one URL, no cross-origin calls.
 * Security headers are set by the API (helmet) when it serves these files.
 * For local development, `npm run dev` with NEXT_PUBLIC_API_URL=http://localhost:4000.
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
