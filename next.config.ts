import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The repo lives inside a larger directory tree; pin the root so Turbopack
  // does not pick up an unrelated lockfile higher up.
  turbopack: { root: __dirname },
  // Keep the repo to just the project's own files.
  agentRules: false,
};

export default nextConfig;
