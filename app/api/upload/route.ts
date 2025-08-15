// app/api/upload/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 画像のみ・最大 5MB
const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPTED = /^image\/(png|jpeg|jpg|gif|webp|avif)$/i;
const UPLOAD_MARKER = "[natsukashi-dex-upload]";

function guessExt(type: string): string {
  if (/png$/i.test(type)) return "png";
  if (/jpeg|jpg$/i.test(type)) return "jpg";
  if (/gif$/i.test(type)) return "gif";
  if (/webp$/i.test(type)) return "webp";
  if (/avif$/i.test(type)) return "avif";
  return "png";
}

async function fetchWithTimeout(url: string, init: RequestInit, ms = 10000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ac.signal });
  } finally {
    clearTimeout(t);
  }
}

export async function POST(req: Request) {
  try {
    const webhook = process.env.DISCORD_UPLOAD_WEBHOOK_URL;
    if (!webhook) {
      return NextResponse.json({ error: "webhook missing" }, { status: 500 });
    }

    const form = await req.formData();
    const file = form.get("file");

    if (!(file instanceof Blob)) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }

    // バリデーション
    const type = (file as any).type || "";
    const size = (file as any).size || 0;
    if (!ACCEPTED.test(type)) {
      return NextResponse.json({ error: "unsupported file type" }, { status: 400 });
    }
    if (!Number.isFinite(size) || size <= 0 || size > MAX_BYTES) {
      return NextResponse.json({ error: "file too large (max 5MB)" }, { status: 413 });
    }

    // ファイル名（入力側で name が取れない場合があるため拡張子は MIME から推定）
    const providedName = (form.get("filename") as string) || "";
    const ext = providedName.split(".").pop()?.match(/^[a-z0-9]+$/i) ? providedName.split(".").pop()! : guessExt(type);
    const safeName = (providedName || `upload.${ext}`).replace(/[^\w.\-]/g, "_");

    // Discord Webhook へ送信（添付のみ。メッセージ本文はマーカーのみにして除外しやすく）
    const fd = new FormData();
    fd.append(
      "payload_json",
      JSON.stringify({
        content: UPLOAD_MARKER,                 // ← 一覧では拾わない専用マーカー
        username: "natsukashi-bot",            // ← 常に bot 風
        avatar_url:
          "https://upload.wikimedia.org/wikipedia/commons/thumb/6/62/Keizo_Obuchi_cropped_Keizo_Obuchi_19890107.jpg/250px-Keizo_Obuchi_cropped_Keizo_Obuchi_19890107.jpg",
        allowed_mentions: { parse: [] as string[] },
      })
    );
    fd.append("files[0]", file, safeName);

    const res = await fetchWithTimeout(`${webhook}?wait=true`, { method: "POST", body: fd }, 15000);
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      return NextResponse.json({ error: "discord upload failed", detail: t }, { status: 502 });
    }

    const json = await res.json().catch(() => null);
    const url: string | undefined = json?.attachments?.[0]?.url;
    if (!url) {
      return NextResponse.json({ error: "no url returned" }, { status: 502 });
    }

    // フロントはこの URL を imageUrl に使えばOK（Discord がCDNホストになります）
    return NextResponse.json({ url }, { status: 201 });
  } catch (e) {
    console.error("POST /api/upload failed:", e);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
