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
    console.log(`[sync] Fetching webhook channel ID...`);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
    
    const r = await fetch(`https://discord.com/api/v10/webhooks/${parts.id}/${parts.token}`, {
      cache: "no-store",
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    if (!r.ok) {
      console.log(`[sync] Webhook API returned ${r.status}`);
      return null;
    }
    
    const j = await r.json();
    const channelId = j?.channel_id ?? null;
    console.log(`[sync] Webhook channel ID: ${channelId}`);
    return channelId;
  } catch (error) {
    console.error(`[sync] fetchWebhookChannelId failed:`, error);
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

  // 名前の取得（優先順位の改善）
  let name = "";
  let avatarUrl = "";
  
  // 1. Embed authorから取得（最高優先度）
  if (e.author?.name) {
    name = e.author.name;
    avatarUrl = e.author.icon_url || "";
  } 
  // 2. Content解析で「○○の投稿」パターン
  else if (typeof m.content === "string" && / の投稿$/.test(m.content)) {
    const match = m.content.match(/^(.+?)\s*の投稿/);
    if (match) name = match[1].replace(/^\[.*?\]\s*/, "");
  }
  // 3. Contentから[natsukashi-dex] ○○ の投稿 パターン 
  else if (typeof m.content === "string" && m.content.includes(MARKER)) {
    const match = m.content.match(/\[natsukashi-dex\]\s*(.+?)\s*の投稿/);
    if (match) name = match[1];
  }
  
  // フォールバック: bot/webhook情報
  if (!name) name = m.author?.username || m.author?.global_name || "unknown";
  
  // アバターURL設定
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

// Webhook認証で詳細情報を補完
async function refillViaWebhook(messages: any[]): Promise<any[]> {
  const parts = parseWebhookParts(DISCORD_WEBHOOK_URL);
  if (!parts) return messages;

  const WEBHOOK_ID = getWebhookIdFromUrl(DISCORD_WEBHOOK_URL);
  const out: any[] = [];

  for (const m of messages) {
    try {
      const noContent = typeof m.content !== "string" || m.content.length === 0;
      const noEmbeds = !Array.isArray(m.embeds) || m.embeds.length === 0;

      if (String(m.webhook_id ?? "") === WEBHOOK_ID && (noContent || noEmbeds)) {
        const r = await fetch(
          `https://discord.com/api/v10/webhooks/${parts.id}/${parts.token}/messages/${m.id}`,
          { 
            cache: "no-store",
            headers: {
              "Accept": "application/json",
              "Accept-Charset": "utf-8"
            }
          }
        );
        if (r.ok) {
          try {
            const full = await r.json();
            full.channel_id = m.channel_id ?? full.channel_id;
            full.timestamp = full.timestamp ?? m.timestamp;
            out.push(full);
            continue;
          } catch (parseError) {
            console.error(`[webhook refill] Failed to parse response for message ${m.id}:`, parseError);
          }
        }
      }
    } catch {
      // ignore
    }
    out.push(m);
  }
  return out;
}

export async function POST(req: NextRequest) {
  try {
    const debug = new URL(req.url).searchParams.get("debug") === "1";
    
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
          headers: { 
            "Authorization": `Bot ${DISCORD_BOT_TOKEN}`,
            "Accept": "application/json",
            "Accept-Charset": "utf-8"
          },
          cache: "no-store",
        })
      )
    );

    let allMsgs: any[] = [];
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (r.status === "fulfilled" && r.value?.ok) {
        try {
          const msgs = (await r.value.json()) as any[];
          allMsgs = allMsgs.concat(msgs);
        } catch (parseError) {
          console.error(`[sync] Failed to parse Discord API response:`, parseError);
        }
      } else if (r.status === "rejected") {
        console.error(`[sync] Discord API request failed:`, r.reason);
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

    // Webhook認証で詳細なメッセージ情報を取得
    mine = await refillViaWebhook(mine);

    // デバッグ: 最初のメッセージ構造を確認
    if (debug && mine.length > 0) {
      console.log("[SYNC DEBUG] First message structure:");
      console.log(JSON.stringify(mine[0], null, 2));
    }

    // エントリーに変換
    const entries = mine.map(mapDiscordMessageToEntry).filter(Boolean);
    
    if (debug) {
      console.log(`[SYNC DEBUG] Converted ${entries.length} entries`);
      if (entries.length > 0) {
        console.log("[SYNC DEBUG] First entry:");
        console.log(JSON.stringify(entries[0], null, 2));
      }
    }
    
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