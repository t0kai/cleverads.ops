import type { NextConfig } from 'next';

// Pages are still pre-rendered static files. The only server code is /api/* (Vercel Functions),
// which reads private Google Sheets for signed-in staff. Secrets live in Vercel env vars, never in the browser.
const nextConfig: NextConfig = {
  trailingSlash: true,
  reactStrictMode: true,
  poweredByHeader: false,
  images: { unoptimized: true },
  // Server-only packages stay out of the browser bundle.
  serverExternalPackages: ['google-auth-library'],
};

export default nextConfig;
