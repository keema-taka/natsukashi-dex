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

function clamp(str: string, max: number) {
  return (str ?? "").slice(0, max);
}

/** Webhook: JSON 1回だけ（添付なし）— embed を必ず付ける */
async function notifyDiscord(
  baseUrl: string,
  entry: { id: string; title: string; episode: string; imageUrl?: string | null },
  contributor: { id: string; name: string; avatarUrl: string }
) {
  if (!DISCORD_WEBHOOK_URL) return null;

  const detailUrl = `${baseUrl.replace(/\/+$/,"")}/entries/${entry.id}`;
  const absImageUrl =
    entry.imageUrl && /^https?:\/\//i.test(entry.imageUrl)
      ? entry.imageUrl
      : entry.imageUrl
      ? `${baseUrl.replace(/\/+$/,"")}${entry.imageUrl.startsWith("/") ? "" : "/"}${entry.imageUrl}`
      : null;

  const embed = {
    type: "rich" as const,
    title: clamp(entry.title, 256),
    url: detailUrl,
    description: clamp(entry.episode, 4096),
    ...(absImageUrl ? { image: { url: absImageUrl } } : {}),
    footer: { text: "natsukashi-dex" }, // ← フィルタ用の目印
  };

  const payload = {
    // 空でもOKだが、見落とし防止で 1 文字入れておく
    content: `${contributor.name} の投稿`,
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


// Discord メッセージ → エントリ整形
function mapDiscordMessageToEntry(m: any) {
  const e = m.embeds?.[0] ?? {};
  // 添付の先頭を画像候補に
  const attachUrl = Array.isArray(m.attachments) && m.attachments[0]?.url ? m.attachments[0].url : "";

  const name = typeof m.content === "string" && m.content.endsWith(" の投稿")
    ? m.content.replace(/ の投稿$/, "")
    : "unknown";

  return {
    id: m.id,
    title: e.title ?? "(無題)",
    episode: e.description ?? "",          // embed ない場合は空のまま
    age: null as number | null,
    tags: "",
    imageUrl: (e.image?.url ?? attachUrl ?? ""),
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
export async function GET(req: NextRequest) {
  try {
    // デバッグモードの有無
    const debug = req.nextUrl.searchParams.get("debug");

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

    // Discordから取得
    const r = await fetch(
      `https://discord.com/api/v10/channels/${DISCORD_CHANNEL_ID}/messages?limit=50`,
      { headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}` } }
    );

    if (!r.ok) {
      const t = await r.text().catch(() => "");
      console.error("[discord] fetch messages failed:", r.status, r.statusText, t);
      return NextResponse.json({ entries: [] }, { status: 200 });
    }

    const msgs = (await r.json()) as any[];
    if (debug === "1") {
      console.log("[entries][debug] fetched msgs =", msgs.length);
      // 先頭3件だけサンプル表示
      for (const m of msgs.slice(0, 3)) {
        console.log("[entries][debug] sample", {
          id: m.id,
          content: m.content,
          hasFooter: (m.embeds?.[0]?.footer?.text ?? "") === "natsukashi-dex",
          url: m.embeds?.[0]?.url,
        });
      }
    }

    // フィルタ
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/+$/, "");
const isOurs = (m: any) => {
  const e = m.embeds?.[0];
  const hasFooter = (e?.footer?.text ?? "") === "natsukashi-dex";
  const urlOk = typeof e?.url === "string" && appUrl && e.url.startsWith(`${appUrl}/entries/`);
  const contentOk = typeof m.content === "string" && / の投稿$/.test(m.content);
  const webhookOk = WEBHOOK_ID && m.webhook_id === WEBHOOK_ID;
  // どれか1つでもOK
  return !!(hasFooter || urlOk || contentOk || webhookOk);
};


    let mine = msgs.filter(isOurs);

    // もし全滅したら、URLチェックを緩和（環境変数未設定などの保険）
    if (mine.length === 0) {
      if (debug === "1") console.warn("[entries][debug] filter hit = 0; relax URL check");
      const relax = (m: any) => {
        const e = m.embeds?.[0];
        const hasFooter = (e?.footer?.text ?? "") === "natsukashi-dex";
        const contentOk = typeof m.content === "string" && / の投稿$/.test(m.content);
        return hasFooter || contentOk;
      };
      mine = msgs.filter(relax);
    }

    if (debug === "1") console.log("[entries][debug] filtered =", mine.length);

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
