// app/api/entries/[id]/like/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

// いいねしたユーザー一覧を返す
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctx.params;
    const url = new URL(_req.url);
    const limit = Math.max(1, Math.min(Number(url.searchParams.get("limit") ?? 20), 100));

    const likes = await prisma.like.findMany({
      where: { entryId: id },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: { userId: true, userName: true, userAvatar: true, createdAt: true },
    });

    return NextResponse.json({ users: likes }, { status: 200 });
  } catch (e) {
    console.error("GET /api/entries/[id]/like failed", e);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}

// いいねトグル／付与／解除
export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const userId = (session.user as any).id || (session.user as any).sub || "";
    const userName = session.user?.name || "unknown";
    const userAvatar = (session.user as any).image || null;

    const { id } = await ctx.params;
    const { action: raw } = await req.json().catch(() => ({ action: "toggle" }));
    const action: "like" | "unlike" | "toggle" =
      raw === "like" || raw === "unlike" ? raw : "toggle";

    // 投稿が存在するか一応チェック
    const exists = await prisma.entry.findUnique({ where: { id }, select: { id: true } });
    if (!exists) return NextResponse.json({ error: "not found" }, { status: 404 });

    const existing = await prisma.like.findUnique({
      where: { entryId_userId: { entryId: id, userId } },
      select: { id: true },
    });

    // 実行する操作を決定
    const willLike =
      action === "like" ? true :
      action === "unlike" ? false :
      !existing; // toggle

    if (willLike) {
      // 既に押していればそのまま返す
      if (existing) {
        const count = await prisma.like.count({ where: { entryId: id } });
        await prisma.entry.update({ where: { id }, data: { likes: count } });
        return NextResponse.json({ likes: count, action: "noop" }, { status: 200 });
      }

      // いいね作成 + カウンタ同期
      const result = await prisma.$transaction(async (tx) => {
        await tx.like.create({
          data: { entryId: id, userId, userName, userAvatar },
        });
        const count = await tx.like.count({ where: { entryId: id } });
        const updated = await tx.entry.update({
          where: { id },
          data: { likes: count },
          select: { likes: true },
        });
        return updated.likes;
      });

      return NextResponse.json({ likes: result }, { status: 200 });
    } else {
      // いいね削除（無ければそのまま）
      const result = await prisma.$transaction(async (tx) => {
        if (existing) {
          await tx.like.delete({ where: { entryId_userId: { entryId: id, userId } } });
        }
        const count = await tx.like.count({ where: { entryId: id } });
        const updated = await tx.entry.update({
          where: { id },
          data: { likes: count },
          select: { likes: true },
        });
        return updated.likes;
      });

      return NextResponse.json({ likes: result }, { status: 200 });
    }
  } catch (e) {
    console.error("PATCH /api/entries/[id]/like failed", e);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
