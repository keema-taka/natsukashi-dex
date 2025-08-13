// app/api/uploads/[file]/route.ts
import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UPLOAD_DIR = "/tmp/uploads";

export async function GET(
  _req: Request,
  ctx: { params: { file: string } }
) {
  try {
    // ディレクトリトラバーサル対策：basename のみ許可
    const name = path.basename(ctx.params.file || "");
    if (!name) {
      return NextResponse.json({ error: "bad request" }, { status: 400 });
    }

    const abs = path.join(UPLOAD_DIR, name);
    const data = await fs.readFile(abs);

        const mime = extToMime(path.extname(name).toLowerCase()) || "application/octet-stream";

    const uint8 = new Uint8Array(data);
return new Response(uint8, { headers: { "Content-Type": mime } });

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
