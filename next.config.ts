import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Default is 1MB; project-file uploads go through a Server Action and are
    // capped at 20MB in files-actions.ts — raise the transport limit to match.
    serverActions: {
      bodySizeLimit: "20mb",
    },
  },
};

export default nextConfig;
