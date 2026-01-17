// app/page.tsx
"use client";
import React, { useState } from "react";
import { useSession, signIn } from "next-auth/react";
import EntriesList from "@/app/components/EntriesList";
import { mutate as swrMutate } from "swr";

type Contributor = { id: string; name: string; avatarUrl: string };

const FIXED_TAGS: string[] = [
  "ゲーム機", "アニメ", "漫画", "おもちゃ", "お菓子", "文房具",
  "音楽", "ファッション", "雑誌", "家電", "スポーツ",
  "テレビ", "ネット", "食べ物", "飲み物",
];

const TAG_COLORS = [
  "mac-tag-blue", "mac-tag-purple", "mac-tag-green", "mac-tag-orange",
  "mac-tag-blue", "mac-tag-purple", "mac-tag-green", "mac-tag-orange"
];

function getTagColor(index: number) {
  return TAG_COLORS[index % TAG_COLORS.length];
}

// ヒーローセクション（System 7風ウェルカムウィンドウ）
function HeroSection({ user, onOpenCreate }: { user: Contributor | null; onOpenCreate: () => void }) {
  return (
    <div className="container-mac" style={{ paddingTop: '24px', paddingBottom: '16px' }}>
      <div className="mac-window animate-window" style={{ maxWidth: '560px', margin: '0 auto' }}>
        <div className="mac-titlebar">
          <div className="mac-controls">
            <div className="mac-close" />
          </div>
          <div className="mac-title">About なつかし図鑑</div>
        </div>
        <div className="mac-content" style={{ textAlign: 'center', padding: '32px 24px' }}>
          {/* アイコン */}
          <div style={{ marginBottom: '16px' }}>
            <span style={{ fontSize: '48px' }}>🗂️</span>
          </div>

          <h2 className="hero-title" style={{
            marginBottom: '8px',
          }}>
            なつかし図鑑
          </h2>

          <p style={{
            fontFamily: "'DotGothic16', monospace",
            fontSize: '11px',
            color: 'var(--text-muted)',
            marginBottom: '16px',
          }}>
            Version 1.0 • © 2026
          </p>

          <div style={{
            background: 'var(--platinum)',
            border: '2px solid',
            borderColor: 'var(--window-border-dark) var(--window-border-light) var(--window-border-light) var(--window-border-dark)',
            padding: '16px',
            marginBottom: '20px',
            textAlign: 'left',
          }}>
            <p style={{
              fontFamily: "'DotGothic16', 'Geneva', monospace",
              fontSize: '12px',
              color: 'var(--text-primary)',
              lineHeight: '1.7',
              margin: 0,
            }}>
              平成の思い出をみんなで集める図鑑です。<br />
              写真1枚・ひとことエピソードでOK。<br />
              消えかけの記憶を、ここに残そう。
            </p>
          </div>

          <button
            onClick={() => {
              if (user) onOpenCreate();
              else if (confirm("投稿するにはログインが必要です。Discordでログインしますか？")) {
                signIn("discord");
              }
            }}
            className="mac-button-primary mac-button"
            style={{ fontSize: '12px', padding: '6px 20px' }}
          >
            ＋ 新規登録
          </button>
        </div>
      </div>
    </div>
  );
}

// 投稿モーダル（Mac風ダイアログ）
function CreateModal({
  open,
  onClose,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (payload: { title: string; episode: string; tags: string[]; imageUrl: string }) => Promise<boolean>;
}) {
  const [form, setForm] = useState({ title: "", episode: "", tags: [] as string[], imageUrl: "" });
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<{ title?: string; episode?: string }>({});
  const [submitting, setSubmitting] = useState(false);

  const isValid = form.title.trim().length > 0 && form.episode.trim().length > 0;

  const handleAnyPaste = React.useCallback((clip: DataTransfer | null | undefined) => {
    const items = clip?.items;
    if (!items || !items.length) return;

    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.kind === "file") {
        const f = it.getAsFile();
        if (f && f.type.startsWith("image/")) {
          setFile(f);
          setForm((p) => ({ ...p, imageUrl: "" }));
          return;
        }
      }
    }
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.kind === "string") {
        it.getAsString((s) => {
          const str = (s || "").trim();
          if (/^https?:\/\/\S+$/i.test(str)) {
            setForm((p) => ({ ...p, imageUrl: str }));
          }
        });
      }
    }
  }, []);

  React.useEffect(() => {
    if (!open) return;
    const onWinPaste = (e: ClipboardEvent) => handleAnyPaste(e.clipboardData);
    window.addEventListener("paste", onWinPaste);
    return () => window.removeEventListener("paste", onWinPaste);
  }, [open, handleAnyPaste]);

  const handleSubmit = React.useCallback(async () => {
    if (submitting) return;
    const next: typeof errors = {};
    if (!form.title.trim()) next.title = "タイトルは必須です";
    if (!form.episode.trim()) next.episode = "エピソードは必須です";
    setErrors(next);
    if (Object.keys(next).length) return;

    setSubmitting(true);
    try {
      let uploadedUrl = form.imageUrl?.trim() || "";
      if (file) {
        const fd = new FormData();
        fd.append("file", file);
        const up = await fetch("/api/upload", { method: "POST", body: fd });
        if (!up.ok) {
          alert("画像アップロードに失敗しました");
          setSubmitting(false);
          return;
        }
        const { url } = await up.json();
        uploadedUrl = url;
      }

      const ok = await onCreate({
        title: form.title,
        episode: form.episode,
        tags: form.tags,
        imageUrl: uploadedUrl,
      });
      if (ok) {
        onClose();
        setForm({ title: "", episode: "", tags: [], imageUrl: "" });
        setErrors({});
        setFile(null);
      }
    } finally {
      setSubmitting(false);
    }
  }, [form, file, onCreate, onClose, submitting]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submitting) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, submitting]);

  if (!open) return null;

  return (
    <div className="mac-modal-overlay" onClick={(e) => e.target === e.currentTarget && !submitting && onClose()}>
      <div className="mac-modal animate-window" onClick={(e) => e.stopPropagation()}>
        <div className="mac-modal-header">
          <div className="mac-controls">
            <div className="mac-close" onClick={() => !submitting && onClose()} style={{ cursor: 'pointer' }} />
          </div>
          <div className="mac-modal-title">新規登録</div>
        </div>

        <div className="mac-modal-body">
          <div className="mac-form-group">
            <label className="mac-label">タイトル *</label>
            <input
              type="text"
              className="mac-input"
              style={{ width: '100%' }}
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="例）ゲームボーイポケット"
              disabled={submitting}
            />
            {errors.title && <span style={{ color: '#CC0000', fontSize: '11px' }}>{errors.title}</span>}
          </div>

          <div className="mac-form-group">
            <label className="mac-label">エピソード *</label>
            <textarea
              className="mac-textarea"
              value={form.episode}
              onChange={(e) => setForm({ ...form, episode: e.target.value })}
              placeholder="例）放課後に友だちとポケモン交換してた…"
              disabled={submitting}
            />
            {errors.episode && <span style={{ color: '#CC0000', fontSize: '11px' }}>{errors.episode}</span>}
          </div>

          <div className="mac-form-group">
            <label className="mac-label">タグ（最大5つ）</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
              {FIXED_TAGS.map((t, i) => {
                const active = form.tags.includes(t);
                const disabled = submitting || (!active && form.tags.length >= 5);
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => {
                      if (disabled) return;
                      setForm((p) => ({
                        ...p,
                        tags: p.tags.includes(t) ? p.tags.filter((x) => x !== t) : [...p.tags, t],
                      }));
                    }}
                    disabled={disabled}
                    className={`mac-tag ${active ? 'mac-tag-blue' : getTagColor(i)}`}
                    style={{
                      cursor: disabled && !active ? 'not-allowed' : 'pointer',
                      opacity: disabled && !active ? 0.4 : 1,
                      outline: active ? '2px solid var(--accent-blue)' : 'none'
                    }}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mac-form-group">
            <label className="mac-label">画像ファイル（任意）</label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              disabled={submitting}
              className="mac-input"
              style={{ width: '100%', padding: '6px' }}
            />
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>クリップボードからの貼り付けもOK</span>
          </div>

          <div className="mac-form-group">
            <label className="mac-label">画像URL（任意）</label>
            <input
              type="url"
              className="mac-input"
              style={{ width: '100%' }}
              value={form.imageUrl}
              onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
              placeholder="https://..."
              disabled={submitting}
            />
          </div>
        </div>

        <div className="mac-modal-footer">
          <button className="mac-button" onClick={onClose} disabled={submitting}>
            キャンセル
          </button>
          <button className="mac-button mac-button-primary" onClick={handleSubmit} disabled={!isValid || submitting}>
            {submitting ? "送信中..." : "登録"}
          </button>
        </div>
      </div>
    </div>
  );
}

// フィルターバー（Finder風ツールバー）
function Filters({ ...props }: any) {
  const {
    allTags, selectedTags, setSelectedTags,
    query, setQuery, contributors, selectedUser, setSelectedUser,
    sort, setSort, onClear, count
  } = props;

  return (
    <div className="container-mac" style={{ paddingTop: '0', paddingBottom: '8px' }}>
      <div className="mac-finder-header">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="🔍 検索..."
          className="mac-input"
          style={{ flex: '1', minWidth: '150px', maxWidth: '250px' }}
        />
        <select
          value={selectedUser}
          onChange={(e) => setSelectedUser(e.target.value)}
          className="mac-select"
        >
          <option value="">投稿者</option>
          {contributors.map((c: Contributor) => (
            <option key={c.name} value={c.name}>{c.name}</option>
          ))}
        </select>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as "new" | "likes")}
          className="mac-select"
        >
          <option value="new">新着順</option>
          <option value="likes">いいね順</option>
        </select>
        <span className="mac-tag" style={{ marginLeft: 'auto' }}>{count}件</span>
        <button onClick={onClear} className="mac-button" style={{ padding: '4px 12px', fontSize: '11px' }}>クリア</button>
      </div>

      {/* タグフィルター */}
      <div
        className="no-scrollbar"
        style={{
          display: 'flex',
          gap: '6px',
          overflowX: 'auto',
          padding: '10px 16px',
          background: 'var(--window-bg)',
          border: '1px solid var(--window-border-dark)',
          borderTop: 'none'
        }}
      >
        {allTags.map((t: string, i: number) => (
          <button
            key={t}
            onClick={() =>
              setSelectedTags(
                selectedTags.includes(t) ? selectedTags.filter((x: string) => x !== t) : [...selectedTags, t]
              )
            }
            className={`mac-tag ${selectedTags.includes(t) ? 'mac-tag-blue' : getTagColor(i)}`}
            style={{
              whiteSpace: 'nowrap',
              flexShrink: 0,
              cursor: 'pointer',
              outline: selectedTags.includes(t) ? '2px solid var(--accent-blue)' : 'none'
            }}
          >
            {t}
          </button>
        ))}
      </div>
    </div>
  );
}

// メインページ
export default function Page() {
  const { data: session } = useSession();
  const user: Contributor | null = session?.user
    ? {
      id: (session.user as any).id || (session.user as any).sub || "",
      name: session.user?.name || "unknown",
      avatarUrl: (session.user as any).image || "https://i.pravatar.cc/100?img=1",
    }
    : null;

  const [openModal, setOpenModal] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedUser, setSelectedUser] = useState("");
  const [sort, setSort] = useState<"new" | "likes">("new");

  const [allTagsFromList, setAllTagsFromList] = useState<string[]>([]);
  const [contributorsFromList, setContributorsFromList] = useState<Contributor[]>([]);
  const [visibleCount, setVisibleCount] = useState(0);

  const onCreate = async (payload: any): Promise<boolean> => {
    const candidate = {
      ...payload,
      contributor: user || { id: "guest", name: "guest", avatarUrl: "https://i.pravatar.cc/100?img=1" },
    };
    try {
      const res = await fetch("/api/entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(candidate),
      });
      if (!res.ok) throw new Error("failed");

      window.dispatchEvent(new CustomEvent("entries:refresh"));
      swrMutate("/api/entries");
      swrMutate("/api/entries?fast=1");
      return true;
    } catch {
      alert("投稿に失敗しました");
      return false;
    }
  };

  return (
    <div style={{ minHeight: '100vh', paddingBottom: '80px' }}>
      <HeroSection user={user} onOpenCreate={() => setOpenModal(true)} />

      <Filters
        allTags={allTagsFromList}
        selectedTags={selectedTags}
        setSelectedTags={setSelectedTags}
        query={query}
        setQuery={setQuery}
        contributors={contributorsFromList}
        selectedUser={selectedUser}
        setSelectedUser={setSelectedUser}
        sort={sort}
        setSort={setSort}
        onClear={() => {
          setQuery("");
          setSelectedTags([]);
          setSelectedUser("");
          setSort("new");
        }}
        count={visibleCount}
      />

      <EntriesList
        query={query}
        selectedTags={selectedTags}
        selectedUserId={selectedUser}
        sort={sort}
        refreshIntervalMs={0}
        currentUserId={user?.id}
        onAllTags={setAllTagsFromList}
        onContributors={setContributorsFromList}
        onCountChange={setVisibleCount}
      />

      {/* FAB */}
      <button
        aria-label="新しい思い出を登録"
        onClick={() => {
          if (user) setOpenModal(true);
          else if (confirm("投稿するにはログインが必要です。Discordでログインしますか？")) {
            signIn("discord");
          }
        }}
        className="mac-fab"
      >
        ＋
      </button>

      <CreateModal open={openModal} onClose={() => setOpenModal(false)} onCreate={onCreate} />
    </div>
  );
}
