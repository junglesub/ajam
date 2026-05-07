import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@timesheet/db", "@timesheet/domain", "@timesheet/ui"]
};

export default nextConfig;
