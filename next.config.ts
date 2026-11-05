import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["postgres", "@electric-sql/pglite"],
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
