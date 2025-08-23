// app/api/entries/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

let lastGoodEntries: any[] | null = null;
let lastGoodAt = 0;
const CACHE_TTL_MS = 60 * 1000; // 1分

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// 共通
type Contributor = { id: string; name: string; avatarUrl: string };

function parseDbContributor(v: unknown): Contributor | null {
  if (!v || typeof v !== "object") return null;
  const o = v as any;
  const id = typeof o.id === "string" ? o.id : (o.id != null ? String(o.id) : "");
  const name = typeof o.name === "string" ? o.name : (o.name != null ? String(o.name) : "");
  const avatarUrl =
    typeof o.avatarUrl === "string"
      ? o.avatarUrl
      : (o.avatarUrl != null ? String(o.avatarUrl) : "");
  if (!id || !name) return null;
  return { id, name, avatarUrl };
}

function normalizeTagsToCSV(tags: unknown): string {
  let arr: string[] = [];
  if (Array.isArray(tags)) arr = tags.map(String);
  else if (typeof tags === "string") arr = tags.split(",");
  const cleaned = Array.from(new Set(arr.map((s) => s.trim()).filter(Boolean))).slice(0, 5);
  return cleaned.join(",");
}

function ensureContributor(input: any): Contributor {
  const c = input ?? {};
  return {
    id: String(c.id ?? "guest"),
    name: String(c.name ?? "ゲスト"),
    avatarUrl: String(
      c.avatarUrl ?? "https://cdn.discordapp.com/embed/avatars/0.png"
    ),
  };
}

function resolveBaseUrl(req: NextRequest): string {
  const envUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (envUrl) return envUrl.replace(/\/+$/, "");
  return req.nextUrl.origin.replace(/\/+$/, "");
}

// ---- Discord 連携ユーティリティ -----------------
// 投稿保存チャンネル（エントリ本体を送る）
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
// 通知チャンネル（お知らせを送る）
const DISCORD_NOTIFY_WEBHOOK_URL = process.env.DISCORD_NOTIFY_WEBHOOK_URL;

const DISCORD_BOT_TOKEN  = process.env.DISCORD_BOT_TOKEN;
const DISCORD_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID; // ← 明示的に保存先チャンネルIDがあるなら利用

const MARKER = "[natsukashi-dex]";

function parseWebhookParts(url?: string | null): { id: string; token: string } | null {
  if (!url) return null;
  const m = url.match(/\/webhooks\/(\d+)\/([^/?#]+)/);
  return m ? { id: m[1], token: m[2] } : null;
}

/** 投稿保存チャンネルの channel_id を webhook から取る */
async function fetchWebhookChannelId(): Promise<string | null> {
  const parts = parseWebhookParts(DISCORD_WEBHOOK_URL);
  if (!parts) {
    console.log('[entries] fetchWebhookChannelId: no webhook URL parts');
    return null;
  }
  try {
    console.log(`[entries] fetchWebhookChannelId: fetching webhook info`);
    const r = await fetch(`https://discord.com/api/v10/webhooks/${parts.id}/${parts.token}`, {
      cache: "no-store",
    });
    if (!r.ok) {
      console.log(`[entries] fetchWebhookChannelId: webhook fetch failed: ${r.status} ${r.statusText}`);
      return null;
    }
    const j = await r.json();
    const channelId = j?.channel_id ?? null;
    console.log(`[entries] fetchWebhookChannelId: got channel_id: ${channelId}`);
    return channelId;
  } catch (err) {
    console.error('[entries] fetchWebhookChannelId: error:', err);
    return null;
  }
}
// ← webhook_id の照合は「投稿保存チャンネル」の Webhook を使う
const WEBHOOK_ID = getWebhookIdFromUrl(DISCORD_WEBHOOK_URL);

async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = 2000) {
  const ac = new AbortController();
  const id = setTimeout(() => ac.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ac.signal });
  } finally {
    clearTimeout(id);
  }
}

/** 投稿保存チャンネルへ送信（埋め込み／IDを返す） */
async function postToDiscordMain(
  baseUrl: string,
  entry: { id: string; title: string; episode: string; imageUrl?: string | null },
  contributor: { id?: string; name: string; avatarUrl?: string }
) {
  if (!DISCORD_WEBHOOK_URL) return null;

  const base = baseUrl.replace(/\/+$/, "");
  const detailUrl = `${base}/entries/${entry.id}`;

  const absImageUrl =
    entry.imageUrl && /^https?:\/\//i.test(entry.imageUrl)
      ? entry.imageUrl
      : entry.imageUrl
      ? `${base}${entry.imageUrl.startsWith("/") ? "" : "/"}${entry.imageUrl}`
      : null;

  const safe = (s: string | null | undefined, n: number) => String(s ?? "").slice(0, n);

  const payload = {
    username: "natsukashi-bot",
    avatar_url: "https://i.imgur.com/3G4GkFv.png",
    content: `${MARKER} ${contributor.name} の投稿`,
    embeds: [
      {
        type: "rich" as const,
        title: safe(entry.title, 256) || "(無題)",
        description: safe(entry.episode, 4096),
        url: detailUrl,
        ...(absImageUrl ? { image: { url: absImageUrl } } : {}),
        footer: { text: "natsukashi-dex" },
      },
    ],
    allowed_mentions: { parse: [] as string[] },
  };

  try {
    const res = await fetch(`${DISCORD_WEBHOOK_URL}?wait=true`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const posted = await res.json().catch(() => null);
    if (!res.ok || !posted) {
      const text = await res.text().catch(() => "");
      console.error(`[discord] main webhook error: ${res.status} ${res.statusText}`, text);
      return null;
    }
    return posted; // { id, ... }
  } catch (err) {
    console.error("[discord] main webhook failed:", err);
    return null;
  }
}

/** 通知用チャンネルへ「埋め込み」で通知（タイトル=リンク・本文・画像） */
async function notifyDiscordToNotifyChannel(
  baseUrl: string,
  entry: { id: string; title: string; episode: string; imageUrl?: string | null },
  contributor: { name: string }
) {
  const url = DISCORD_NOTIFY_WEBHOOK_URL;
  if (!url) return;

  const base = baseUrl.replace(/\/+$/, "");
  const detailUrl = `${base}/entries/${entry.id}`;

  const absImageUrl =
    entry.imageUrl && /^https?:\/\//i.test(entry.imageUrl)
      ? entry.imageUrl
      : entry.imageUrl
      ? `${base}${entry.imageUrl.startsWith("/") ? "" : "/"}${entry.imageUrl}`
      : null;

  const safe = (s: string | null | undefined, n: number) => String(s ?? "").slice(0, n);

  // ★ エピソードの下に by を追加 (未使用のため削除)

  const payload = {
    username: "図鑑登録通知くん",
    avatar_url:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/6/62/Keizo_Obuchi_cropped_Keizo_Obuchi_19890107.jpg/250px-Keizo_Obuchi_cropped_Keizo_Obuchi_19890107.jpg",
    content: "",
    embeds: [
      {
        type: "rich" as const,
        title: safe(entry.title, 256) || "(無題)",
        url: detailUrl,
        // ★ episode の下に by を追記
        description: `${safe(entry.episode, 4096)}\n\nby ${safe(contributor.name, 128)}`,
        ...(absImageUrl ? { image: { url: absImageUrl } } : {}),
      },
    ],
    allowed_mentions: { parse: [] as string[] },
  };

  try {
    await fetch(`${url}?wait=false`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    console.warn("[discord][notify-channel] failed", e);
  }
}

function getWebhookIdFromUrl(url?: string | null): string | null {
  if (!url) return null;
  const m = url.match(/\/webhooks\/(\d+)\//);
  return m ? m[1] : null;
}

/** content からフォールバックで復元 */
function parseFromContent(content: string) {
  const out: { title?: string; episode?: string; imageUrl?: string; name?: string; marked?: boolean } = {};
  const lines = (content || "").split(/\r?\n/).map((s) => s.trim());
  for (const ln of lines) {
    if (ln.startsWith(MARKER)) {
      out.marked = true;
      const m = ln.match(/\]\s*(.+?)\s*の投稿$/);
      if (m) out.name = m[1];
    } else if (ln.toLowerCase().startsWith("title:")) {
      out.title = ln.slice(6).trim();
    } else if (ln.toLowerCase().startsWith("episode:")) {
      out.episode = ln.slice(8).trim();
    } else if (ln.toLowerCase().startsWith("image:")) {
      out.imageUrl = ln.slice(6).trim();
    }
  }
  return out;
}

// Discord → Entry
function mapDiscordMessageToEntry(m: any) {
  const e = m.embeds?.[0] ?? {};
  let title = e.title ?? "";
  let episode = e.description ?? "";
  let image = e?.image?.url ?? "";

  const parsed = typeof m.content === "string" ? parseFromContent(m.content) : {};
  if (!title && parsed.title) title = parsed.title;
  if (!episode && parsed.episode) episode = parsed.episode;
  if (!image && parsed.imageUrl) image = parsed.imageUrl;

  if (!image && Array.isArray(m.attachments) && m.attachments[0]?.url) {
    image = m.attachments[0].url;
  }

  // 名前の取得優先順位: embed author > content解析 > webhook username > bot username
  let name = "";
  let avatarUrl = "";
  
  if (e.author?.name) {
    // embedにauthor情報がある場合（理想的）
    name = e.author.name;
    avatarUrl = e.author.icon_url || "";
  } else if (parsed.name) {
    // content解析で名前が取得できた場合
    name = parsed.name;
  } else if (typeof m.content === "string" && / の投稿$/.test(m.content)) {
    // contentから「○○の投稿」パターンを抽出
    const match = m.content.match(/^(.+?)\s*の投稿/);
    if (match) name = match[1].replace(/^\[.*?\]\s*/, ""); // マーカー除去
  }
  
  // フォールバック
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

// ---- 共通: no-store JSON
function jsonNoStore(body: any, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/** 配列に commentCount を付与して返す */
async function withCommentCounts<T extends { id: string }>(list: T[]) {
  if (!list.length) return list.map((e) => ({ ...e, commentCount: 0 }));
  
  try {
    const ids = list.map((e) => e.id);
    const grouped = await prisma.comment.groupBy({
      by: ["entryId"],
      _count: { _all: true },
      where: { entryId: { in: ids } },
    });
    const map = new Map(grouped.map((g) => [g.entryId, g._count._all]));
    return list.map((e) => ({ ...e, commentCount: map.get(e.id) ?? 0 }));
  } catch (dbError) {
    console.error('[entries] withCommentCounts DB error, returning 0 counts:', dbError);
    // DB接続失敗時は commentCount: 0 で返す
    return list.map((e) => ({ ...e, commentCount: 0 }));
  }
}

// ---- GET: 一覧
export async function GET(req: NextRequest) {
  try {
    console.log('[entries] GET request started');
    const debug = req.nextUrl.searchParams.get("debug");
    const fast = req.nextUrl.searchParams.get("fast") === "1";
    const sync = req.nextUrl.searchParams.get("sync") === "1";
    console.log(`[entries] params: debug=${debug}, fast=${fast}, sync=${sync}`);

    // 本番環境でのDiscordBot優先、DB代替処理
    console.log(`[entries] DISCORD_BOT_TOKEN exists: ${!!DISCORD_BOT_TOKEN}, NODE_ENV: ${process.env.NODE_ENV}`);
    console.log(`[entries] Environment variables: DATABASE_URL=${!!process.env.DATABASE_URL}, WEBHOOK_URL=${!!DISCORD_WEBHOOK_URL}`);
    
    // ローカル開発環境でsync=1でない場合のみDB優先
    if (process.env.NODE_ENV === "development" && !sync && !DISCORD_BOT_TOKEN) {
      console.log('[entries] Local development mode: using DB fallback');
      try {
        const rows = await prisma.entry.findMany({
          orderBy: { createdAt: "desc" },
          select: {
            id: true, title: true, episode: true, age: true, tags: true,
            imageUrl: true, contributor: true, likes: true, createdAt: true,
          },
        });
        const enriched = await withCommentCounts(rows);
        console.log(`[entries] DB fallback success: ${enriched.length} entries`);
        if (debug === "1") console.log("[entries][debug] prisma.count =", enriched.length);
        return jsonNoStore({ entries: enriched }, 200);
      } catch (dbError) {
        console.error('[entries] DB fallback failed, trying Discord:', dbError);
        // DB失敗時はDiscordに続行
      }
    }

    console.log('[entries] Using Discord API mode');
    const envChan = DISCORD_CHANNEL_ID || "";
    console.log(`[entries] envChan: ${envChan}`);
    
    let hookChan: string | null = null;
    try {
      hookChan = await fetchWebhookChannelId();
    } catch (webhookError) {
      console.error('[entries] fetchWebhookChannelId failed:', webhookError);
    }
    console.log(`[entries] hookChan: ${hookChan}`);
    
    const uniqueChans = Array.from(new Set([envChan, hookChan].filter(Boolean)));
    console.log(`[entries] uniqueChans: ${uniqueChans.join(', ')}`);
    
    // チャンネル情報が取得できない場合はDB代替またはエラー
    if (uniqueChans.length === 0) {
      console.log('[entries] No Discord channels available');
      
      // BOTトークンがない場合は即座に空配列を返す（DB無し動作）
      if (!DISCORD_BOT_TOKEN) {
        console.log('[entries] No Discord bot token - returning empty entries');
        return jsonNoStore({ entries: [] }, 200);
      }
      
      // DBが利用可能な場合のみフォールバック
      try {
        const rows = await prisma.entry.findMany({
          orderBy: { createdAt: "desc" },
          select: {
            id: true, title: true, episode: true, age: true, tags: true,
            imageUrl: true, contributor: true, likes: true, createdAt: true,
          },
        });
        const enriched = await withCommentCounts(rows);
        console.log(`[entries] Discord fallback to DB success: ${enriched.length} entries`);
        return jsonNoStore({ entries: enriched }, 200);
      } catch (dbError) {
        console.error('[entries] Discord fallback to DB failed:', dbError);
        return jsonNoStore({ entries: [] }, 200);
      }
    }

    // 取得（limit=50, timeout=2s）
    const urls = uniqueChans.map(
      (cid) => `https://discord.com/api/v10/channels/${cid}/messages?limit=50`
    );
    const results = await Promise.allSettled(
      urls.map((url) =>
        fetchWithTimeout(url, {
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
      } else {
        const cid = uniqueChans[i];
        console.error("[discord] fetch messages failed:", cid);
      }
    }

    // どれも取れなかった → キャッシュ or DB
    console.log(`[entries] allMsgs.length: ${allMsgs.length}`);
    if (allMsgs.length === 0) {
      console.log('[entries] No Discord messages found, trying cache or DB');
      if (lastGoodEntries && Date.now() - lastGoodAt < CACHE_TTL_MS) {
        if (debug === "1") console.warn("[entries][debug] using in-memory cache");
        const enrichedCache = await withCommentCounts(lastGoodEntries);
        return jsonNoStore({ entries: enrichedCache }, 200);
      }
      console.log('[entries] Falling back to DB');
      const rows = await prisma.entry.findMany({
        orderBy: { createdAt: "desc" },
        select: {
          id: true, title: true, episode: true, age: true, tags: true,
          imageUrl: true, contributor: true, likes: true, createdAt: true,
        },
      });
      const enrichedDb = await withCommentCounts(rows);
      if (debug === "1")
        console.warn("[entries][debug] discord empty -> fallback to DB:", enrichedDb.length);
      return jsonNoStore({ entries: enrichedDb }, 200);
    }

    // 重複除去 + 新しい順
    const byId = new Map<string, any>();
    for (const m of allMsgs) byId.set(m.id, m);
    const msgs = Array.from(byId.values()).sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    // 1) 自分の webhook の投稿に限定（embed情報なしでもOK・webhook経由で後で補完）
    // 画像アップロード専用マーカーは除外
    let mine = msgs.filter((m: any) => {
      if (!WEBHOOK_ID) return false;
      const isMyWebhook = String(m.webhook_id ?? "") === WEBHOOK_ID;
      if (!isMyWebhook) return false;
      
      // アップロード専用マーカーを含むメッセージは除外
      const isUploadOnly = typeof m.content === "string" && m.content.includes("[natsukashi-dex-upload]");
      if (isUploadOnly) return false;
      
      // embedが空でcontentも意味のない投稿を除外
      const embed = m.embeds?.[0];
      const hasTitle = embed?.title && embed.title.trim() && embed.title !== "(無題)";
      const hasEpisode = embed?.description && embed.description.trim();
      const hasValidContent = hasTitle || hasEpisode;
      
      if (!hasValidContent) {
        console.log(`[entries] Filtering out empty content message: ${m.id}`);
        return false;
      }
      
      return true;
    });

    // 2) 中身が薄いものを webhook 認証で補完
    mine = await refillViaWebhook(mine);

    // 3) まだ 0 件ならフォールバック
    if (mine.length === 0) {
      const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/+$/, "");
      mine = msgs.filter((m: any) => {
        // アップロード専用マーカーを含むメッセージは除外
        const isUploadOnly = typeof m.content === "string" && m.content.includes("[natsukashi-dex-upload]");
        if (isUploadOnly) return false;
        
        const e = m.embeds?.[0];
        const hasFooter = (e?.footer?.text ?? "") === "natsukashi-dex";
        const urlOk = typeof e?.url === "string" && appUrl && e.url.startsWith(`${appUrl}/entries/`);
        const contentMark = typeof m.content === "string" && m.content.includes(MARKER);
        return hasFooter || urlOk || contentMark;
      });
    }

    if (mine.length === 0) {
      if (lastGoodEntries && Date.now() - lastGoodAt < CACHE_TTL_MS) {
        if (debug === "1") console.warn("[entries][debug] mine=0 -> use cache");
        const enrichedCache = await withCommentCounts(lastGoodEntries);
        return jsonNoStore({ entries: enrichedCache }, 200);
      }
      const rows = await prisma.entry.findMany({
        orderBy: { createdAt: "desc" },
        select: {
          id: true, title: true, episode: true, age: true, tags: true,
          imageUrl: true, contributor: true, likes: true, createdAt: true,
        },
      });
      const enrichedDb = await withCommentCounts(rows);
      if (debug === "1") console.warn("[entries][debug] mine=0 -> use DB:", enrichedDb.length);
      return jsonNoStore({ entries: enrichedDb }, 200);
    }

    // 4) 変換
    const entries = mine.map(mapDiscordMessageToEntry);

    // 5) fast=1 でなければ DB で補完・同期（tags/likes/contributor/title/episode/imageUrl）
    if (!fast) {
      const ids = entries.map((e) => e.id);
      const rows = await prisma.entry.findMany({
        where: { id: { in: ids } },
        select: {
          id: true, tags: true, likes: true, contributor: true,
          title: true, episode: true, imageUrl: true,
        },
      });
      const byDb = new Map(rows.map((r) => [r.id, r]));
      
      // 存在しないエントリをDBに作成（1件ずつupsertで作成）
      const missingEntries = entries.filter((e) => !byDb.has(e.id));
      if (missingEntries.length > 0) {
        for (const e of missingEntries) {
          try {
            await prisma.entry.create({
              data: {
                id: e.id,
                title: e.title,
                episode: e.episode,
                age: e.age,
                tags: Array.isArray(e.tags) ? e.tags.join(",") : String(e.tags || ""),
                imageUrl: e.imageUrl,
                contributor: e.contributor,
                likes: e.likes,
                createdAt: e.createdAt,
              },
            });
          } catch {
            // 重複エラーは無視（すでに存在する場合）
            console.warn(`Entry ${e.id} already exists, skipping`);
          }
        }
      }
      
      // DB補完処理
      for (const e of entries) {
        const db = byDb.get(e.id);
        if (!db) continue;
        e.title    = db.title    ?? e.title;
        e.episode  = db.episode  ?? e.episode;
        e.imageUrl = db.imageUrl ?? e.imageUrl;
        e.tags     = db.tags     ?? e.tags;
        e.likes    = typeof db.likes === "number" ? db.likes : e.likes;
        const dbC = parseDbContributor(db.contributor);
        if (dbC) e.contributor = dbC;
      }
    }

    // 6) コメント件数を付与（fast=1では0固定）
    const enriched = await withCommentCounts(entries);

    // ✅ キャッシュ更新
    lastGoodEntries = enriched;
    lastGoodAt = Date.now();

    return jsonNoStore({ entries: enriched }, 200);
  } catch (e) {
    console.error("GET /api/entries failed", e);
    console.error("Error stack:", e instanceof Error ? e.stack : 'No stack trace');
    return jsonNoStore({ error: "failed" }, 500);
  }
}

// webhook 認証で 1件ずつ取り直し
async function refillViaWebhook(messages: any[]): Promise<any[]> {
  // ← 投稿保存チャンネルの webhook で取り直す
  const parts = parseWebhookParts(DISCORD_WEBHOOK_URL);
  if (!parts) return messages;

  const out: any[] = [];
  for (const m of messages) {
    try {
      const noContent = typeof m.content !== "string" || m.content.length === 0;
      const noEmbeds = !Array.isArray(m.embeds) || m.embeds.length === 0;

      if (String(m.webhook_id ?? "") === WEBHOOK_ID && (noContent || noEmbeds)) {
        const r = await fetch(
          `https://discord.com/api/v10/webhooks/${parts.id}/${parts.token}/messages/${m.id}`,
          { cache: "no-store" }
        );
        if (r.ok) {
          const full = await r.json();
          full.channel_id = m.channel_id ?? full.channel_id;
          full.timestamp = full.timestamp ?? m.timestamp;
          out.push(full);
          continue;
        }
      }
    } catch {
      // ignore
    }
    out.push(m);
  }
  return out;
}

// ---- POST: 作成（Discord→DB）
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const contributor = ensureContributor(body.contributor);
    const tagsCSV = normalizeTagsToCSV(body.tags);

    // age パース
    let age: number | null = null;
    if (typeof body.age === "number") age = Number.isFinite(body.age) ? body.age : null;
    else if (typeof body.age === "string" && body.age.trim() !== "") {
      const n = Number(body.age);
      age = Number.isFinite(n) ? n : null;
    }

    // 1) 先に Discord（投稿保存チャンネル）へ送信し、message.id を得る
    const baseUrl = resolveBaseUrl(req);
    const posted = await postToDiscordMain(
      baseUrl,
      {
        id: "tmp", // エンベッドのURLだけ一旦 /entries/tmp になるが問題なし
        title: String(body.title ?? ""),
        episode: String(body.episode ?? ""),
        imageUrl: String(body.imageUrl ?? ""),
      },
      contributor
    );

    const discordId: string | null = posted?.id ?? null;

    // 2) DB へ保存（id は Discord の message.id を採用）
    const created = await prisma.entry.create({
      data: {
        id: discordId ?? undefined, // 取れなければ自動採番
        title: String(body.title ?? ""),
        episode: String(body.episode ?? ""),
        age,
        tags: tagsCSV,
        imageUrl: String(body.imageUrl ?? ""),
        contributor,
        likes: 0,
      },
      select: {
        id: true, title: true, episode: true, age: true, tags: true,
        imageUrl: true, contributor: true, likes: true, createdAt: true,
      },
    });

    // 3) 通知チャンネルへお知らせ（埋め込み／タイトル=リンク・本文・画像）
    if (created.id) {
      await notifyDiscordToNotifyChannel(
        baseUrl,
        { id: created.id, title: created.title, episode: created.episode, imageUrl: created.imageUrl },
        { name: contributor.name }
      );
    }

    const responseEntry = discordId ? { ...created, id: discordId } : created;
    return jsonNoStore({ entry: responseEntry }, 201);
  } catch (e) {
    console.error("POST /api/entries failed", e);
    return jsonNoStore({ error: "failed" }, 500);
  }
}
