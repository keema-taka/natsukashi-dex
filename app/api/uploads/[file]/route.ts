// app/api/uploads/[file]/route.ts
import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UPLOAD_DIR = "/tmp/uploads";

export async function GET(_req: Request, ctx: { params: { file: string } }) {
  try {
    // ディレクトリトラバーサル対策：basenameのみ許可
    const name = path.basename(ctx.params.file || "");
    if (!name) {
      return NextResponse.json({ error: "bad request" }, { status: 400 });
    }

    const abs = path.join(UPLOAD_DIR, name);
    const data = await fs.readFile(abs);

    const mime =
      extToMime(path.extname(name).toLowerCase()) || "application/octet-stream";

    // Buffer -> Uint8Array で Response に渡す
    const body = new Uint8Array(data);

    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": mime,
        "Content-Length": String(body.byteLength),
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (e: any) {
    if (e?.code === "ENOENT") {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    console.error("GET /api/uploads/[file] failed:", e);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}

function extToMime(ext: string): string | null {
  switch (ext) {
    case ".png": return "image/png";
    case ".jpg":
    case ".jpeg": return "image/jpeg";
    case ".webp": return "image/webp";
    case ".gif": return "image/gif";
    case ".avif": return "image/avif";
    default: return null;
  }
}
