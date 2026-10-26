/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false, // Disables double-render cycles in POS production environment
  compress: true,        // Enables Gzip & Brotli asset compression for lightning-fast network transfer
  poweredByHeader: false, // Security & bandwidth hardening
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || '/api',
  },
  async rewrites() {
    const rawBackend =
      process.env.BACKEND_URL ||
      process.env.NEXT_PUBLIC_BACKEND_URL ||
      (process.env.NEXT_PUBLIC_API_URL && process.env.NEXT_PUBLIC_API_URL.startsWith('http')
        ? process.env.NEXT_PUBLIC_API_URL.replace(/\/api\/?$/, '')
        : '') ||
      'http://127.0.0.1:4000';
    // Use 127.0.0.1 instead of localhost so Node.js bypasses DNS resolution when offline/no Wi-Fi
    const backendUrl = rawBackend.replace(/\/$/, '').replace('localhost:4000', '127.0.0.1:4000');
    return [
      {
        source: '/api/:path*',
        destination: `${backendUrl}/api/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
