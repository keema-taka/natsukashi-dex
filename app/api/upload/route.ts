// app/api/upload/route.ts
import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import sharp from "sharp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UPLOAD_DIR = "/tmp/uploads";   // Render で書き込みOK
const MAX_SIZE = 5 * 1024 * 1024;    // 5MB

// HEIC/HEIF 判定（拡張子 or MIME）
function isHeicLike(file: File | Blob, originalName: string) {
  const ext = (path.extname(originalName || "") || "").toLowerCase();
  const mime = (file as File).type?.toLowerCase?.() || "";
  return /(\.heic|\.heif)$/.test(ext) || /image\/(heic|heif)/.test(mime);
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

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: "too large" }, { status: 413 });
    }
    if (!(file.type || "").startsWith("image/")) {
      return NextResponse.json({ error: "not image" }, { status: 400 });
    }

    // 元ファイル名（ブラウザによっては name が空のことがある）
    const originalName =
      (form.get("filename") as string) ||
      (file as any).name ||
      "image";

    const buf = Buffer.from(await file.arrayBuffer());

    await fs.mkdir(UPLOAD_DIR, { recursive: true });

    let outBuf: Buffer;
    let outExt: string;

    if (isHeicLike(file, originalName)) {
      // HEIC/HEIF → JPEG へ変換（回転補正あり）
      outBuf = await sharp(buf).rotate().jpeg({ quality: 85 }).toBuffer();
      outExt = ".jpg";
    } else {
      // そのまま保存（拡張子は name or MIME から）
      const ext =
        (path.extname(originalName || "") || "").toLowerCase() ||
        guessExt(file.type) ||
        ".png";
      outBuf = buf;
      outExt = ext;
    }

    // ファイル名は衝突しないように一意化
    const id = crypto.randomBytes(8).toString("hex");
    const filename = `${Date.now()}_${id}${outExt}`;
    const abs = path.join(UPLOAD_DIR, filename);

    await fs.writeFile(abs, outBuf);

    // ブラウザ・Discord から参照するURL（配信用の GET ルート）
    const url = `/api/uploads/${encodeURIComponent(filename)}`;
    return NextResponse.json({ url }, { status: 201 });
  } catch (e) {
    console.error("upload failed", e);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
