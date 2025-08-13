// app/api/entries/[id]/comments/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Author = { id: string; name: string; avatarUrl: string };

function ensureAuthor(input: any): Author {
  const a = input ?? {};
  return {
    id: String(a.id ?? "guest"),
    name: String(a.name ?? "guest"),
    avatarUrl: String(a.avatarUrl ?? "https://i.pravatar.cc/100?img=1"),
  };
}

// GET /api/entries/:id/comments?cursor=<commentId>&take=20
export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const take = Math.min(Math.max(Number(url.searchParams.get("take") ?? "20"), 1), 50);
  const cursor = url.searchParams.get("cursor") || undefined;

  const comments = await prisma.comment.findMany({
    where: { entryId: id },
    orderBy: { createdAt: "desc" },
    take,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    select: { id: true, entryId: true, body: true, author: true, createdAt: true },
  });

  return NextResponse.json({ comments }, { status: 200 });
}

// POST /api/entries/:id/comments
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctx.params;
    const body = await req.json();

    if (!body?.body || String(body.body).trim().length === 0) {
      return NextResponse.json({ error: "body is required" }, { status: 400 });
    }

    const author = ensureAuthor(body.author);

    const comment = await prisma.comment.create({
      data: {
        entryId: id,
        body: String(body.body),
        author,
      },
      select: { id: true, entryId: true, body: true, author: true, createdAt: true },
    });

    return NextResponse.json({ comment }, { status: 201 });
  } catch (e) {
    console.error("POST /api/entries/[id]/comments failed", e);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
