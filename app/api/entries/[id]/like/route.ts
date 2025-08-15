// app/api/entries/[id]/like/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const runtime = "nodejs";

// ---- いいねしたユーザー一覧（直近 limit 件） ----
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctx.params;

    const url = new URL(req.url);
    const raw = Number(url.searchParams.get("limit") ?? 20);
    const limit = Number.isFinite(raw) ? Math.max(1, Math.min(raw, 100)) : 20;

    const likes = await prisma.like.findMany({
      where: { entryId: id },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        userId: true,
        userName: true,
        userAvatar: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ users: likes }, { status: 200 });
  } catch (e) {
    console.error("GET /api/entries/[id]/like failed:", e);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}

// ---- いいね：toggle / like / unlike ----
export async function PATCH(
  req: NextRequest,
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

    // 対象投稿チェック
    const exists = await prisma.entry.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!exists) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }

    // 既存のいいね有無（複合ユニーク）
    const existing = await prisma.like.findUnique({
      where: { entryId_userId: { entryId: id, userId } },
      select: { id: true },
    });

    // 実行アクション決定
    const willLike =
      action === "like" ? true : action === "unlike" ? false : !existing;

    if (willLike) {
      if (existing) {
        const count = await prisma.like.count({ where: { entryId: id } });
        await prisma.entry.update({ where: { id }, data: { likes: count } });
        return NextResponse.json({ likes: count, action: "noop", userLiked: true }, { status: 200 });
      }

      const newCount = await prisma.$transaction(async (tx) => {
        await tx.like.create({
          data: { entryId: id, userId, userName, userAvatar },
        });
        const count = await tx.like.count({ where: { entryId: id } });
        await tx.entry.update({ where: { id }, data: { likes: count } });
        return count;
      });

      return NextResponse.json({ likes: newCount, action: "like", userLiked: true }, { status: 200 });
    } else {
      const newCount = await prisma.$transaction(async (tx) => {
        if (existing) {
          await tx.like.delete({
            where: { entryId_userId: { entryId: id, userId } },
          });
        }
        const count = await tx.like.count({ where: { entryId: id } });
        await tx.entry.update({ where: { id }, data: { likes: count } });
        return count;
      });

      return NextResponse.json({ likes: newCount, action: "unlike", userLiked: false }, { status: 200 });
    }
  } catch (e) {
    console.error("PATCH /api/entries/[id]/like failed:", e);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
