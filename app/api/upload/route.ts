// app/api/upload/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const webhook = process.env.DISCORD_WEBHOOK_URL;
    if (!webhook) {
      return NextResponse.json({ error: "webhook missing" }, { status: 500 });
    }

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof Blob)) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }

    const fd = new FormData();
    // 添付だけ送りたいので payload_json は空でOK（メッセージは作られる）
    fd.append("payload_json", JSON.stringify({ content: "upload" }));
    // filename が無い環境があるので、適当な拡張子をつける
    const name = (form.get("filename") as string) || "upload.png";
    fd.append("files[0]", file, name);

    const res = await fetch(`${webhook}?wait=true`, { method: "POST", body: fd });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      return NextResponse.json({ error: "discord upload failed", detail: t }, { status: 502 });
    }

    const json = await res.json();
    const url = json?.attachments?.[0]?.url as string | undefined;
    if (!url) {
      return NextResponse.json({ error: "no url returned" }, { status: 502 });
    }
    // フロントはこの URL を imageUrl にセットすればOK
    return NextResponse.json({ url }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
