// app/api/entries/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type Contributor = { id: string; name: string; avatarUrl: string };

/** tags を CSV に正規化（重複除去・空文字除去・最大5件） */
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

/** ベースURLの決定: NEXT_PUBLIC_APP_URL > req.origin */
function resolveBaseUrl(req: NextRequest): string {
  const envUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (envUrl) return envUrl.replace(/\/+$/, "");
  return req.nextUrl.origin.replace(/\/+$/, "");
}

/** 相対URL（/uploads/... 等）を絶対URLにする */
function absolutize(url: string | null | undefined, base: string): string | undefined {
  if (!url) return undefined;
  if (/^https?:\/\//i.test(url)) return url;
  const joined = url.startsWith("/") ? url : `/${url}`;
  return `${base}${joined}`;
}

/** Discord Webhook へ通知（JSON 1回だけ。添付は使わない） */
async function notifyDiscord(
  baseUrl: string,
  entry: { id: string; title: string; episode: string; imageUrl?: string | null },
  contributor: Contributor
) {
  const webhook = process.env.DISCORD_WEBHOOK_URL;
  if (!webhook) return;

  const detailUrl = `${baseUrl}/entries/${entry.id}`;
  const imageUrl = absolutize(entry.imageUrl, baseUrl); // DiscordがこのURLを取りに来る

  const payload = {
    content: `${contributor.name} の投稿`,
    allowed_mentions: { parse: [] as string[] }, // 誤メンション防止
    embeds: [
      {
        title: entry.title,      // 太字表示
        url: detailUrl,          // タイトルをクリックで詳細へ
        description: entry.episode,
        image: imageUrl ? { url: imageUrl } : undefined,
      },
    ],
  };

  try {
    const res = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(`[discord] webhook error: ${res.status} ${res.statusText} ${text}`);
    }
  } catch (err) {
    console.error("[discord] webhook failed:", err);
  }
}

// GET /api/entries  一覧
export async function GET() {
  try {
    const rows = await prisma.entry.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        episode: true,
        age: true,
        tags: true,
        imageUrl: true,
        contributor: true,
        likes: true,
        createdAt: true,
      },
    });
    return NextResponse.json({ entries: rows }, { status: 200 });
  } catch (e) {
    console.error("GET /api/entries failed", e);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}

// POST /api/entries 作成
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const contributor = ensureContributor(body.contributor);
    const tagsCSV = normalizeTagsToCSV(body.tags);

    // age は安全にパース
    let age: number | null = null;
    if (typeof body.age === "number") {
      age = Number.isFinite(body.age) ? body.age : null;
    } else if (typeof body.age === "string" && body.age.trim() !== "") {
      const n = Number(body.age);
      age = Number.isFinite(n) ? n : null;
    }

    const created = await prisma.entry.create({
      data: {
        title: String(body.title ?? ""),
        episode: String(body.episode ?? ""),
        age,
        tags: tagsCSV,
        imageUrl: String(body.imageUrl ?? ""),
        contributor,
        likes: 0,
      },
      select: {
        id: true,
        title: true,
        episode: true,
        age: true,
        tags: true,
        imageUrl: true,
        contributor: true,
        likes: true,
        createdAt: true,
      },
    });

    // Discord 通知（fire-and-forget）
    const baseUrl = resolveBaseUrl(req);
    notifyDiscord(baseUrl, created, contributor);

    return NextResponse.json({ entry: created }, { status: 201 });
  } catch (e) {
    console.error("POST /api/entries failed", e);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
