// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 本番ビルド時に ESLint/TS エラーで落とさない
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  // （任意）画像最適化のホスト許可などが必要ならここに追記
  // images: { remotePatterns: [{ protocol: 'https', hostname: 'images.unsplash.com' }] }
};

export default nextConfig;
