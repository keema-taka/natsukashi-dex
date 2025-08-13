// app/api/entries/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

import path from "node:path";
import fs from "node:fs/promises";

// 詳細: GET /api/entries/:id
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }   // ← Promise を受け取る
) {
  const { id } = await ctx.params;           // ← await して取り出す

  try {
    const entry = await prisma.entry.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        episode: true,
        tags: true,        // CSV文字列
        imageUrl: true,
        contributor: true, // Json
        likes: true,
        createdAt: true,
        // age を使うなら true に
        // age: true,
      },
    });

    if (!entry) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }

    return NextResponse.json({ entry }, { status: 200 });
  } catch (e) {
    console.error("GET /api/entries/[id] failed:", e);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}

// 削除: DELETE /api/entries/:id（投稿者のみ）
export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }   // ← Promise
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const userId = (session.user as any).id || (session.user as any).sub || "";

    const { id } = await ctx.params;         // ← await

    // 対象取得
    const entry = await prisma.entry.findUnique({
      where: { id },
      select: { id: true, contributor: true, imageUrl: true },
    });
    if (!entry) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }

    // 投稿者のみ削除可
    const ownerId =
      (entry.contributor as any)?.id ? String((entry.contributor as any).id) : "";
    if (!ownerId || ownerId !== String(userId)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    // 画像ファイルのローカル削除（/public/uploads/** のときだけ）
    const maybeDeleteLocalImage = async () => {
      const url = entry.imageUrl || "";
      if (!url) return;
      // 外部URLや /uploads/ 以外は無視
      if (/^https?:\/\//i.test(url)) return;
      if (!url.startsWith("/uploads/")) return;

      const rel = url.replace(/^\/+/, ""); // "uploads/xxx.png"
      const abs = path.resolve(process.cwd(), "public", rel);
      try {
        await fs.unlink(abs);
      } catch {
        // すでに無い等は無視
      }
    };

    // コメント → エントリの順で削除（トランザクション）
    await prisma.$transaction(async (tx) => {
      await tx.comment.deleteMany({ where: { entryId: id } });
      await tx.entry.delete({ where: { id } });
    });

    await maybeDeleteLocalImage();

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e) {
    console.error("DELETE /api/entries/[id] failed:", e);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
