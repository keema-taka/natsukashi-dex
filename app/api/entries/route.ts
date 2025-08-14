// app/api/entries/route.ts
import { NextResponse, NextRequest } from "next/server";
import { fetchEntriesViaBot, postEntryViaWebhook } from "@/lib/discordStore";

export const runtime = "nodejs";

type Contributor = { id?: string; name?: string; avatarUrl?: string };

function toArrayTags(input: unknown): string[] {
  if (Array.isArray(input)) return input.map(String).map(s=>s.trim()).filter(Boolean).slice(0,5);
  if (typeof input === "string") return input.split(",").map(s=>s.trim()).filter(Boolean).slice(0,5);
  return [];
}

function ensureContributor(input: any): Required<Contributor> {
  return {
    id: String(input?.id ?? "guest"),
    name: String(input?.name ?? "guest"),
    avatarUrl: String(input?.avatarUrl ?? "https://kotonohaworks.com/free-icons/wp-content/uploads/kkrn_icon_user_7.png"),
  };
}

export async function GET() {
  try {
    const entries = await fetchEntriesViaBot(50);
    return NextResponse.json({ entries }, { status: 200 });
  } catch (e) {
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}

// 投稿
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const contributor = ensureContributor(body.contributor);
    const tags = toArrayTags(body.tags);

    let age: number | null = null;
    if (typeof body.age === "number" && Number.isFinite(body.age)) age = body.age;
    else if (typeof body.age === "string" && body.age.trim() !== "") {
      const n = Number(body.age); age = Number.isFinite(n) ? n : null;
    }

    const entry = await postEntryViaWebhook({
      title: String(body.title ?? ""),
      episode: String(body.episode ?? ""),
      imageUrl: String(body.imageUrl ?? ""),
      tags,
      age,
      contributor: { name: contributor.name, avatarUrl: contributor.avatarUrl },
    });

    if (!entry) return NextResponse.json({ error: "failed" }, { status: 500 });
    return NextResponse.json({ entry }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
