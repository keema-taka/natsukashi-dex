// app/api/refresh-image/route.ts
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
        console.log(`[refresh-image] Bot API response for ${messageId}:`, JSON.stringify(json, null, 2));
        // 最新の画像URLを取得
        const imageUrl = json.embeds?.[0]?.image?.url || json.attachments?.[0]?.url;
        if (imageUrl) return imageUrl;
      } else {
        console.log(`[refresh-image] Bot API failed for ${messageId}: ${r.status} ${r.statusText}`);
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
        console.log(`[refresh-image] Webhook API response for ${messageId}:`, JSON.stringify(json, null, 2));
        const imageUrl = json.embeds?.[0]?.image?.url || json.attachments?.[0]?.url;
        if (imageUrl) return imageUrl;
      } else {
        console.log(`[refresh-image] Webhook API failed for ${messageId}: ${r.status} ${r.statusText}`);
      }
    }

    return null;
  } catch (error) {
    console.error('[refresh-image] Failed to get latest image:', error);
    return null;
  }
}

async function updateEntryImageUrl(messageId: string, newImageUrl: string): Promise<void> {
  try {
    await prisma.entry.update({
      where: { id: messageId },
      data: { imageUrl: newImageUrl }
    });
  } catch (error) {
    console.error('Failed to update entry imageUrl:', error);
    throw error;
  }
}

export async function POST(req: NextRequest) {
  try {
    console.log('[refresh-image] POST request received');
    
    const { messageId, currentUrl } = await req.json();
    console.log(`[refresh-image] messageId: ${messageId}, currentUrl: ${currentUrl}`);

    if (!messageId) {
      console.log('[refresh-image] Missing messageId');
      return NextResponse.json({ error: "messageId is required" }, { status: 400 });
    }

    // Discord APIから最新の画像URLを取得
    const latestImageUrl = await getLatestImageFromDiscord(messageId);
    console.log(`[refresh-image] latestImageUrl from Discord: ${latestImageUrl}`);

    if (latestImageUrl && latestImageUrl !== currentUrl) {
      console.log(`[refresh-image] URL changed from ${currentUrl} to ${latestImageUrl}`);
      
      // データベースの画像URLも更新
      try {
        await updateEntryImageUrl(messageId, latestImageUrl);
        console.log(`[refresh-image] Updated database for messageId: ${messageId}`);
        
        // entriesキャッシュをクリア
        try {
          const { clearEntriesCache } = await import('../entries/route');
          clearEntriesCache();
        } catch (cacheError) {
          console.error('[refresh-image] Failed to clear entries cache:', cacheError);
        }
      } catch (dbError) {
        console.error('[refresh-image] Failed to update database:', dbError);
      }
      
      return NextResponse.json({ 
        success: true, 
        newImageUrl: latestImageUrl,
        refreshed: true 
      });
    }

    console.log('[refresh-image] No URL change detected or failed to get new URL');
    return NextResponse.json({ 
      success: true, 
      imageUrl: currentUrl,
      refreshed: false 
    });

  } catch (error) {
    console.error('POST /api/refresh-image failed:', error);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}