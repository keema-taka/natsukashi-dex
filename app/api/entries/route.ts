// app/api/entries/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

let lastGoodEntries: any[] | null = null;
let lastGoodAt = 0;
const CACHE_TTL_MS = 60 * 1000; // 1分

export const runtime = "nodejs";
// ▼ 完全動的 & 再検証なし
export const dynamic = "force-dynamic";
export const revalidate = 0;

// どのファイルでも使う想定（entries/route.ts と entries/[id]/route.ts 両方に置いてOK）
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

  if (!id || !name) return null; // 必須が欠けていれば無効
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
    name: String(c.name ?? "guest"),
    avatarUrl: String(
      c.avatarUrl ??
        "https://kotonohaworks.com/free-icons/wp-content/uploads/kkrn_icon_user_7.png"
    ),
  };
}

function resolveBaseUrl(req: NextRequest): string {
  const envUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (envUrl) return envUrl.replace(/\/+$/, "");
  return req.nextUrl.origin.replace(/\/+$/, "");
}

// ---- Discord 連携ユーティリティ -----------------
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const DISCORD_BOT_TOKEN   = process.env.DISCORD_BOT_TOKEN;
const DISCORD_CHANNEL_ID  = process.env.DISCORD_CHANNEL_ID;

const MARKER = "[natsukashi-dex]"; // ← フォールバック用の目印

/** Webhook URL から (id, token) を抜く */
function parseWebhookParts(url?: string | null): { id: string; token: string } | null {
  if (!url) return null;
  const m = url.match(/\/webhooks\/(\d+)\/([^/?#]+)/);
  return m ? { id: m[1], token: m[2] } : null;
}

/** Webhook のメタ情報を取得して channel_id を知る（認証不要） */
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

async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = 3000) {
  const ac = new AbortController();
  const id = setTimeout(() => ac.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ac.signal });
  } finally {
    clearTimeout(id);
  }
}

/** Webhook: JSON 1回だけ（添付なし）— 手動テストと同じ最小形 + 送受ログ */
async function notifyDiscord(
  baseUrl: string,
  entry: { id: string; title: string; episode: string; imageUrl?: string | null },
  contributor: { id: string; name: string; avatarUrl: string }
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

  const safe = (s: string, n: number) => (s ?? "").slice(0, n);

  // 既存: notifyDiscord の payload 定義に追記
const payload = {
  // NEW: 投稿者の見た目をDiscord上で反映
  username: contributor.name,
  avatar_url: contributor.avatarUrl,

  content:
    `${MARKER} ${contributor.name} の投稿\n` +
    `title: ${safe(entry.title, 256)}\n` +
    `episode: ${safe(entry.episode, 4096)}` +
    (absImageUrl ? `\nimage: ${absImageUrl}` : ""),
  embeds: [
    {
      type: "rich" as const,
      title: safe(entry.title, 256),
      description: safe(entry.episode, 4096),
      url: detailUrl,
      ...(absImageUrl ? { image: { url: absImageUrl } } : {}),
      footer: { text: "natsukashi-dex" },
    },
  ],
  allowed_mentions: { parse: [] as string[] },
};

  const preview = {
    content: payload.content.slice(0, 120),
    embedsLen: Array.isArray(payload.embeds) ? payload.embeds.length : 0,
    title: payload.embeds?.[0]?.title,
    hasFooter: !!payload.embeds?.[0]?.footer?.text,
    url: payload.embeds?.[0]?.url,
  };
  console.log("[discord][notify] payload preview:", preview);

  try {
    const res = await fetch(`${DISCORD_WEBHOOK_URL}?wait=true`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const posted = await res.json().catch(() => null);

    if (!res.ok || !posted) {
      const text = await res.text().catch(() => "");
      console.error(`[discord] webhook error: ${res.status} ${res.statusText}`, text);
      return null;
    }

    console.log("[discord][posted]", {
      id: posted.id,
      content: (posted.content || "").slice(0, 120),
      embedsLen: Array.isArray(posted.embeds) ? posted.embeds.length : 0,
      footer: posted.embeds?.[0]?.footer?.text,
      url: posted.embeds?.[0]?.url,
    });

    return posted; // { id, ... }
  } catch (err) {
    console.error("[discord] webhook failed:", err);
    return null;
  }
}

function getWebhookIdFromUrl(url?: string | null): string | null {
  if (!url) return null;
  const m = url.match(/\/webhooks\/(\d+)\//);
  return m ? m[1] : null;
}
const WEBHOOK_ID = getWebhookIdFromUrl(DISCORD_WEBHOOK_URL);

/** content からフォールバックで復元 */
function parseFromContent(content: string) {
  const out: {title?: string; episode?: string; imageUrl?: string; name?: string; marked?: boolean} = {};
  const lines = (content || "").split(/\r?\n/).map(s => s.trim());
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

// Discord メッセージ → エントリ整形（embed が空でも content/添付から復元）
function mapDiscordMessageToEntry(m: any) {
  const e = m.embeds?.[0] ?? {};
  let title   = e.title ?? "";
  let episode = e.description ?? "";
  let image   = e?.image?.url ?? "";

  // contentから復元
  const parsed = typeof m.content === "string" ? parseFromContent(m.content) : {};
  if (!title && parsed.title)     title = parsed.title;
  if (!episode && parsed.episode) episode = parsed.episode;
  if (!image && parsed.imageUrl)  image = parsed.imageUrl;

  // 添付（画像）フォールバック
  if (!image && Array.isArray(m.attachments) && m.attachments[0]?.url) {
    image = m.attachments[0].url;
  }

  // 投稿者名
  let name =
  parsed.name ||
  (typeof m.content === "string" && / の投稿$/.test(m.content)
    ? m.content.replace(/ の投稿$/, "")
    : m.author?.username || "unknown");

  const avatarUrl =
    m.author?.avatar && m.author?.id
      ? `https://cdn.discordapp.com/avatars/${m.author.id}/${m.author.avatar}.png`
      : "https://i.pravatar.cc/100?img=1";

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

// ---- 共通: no-store JSON ヘルパ
function jsonNoStore(body: any, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

// ---- GET: 一覧（Discord から復元） -----------------
export async function GET(req: NextRequest) {
  try {
    const debug = req.nextUrl.searchParams.get("debug");

    // Bot が無ければ DB fallback
    if (!DISCORD_BOT_TOKEN) {
      const rows = await prisma.entry.findMany({
        orderBy: { createdAt: "desc" },
        select: {
          id: true, title: true, episode: true, age: true, tags: true,
          imageUrl: true, contributor: true, likes: true, createdAt: true,
        },
      });
      if (debug === "1") console.log("[entries][debug] prisma.count =", rows.length);
      return jsonNoStore({ entries: rows }, 200);
    }

    // 使うチャンネルID（env と webhook 実チャンネル）
    const envChan = DISCORD_CHANNEL_ID || "";
    const hookChan = await fetchWebhookChannelId();
    const uniqueChans = Array.from(new Set([envChan, hookChan].filter(Boolean)));

    if (debug === "1") {
      console.log("[entries][debug] WEBHOOK_ID =", WEBHOOK_ID);
      console.log("[entries][debug] channels to fetch =", uniqueChans);
    }

    // --- 複数チャンネルを並列取得（タイムアウトあり）
    const urls = uniqueChans.map(
      (cid) => `https://discord.com/api/v10/channels/${cid}/messages?limit=100`
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

    // どれも取れなかった → メモリキャッシュ or DB
    if (allMsgs.length === 0) {
      if (lastGoodEntries && Date.now() - lastGoodAt < CACHE_TTL_MS) {
        if (debug === "1") console.warn("[entries][debug] using in-memory cache");
        return jsonNoStore({ entries: lastGoodEntries }, 200);
      }
      const rows = await prisma.entry.findMany({
        orderBy: { createdAt: "desc" },
        select: {
          id: true, title: true, episode: true, age: true, tags: true,
          imageUrl: true, contributor: true, likes: true, createdAt: true,
        },
      });
      if (debug === "1")
        console.warn("[entries][debug] discord empty -> fallback to DB:", rows.length);
      return jsonNoStore({ entries: rows }, 200);
    }

    // 重複除去 + 新しい順
    const byId = new Map<string, any>();
    for (const m of allMsgs) byId.set(m.id, m);
    const msgs = Array.from(byId.values()).sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    // 1) まずは自分の webhook_id のみ抽出
    let mine = msgs.filter((m: any) =>
      WEBHOOK_ID ? String(m.webhook_id ?? "") === WEBHOOK_ID : false
    );

    // 2) 中身が空のものを webhook 経由で取り直し
    mine = await refillViaWebhook(mine);

    // 3) 目印フォールバック（footer / url / MARKER）
    if (mine.length === 0) {
      const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/+$/, "");
      mine = msgs.filter((m: any) => {
        const e = m.embeds?.[0];
        const hasFooter = (e?.footer?.text ?? "") === "natsukashi-dex";
        const urlOk = typeof e?.url === "string" && appUrl && e.url.startsWith(`${appUrl}/entries/`);
        const contentMark = typeof m.content === "string" && m.content.includes(MARKER);
        return hasFooter || urlOk || contentMark;
      });
    }

    // 4) それでも 0 → キャッシュ or DB
    if (mine.length === 0) {
      if (lastGoodEntries && Date.now() - lastGoodAt < CACHE_TTL_MS) {
        if (debug === "1") console.warn("[entries][debug] mine=0 -> use cache");
        return jsonNoStore({ entries: lastGoodEntries }, 200);
      }
      const rows = await prisma.entry.findMany({
        orderBy: { createdAt: "desc" },
        select: {
          id: true, title: true, episode: true, age: true, tags: true,
          imageUrl: true, contributor: true, likes: true, createdAt: true,
        },
      });
      if (debug === "1") console.warn("[entries][debug] mine=0 -> use DB:", rows.length);
      return jsonNoStore({ entries: rows }, 200);
    }

    if (debug === "1") {
      console.log(
        "[entries][debug] sample(3)=",
        mine.slice(0, 3).map((m) => ({
          id: m.id,
          webhook_id: m.webhook_id,
          footer: m.embeds?.[0]?.footer?.text,
          hasMarker: typeof m.content === "string" && m.content.includes(MARKER),
          url: m.embeds?.[0]?.url,
          channel_id: m.channel_id,
        }))
      );
    }

// entries 変換のあと DB で補完するところ
const entries = mine.map(mapDiscordMessageToEntry);

const ids = entries.map((e) => e.id);
const rows = await prisma.entry.findMany({
  where: { id: { in: ids } },
  select: {
    id: true, tags: true, likes: true, contributor: true,
    title: true, episode: true, imageUrl: true,
  },
});
const byDb = new Map(rows.map((r) => [r.id, r]));

for (const e of entries) {
  const db = byDb.get(e.id);
  if (!db) continue;

  e.title    = db.title    ?? e.title;
  e.episode  = db.episode  ?? e.episode;
  e.imageUrl = db.imageUrl ?? e.imageUrl;
  e.tags     = db.tags     ?? e.tags;
  e.likes    = typeof db.likes === "number" ? db.likes : e.likes;

  // ★ ここを変更：直接代入せずパースしてから
  const dbC = parseDbContributor(db.contributor);
  if (dbC) e.contributor = dbC;
}

    // ✅ 正常に取れたのでキャッシュ更新
    lastGoodEntries = entries;
    lastGoodAt = Date.now();

    return jsonNoStore({ entries }, 200);
  } catch (e) {
    console.error("GET /api/entries failed", e);
    return jsonNoStore({ error: "failed" }, 500);
  }
}

// 追加ヘルパー：webhook 認証で1件ずつ取り直し
async function refillViaWebhook(messages: any[]): Promise<any[]> {
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
      // ignore and fall back
    }
    out.push(m);
  }
  return out;
}

// ---- POST: 作成（Discord へ投稿 → message.id を id に採用） ----
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

    // 先に Discord へ投稿（待機して message.id をもらう）
    const baseUrl = resolveBaseUrl(req);
    const msg = await notifyDiscord(
      baseUrl,
      {
        id: "tmp", // 詳細URLには使わないので暫定OK
        title: String(body.title ?? ""),
        episode: String(body.episode ?? ""),
        imageUrl: String(body.imageUrl ?? ""),
      },
      contributor
    );

    const discordId: string | null = msg?.id ?? null;

    // DB は参照キーとして保持（将来用）
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

    const responseEntry = discordId ? { ...created, id: discordId } : created;
    return jsonNoStore({ entry: responseEntry }, 201);
  } catch (e) {
    console.error("POST /api/entries failed", e);
    return jsonNoStore({ error: "failed" }, 500);
  }
}