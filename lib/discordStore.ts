// lib/discordStore.ts
// Discord を“準DB”として使う最小ユーティリティ

type DiscordMessage = {
  id: string;
  timestamp: string;
  embeds?: Array<{
    title?: string;
    description?: string;
    author?: { name?: string; icon_url?: string };
    image?: { url?: string; proxy_url?: string };
    footer?: { text?: string };
  }>;
  attachments?: Array<{ url: string }>;
  reactions?: Array<{ emoji: { name?: string }, count: number }>;
};

export type EntryLite = {
  id: string;
  title: string;
  episode: string;
  imageUrl: string;
  tags: string[];
  age: number | null;
  contributor: { id: string; name: string; avatarUrl: string };
  likes: number;             // 将来リアクションから拾う想定（今は0でOK）
  createdAt: Date;
};

function parseFooter(footer?: string) {
  // footer.text に "tags=a,b,c;age=12" という簡易書式を入れておく想定
  const res = { tags: [] as string[], age: null as number | null };
  if (!footer) return res;
  // tags=..., age=... を適当に抜く
  const mTags = footer.match(/tags=([^;]+)/i);
  if (mTags) {
    res.tags = mTags[1].split(",").map(s => s.trim()).filter(Boolean).slice(0, 5);
  }
  const mAge = footer.match(/age=(\d+)/i);
  if (mAge) res.age = Number(mAge[1]);
  return res;
}

function firstNonEmpty(...arr: (string | undefined)[]) {
  return arr.find(Boolean) || "";
}

export function toEntry(m: DiscordMessage): EntryLite | null {
  const e = (m.embeds && m.embeds[0]) || {};
  const title = e.title || "";
  const episode = e.description || "";
  if (!title && !episode) return null;

  const img = e.image?.proxy_url || e.image?.url || m.attachments?.[0]?.url || "";
  const footer = parseFooter(e.footer?.text);
  const name = e.author?.name || "guest";
  const avatarUrl = e.author?.icon_url || "https://kotonohaworks.com/free-icons/wp-content/uploads/kkrn_icon_user_7.png";

  // likes は後でリアクションから拾える（今は0）
  const likes = 0;

  return {
    id: m.id,
    title,
    episode,
    imageUrl: img,
    tags: footer.tags,
    age: footer.age,
    contributor: { id: "discord", name, avatarUrl },
    likes,
    createdAt: new Date(m.timestamp),
  };
}

const API = "https://discord.com/api/v10";

export async function fetchEntriesViaBot(limit = 50): Promise<EntryLite[]> {
  const token = process.env.DISCORD_BOT_TOKEN!;
  const channelId = process.env.DISCORD_CHANNEL_ID!;
  const url = `${API}/channels/${channelId}/messages?limit=${Math.min(Math.max(limit,1),100)}`;
  const res = await fetch(url, { headers: { Authorization: `Bot ${token}` } });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`discord list failed: ${res.status} ${res.statusText} ${t}`);
  }
  const list: DiscordMessage[] = await res.json();
  return list
    .map(toEntry)
    .filter((v): v is EntryLite => !!v)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export async function fetchEntryById(id: string): Promise<EntryLite | null> {
  const token = process.env.DISCORD_BOT_TOKEN!;
  const channelId = process.env.DISCORD_CHANNEL_ID!;
  const url = `${API}/channels/${channelId}/messages/${id}`;
  const res = await fetch(url, { headers: { Authorization: `Bot ${token}` } });
  if (!res.ok) return null;
  const m: DiscordMessage = await res.json();
  return toEntry(m);
}

// Webhook で 1件投稿（Embed＋画像URL）
// 画像ファイルは /api/upload で Discord に添付して URL を得る想定
export async function postEntryViaWebhook(input: {
  title: string;
  episode: string;
  imageUrl?: string | null;
  tags?: string[];
  age?: number | null;
  contributor: { name: string; avatarUrl?: string };
}) {
  const webhook = process.env.DISCORD_WEBHOOK_URL!;
  const footerText = [
    input.tags && input.tags.length ? `tags=${input.tags.slice(0,5).join(",")}` : "",
    (typeof input.age === "number" && Number.isFinite(input.age)) ? `age=${input.age}` : "",
  ].filter(Boolean).join(";");

  const payload = {
    content: `${input.contributor.name} の投稿`,
    allowed_mentions: { parse: [] as string[] },
    embeds: [{
      title: (input.title || "").slice(0, 256),
      description: (input.episode || "").slice(0, 4096),
      author: {
        name: input.contributor.name || "guest",
        icon_url: input.contributor.avatarUrl || "https://kotonohaworks.com/free-icons/wp-content/uploads/kkrn_icon_user_7.png",
      },
      ...(input.imageUrl ? { image: { url: input.imageUrl } } : {}),
      ...(footerText ? { footer: { text: footerText } } : {}),
    }],
  };

  // ?wait=true でメッセージJSONを返してもらう（id取得用）
  const res = await fetch(`${webhook}?wait=true`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`discord webhook failed: ${res.status} ${res.statusText} ${t}`);
  }
  const m: DiscordMessage = await res.json();
  return toEntry(m); // そのままクライアントに返せる形へ
}
