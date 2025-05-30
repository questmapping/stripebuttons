import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_ADMIN_AUTH_ENABLED: process.env.ADMIN_AUTH_ENABLED,
  },
  /* config options here */
};

export default nextConfig;
