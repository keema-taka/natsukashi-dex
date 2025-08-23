// app/api/entries-simple/route.ts
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  try {
    console.log('[entries-simple] Starting simple entries endpoint');
    
    // 最小限のテスト: 固定データを返す
    const testData = {
      entries: [
        {
          id: "test",
          title: "テスト投稿",
          episode: "これはテスト用の投稿です",
          age: null,
          tags: "",
          imageUrl: "",
          contributor: { id: "test", name: "Test User", avatarUrl: "" },
          likes: 0,
          createdAt: new Date().toISOString(),
          commentCount: 0
        }
      ]
    };

    console.log('[entries-simple] Returning test data');
    return NextResponse.json(testData, { 
      headers: { "Cache-Control": "no-store" } 
    });

  } catch (error) {
    console.error('[entries-simple] Error:', error);
    return NextResponse.json({ 
      error: String(error),
      stack: error instanceof Error ? error.stack : undefined 
    }, { status: 500 });
  }
}