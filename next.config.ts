import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    'local-origin.dev',
    '*.local-origin.dev',
    '121.126.210.2',
    '121.126.210.3',
  ],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'picsum.photos' },
      { protocol: 'https', hostname: 'example.com' },
    ],
  },
  compiler: {
    removeConsole: {
      exclude: ['error', 'warn', 'info', 'debug'],
    },
  },
};

export default nextConfig;
