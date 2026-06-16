import type {NextConfig} from 'next';

// Static-export config so the game can be served as plain files (e.g. GitHub
// Pages). Set NEXT_PUBLIC_BASE_PATH to the repo subpath when deploying to a
// project page, e.g. "/osrs-tower-defense"; leave empty for a user/root site
// or local dev.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

const nextConfig: NextConfig = {
  output: 'export',
  basePath,
  assetPrefix: basePath || undefined,
  trailingSlash: true,
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  images: {
    // No image optimization server in a static export.
    unoptimized: true,
  },
};

export default nextConfig;
