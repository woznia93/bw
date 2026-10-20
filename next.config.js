/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    optimizePackageImports: ['@vercel/analytics', '@vercel/speed-insights'],
  },
  onDemandEntries: {
    maxInactiveAge: 60 * 1000,
    pagesBufferLength: 5,
  },
  staticPageGenerationTimeout: 60,
  images: {
    // Spotify album art
    remotePatterns: [{ protocol: 'https', hostname: 'i.scdn.co' }],
  },
}

module.exports = nextConfig
