// app/page.tsx
"use client";
import React, { useState } from "react";
import { useSession, signIn } from "next-auth/react";
import EntriesList from "@/app/components/EntriesList";
import { mutate as swrMutate } from "swr";

// ————————————————————————————————————————————————
// types
// ————————————————————————————————————————————————
type Contributor = { id: string; name: string; avatarUrl: string };

const FIXED_TAGS: string[] = [
  "ゲーム機","アニメ","漫画","おもちゃ","お菓子","文房具",
  "音楽","ファッション","雑誌","家電","スポーツ","⚽️","⚾️",
  // 追加タグ
  "テレビ","ネット","食べ物","飲み物",
];

// ————————————————————————————————————————————————
// ヒーロー
// ————————————————————————————————————————————————
function HeaderHero({
  user,
  onOpenCreate,
}: {
  user: Contributor | null;
  onOpenCreate: () => void;
}) {
  return (
    <section className="container-page py-6">
      <div className="sticker hero-card p-5 md:p-7 grid gap-4 md:flex md:items-center md:justify-between">
        <div className="grid gap-2">
          <h2 className="text-[20px] md:text-[26px] font-bold leading-tight">
            平成レトロの思い出を集めて、みんなの図鑑に。
          </h2>
          <p className="text-[13px] md:text-sm text-neutral-700">
            写真1枚・ひとことエピソードでOK。消えかけの記憶をここに残そう。
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              if (user) onOpenCreate();
              else if (confirm("投稿するにはログインが必要です。Discordでログインしますか？")) {
                signIn("discord");
              }
            }}
            className="btn-retro"
          >
            登録する
          </button>
        </div>
      </div>
    </section>
  );
}

// ————————————————————————————————————————————————
// 投稿モーダル（送信の二重防止・画像URL/ペースト対応）
// ————————————————————————————————————————————————
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

  // 画像のクリップボード貼り付け対応（画像ファイル優先／URLも可）
  const handlePasteIntoImage = React.useCallback(async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items || !items.length) return;

    // 1) 画像ファイルがあれば優先（GIF含む）
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.kind === "file") {
        const f = it.getAsFile();
        if (f && f.type.startsWith("image/")) {
          setFile(f);
          // ファイルを使う場合はURL欄はクリア
          setForm((p) => ({ ...p, imageUrl: "" }));
          return;
        }
      }
    }

    // 2) 画像URLらしきテキストがあればURL欄に入れる
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.kind === "string") {
        it.getAsString((s) => {
          const str = (s || "").trim();
          if (
            /^https?:\/\/.+\.(png|jpe?g|gif|webp|bmp|svg)(\?.*)?$/i.test(str) ||
            /^https?:\/\//i.test(str)
          ) {
            setForm((p) => ({ ...p, imageUrl: str }));
          }
        });
      }
    }
  }, []);

  const handleSubmit = React.useCallback(async () => {
    if (submitting) return; // 二重送信ガード
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
          alert("画像アップロードに失敗しました。サイズや形式を確認してください。");
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
      if (e.key === "Enter" && (e.target as HTMLElement)?.tagName !== "TEXTAREA" && isValid && !submitting) {
        e.preventDefault();
        handleSubmit();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, isValid, onClose, handleSubmit, submitting]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal="true" id="create">
      <div
        className={`absolute inset-0 bg-black/30 ${submitting ? "cursor-wait" : ""}`}
        onClick={(e) => !submitting && e.currentTarget === e.target && onClose()}
      />
      <div
        className="relative z-50 w-full sm:w-[640px] max-w-[92vw] sticker pixel-border p-6 md:p-8 bg-white shadow-xl overflow-x-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 border-b">
          <h3 className="text-lg font-semibold">平成レトロな思い出を登録</h3>
          <p className="text-sm text-neutral-500">写真と一言エピソードでOK。みんなの記憶を集めよう。</p>
        </div>

        <div className="p-5 grid grid-cols-1 gap-4">
          <label className="grid gap-1">
            <span className="text-sm">タイトル <span className="text-pink-600">*</span></span>
            <input
              required
              disabled={submitting}
              aria-invalid={!!errors.title}
              className={`w-full border rounded-lg px-3 py-2 ${errors.title ? "border-pink-400" : ""}`}
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="例）ゲームボーイポケット"
            />
            {errors.title && <span className="text-xs text-pink-600">{errors.title}</span>}
          </label>

          <label className="grid gap-1">
            <span className="text-sm">エピソード <span className="text-pink-600">*</span></span>
            <textarea
              required
              disabled={submitting}
              aria-invalid={!!errors.episode}
              className={`w-full border rounded-lg px-3 py-2 minハ-[88px] ${errors.episode ? "border-pink-400" : ""}`}
              value={form.episode}
              onChange={(e) => setForm({ ...form, episode: e.target.value })}
              placeholder="例）放課後に友だちとポケモン交換してた…"
            />
            {errors.episode && <span className="text-xs text-pink-600">{errors.episode}</span>}
          </label>

          {/* 固定タグ（複数選択・最大5） */}
          <div className="grid gap-2">
            <span className="text-sm">タグ（最大5つまで）</span>
            <div className="flex flex-wrap gap-2">
              {FIXED_TAGS.map((t) => {
                const active = form.tags.includes(t);
                const disabled = submitting || (!active && form.tags.length >= 5);
                const handleClick = () => {
                  if (disabled) return;
                  setForm((p) => ({
                    ...p,
                    tags: p.tags.includes(t) ? p.tags.filter((x) => x !== t) : [...p.tags, t],
                  }));
                };
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={handleClick}
                    disabled={disabled}
                    className={`px-3 py-1 rounded-full border text-sm transition-all ${
                      active ? "bg-black text-white border-black" : "bg-white hover:bg-neutral-50 border-neutral-300"
                    } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
                    aria-pressed={active}
                    aria-disabled={disabled}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 画像ファイル（任意） */}
          <label className="grid gap-1">
            <span className="text-sm">画像ファイル（任意・5MBまで）</span>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              disabled={submitting}
              className="w-full border rounded-lg px-3 py-2 file:mr-3 file:px-3 file:py-2 file:rounded-md file:border file:bg-white file:hover:bg-neutral-50 file:border-neutral-300"
            />
            <span className="text-xs text-neutral-500">※ 直接URL入力よりもファイル選択を優先します（GIF対応）</span>
          </label>

          {/* 画像URL（任意）＋ クリップボード貼り付け対応 */}
          <label className="grid gap-1">
            <span className="text-sm">画像URL（任意・GIF対応）</span>
            <input
              type="url"
              inputMode="url"
              placeholder="https://example.com/image.gif など（ここに Ctrl/⌘+V で貼り付けOK）"
              className="w-full border rounded-lg px-3 py-2"
              value={form.imageUrl}
              onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
              onPaste={handlePasteIntoImage}
              disabled={submitting}
            />
            <span className="text-xs text-neutral-500">
              画像ファイルをクリップボードから貼り付けてもOKです。ファイルがある場合はファイルを優先します。
            </span>
          </label>
        </div>

        <div className="p-5 border-t flex items-center justify-end gap-3">
          <button className="px-3 py-1.5 rounded-lg border" onClick={onClose} disabled={submitting}>キャンセル</button>
          <button
            className={`px-3 py-1.5 rounded-lg text白 transition disabled:opacity-50 disabled:cursor-not-allowed bg-black ${submitting ? "cursor-wait" : ""}`}
            disabled={!isValid || submitting}
            onClick={handleSubmit}
          >
            {submitting ? "送信中…" : "追加する"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ————————————————————————————————————————————————
// フィルタ（件数/タグ/投稿者は EntriesList から受け取る）
// ————————————————————————————————————————————————
function Filters({
  allTags,
  selectedTags,
  setSelectedTags,
  query,
  setQuery,
  contributors,
  selectedUser,
  setSelectedUser,
  sort,
  setSort,
  onClear,
  count,
}: any) {
  return (
    <div className="grid gap-3 container-page pt-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="キーワード（タイトル・エピソード）"
          className="w-full md:w-96 border rounded-lg px-3 py-2"
        />
        {/* 投稿者は “名前” を value にする（EntriesList 側と対応） */}
        <select value={selectedUser} onChange={(e) => setSelectedUser(e.target.value)} className="border rounded-lg px-3 py-2">
          <option value="">投稿者で絞り込み</option>
          {contributors.map((c: Contributor) => (
            <option key={c.name} value={c.name}>{c.name}</option>
          ))}
        </select>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as "new" | "likes")}
          className="border rounded-lg px-3 py-2"
        >
          <option value="new">新着順</option>
          <option value="likes">いいねが多い順</option>
        </select>

        <span className="ml-auto text-sm text-neutral-600">件数: {count}</span>
        <button onClick={onClear} className="px-3 py-1.5 rounded-lg border hover:bg-neutral-50">条件をクリア</button>
      </div>

      {/* タグ：横スクロールの帯 */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar -mx-4 px-4">
        {allTags.map((t: string) => (
          <button
            key={t}
            onClick={() =>
              setSelectedTags(
                selectedTags.includes(t) ? selectedTags.filter((x: string) => x !== t) : [...selectedTags, t]
              )
            }
            className={`px-3 py-1 rounded-full border text-sm whitespace-nowrap transition-all ${
              selectedTags.includes(t) ? "bg-black text-white border-black" : "bg-white hover:bg-neutral-50 border-neutral-300"
            }`}
          >
            {t}
          </button>
        ))}
      </div>
    </div>
  );
}

// ————————————————————————————————————————————————
// ページ本体
// ————————————————————————————————————————————————
export default function Page() {
  const { data: session } = useSession();
  const user: Contributor | null = session?.user
    ? {
        id: (session.user as any).id || (session.user as any).sub || "",
        name: session.user?.name || "unknown",
        avatarUrl: (session.user as any).image || "https://i.pravatar.cc/100?img=1",
      }
    : null;

  // UI 状態だけ保持
  const [openModal, setOpenModal] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedUser, setSelectedUser] = useState(""); // “名前” が入る
  const [sort, setSort] = useState<"new" | "likes">("new");

  // EntriesList から受け取る情報
  const [allTagsFromList, setAllTagsFromList] = useState<string[]>([]);
  const [contributorsFromList, setContributorsFromList] = useState<Contributor[]>([]);
  const [visibleCount, setVisibleCount] = useState(0);

  // 投稿作成（Promise<boolean> を返す）
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

      // 即時反映：SWR へ再検証依頼（両方キーを叩く）
      window.dispatchEvent(new CustomEvent("entries:refresh"));
      swrMutate("/api/entries");
      swrMutate("/api/entries?fast=1");
      return true;
    } catch {
      alert("投稿に失敗しました。時間をおいて再度お試しください。");
      return false;
    }
  };

  return (
    <div className="min-h-screen bg-dot">
      {/* ヒーロー */}
      <HeaderHero user={user} onOpenCreate={() => setOpenModal(true)} />

      {/* フィルタ（件数/タグ/投稿者は EntriesList から渡される） */}
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

      {/* 一覧（取得・フィルタ・並び替え・削除・再検証） */}
      <EntriesList
        query={query}
        selectedTags={selectedTags}
        selectedUserId={selectedUser}   // “名前” でフィルタ
        sort={sort}
        refreshIntervalMs={0}
        currentUserId={user?.id}
        onAllTags={setAllTagsFromList}
        onContributors={setContributorsFromList}
        onCountChange={setVisibleCount}
      />

      {/* 右下＋ボタン */}
      <button
        aria-label="新しい思い出を登録"
        onClick={() => {
          if (user) setOpenModal(true);
          else if (confirm("投稿するにはログインが必要です。Discordでログインしますか？")) {
            signIn("discord");
          }
        }}
        className="fab"
      >
        ＋
      </button>

      {/* 作成モーダル */}
      <CreateModal open={openModal} onClose={() => setOpenModal(false)} onCreate={onCreate} />
    </div>
  );
}
