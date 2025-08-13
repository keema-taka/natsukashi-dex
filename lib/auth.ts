// lib/auth.ts
import { NextAuthOptions } from "next-auth";
import DiscordProvider from "next-auth/providers/discord";

export const authOptions: NextAuthOptions = {
  providers: [
    DiscordProvider({
      clientId: process.env.DISCORD_CLIENT_ID!,
      clientSecret: process.env.DISCORD_CLIENT_SECRET!,
    }),
  ],
  secret: process.env.NEXTAUTH_SECRET,
  session: { strategy: "jwt" },
  callbacks: {
    async jwt({ token, account, profile, user }) {
      // Discord のID/画像/名前をトークンに載せる
      if (account) {
        const p = (profile as any) ?? {};
        token.id = p.id ?? (user as any)?.id ?? token.sub ?? "";
        token.name = p.global_name ?? token.name ?? (user as any)?.name ?? "";
        token.picture = p.image_url ?? token.picture ?? (user as any)?.image ?? "";
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = (token as any).id ?? token.sub ?? "";
        session.user.name = (token as any).name ?? session.user.name ?? "";
        session.user.image = (token as any).picture ?? session.user.image ?? "";
      }
      return session;
    },
  },
};
