// app/api/upload/route.ts
import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UPLOAD_DIR = "/tmp/uploads";           // ← Renderで書き込みOK
const MAX_SIZE = 5 * 1024 * 1024;            // 5MB

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file");

    if (!(file instanceof Blob)) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: "too large" }, { status: 413 });
    }
    const mime = file.type || "";
    if (!mime.startsWith("image/")) {
      return NextResponse.json({ error: "not image" }, { status: 400 });
    }

    // 元ファイル名（無い場合はフォールバック）
    const originalName =
      (form.get("filename") as string) ||
      (file as any).name ||
      "image";
    const ext = path.extname(originalName) || guessExt(mime) || ".png";

    // 一意なファイル名作成
    const id = crypto.randomBytes(8).toString("hex");
    const filename = `${Date.now()}_${id}${ext}`;

    await fs.mkdir(UPLOAD_DIR, { recursive: true });
    const buf = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(path.join(UPLOAD_DIR, filename), buf);

    // ブラウザ・Discordから参照するURLは API 経由にする
    const url = `/api/uploads/${encodeURIComponent(filename)}`;
    return NextResponse.json({ url }, { status: 201 });
  } catch (e) {
    console.error("upload failed", e);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}

function guessExt(mime: string): string | null {
  switch (mime) {
    case "image/png": return ".png";
    case "image/jpeg": return ".jpg";
    case "image/webp": return ".webp";
    case "image/gif": return ".gif";
    case "image/avif": return ".avif";
    default: return null;
  }
}
