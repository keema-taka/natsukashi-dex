// app/api/clear-cache/route.ts
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    console.log('[clear-cache] POST request received');
    
    // entriesキャッシュをクリア
    try {
      const { clearEntriesCache } = await import('../entries/route');
      clearEntriesCache();
      console.log('[clear-cache] Successfully cleared entries cache');
    } catch (error) {
      console.error('[clear-cache] Failed to clear entries cache:', error);
      throw error;
    }

    return NextResponse.json({ 
      success: true,
      message: "Cache cleared successfully" 
    });

  } catch (error) {
    console.error('POST /api/clear-cache failed:', error);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}