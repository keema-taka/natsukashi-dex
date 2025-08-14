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
const DISCORD_BOT_TOKEN   = process.env.DISCORD_BOT_TOKEN;   // ← 生のトークン文字列（先頭に「Bot 」は付けない）
const DISCORD_CHANNEL_ID  = process.env.DISCORD_CHANNEL_ID;  // 投稿を流すチャンネルID

// Webhook: JSON 1回だけ（添付なし）
async function notifyDiscord(baseUrl: string, entry: {
  id: string; title: string; episode: string; imageUrl?: string | null;
}, contributor: Contributor) {
  if (!DISCORD_WEBHOOK_URL) return;

  const detailUrl = `${baseUrl}/entries/${entry.id}`;
  const absImageUrl = absolutize(entry.imageUrl, baseUrl);
  const safe = (s: string, max: number) => (s ?? "").slice(0, max);

const payload = {
  content: `${contributor.name} の投稿`,
  allowed_mentions: { parse: [] as string[] },
  embeds: [
    {
      title: safe(entry.title, 256),
      url: detailUrl,
      description: safe(entry.episode, 4096),
      ...(absImageUrl ? { image: { url: absImageUrl } } : {}),
      footer: { text: "natsukashi-dex" },   // ★ 目印を復活
    },
  ],
};

  const res = await fetch(`${DISCORD_WEBHOOK_URL}?wait=true`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  // wait=true の場合は作成メッセージ JSON が返る
  if (res.ok) {
    return await res.json(); // { id, embeds, ... }
  } else {
    const text = await res.text().catch(() => "");
    console.error(`[discord] webhook error: ${res.status} ${res.statusText}`, text);
    return null;
  }
}

// Discord メッセージ → エントリ整形
function mapDiscordMessageToEntry(m: any) {
  const e = m.embeds?.[0] ?? {};
  const name = typeof m.content === "string" ? m.content.replace(/ の投稿$/, "") : "unknown";
  return {
    id: m.id,
    title: e.title ?? "(無題)",
    episode: e.description ?? "",
    age: null as number | null,
    tags: "",
    imageUrl: e.image?.url ?? "",
    contributor: {
      id: "discord",
      name,
      avatarUrl: m.author?.avatar
        ? `https://cdn.discordapp.com/avatars/${m.author.id}/${m.author.avatar}.png`
        : "https://i.pravatar.cc/100?img=1",
    },
    likes: 0,
    createdAt: new Date(m.timestamp),
  };
}

// ---- GET: 一覧（Discord から復元） -----------------
export async function GET() {
  try {
    if (!DISCORD_BOT_TOKEN || !DISCORD_CHANNEL_ID) {
      const rows = await prisma.entry.findMany({
        orderBy: { createdAt: "desc" },
        select: {
          id: true, title: true, episode: true, age: true, tags: true,
          imageUrl: true, contributor: true, likes: true, createdAt: true,
        },
      });
      return NextResponse.json({ entries: rows }, { status: 200 });
    }

    const r = await fetch(
      `https://discord.com/api/v10/channels/${DISCORD_CHANNEL_ID}/messages?limit=50`,
      { headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}` } }
    );

    if (!r.ok) {
      const t = await r.text().catch(() => "");
      console.error("[discord] fetch messages failed:", r.status, r.statusText, t);
      return NextResponse.json({ entries: [] }, { status: 200 });
    }

    const msgs = await r.json() as any[]; // ← json() は1回だけ！

    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/+$/, "");
    const isOurs = (m: any) => {
      const e = m.embeds?.[0];
      const hasFooter = (e?.footer?.text ?? "") === "natsukashi-dex";
      const urlOk = typeof e?.url === "string" && appUrl && e.url.startsWith(`${appUrl}/entries/`);
      const contentOk = typeof m.content === "string" && / の投稿$/.test(m.content);
      return hasFooter || urlOk || contentOk;
    };

    const mine = msgs.filter(isOurs).map(mapDiscordMessageToEntry);
    return NextResponse.json({ entries: mine }, { status: 200 });
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
      id: "tmp",
      title: String(body.title ?? ""),
      episode: String(body.episode ?? ""),
      imageUrl: String(body.imageUrl ?? ""),
    }, contributor);

    const discordId: string | null = msg?.id ?? null;

    // DB を併用する場合：id を Discord の message.id で固定しておくと参照が楽
    // （Render 無料枠だと消えますが、likes/comments の参照キーとして将来使えます）
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

    // id を Discord の id に合わせたかったが取得できなかった場合、
    // クライアント遷移のためだけに上書きして返す（暫定）
    const responseEntry = discordId ? { ...created, id: discordId } : created;

    return NextResponse.json({ entry: responseEntry }, { status: 201 });
  } catch (e) {
    console.error("POST /api/entries failed", e);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
