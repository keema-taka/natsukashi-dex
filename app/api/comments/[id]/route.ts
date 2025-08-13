// app/api/comments/[id]/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// コメント更新: PATCH /api/comments/:id
export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctx.params;
    const body = await req.json();

    if (!body?.body || typeof body.body !== "string") {
      return NextResponse.json({ error: "body は必須です" }, { status: 400 });
    }

    const updated = await prisma.comment.update({
      where: { id },
      data: { body: body.body },
      select: { id: true, entryId: true, body: true, author: true, createdAt: true },
    });

    return NextResponse.json({ comment: updated }, { status: 200 });
  } catch (e: any) {
    // レコードなし
    if (e?.code === "P2025") {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    console.error(e);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}

// コメント削除: DELETE /api/comments/:id
export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctx.params;

    await prisma.comment.delete({ where: { id } });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: any) {
    if (e?.code === "P2025") {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    console.error(e);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
