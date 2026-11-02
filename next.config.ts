import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the project root. Otherwise Turbopack may pick up a lockfile in a
  // parent directory and watch far more than this app.
  turbopack: { root: __dirname },
};

export default nextConfig;
