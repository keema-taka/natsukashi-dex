// app/api/entries/[id]/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const DISCORD_BOT_TOKEN  = process.env.DISCORD_BOT_TOKEN!;
const DISCORD_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID!;

function mapDiscordMessageToEntry(m: any) {
  const e = m.embeds?.[0] ?? {};
  const name = typeof m.content === "string" ? m.content.replace(/ の投稿$/, "") : "unknown";
  return {
    id: m.id,
    title: e.title ?? "(無題)",
    episode: e.description ?? "",
    age: null as number | null,
    tags: "",
    imageUrl: e.image?.url ?? "",
    contributor: {
      id: "discord",
      name,
      avatarUrl: m.author?.avatar
        ? `https://cdn.discordapp.com/avatars/${m.author.id}/${m.author.avatar}.png`
        : "https://i.pravatar.cc/100?img=1",
    },
    likes: 0,
    createdAt: new Date(m.timestamp),
  };
}

export async function GET(
  _req: Request,
  ctx: { params: { id: string } }
) {
  try {
    if (!DISCORD_BOT_TOKEN || !DISCORD_CHANNEL_ID) {
      return NextResponse.json({ error: "discord not configured" }, { status: 500 });
    }

    const r = await fetch(
      `https://discord.com/api/v10/channels/${DISCORD_CHANNEL_ID}/messages/${ctx.params.id}`,
      { headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}` } }
    );

    if (r.status === 404) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    if (!r.ok) {
      const t = await r.text().catch(() => "");
      console.error("[discord] fetch message failed:", r.status, r.statusText, t);
      return NextResponse.json({ error: "failed" }, { status: 500 });
    }

    const json = await r.json();
   // fetch して json を得た後の検査部をこれに
const e = json.embeds?.[0];
const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/+$/, "");
const isOurs =
  (e?.footer?.text ?? "") === "natsukashi-dex" ||
  (typeof e?.url === "string" && appUrl && e.url.startsWith(`${appUrl}/entries/`)) ||
  (typeof json.content === "string" && / の投稿$/.test(json.content));

if (!isOurs) {
  return NextResponse.json({ error: "not found" }, { status: 404 });
}

    const entry = mapDiscordMessageToEntry(json);
    return NextResponse.json({ entry }, { status: 200 });
  } catch (e) {
    console.error("GET /api/entries/[id] failed:", e);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
