import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: "/",
          destination: "/amberfield-offline.html",
        },
      ],
    };
  },
};

export default nextConfig;
