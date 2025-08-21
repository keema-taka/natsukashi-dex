// app/entries/[id]/CommentBox.tsx
"use client";

import useSWR, { mutate } from "swr";
import React from "react";
import { useSession } from "next-auth/react";

type Author = { id: string; name: string; avatarUrl: string };
type Comment = { id: string; entryId: string; body: string; author: Author; createdAt: string };

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function CommentBox({ entryId }: { entryId: string }) {
  const { data, isLoading } = useSWR<{ comments: Comment[] }>(`/api/entries/${entryId}/comments?take=20`, fetcher, { revalidateOnFocus: false });
  const comments = data?.comments ?? [];
  const { data: session } = useSession();
  const me: Author | null = session?.user
    ? { id: (session.user as any).id || (session.user as any).sub || "user", name: session.user?.name || "unknown", avatarUrl: (session.user as any).image || "https://i.pravatar.cc/100?img=1" }
    : null;

  const [text, setText] = React.useState("");

  const postComment = async () => {
    const body = text.trim();
    if (!body) return;
    setText("");

    const optimistic: Comment = {
      id: "tmp-" + Date.now(),
      entryId,
      body,
      author: me ?? { id: "guest", name: "guest", avatarUrl: "https://i.pravatar.cc/100?img=1" },
      createdAt: new Date().toISOString(),
    };

    mutate(`/api/entries/${entryId}/comments?take=20`, (curr?: { comments: Comment[] }) => {
      const prev = curr?.comments ?? [];
      return { comments: [optimistic, ...prev] };
    }, false);

    const res = await fetch(`/api/entries/${entryId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body, author: optimistic.author }),
    });

    if (!res.ok) {
      // rollback
      mutate(`/api/entries/${entryId}/comments?take=20`);
      alert("コメント投稿に失敗しました。");
      return;
    }

    // revalidate
    mutate(`/api/entries/${entryId}/comments?take=20`);
    // エントリーリストのcommentCountを更新
    window.dispatchEvent(new CustomEvent('entries:refresh'));
  };

  const onEdit = async (comment: Comment) => {
    const next = prompt("コメントを編集", comment.body);
    if (next == null) return;
    const body = next.trim();
    if (!body) return;

    mutate(`/api/entries/${entryId}/comments?take=20`, (curr?: { comments: Comment[] }) => {
      const prev = curr?.comments ?? [];
      return { comments: prev.map((c) => (c.id === comment.id ? { ...c, body } : c)) };
    }, false);

    const res = await fetch(`/api/comments/${comment.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    });
    if (!res.ok) {
      mutate(`/api/entries/${entryId}/comments?take=20`);
      alert("更新に失敗しました。");
      return;
    }
    mutate(`/api/entries/${entryId}/comments?take=20`);
  };

  const onDelete = async (comment: Comment) => {
    if (!confirm("このコメントを削除しますか？")) return;

    mutate(`/api/entries/${entryId}/comments?take=20`, (curr?: { comments: Comment[] }) => {
      const prev = curr?.comments ?? [];
      return { comments: prev.filter((c) => c.id !== comment.id) };
    }, false);

    const res = await fetch(`/api/comments/${comment.id}`, { method: "DELETE" });
    if (!res.ok) {
      mutate(`/api/entries/${entryId}/comments?take=20`);
      alert("削除に失敗しました。");
      return;
    }
    mutate(`/api/entries/${entryId}/comments?take=20`);
    // エントリーリストのcommentCountを更新
    window.dispatchEvent(new CustomEvent('entries:refresh'));
  };

  return (
    <section className="grid gap-3">
      <h2 className="text-lg font-semibold">コメント</h2>

      <div className="rounded-xl border p-3 bg-white grid gap-2">
        <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="ひとこと残す…" className="border rounded-lg px-3 py-2 min-h-[72px]" />
        <div className="flex items-center justify-end">
          <button onClick={postComment} className="px-3 py-1.5 rounded-lg bg-black text-white disabled:opacity-50" disabled={!text.trim()}>
            投稿
          </button>
        </div>
      </div>

      <div className="grid gap-3">
        {isLoading && <div className="text-sm text-neutral-500">読み込み中…</div>}
        {comments.map((c) => (
          <div key={c.id} className="rounded-xl border p-3 bg-white">
            <div className="flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={c.author?.avatarUrl ?? "https://i.pravatar.cc/100?img=1"} alt={c.author?.name ?? "unknown"} className="w-7 h-7 rounded-full object-cover" />
              <div className="text-sm">
                <div className="font-medium">{c.author?.name ?? "unknown"}</div>
                <div className="text-xs text-neutral-500">{new Date(c.createdAt).toLocaleString()}</div>
              </div>
              <div className="ml-auto flex items-center gap-2 text-xs">
                <button className="px-2 py-1 rounded border" onClick={() => onEdit(c)}>編集</button>
                <button className="px-2 py-1 rounded border" onClick={() => onDelete(c)}>削除</button>
              </div>
            </div>
            <p className="mt-2 text-sm whitespace-pre-wrap">{c.body}</p>
          </div>
        ))}
        {!isLoading && comments.length === 0 && <div className="text-sm text-neutral-500">まだコメントはありません。</div>}
      </div>
    </section>
  );
}
