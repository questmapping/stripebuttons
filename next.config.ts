import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_ADMIN_AUTH_ENABLED: process.env.ADMIN_AUTH_ENABLED,
    NEXT_PUBLIC_PRIVACY_POLICY_URL: process.env.NEXT_PUBLIC_PRIVACY_POLICY_URL,
    NEXT_PUBLIC_COOKIE_POLICY_URL: process.env.NEXT_PUBLIC_COOKIE_POLICY_URL,
    NEXT_PUBLIC_TERMS_URL: process.env.NEXT_PUBLIC_TERMS_URL,
    NEXT_PUBLIC_STATE_AID_URL: process.env.NEXT_PUBLIC_STATE_AID_URL,
  },
  /* config options here */
};

export default nextConfig;
