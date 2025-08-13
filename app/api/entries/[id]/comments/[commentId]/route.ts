// app/api/comments/[commentId]/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// PATCH /api/comments/:commentId { body: "..." }
export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ commentId: string }> }
) {
  try {
    const { commentId } = await ctx.params;
    const payload = await req.json();
    if (!payload?.body || String(payload.body).trim().length === 0) {
      return NextResponse.json({ error: "body is required" }, { status: 400 });
    }

    const updated = await prisma.comment.update({
      where: { id: commentId },
      data: { body: String(payload.body) },
      select: { id: true, entryId: true, body: true, author: true, createdAt: true },
    });

    return NextResponse.json({ comment: updated }, { status: 200 });
  } catch (e) {
    console.error("PATCH /api/comments/[commentId] failed", e);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}

// DELETE /api/comments/:commentId
export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ commentId: string }> }
) {
  try {
    const { commentId } = await ctx.params;

    await prisma.comment.delete({ where: { id: commentId } });
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e) {
    console.error("DELETE /api/comments/[commentId] failed", e);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
