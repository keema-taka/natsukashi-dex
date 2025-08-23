// app/api/refresh-all-images/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

function parseWebhookParts(url?: string | null): { id: string; token: string } | null {
  if (!url) return null;
  const m = url.match(/\/webhooks\/(\d+)\/([^/?#]+)/);
  return m ? { id: m[1], token: m[2] } : null;
}

async function getLatestImageFromDiscord(messageId: string): Promise<string | null> {
  if (!DISCORD_BOT_TOKEN || !DISCORD_WEBHOOK_URL) return null;

  try {
    // 1. Bot APIで取得を試行
    const channelId = process.env.DISCORD_CHANNEL_ID;
    if (channelId) {
      const r = await fetch(
        `https://discord.com/api/v10/channels/${channelId}/messages/${messageId}`,
        { 
          headers: { 
            "Authorization": `Bot ${DISCORD_BOT_TOKEN}`,
            "Accept": "application/json"
          }, 
          cache: "no-store" 
        }
      );

      if (r.ok) {
        const json = await r.json();
        // 最新の画像URLを取得
        const imageUrl = json.embeds?.[0]?.image?.url || json.attachments?.[0]?.url;
        if (imageUrl) return imageUrl;
      }
    }

    // 2. Webhook APIで取得を試行
    const parts = parseWebhookParts(DISCORD_WEBHOOK_URL);
    if (parts) {
      const r = await fetch(
        `https://discord.com/api/v10/webhooks/${parts.id}/${parts.token}/messages/${messageId}`,
        { 
          cache: "no-store",
          headers: { "Accept": "application/json" }
        }
      );

      if (r.ok) {
        const json = await r.json();
        const imageUrl = json.embeds?.[0]?.image?.url || json.attachments?.[0]?.url;
        if (imageUrl) return imageUrl;
      }
    }

    return null;
  } catch (error) {
    console.error(`[refresh-all-images] Failed to get latest image for ${messageId}:`, error);
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    console.log('[refresh-all-images] Starting batch refresh');

    // Discord CDNの画像URLを持つ全てのエントリを取得
    const entries = await prisma.entry.findMany({
      where: {
        imageUrl: {
          contains: 'cdn.discordapp.com'
        }
      },
      select: {
        id: true,
        imageUrl: true
      }
    });

    console.log(`[refresh-all-images] Found ${entries.length} entries with Discord CDN URLs`);

    let updatedCount = 0;
    let failedCount = 0;

    // 各エントリの画像URLを更新
    for (const entry of entries) {
      try {
        const newImageUrl = await getLatestImageFromDiscord(entry.id);
        
        if (newImageUrl && newImageUrl !== entry.imageUrl) {
          await prisma.entry.update({
            where: { id: entry.id },
            data: { imageUrl: newImageUrl }
          });
          
          console.log(`[refresh-all-images] Updated ${entry.id}: ${entry.imageUrl} -> ${newImageUrl}`);
          updatedCount++;
        }
        
        // レート制限を避けるため少し待機
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        console.error(`[refresh-all-images] Failed to update ${entry.id}:`, error);
        failedCount++;
      }
    }

    console.log(`[refresh-all-images] Completed: ${updatedCount} updated, ${failedCount} failed`);

    return NextResponse.json({
      success: true,
      totalEntries: entries.length,
      updatedCount,
      failedCount
    });

  } catch (error) {
    console.error('POST /api/refresh-all-images failed:', error);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}