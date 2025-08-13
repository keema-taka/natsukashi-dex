// app/api/upload/route.ts
import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const ext = path.extname(file.name || "") || ".png";
    const filename = `${randomUUID()}${ext}`;
    const dir = path.join(process.cwd(), "public", "uploads");
    await fs.mkdir(dir, { recursive: true });
    const filepath = path.join(dir, filename);

    await fs.writeFile(filepath, buffer);

    // ブラウザから参照するURL
    const url = `/uploads/${filename}`;
    return NextResponse.json({ url }, { status: 201 });
  } catch (e) {
    console.error("upload failed", e);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
