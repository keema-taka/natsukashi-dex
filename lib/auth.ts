// lib/auth.ts（抜粋：オプションへ追記）
import DiscordProvider from "next-auth/providers/discord";
import type { NextAuthOptions } from "next-auth";

export const authOptions: NextAuthOptions = {
  providers: [
    DiscordProvider({
      clientId: process.env.DISCORD_CLIENT_ID!,
      clientSecret: process.env.DISCORD_CLIENT_SECRET!,
      authorization: { params: { scope: "identify email" } }, // 明示しておく
    }),
  ],
  secret: process.env.NEXTAUTH_SECRET,

  // 本番でのCookie設定を明示
  useSecureCookies: process.env.NODE_ENV === "production",
  cookies: {
    sessionToken: {
      name:
        process.env.NODE_ENV === "production"
          ? "__Secure-next-auth.session-token"
          : "next-auth.session-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
      },
    },
  },

  // SSR/ISRでも安定させたい場合の保険（省略可）
  session: { strategy: "jwt" },
  // callbacks: { ... } // 既存があればそのまま
  logger: {
    error(code, metadata) {
      console.error("[next-auth][error]", code, metadata);
    },
    warn(code) { console.warn("[next-auth][warn]", code); },
    debug(code, metadata) { console.log("[next-auth][debug]", code, metadata); },
  },
};
