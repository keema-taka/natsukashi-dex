// app/api/debug/route.ts
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  try {
    const envInfo = {
      NODE_ENV: process.env.NODE_ENV,
      DATABASE_URL_exists: !!process.env.DATABASE_URL,
      DISCORD_BOT_TOKEN_exists: !!process.env.DISCORD_BOT_TOKEN,
      DISCORD_WEBHOOK_URL_exists: !!process.env.DISCORD_WEBHOOK_URL,
      DISCORD_CHANNEL_ID_exists: !!process.env.DISCORD_CHANNEL_ID,
      NEXTAUTH_URL: process.env.NEXTAUTH_URL,
      NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
      timestamp: new Date().toISOString(),
    };

    console.log('[debug] Environment info:', envInfo);

    // Prisma connection test
    let prismaStatus = "unknown";
    try {
      const { prisma } = await import("@/lib/prisma");
      await prisma.$queryRaw`SELECT 1`;
      prismaStatus = "connected";
    } catch (prismaError) {
      prismaStatus = `error: ${String(prismaError)}`;
      console.error('[debug] Prisma error:', prismaError);
    }

    return NextResponse.json({ 
      ...envInfo, 
      prismaStatus,
      success: true 
    });
  } catch (error) {
    console.error('[debug] Debug endpoint failed:', error);
    return NextResponse.json({ 
      error: String(error),
      stack: error instanceof Error ? error.stack : undefined,
      success: false 
    }, { status: 500 });
  }
}