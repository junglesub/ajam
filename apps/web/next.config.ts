import path from "node:path";

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(process.cwd(), "../.."),
  reactStrictMode: true,
  transpilePackages: ["@timesheet/db", "@timesheet/domain", "@timesheet/ui"]
};

export default nextConfig;
