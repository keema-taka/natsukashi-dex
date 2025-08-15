// app/api/entries/[id]/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const DISCORD_BOT_TOKEN  = process.env.DISCORD_BOT_TOKEN!;
const DISCORD_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID!;
const MARKER = "[natsukashi-dex]";

// どのファイルでも使う想定（entries/route.ts と entries/[id]/route.ts 両方に置いてOK）
type Contributor = { id: string; name: string; avatarUrl: string };

function parseDbContributor(v: unknown): Contributor | null {
  if (!v || typeof v !== "object") return null;
  const o = v as any;
  const id = typeof o.id === "string" ? o.id : (o.id != null ? String(o.id) : "");
  const name = typeof o.name === "string" ? o.name : (o.name != null ? String(o.name) : "");
  const avatarUrl =
    typeof o.avatarUrl === "string"
      ? o.avatarUrl
      : (o.avatarUrl != null ? String(o.avatarUrl) : "");

  if (!id || !name) return null; // 必須が欠けていれば無効
  return { id, name, avatarUrl };
}

function jsonNoStore(body: any, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function parseFromContent(content: string) {
  const out: { title?: string; episode?: string; imageUrl?: string; name?: string } = {};
  const lines = (content || "").split(/\r?\n/).map((s) => s.trim());
  for (const ln of lines) {
    if (ln.startsWith(MARKER)) {
      const m = ln.match(/\]\s*(.+?)\s*の投稿$/);
      if (m) out.name = m[1];
    } else if (ln.toLowerCase().startsWith("title:")) {
      out.title = ln.slice(6).trim();
    } else if (ln.toLowerCase().startsWith("episode:")) {
      out.episode = ln.slice(8).trim();
    } else if (ln.toLowerCase().startsWith("image:")) {
      out.imageUrl = ln.slice(6).trim();
    }
  }
  return out;
}

// 0..5 を返す軽いハッシュ
function hash05(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 6;
}

function mapDiscordMessageToEntry(m: any) {
  const e = m.embeds?.[0] ?? {};
  const parsed = typeof m.content === "string" ? parseFromContent(m.content) : {};
  const name =
    parsed.name ||
    (typeof m.content === "string" && / の投稿$/.test(m.content)
      ? m.content.replace(/ の投稿$/, "")
      : m.author?.username || "unknown");

  // ★ BigInt を使わないフォールバックに変更
  const avatarUrl =
    m.author?.avatar && m.author?.id
      ? `https://cdn.discordapp.com/avatars/${m.author.id}/${m.author.avatar}.png`
      : m.author?.id
        ? `https://cdn.discordapp.com/embed/avatars/${hash05(String(m.author.id))}.png`
        : "https://i.pravatar.cc/100?img=1";

  const title = e.title ?? parsed.title ?? "(無題)";
  const episode = e.description ?? parsed.episode ?? "";
  const imageUrl =
    e?.image?.url ?? parsed.imageUrl ?? (Array.isArray(m.attachments) && m.attachments[0]?.url) ?? "";

  return {
    id: m.id,
    title,
    episode,
    age: null as number | null,
    tags: "",
    imageUrl,
    contributor: { id: "discord", name, avatarUrl },
    likes: 0,
    createdAt: new Date(m.timestamp),
  };
}

function ensureOurs(json: any) {
  const e = json.embeds?.[0];
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/+$/, "");
  return (
    (e?.footer?.text ?? "") === "natsukashi-dex" ||
    (typeof e?.url === "string" && appUrl && e.url.startsWith(`${appUrl}/entries/`)) ||
    (typeof json.content === "string" && json.content.includes(MARKER))
  );
}

// ---------- GET: 単一取得 ----------
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;

    if (!DISCORD_BOT_TOKEN || !DISCORD_CHANNEL_ID) {
      return jsonNoStore({ error: "discord not configured" }, 500);
    }

    const r = await fetch(
      `https://discord.com/api/v10/channels/${DISCORD_CHANNEL_ID}/messages/${id}`,
      { headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}` }, cache: "no-store" }
    );

    if (r.status === 404) return jsonNoStore({ error: "not found" }, 404);
    if (!r.ok) {
      const t = await r.text().catch(() => "");
      console.error("[discord] fetch message failed:", r.status, r.statusText, t);
      return jsonNoStore({ error: "failed" }, 500);
    }

    const json = await r.json();
    if (!ensureOurs(json)) return jsonNoStore({ error: "not found" }, 404);

    const entry = mapDiscordMessageToEntry(json);

    // DB 側の likes/tags/contributor を上書き補完
    const row = await prisma.entry.findUnique({
      where: { id },
      select: { id: true, title: true, episode: true, imageUrl: true, tags: true, likes: true, contributor: true },
    });

    if (row) {
      entry.title    = row.title    ?? entry.title;
      entry.episode  = row.episode  ?? entry.episode;
      entry.imageUrl = row.imageUrl ?? entry.imageUrl;
      entry.tags     = row.tags     ?? entry.tags;
      entry.likes    = typeof row.likes === "number" ? row.likes : entry.likes;

      const dbC = parseDbContributor(row.contributor);
      if (dbC) entry.contributor = dbC;
    }

    return jsonNoStore({ entry }, 200);
  } catch (e) {
    console.error("GET /api/entries/[id] failed:", e);
    return jsonNoStore({ error: "failed" }, 500);
  }
}

// ---------- PATCH: いいね増減（※互換用。新実装は /api/entries/[id]/like を使用） ----------
/**
 * リクエスト例:
 *  { "op": "like" }               -> +1
 *  { "op": "unlike" }             -> -1 (0未満にならない)
 *  { "op": "set", "value": 12 }   -> 絶対値セット（管理ツール用）
 */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;

    const body = await req.json().catch(() => ({} as any));
    const op = String(body?.op || "like");

    // 既存値を取得（無ければ 0 から）
    const current = await prisma.entry.findUnique({
      where: { id },
      select: { likes: true },
    });

    let nextLikes = Math.max(0, current?.likes ?? 0);

    if (op === "like") {
      nextLikes = nextLikes + 1;
    } else if (op === "unlike") {
      nextLikes = Math.max(0, nextLikes - 1);
    } else if (op === "set") {
      const v = Number(body?.value);
      if (Number.isFinite(v) && v >= 0) nextLikes = Math.floor(v);
    } else {
      return jsonNoStore({ error: "invalid op" }, 400);
    }

    const updated = await prisma.entry.upsert({
      where: { id },
      create: {
        id,
        title: "(無題)",
        episode: "",
        imageUrl: "",
        contributor: { id: "discord", name: "unknown", avatarUrl: "" } as any,
        likes: nextLikes,
        tags: "",
      },
      update: { likes: nextLikes },
      select: { id: true, likes: true },
    });

    return jsonNoStore({ id: updated.id, likes: updated.likes }, 200);
  } catch (e) {
    console.error("PATCH /api/entries/[id] failed:", e);
    return jsonNoStore({ error: "failed" }, 500);
  }
}

// ---------- DELETE: Discord & DB 両方削除 ----------
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;

    // 1) Discord 側を削除（権限が必要 / 404 は無視して続行）
    let discordOk = true;
    if (DISCORD_BOT_TOKEN && DISCORD_CHANNEL_ID) {
      const r = await fetch(
        `https://discord.com/api/v10/channels/${DISCORD_CHANNEL_ID}/messages/${id}`,
        { method: "DELETE", headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}` } }
      );
      if (!(r.ok || r.status === 404)) {
        discordOk = false;
        const t = await r.text().catch(() => "");
        console.error("[discord] delete message failed:", r.status, r.statusText, t);
      }
    }

    // 2) DB 側を削除（無ければスキップ）
    try {
      await prisma.entry.delete({ where: { id } });
    } catch {
      // not found → 無視
    }

    if (!discordOk) {
      return jsonNoStore({ ok: false, partial: "db_deleted_only" }, 200);
    }
    return jsonNoStore({ ok: true }, 200);
  } catch (e) {
    console.error("DELETE /api/entries/[id] failed:", e);
    return jsonNoStore({ error: "failed" }, 500);
  }
}
