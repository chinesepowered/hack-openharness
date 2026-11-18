import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Separate build dirs let two builds run side by side (e.g. for demo recording).
  distDir: process.env.NEXT_DIST_DIR || '.next',
  // Server-Sent Events must not be buffered by response compression.
  compress: false,
  poweredByHeader: false,
  devIndicators: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
    ];
  },
};

export default nextConfig;
