import type { NextConfig } from "next";
const apiOrigin = (
  process.env.DATADRIFT_API_URL || "http://127.0.0.1:18092"
).replace(/\/$/, "");
const config: NextConfig = {
  output: "standalone",
  experimental: { proxyTimeout: 180000 },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${apiOrigin}/api/:path*`,
      },
    ];
  },
};
export default config;
