// lib/discord.ts
export async function sendDiscordNewEntry(entry: {
  id: string;
  title: string;
  episode: string;
  imageUrl?: string | null;
  contributor?: { name?: string | null; avatarUrl?: string | null } | null;
}, baseUrl: string) {
  const url = process.env.DISCORD_WEBHOOK_URL;
  if (!url) return; // 未設定なら何もしない

  const author = entry.contributor?.name ?? "unknown";
  const imageUrl = entry.imageUrl || "https://placehold.co/800x450?text=No+Image";
  const detailUrl = `${baseUrl}/entries/${entry.id}`;

  // 仕様どおりの本文
  const content = `**${author}** の投稿\n\n**${entry.title}**\n${entry.episode}\n${detailUrl}`;

  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      content,
      embeds: [
        {
          title: entry.title,
          url: detailUrl,
          description: entry.episode,
          image: { url: imageUrl },
          author: {
            name: author,
            icon_url: entry.contributor?.avatarUrl ?? undefined,
          },
        },
      ],
    }),
  });
}
