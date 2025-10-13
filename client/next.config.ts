import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:8000/:path*',
      },
    ];
  },
  
  // CRITICAL: CSP headers for Chrome 2024 iframe PDF compatibility + WebSocket support
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            // Enhanced CSP for Chrome PDF plugin support (plugin-types removed - deprecated)
            value: [
              "default-src 'self' blob: data: http: https: ws: wss:",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: data:",
              "style-src 'self' 'unsafe-inline' blob: data:",
              "frame-src 'self' blob: data: http: https:",
              "object-src 'self' blob: data:",        // CRITICAL FOR PDF
              "media-src 'self' blob: data:",         // CRITICAL FOR PDF
              "worker-src 'self' blob:",
              "child-src 'self' blob: data:",
              "connect-src 'self' http: https: ws: wss:",
              "img-src 'self' blob: data: https:"     // Added for PDF rendering
            ].join("; ")
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin'
          }
          // NOTE: X-Frame-Options intentionally omitted to allow iframe embedding
        ],
      },
    ];
  },
};

export default nextConfig;
