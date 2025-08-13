// app/api/entries/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs"; // ← Discord webhook を安定させるため Node 実行を明示

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

/** URL から拡張子を推定（無ければ jpg） */
function guessFilename(url: string, fallbackBase: string) {
  try {
    const u = new URL(url);
    const path = u.pathname;
    const m = path.match(/\.(png|jpe?g|webp|gif|avif)$/i);
    const ext = m ? m[0].toLowerCase() : ".jpg";
    return `${fallbackBase}${ext}`;
  } catch {
    return `${fallbackBase}.jpg`;
  }
}

/** Discord Webhook へ通知（存在すれば。失敗しても throw しない）
 *  1) 画像を取得→添付ファイルとして送信（ローカルURLでも表示可）
 *  2) 失敗時は image.url 直参照にフォールバック
 *  - タイトルはリンク化（embed.url）
 *  - 本文にはURLを書かない
 */
async function notifyDiscord(
  baseUrl: string,
  entry: { id: string; title: string; episode: string; imageUrl?: string | null },
  contributor: Contributor
) {
  const webhook = process.env.DISCORD_WEBHOOK_URL;
  if (!webhook) {
    console.warn("[discord] DISCORD_WEBHOOK_URL が未設定です。通知をスキップしました。");
    return;
  }

  const detailUrl = `${baseUrl}/entries/${entry.id}`;
  const absImageUrl = absolutize(entry.imageUrl, baseUrl);

  const embedBase = {
    title: entry.title,     // Discord側で太字表示
    url: detailUrl,         // ← タイトルをクリックで詳細へ
    description: entry.episode, // ← URLは本文に含めない
  };

  try {
    if (absImageUrl) {
      // まずは画像を取得して添付ファイルで送信（ローカル環境でも確実に表示）
      const imgRes = await fetch(absImageUrl);
      if (imgRes.ok) {
        const buf = await imgRes.arrayBuffer();
        const contentType = imgRes.headers.get("content-type") || "image/jpeg";
        const filename = guessFilename(absImageUrl, `entry-${entry.id}`);
        const file = new Blob([buf], { type: contentType });

        const form = new FormData();
        form.append(
          "payload_json",
          JSON.stringify({
            content: `${contributor.name} の投稿`,
            allowed_mentions: { parse: [] as string[] }, // 誤メンション防止
            embeds: [
              {
                ...embedBase,
                image: { url: `attachment://${filename}` }, // 添付を参照
              },
            ],
          })
        );
        form.append("files[0]", file, filename);

        const up = await fetch(webhook, { method: "POST", body: form });
        if (!up.ok) {
          const text = await up.text().catch(() => "");
          console.error(`[discord] attachment send error: ${up.status} ${up.statusText}`, text);

          // フォールバック：URL直参照で送信
          const fallbackPayload = {
            content: `${contributor.name} の投稿`,
            allowed_mentions: { parse: [] as string[] },
            embeds: [{ ...embedBase, image: { url: absImageUrl } }],
          };
          await fetch(webhook, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(fallbackPayload),
          }).catch(() => {});
        }
        return; // 添付で成功したら終了
      }
    }

    // 画像なし or 取得に失敗 → URL参照または画像無しで送信
    const payload = {
      content: `${contributor.name} の投稿`,
      allowed_mentions: { parse: [] as string[] },
      embeds: [
        {
          ...embedBase,
          ...(absImageUrl ? { image: { url: absImageUrl } } : {}),
        },
      ],
    };

    const res = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(`[discord] webhook error: ${res.status} ${res.statusText}`, text);
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
        tags: true,        // CSV
        imageUrl: true,
        contributor: true,
        likes: true,       // 既存のカウンタ
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
