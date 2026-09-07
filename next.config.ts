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
  experimental: {
    // Prerender in the build process instead of a worker thread. Next 15.4.11's
    // export workers die on this machine's Node 24 with
    // `TypeError: a[d] is not a function` out of `.next/server/webpack-runtime.js`
    // — the worker loads a chunk whose factory never arrived, so every page fails
    // to prerender and `output: 'export'` aborts. Same failure on a clean tree and
    // a fresh `npm install`, so it is the worker, not the app. Single-process
    // export costs a few seconds on four pages.
    workerThreads: false,
  },
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
