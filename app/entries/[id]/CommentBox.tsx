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
    <section className="grid gap-4 mt-8">
      <h2 className="text-sm font-['Silkscreen'] pl-1">COMMENTS ({comments.length})</h2>

      <div className="mac-window p-3 bg-[var(--platinum)]">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="ひとこと残す…"
          className="mac-textarea mb-2 font-['DotGothic16']"
        />
        <div className="flex items-center justify-end">
          <button
            onClick={postComment}
            className="mac-button bg-[var(--window-border-dark)] text-white disabled:opacity-50"
            disabled={!text.trim()}
          >
            WRITE
          </button>
        </div>
      </div>

      <div className="grid gap-2">
        {isLoading && <div className="text-sm text-[var(--text-muted)] font-['DotGothic16'] text-center py-4">Loading...</div>}
        {comments.map((c) => (
          <div key={c.id} className="bg-[var(--window-bg)] border-2 border-[var(--window-border-dark)] p-3 shadow-sm">
            <div className="flex items-start gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={c.author?.avatarUrl ?? "https://i.pravatar.cc/100?img=1"}
                alt={c.author?.name ?? "unknown"}
                className="mac-avatar"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <div className="font-bold text-xs">{c.author?.name ?? "unknown"}</div>
                  <div className="text-[10px] text-[var(--text-muted)]">{new Date(c.createdAt).toLocaleString()}</div>
                </div>
                <p className="text-sm whitespace-pre-wrap font-['DotGothic16'] leading-relaxed">{c.body}</p>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-2">
              <button className="text-[10px] underline text-[var(--text-muted)] hover:text-black" onClick={() => onEdit(c)}>EDIT</button>
              <button className="text-[10px] underline text-[var(--text-muted)] hover:text-red-600" onClick={() => onDelete(c)}>DELETE</button>
            </div>
          </div>
        ))}
        {!isLoading && comments.length === 0 && (
          <div className="text-center py-8 border-2 border-dashed border-[var(--platinum-dark)] text-[var(--text-muted)] font-['DotGothic16'] bg-[var(--window-bg)]">
            まだコメントはありません。
          </div>
        )}
      </div>
    </section>
  );
}
