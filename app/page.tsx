"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSession, signIn } from "next-auth/react";
import Expandable from "@/app/components/Expandable";
import LikesPopover from "@/app/components/LikesPopover";

// ————————————————————————————————————————————————
// types
// ————————————————————————————————————————————————
type Contributor = { id: string; name: string; avatarUrl: string };
type Entry = {
  id: string;
  title: string;
  episode: string;
  tags: string[];
  imageUrl: string;
  contributor: Contributor;
  likes: number;
  createdAt?: string | Date;
};

const FALLBACK_IMG =
  "https://placehold.co/800x450?text=No+Image";

const FIXED_TAGS: string[] = [
  "ゲーム機",
  "アニメ",
  "漫画",     // 追加
  "おもちゃ",
  "お菓子",
  "文房具",
  "音楽",
  "ファッション",
  "雑誌",
  "家電",
  "スポーツ", // 追加
  "⚽️",       // 追加
  "⚾️",       // 追加
];

// 小さめピル（未使用でも残してOK）
function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="px-2 py-0.5 text-xs rounded-full bg-neutral-100 border border-neutral-200">
      {children}
    </span>
  );
}

// ————————————————————————————————————————————————
// ヒーロー：タイトル＋ボタン
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

        {/* HeaderHero 内ボタン行 */}
        <div className="flex items-center gap-3">
  <button
    onClick={() => {
      if (user) {
        onOpenCreate();
      } else {
        if (confirm("投稿するにはログインが必要です。Discordでログインしますか？")) {
          signIn("discord");
        }
      }
    }}
    className="btn-retro"
  >
    登録する
  </button>
  {/* 図鑑を共有ボタンは削除のまま */}
</div>
      </div>
    </section>
  );
}

// ————————————————————————————————————————————————
// 投稿モーダル
// ————————————————————————————————————————————————
function CreateModal({ open, onClose, onCreate }: any) {
  const [form, setForm] = useState({
    title: "",
    episode: "",
    tags: [] as string[],
    imageUrl: "",
  });
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<{ title?: string; episode?: string }>({});

  const isValid = form.title.trim().length > 0 && form.episode.trim().length > 0;

  const handleSubmit = React.useCallback(async () => {
    const next: typeof errors = {};
    if (!form.title.trim()) next.title = "タイトルは必須です";
    if (!form.episode.trim()) next.episode = "エピソードは必須です";
    setErrors(next);
    if (Object.keys(next).length) return;

    let uploadedUrl = form.imageUrl?.trim() || "";
    if (file) {
      const fd = new FormData();
      fd.append("file", file);
      const up = await fetch("/api/upload", { method: "POST", body: fd });
      if (!up.ok) {
        alert("画像アップロードに失敗しました。サイズや形式を確認してください。");
        return;
      }
      const { url } = await up.json();
      uploadedUrl = url;
    }

    const payload = {
      title: form.title,
      episode: form.episode,
      tags: form.tags,
      imageUrl: uploadedUrl,
    };

    onCreate(payload);
    onClose();
    setForm({ title: "", episode: "", tags: [], imageUrl: "" });
    setErrors({});
    setFile(null);
  }, [form, file, onCreate, onClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Enter" && (e.target as HTMLElement)?.tagName !== "TEXTAREA" && isValid) {
        e.preventDefault();
        handleSubmit();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, isValid, onClose, handleSubmit]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal="true" id="create">
      <div className="absolute inset-0 bg-black/30" onClick={(e) => e.currentTarget === e.target && onClose()} />
      <div className="relative z-50 w-full sm:w-[640px] max-w-[92vw] sticker pixel-border p-6 md:p-8 bg-white shadow-xl overflow-x-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="p-5 border-b">
          <h3 className="text-lg font-semibold">平成レトロな思い出を登録</h3>
          <p className="text-sm text-neutral-500">写真と一言エピソードでOK。みんなの記憶を集めよう。</p>
        </div>

        <div className="p-5 grid grid-cols-1 gap-4">
          <label className="grid gap-1">
            <span className="text-sm">タイトル <span className="text-pink-600">*</span></span>
            <input
              required
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
              aria-invalid={!!errors.episode}
              className={`w-full border rounded-lg px-3 py-2 min-h-[88px] ${errors.episode ? "border-pink-400" : ""}`}
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
                const disabled = !active && form.tags.length >= 5;
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

          <label className="grid gap-1">
            <span className="text-sm">画像ファイル（任意・5MBまで）</span>
            <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="w-full border rounded-lg px-3 py-2 file:mr-3 file:px-3 file:py-2 file:rounded-md file:border file:bg-white file:hover:bg-neutral-50 file:border-neutral-300" />
            <span className="text-xs text-neutral-500">※ 直接URL入力よりもファイル選択を優先します</span>
          </label>
        </div>

        <div className="p-5 border-t flex items-center justify-end gap-3">
          <button className="px-3 py-1.5 rounded-lg border" onClick={onClose}>キャンセル</button>
          <button
            className="px-3 py-1.5 rounded-lg text-white transition disabled:opacity-50 disabled:cursor-not-allowed bg-black"
            disabled={!isValid}
            onClick={handleSubmit}
          >
            追加する
          </button>
        </div>
      </div>
    </div>
  );
}

// ————————————————————————————————————————————————
// ユーティリティ：クリック外
// ————————————————————————————————————————————————
function useClickOutside<T extends HTMLElement>(onOutside: () => void) {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) onOutside();
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [onOutside]);
  return ref;
}

// ————————————————————————————————————————————————
// カード（ステッカー）
// ————————————————————————————————————————————————
function EntryCard({
  idx,
  e,
  onToggleLike,
  onDelete,
  hydrated,
  currentUserId,
}: {
  idx: number;
  e: Entry;
  onToggleLike: (id: string) => void;
  onDelete: (id: string) => void;
  hydrated: boolean;
  currentUserId?: string;
}) {
  const [liked, setLiked] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [popping, setPopping] = useState(false); // いいね演出
  const [likers, setLikers] = useState<{ userId: string; userName: string; userAvatar?: string | null }[]>([]);
  const [showLikers, setShowLikers] = useState(false);
  const longPressTimer = useRef<number | null>(null);

  const isRealId = hydrated && !String(e.id).startsWith("tmp-") && String(e.id).length > 12;
  const isOwner = currentUserId && e.contributor?.id && String(e.contributor.id) === String(currentUserId);

  const menuRef = useClickOutside<HTMLDivElement>(() => setMenuOpen(false));

  useEffect(() => {
    if (typeof window !== "undefined") setLiked(!!localStorage.getItem(`liked:${e.id}`));
  }, [e.id]);

  useEffect(() => {
    return () => {
      if (longPressTimer.current) window.clearTimeout(longPressTimer.current);
    };
  }, []);

  const handleLike = () => {
    onToggleLike(e.id);
    setLiked((prev) => !prev);
    setPopping(true);
    setTimeout(() => setPopping(false), 420);
  };

  const Img = (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={e.imageUrl || FALLBACK_IMG}
      alt={e.title}
      className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform"
      loading="lazy"
      onError={(ev) => {
        const img = ev.currentTarget as HTMLImageElement;
        if (img.src !== FALLBACK_IMG) img.src = FALLBACK_IMG;
      }}
    />
  );

  const confirmDelete = async () => {
    setMenuOpen(false);
    const ok = confirm("この投稿を削除しますか？（元に戻せません）");
    if (!ok) return;
    // 楽観削除
    onDelete(e.id);
    // サーバ削除
    try {
      const res = await fetch(`/api/entries/${e.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("delete failed");
    } catch {
      alert("削除に失敗しました。再読み込み後に再度お試しください。");
    }
  };

  const fetchLikers = async () => {
    try {
      const res = await fetch(`/api/entries/${e.id}/like`, { method: "GET", cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setLikers(data.users || []);
      }
    } catch {}
  };

  const onHoverLike = async () => {
    await fetchLikers();
    setShowLikers(true);
  };
  const onLeaveLike = () => setShowLikers(false);

  const onTouchStartLike = () => {
    if (longPressTimer.current) window.clearTimeout(longPressTimer.current);
    longPressTimer.current = window.setTimeout(async () => {
      await fetchLikers();
      setShowLikers(true);
    }, 500);
  };
  const onTouchEndLike = () => {
    if (longPressTimer.current) window.clearTimeout(longPressTimer.current);
    setTimeout(() => setShowLikers(false), 150);
  };

  return (
    <article className="group relative sticker rt overflow-hidden">
      {/* 右上メニュー（オーナーのみ） */}
      {isOwner ? (
        <div className="absolute right-3 top-3 z-10" ref={menuRef}>
          <button
            className="w-8 h-8 rounded-full bg-white/95 border border-neutral-200 shadow hover:bg-white"
            onClick={() => setMenuOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            title="メニュー"
          >
            ⋯
          </button>
          {menuOpen && (
            <div role="menu" className="absolute right-0 mt-2 w-36 rounded-xl border bg-white shadow-lg overflow-hidden">
              <button className="w-full text-left px-3 py-2 text-sm hover:bg-neutral-50" onClick={confirmDelete}>
                削除する
              </button>
            </div>
          )}
        </div>
      ) : null}

      {/* 画像：上だけ角丸 */}
      <div className="aspect-[16/9] w-full overflow-hidden bg-neutral-100 rounded-t-2xl">
        {isRealId ? <Link href={`/entries/${e.id}`}>{Img}</Link> : Img}
      </div>

      <div className="p-4 grid gap-2">
        <h3 className="entry-title font-semibold leading-tight">
          {isRealId ? (
            <Link href={`/entries/${e.id}`} className="hover:underline">
              {e.title}
            </Link>
          ) : (
            e.title
          )}
        </h3>

        <Expandable lines={2} className="text-sm text-neutral-700">
          {e.episode}
        </Expandable>

        <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-600 pt-1">
          {e.tags?.slice(0, 4).map((t) => (
            <Pill key={t}>{t}</Pill>
          ))}
        </div>

        <div className="mt-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={e.contributor.avatarUrl} alt={e.contributor.name} className="w-6 h-6 rounded-full" />
            <span className="text-xs text-neutral-600">by {e.contributor.name}</span>
          </div>

          {/* いいね（相対ラッパでポップ位置を安定化） */}
          <div className="relative">
            <button
              onClick={handleLike}
              onMouseEnter={onHoverLike}
              onMouseLeave={onLeaveLike}
              onTouchStart={onTouchStartLike}
              onTouchEnd={onTouchEndLike}
              onTouchCancel={onTouchEndLike}
              aria-pressed={liked}
              aria-label={liked ? "いいねを取り消す" : "いいねする"}
              title={liked ? "いいね解除" : "いいね！"}
              className={`relative px-2 h-8 inline-flex items-center gap-1.5 rounded-full border text-[13px] select-none
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-300/60 active:scale-95
                transition-all duration-150 ease-out shadow-sm hover:shadow-md ${popping ? "like-pop" : ""}
                ${liked ? "bg-pink-50 border-pink-200 text-pink-600" : "bg-white hover:bg-neutral-50 border-neutral-300 text-neutral-800"}`}
            >
              <span className={`text-base leading-none ${liked ? "opacity-100" : "opacity-80"}`}>{liked ? "❤️" : "🤍"}</span>
              <span className="tabular-nums">{e.likes}</span>
              {liked && popping && <span className="burst">✦</span>}
            </button>

            {showLikers && <div className="absolute right-0 top-[calc(100%+6px)] z-20">
              <LikesPopover users={likers} />
            </div>}
          </div>
        </div>
      </div>
    </article>
  );
}

// ————————————————————————————————————————————————
// フィルタ
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
        <select value={selectedUser} onChange={(e) => setSelectedUser(e.target.value)} className="border rounded-lg px-3 py-2">
          <option value="">投稿者で絞り込み</option>
          {contributors.map((c: Contributor) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value)} className="border rounded-lg px-3 py-2">
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

  const [entries, setEntries] = useState<Entry[]>([]);
  const [openModal, setOpenModal] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedUser, setSelectedUser] = useState("");
  const [sort, setSort] = useState("new");
  const [hydrated, setHydrated] = useState(false);

  // 初回ロード
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/entries", { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.entries)) {
            const normalized = (data.entries as any[]).map((d) => ({
              ...d,
              tags: Array.isArray(d.tags)
                ? d.tags
                : typeof d.tags === "string"
                ? d.tags.split(",").map((s: string) => s.trim()).filter(Boolean)
                : [],
              contributor: d.contributor ?? { id: "guest", name: "guest", avatarUrl: "https://i.pravatar.cc/100?img=1" },
            })) as Entry[];
            setEntries(normalized);
          }
        }
      } finally {
        setHydrated(true);
      }
    })();
  }, []);

  const allTags = useMemo(() => Array.from(new Set(entries.flatMap((e) => e.tags)) || []), [entries]);

  const contributors = useMemo(() => {
    const map = new Map<string, Contributor>();
    entries.forEach((e) => map.set(e.contributor.id, e.contributor));
    return Array.from(map.values());
  }, [entries]);

  const filtered = useMemo(() => {
    let list = [...entries];
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter((e) => e.title.toLowerCase().includes(q) || e.episode.toLowerCase().includes(q));
    }
    if (selectedTags.length) list = list.filter((e) => selectedTags.every((t) => e.tags?.includes(t)));
    if (selectedUser) list = list.filter((e) => e.contributor.id === selectedUser);

    if (sort === "likes") {
      list.sort((a, b) => b.likes - a.likes);
    } else {
      list.sort((a, b) => {
        const da = a.createdAt ? new Date(a.createdAt as any).getTime() : 0;
        const db = b.createdAt ? new Date(b.createdAt as any).getTime() : 0;
        return db - da; // 新しい順
      });
    }
    return list;
  }, [entries, query, selectedTags, selectedUser, sort]);

  // いいねトグル：サーバーの like/unlike に合わせて安定更新
  const onToggleLike = async (id: string) => {
    const key = `liked:${id}`;
    const wasLiked = typeof window !== "undefined" ? !!localStorage.getItem(key) : false;

    // 楽観反映
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, likes: Math.max(0, e.likes + (wasLiked ? -1 : 1)) } : e)));
    if (typeof window !== "undefined") {
      if (wasLiked) localStorage.removeItem(key);
      else localStorage.setItem(key, "1");
    }
    if (!hydrated) return;

    try {
      const res = await fetch(`/api/entries/${id}/like`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: wasLiked ? "unlike" : "like" }),
      });
      if (!res.ok) throw new Error("toggle failed");
      const data = await res.json(); // { likes, userLiked, users? }
      setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, likes: data.likes } : e)));
    } catch {
      // ロールバック
      setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, likes: Math.max(0, e.likes + (wasLiked ? 1 : -1)) } : e)));
      if (typeof window !== "undefined") {
        if (wasLiked) localStorage.setItem(key, "1");
        else localStorage.removeItem(key);
      }
      alert("いいね切り替えに失敗しました。時間をおいて再度お試しください。");
    }
  };

  const onCreate = async (payload: any) => {
    const candidate = {
      ...payload,
      contributor: user || { id: "guest", name: "guest", avatarUrl: "https://i.pravatar.cc/100?img=1" },
    };
    const optimistic: Entry = {
      id: "tmp-" + Date.now(),
      title: candidate.title,
      episode: candidate.episode,
      tags: candidate.tags || [],
      imageUrl: candidate.imageUrl || FALLBACK_IMG,
      contributor: candidate.contributor,
      likes: 0,
      createdAt: new Date().toISOString(),
    };
    setEntries((prev) => [optimistic, ...prev]);

    try {
      const res = await fetch("/api/entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(candidate),
      });
      if (!res.ok) throw new Error("failed");
      const createdRaw = (await res.json()).entry as any;
      const created: Entry = {
        id: createdRaw.id,
        title: createdRaw.title,
        episode: createdRaw.episode,
        tags: Array.isArray(createdRaw.tags)
          ? createdRaw.tags
          : typeof createdRaw.tags === "string"
          ? createdRaw.tags.split(",").map((s: string) => s.trim()).filter(Boolean)
          : [],
        imageUrl: createdRaw.imageUrl ?? "",
        contributor: createdRaw.contributor ?? candidate.contributor,
        likes: createdRaw.likes ?? 0,
        createdAt: createdRaw.createdAt ?? new Date().toISOString(),
      };
      setEntries((prev) => [created, ...prev.filter((e) => e.id !== optimistic.id)]);
    } catch {
      setEntries((prev) => prev.filter((e) => e.id !== optimistic.id));
      alert("投稿に失敗しました。時間をおいて再度お試しください。");
    }
  };

  return (
    <div className="min-h-screen bg-dot">
      {/* ヒーロー */}
      <HeaderHero user={user} onOpenCreate={() => setOpenModal(true)} />

      {/* フィルタ */}
      <Filters
        allTags={allTags}
        selectedTags={selectedTags}
        setSelectedTags={setSelectedTags}
        query={query}
        setQuery={setQuery}
        contributors={contributors}
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
        count={filtered.length}
      />

      {/* 1カラムのフィード */}
      <section className="container-page pb-16 pt-4 space-y-8">
        {filtered.length === 0 ? (
          <div className="text-center text-neutral-600 py-16">
            条件に一致する思い出がありません。条件をゆるめてみてください。
          </div>
        ) : (
          filtered.map((e, idx) => (
            <EntryCard
              key={e.id}
              idx={idx}
              e={e}
              hydrated={hydrated}
              onToggleLike={onToggleLike}
              onDelete={(id) => setEntries((p) => p.filter((x) => x.id !== id))}
              currentUserId={user?.id}
            />
          ))
        )}
      </section>

      {/* 右下の追従＋ボタン（PC/SP 共通） */}
      <button
  aria-label="新しい思い出を登録"
  onClick={() => {
    if (user) {
      setOpenModal(true);
    } else {
      if (confirm("投稿するにはログインが必要です。Discordでログインしますか？")) {
        signIn("discord");
      }
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
