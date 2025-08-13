// middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const user = process.env.BASIC_USER;
  const pass = process.env.BASIC_PASS;
  if (!user || !pass) return NextResponse.next();

  // 除外パス（画像/静的/NextAuth/OGP などは通す）
  const { pathname } = req.nextUrl;
  const isPublic =
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/public") ||
    pathname.startsWith("/api/auth") ||   // Discordログイン用
    pathname.startsWith("/api/ogp") ||    // OGP画像生成用(任意)
    pathname.match(/\.(png|jpg|jpeg|gif|webp|svg)$/);

  if (isPublic) return NextResponse.next();

  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Basic ")) {
    return new NextResponse("Unauthorized", {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="Protected"' },
    });
  }
  const [, encoded] = auth.split(" ");
  const [u, p] = Buffer.from(encoded, "base64").toString().split(":");

  if (u === user && p === pass) return NextResponse.next();

  return new NextResponse("Unauthorized", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Protected"' },
  });
}

export const config = {
  matcher: ["/((?!api/upload).*)"], // 必要なら /api/upload も保護対象外に
};
