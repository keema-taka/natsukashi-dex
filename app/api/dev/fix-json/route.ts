// app/api/dev/fix-json/route.ts
// ⚠️開発専用。終わったら削除推奨
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const DEFAULT = {
  id: "guest",
  name: "guest",
  avatarUrl: "https://i.pravatar.cc/100?img=1",
};
const DEFAULT_JSON = JSON.stringify(DEFAULT);

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const mode = searchParams.get("mode"); // "force" で全件上書き

    let entryContributor = 0;
    let commentAuthor = 0;

    if (mode === "force") {
      // 文字列としての JSON を全件に強制セット
      entryContributor = await prisma.$executeRawUnsafe<number>(
        `UPDATE "Entry" SET "contributor" = ?`,
        DEFAULT_JSON
      );
      commentAuthor = await prisma.$executeRawUnsafe<number>(
        `UPDATE "Comment" SET "author" = ?`,
        DEFAULT_JSON
      );
    } else {
      // 壊れている/空/怪しい値だけを上書き（json()は使わない）
      entryContributor = await prisma.$executeRawUnsafe<number>(
        `
        UPDATE "Entry"
        SET "contributor" = ?
        WHERE "contributor" IS NULL
           OR trim("contributor") = ''
           OR lower(trim("contributor")) IN ('null','undefined','[object object]')
           OR substr(trim("contributor"),1,1) NOT IN ('{','[')
        `,
        DEFAULT_JSON
      );

      commentAuthor = await prisma.$executeRawUnsafe<number>(
        `
        UPDATE "Comment"
        SET "author" = ?
        WHERE "author" IS NULL
           OR trim("author") = ''
           OR lower(trim("author")) IN ('null','undefined','[object object]')
           OR substr(trim("author"),1,1) NOT IN ('{','[')
        `,
        DEFAULT_JSON
      );
    }

    const entryTags = await prisma.$executeRawUnsafe<number>(
      `UPDATE "Entry" SET "tags" = '' WHERE "tags" IS NULL`
    );
    const entryCreatedAt = await prisma.$executeRawUnsafe<number>(
      `UPDATE "Entry" SET "createdAt" = CURRENT_TIMESTAMP WHERE "createdAt" IS NULL`
    );

    return NextResponse.json(
      {
        ok: true,
        updated: { entryContributor, commentAuthor, entryTags, entryCreatedAt },
        mode: mode ?? "smart",
      },
      { status: 200 }
    );
  } catch (e) {
    console.error("fix-json failed", e);
    return NextResponse.json({ ok: false, error: "fix-json failed" }, { status: 500 });
  }
}
