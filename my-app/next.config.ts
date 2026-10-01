import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow profile photos up to 4 MB; Vercel caps requests at 4.5 MB (default limit is 1 MB)
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
};

export default nextConfig;
