import type { NextConfig } from 'next';

// Static export: Vercel only serves files. No server code, no secrets.
const nextConfig: NextConfig = {
  output: 'export',
  trailingSlash: true,
  reactStrictMode: true,
  poweredByHeader: false,
  images: { unoptimized: true },
};

export default nextConfig;
