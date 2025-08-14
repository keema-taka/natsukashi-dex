// app/api/entries/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type Contributor = { id: string; name: string; avatarUrl: string };

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

function absolutize(url: string | null | undefined, base: string): string | undefined {
  if (!url) return undefined;
  if (/^https?:\/\//i.test(url)) return url;
  const joined = url.startsWith("/") ? url : `/${url}`;
  return `${base}${joined}`;
}

// ---- Discord 連携ユーティリティ -----------------
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const DISCORD_BOT_TOKEN   = process.env.DISCORD_BOT_TOKEN;
const DISCORD_CHANNEL_ID  = process.env.DISCORD_CHANNEL_ID;

const MARKER = "[natsukashi-dex]"; // ← フォールバック用の目印

function clamp(str: string, max: number) {
  return (str ?? "").slice(0, max);
}

/** Webhook: JSON 1回だけ（添付なし）— embed が無い/空でも content から復元できるようにする */
async function notifyDiscord(
  baseUrl: string,
  entry: { id: string; title: string; episode: string; imageUrl?: string | null },
  contributor: { id: string; name: string; avatarUrl: string }
) {
  if (!DISCORD_WEBHOOK_URL) return null;

  const base = baseUrl.replace(/\/+$/,"");
  const detailUrl = `${base}/entries/${entry.id}`;
  const absImageUrl =
    entry.imageUrl && /^https?:\/\//i.test(entry.imageUrl)
      ? entry.imageUrl
      : entry.imageUrl
      ? `${base}${entry.imageUrl.startsWith("/") ? "" : "/"}${entry.imageUrl}`
      : null;

  const safe = (s: string, n:number)=> (s ?? "").slice(0, n);

  // ★ ここが追加：content に機械可読な行を入れておく（embedが落ちても復元可能）
  const contentLines = [
    `${MARKER} ${contributor.name} の投稿`,
    `title: ${safe(entry.title, 256)}`,
    `episode: ${safe(entry.episode, 4096)}`,
    absImageUrl ? `image: ${absImageUrl}` : null,
  ].filter(Boolean);

  const embed = {
    type: "rich" as const,
    title: clamp(entry.title, 256),
    url: detailUrl,
    description: clamp(entry.episode, 4096),
    ...(absImageUrl ? { image: { url: absImageUrl } } : {}),
    footer: { text: "natsukashi-dex" }, // ← フィルタ用の目印
  };

  const payload = {
    content: contentLines.join("\n"),
    allowed_mentions: { parse: [] as string[] },
    embeds: [embed],
  };

  try {
    const res = await fetch(`${DISCORD_WEBHOOK_URL}?wait=true`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(`[discord] webhook error: ${res.status} ${res.statusText}`, text);
      return null;
    }
    return await res.json(); // { id, ... }
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
      // 1行目: "[natsukashi-dex] {name} の投稿"
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
  // ① embed から
  let title   = e.title ?? "";
  let episode = e.description ?? "";
  let image   = e?.image?.url ?? "";

  // ② content から復元（MARKER 付き）
  const parsed = typeof m.content === "string" ? parseFromContent(m.content) : {};
  if (!title && parsed.title)   title = parsed.title;
  if (!episode && parsed.episode) episode = parsed.episode;
  if (!image && parsed.imageUrl)   image = parsed.imageUrl;

  // ③ 添付（画像）フォールバック
  if (!image && Array.isArray(m.attachments) && m.attachments[0]?.url) {
    image = m.attachments[0].url;
  }

  // 投稿者名（content優先 → 末尾「 の投稿」フォーマット → unknown）
  let name = parsed.name || (typeof m.content === "string" && / の投稿$/.test(m.content) ? m.content.replace(/ の投稿$/, "") : "unknown");

  // アイコン
  const avatarUrl = (m.author?.avatar && m.author?.id)
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

// ---- GET: 一覧（Discord から復元） -----------------
export async function GET(req: NextRequest) {
  try {
    const debug = req.nextUrl.searchParams.get("debug");

    // Bot 経由で取得できない場合は DB から返す（ローカル保険）
    if (!DISCORD_BOT_TOKEN || !DISCORD_CHANNEL_ID) {
      const rows = await prisma.entry.findMany({
        orderBy: { createdAt: "desc" },
        select: {
          id: true, title: true, episode: true, age: true, tags: true,
          imageUrl: true, contributor: true, likes: true, createdAt: true,
        },
      });
      if (debug === "1") console.log("[entries][debug] prisma.count =", rows.length);
      return NextResponse.json({ entries: rows }, { status: 200 });
    }

    // ここが実際の Discord API 呼び出し
    const discordApiUrl = `https://discord.com/api/v10/channels/${DISCORD_CHANNEL_ID}/messages?limit=50`;
    const resp = await fetch(discordApiUrl, {
      headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}` },
      // 失敗時に役立つので付けておく（不要なら削ってOK）
      cache: "no-store",
    });

    if (!resp.ok) {
      const t = await resp.text().catch(() => "");
      console.error("[discord] fetch messages failed:", resp.status, resp.statusText, t);
      return NextResponse.json({ entries: [] }, { status: 200 });
    }

    const msgs = (await resp.json()) as any[];

    // デバッグ表示
    if (debug === "1") {
      console.log("[entries][debug] WEBHOOK_ID =", WEBHOOK_ID);
      console.log(
        "[entries][debug] sample(3)=",
        msgs.slice(0, 3).map((m) => ({
          id: m.id,
          webhook_id: m.webhook_id,
          footer: m.embeds?.[0]?.footer?.text,
          hasMarker: typeof m.content === "string" && m.content.includes(MARKER),
          url: m.embeds?.[0]?.url,
        }))
      );
    }

    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/+$/, "");
    const isOursStrict = (m: any) => {
      const e = m.embeds?.[0];
      const hasFooter   = (e?.footer?.text ?? "") === "natsukashi-dex";
      const urlOk       = typeof e?.url === "string" && appUrl && e.url.startsWith(`${appUrl}/entries/`);
      const contentMark = typeof m.content === "string" && m.content.includes(MARKER);
      const hasAnyMark  = hasFooter || contentMark || urlOk;

      if (WEBHOOK_ID) {
        const fromMyWebhook = String(m.webhook_id ?? "") === WEBHOOK_ID;
        return fromMyWebhook && hasAnyMark;
      }
      return hasAnyMark;
    };

    let mine = msgs.filter(isOursStrict);

    // 全滅フォールバック：MARKER のみ
    if (mine.length === 0) {
      const relaxed = msgs.filter(
        (m) => typeof m.content === "string" && m.content.includes(MARKER)
      );
      if (debug === "1") {
        console.warn("[entries][debug] strict filter = 0; relaxed by MARKER =", relaxed.length);
      }
      mine = relaxed;
    }

    // さらに全滅なら footer / url のみ
    if (mine.length === 0) {
      const fallback = msgs.filter((m) => {
        const e = m.embeds?.[0];
        const hasFooter = (e?.footer?.text ?? "") === "natsukashi-dex";
        const urlOk     = typeof e?.url === "string" && appUrl && e.url.startsWith(`${appUrl}/entries/`);
        return hasFooter || urlOk;
      });
      if (debug === "1") {
        console.warn("[entries][debug] relaxed(MARKER) = 0; fallback(footer/url) =", fallback.length);
      }
      mine = fallback;
    }

    const entries = mine.map(mapDiscordMessageToEntry);
    return NextResponse.json({ entries }, { status: 200 });
  } catch (e) {
    console.error("GET /api/entries failed", e);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
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
    const msg = await notifyDiscord(baseUrl, {
      id: "tmp", // 詳細URLには使わないので暫定OK
      title: String(body.title ?? ""),
      episode: String(body.episode ?? ""),
      imageUrl: String(body.imageUrl ?? ""),
    }, contributor);

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
    return NextResponse.json({ entry: responseEntry }, { status: 201 });
  } catch (e) {
    console.error("POST /api/entries failed", e);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
