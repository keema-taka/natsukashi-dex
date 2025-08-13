import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    // contributor をテキストとして覗く
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `
      SELECT id,
             typeof(contributor)   AS t,
             substr(contributor,1,60) AS head,
             tags,
             typeof(tags)          AS t_tags
      FROM "Entry"
      ORDER BY createdAt DESC
      LIMIT 20
      `
    );
    return NextResponse.json({ rows }, { status: 200 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "peek failed" }, { status: 500 });
  }
}
