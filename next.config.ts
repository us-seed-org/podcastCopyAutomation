import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["ai", "@ai-sdk/openai", "@ai-sdk/google", "@ai-sdk/openai-compatible"],
};

export default nextConfig;
