/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false, // Disables double-render cycles in POS production environment
  compress: true,        // Enables Gzip & Brotli asset compression for lightning-fast network transfer
  poweredByHeader: false, // Security & bandwidth hardening
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || '/api',
  },
  async rewrites() {
    const backendUrl = (process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000').replace(/\/$/, '');
    return [
      {
        source: '/api/:path*',
        destination: `${backendUrl}/api/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
