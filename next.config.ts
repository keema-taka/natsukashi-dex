// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 本番ビルド時に ESLint/TS エラーで落とさない
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },

  // 画像最適化: Discord / アバター / フォールバック画像を許可
  images: {
    remotePatterns: [
      // Discord attachments & avatars
      { protocol: "https", hostname: "cdn.discordapp.com", pathname: "/attachments/**" },
      { protocol: "https", hostname: "cdn.discordapp.com", pathname: "/avatars/**" },
      { protocol: "https", hostname: "cdn.discordapp.com", pathname: "/embed/avatars/**" },
      { protocol: "https", hostname: "media.discordapp.net", pathname: "/attachments/**" },

      // プロフィールのダミー画像
      { protocol: "https", hostname: "i.pravatar.cc", pathname: "/**" },

      // ゲスト用フォールバックアイコン（あなたのコードで使用中）
      { protocol: "https", hostname: "kotonohaworks.com", pathname: "/free-icons/**" },
    ],
    formats: ["image/avif", "image/webp"], // モダン形式を優先配信
  },

  // 圧縮は既定で有効（明示しておくなら）
  compress: true,
};

export default nextConfig;