// app/api/sync/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const DISCORD_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

function parseWebhookParts(url?: string | null): { id: string; token: string } | null {
  if (!url) return null;
  const m = url.match(/\/webhooks\/(\d+)\/([^/?#]+)/);
  return m ? { id: m[1], token: m[2] } : null;
}

async function fetchWebhookChannelId(): Promise<string | null> {
  const parts = parseWebhookParts(DISCORD_WEBHOOK_URL);
  if (!parts) return null;
  try {
    const r = await fetch(`https://discord.com/api/v10/webhooks/${parts.id}/${parts.token}`, {
      cache: "no-store",
    });
    if (!r.ok) return null;
    const j = await r.json();
    return j?.channel_id ?? null;
  } catch {
    return null;
  }
}

function getWebhookIdFromUrl(url?: string | null): string | null {
  if (!url) return null;
  const m = url.match(/\/webhooks\/(\d+)\//);
  return m ? m[1] : null;
}

function mapDiscordMessageToEntry(m: any) {
  const e = m.embeds?.[0] ?? {};
  const MARKER = "[natsukashi-dex]";
  
  // 画像アップロード専用は除外
  if (typeof m.content === "string" && m.content.includes("[natsukashi-dex-upload]")) {
    return null;
  }

  let title = e.title ?? "";
  let episode = e.description ?? "";
  let image = e?.image?.url ?? "";

  if (!image && Array.isArray(m.attachments) && m.attachments[0]?.url) {
    image = m.attachments[0].url;
  }

  // 名前の取得
  let name = "";
  let avatarUrl = "";
  
  if (e.author?.name) {
    name = e.author.name;
    avatarUrl = e.author.icon_url || "";
  } else if (typeof m.content === "string" && / の投稿$/.test(m.content)) {
    const match = m.content.match(/^(.+?)\s*の投稿/);
    if (match) name = match[1].replace(/^\[.*?\]\s*/, "");
  }
  
  if (!name) name = m.author?.username || m.author?.global_name || "unknown";
  
  if (!avatarUrl) {
    if (m.author?.avatar && m.author?.id) {
      avatarUrl = `https://cdn.discordapp.com/avatars/${m.author.id}/${m.author.avatar}.png`;
    } else {
      avatarUrl = "https://cdn.discordapp.com/embed/avatars/0.png";
    }
  }

  return {
    id: m.id,
    title: title || "(無題)",
    episode: episode || "",
    age: null as number | null,
    tags: "",
    imageUrl: image || "",
    contributor: { id: "discord", name, avatarUrl },
    likes: 0,
    createdAt: new Date(m.timestamp),
  };
}

export async function POST(req: NextRequest) {
  try {
    if (!DISCORD_BOT_TOKEN) {
      return NextResponse.json({ error: "Discord not configured" }, { status: 500 });
    }

    const envChan = DISCORD_CHANNEL_ID || "";
    const hookChan = await fetchWebhookChannelId();
    const uniqueChans = Array.from(new Set([envChan, hookChan].filter(Boolean)));

    if (uniqueChans.length === 0) {
      return NextResponse.json({ error: "No channels configured" }, { status: 500 });
    }

    // Discord からメッセージを取得（最大100件）
    const urls = uniqueChans.map(
      (cid) => `https://discord.com/api/v10/channels/${cid}/messages?limit=100`
    );
    
    const results = await Promise.allSettled(
      urls.map((url) =>
        fetch(url, {
          headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}` },
          cache: "no-store",
        })
      )
    );

    let allMsgs: any[] = [];
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (r.status === "fulfilled" && r.value?.ok) {
        const msgs = (await r.value.json()) as any[];
        allMsgs = allMsgs.concat(msgs);
      }
    }

    if (allMsgs.length === 0) {
      return NextResponse.json({ error: "No messages found" }, { status: 404 });
    }

    // 重複除去
    const byId = new Map<string, any>();
    for (const m of allMsgs) byId.set(m.id, m);
    const msgs = Array.from(byId.values());

    // Webhook IDでフィルタ
    const WEBHOOK_ID = getWebhookIdFromUrl(DISCORD_WEBHOOK_URL);
    let mine = msgs.filter((m: any) => {
      if (!WEBHOOK_ID) return false;
      const isMyWebhook = String(m.webhook_id ?? "") === WEBHOOK_ID;
      if (!isMyWebhook) return false;
      
      const isUploadOnly = typeof m.content === "string" && m.content.includes("[natsukashi-dex-upload]");
      return !isUploadOnly;
    });

    // フォールバック
    if (mine.length === 0) {
      const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/+$/, "");
      mine = msgs.filter((m: any) => {
        const isUploadOnly = typeof m.content === "string" && m.content.includes("[natsukashi-dex-upload]");
        if (isUploadOnly) return false;
        
        const e = m.embeds?.[0];
        const hasFooter = (e?.footer?.text ?? "") === "natsukashi-dex";
        const urlOk = typeof e?.url === "string" && appUrl && e.url.startsWith(`${appUrl}/entries/`);
        const contentMark = typeof m.content === "string" && m.content.includes("[natsukashi-dex]");
        return hasFooter || urlOk || contentMark;
      });
    }

    // エントリーに変換
    const entries = mine.map(mapDiscordMessageToEntry).filter(Boolean);
    
    let syncedCount = 0;
    let skippedCount = 0;

    // DBに保存（upsert）
    for (const entry of entries) {
      if (!entry) continue;
      
      try {
        const existing = await prisma.entry.findUnique({
          where: { id: entry.id },
          select: { id: true }
        });

        if (existing) {
          skippedCount++;
        } else {
          await prisma.entry.create({
            data: {
              id: entry.id,
              title: entry.title,
              episode: entry.episode,
              age: entry.age,
              tags: Array.isArray(entry.tags) ? entry.tags.join(",") : String(entry.tags || ""),
              imageUrl: entry.imageUrl,
              contributor: entry.contributor,
              likes: entry.likes,
              createdAt: entry.createdAt,
            },
          });
          syncedCount++;
        }
      } catch (error) {
        console.warn(`Failed to sync entry ${entry.id}:`, error);
      }
    }

    return NextResponse.json({
      success: true,
      totalFound: entries.length,
      synced: syncedCount,
      skipped: skippedCount,
    }, { status: 200 });

  } catch (e) {
    console.error("POST /api/sync failed:", e);
    return NextResponse.json({ error: "sync failed" }, { status: 500 });
  }
}