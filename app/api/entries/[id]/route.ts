// app/api/entries/[id]/route.ts
import { NextResponse } from "next/server";
import { fetchEntryById } from "@/lib/discordStore";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  ctx: { params: { id: string } }
) {
  try {
    const e = await fetchEntryById(ctx.params.id);
    if (!e) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ entry: e }, { status: 200 });
  } catch (e) {
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}

// DELETE は当面未対応（Discord 側で手動削除 or 後続対応）
