// app/components/EntryCard.tsx
'use client';

import Link from 'next/link';
import Expandable from '@/app/components/Expandable';
import SafeImage from '@/app/components/SafeImage';
import LikeButton from './LikeButton';
import KebabMenu from './KebabMenu';
import React from 'react';

type Contributor = { id: string; name: string; avatarUrl: string };
type Entry = {
  id: string;
  title: string;
  episode: string;
  tags: string[];
  imageUrl: string;
  contributor: Contributor;
  likes: number;
  commentCount: number;                 // ★ 追加
  createdAt?: string | Date;
  age?: number | null;
};

const FALLBACK_IMG = 'https://placehold.co/800x450?text=No+Image';

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="px-2 py-0.5 text-xs rounded-full bg-neutral-100 border border-neutral-200">
      {children}
    </span>
  );
}

/** いいねしたユーザー表示用の軽量ポップオーバー */
function LikesPopover({
  users,
}: {
  users: { userId: string; userName: string; userAvatar?: string | null }[];
}) {
  if (!users?.length) {
    return (
      <div className="rounded-xl border bg-white shadow-lg p-3 text-xs text-neutral-600">
        まだ「いいね」した人はいません
      </div>
    );
  }
  return (
    <div className="min-w-[220px] max-w-[280px] rounded-xl border bg-white shadow-lg p-3">
      <div className="text-xs font-medium text-neutral-700 mb-2">
        いいねしたユーザー
      </div>
      <ul className="space-y-2">
        {users.slice(0, 10).map((u) => (
          <li key={`${u.userId}`} className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={u.userAvatar || 'https://i.pravatar.cc/100?img=1'}
              alt={u.userName}
              className="w-6 h-6 rounded-full object-cover"
            />
            <span className="text-xs text-neutral-800 truncate">{u.userName}</span>
          </li>
        ))}
      </ul>
      {users.length > 10 && (
        <div className="mt-2 text-[11px] text-neutral-500">
          ほか {users.length - 10} 名
        </div>
      )}
    </div>
  );
}

export default function EntryCard({
  entry,
  currentUserId: _currentUserId, // 将来用 
  onDeleted,
  forceKebab: _forceKebab,     // 受け取りだけ
  priority = false,            // 画像の優先読み込み設定
}: {
  entry: Entry;
  currentUserId?: string;
  onDeleted?: (id: string) => void;
  forceKebab?: boolean;
  priority?: boolean;          // 画像の優先読み込み設定
}) {
  const isRealId =
    entry.id && !String(entry.id).startsWith('tmp-') && String(entry.id).length > 12;

  // ---- いいねユーザーのポップオーバー制御 ----
  const [likers, setLikers] = React.useState<
    { userId: string; userName: string; userAvatar?: string | null }[]
  >([]);
  const [showLikers, setShowLikers] = React.useState(false);
  const longPressTimer = React.useRef<number | null>(null);

  const fetchLikers = React.useCallback(async () => {
    if (!isRealId) return;
    try {
      const res = await fetch(`/api/entries/${entry.id}/like?limit=20`, {
        method: 'GET',
        cache: 'no-store',
      });
      if (res.ok) {
        const data = await res.json();
        setLikers(Array.isArray(data?.users) ? data.users : []);
      }
    } catch {
      // ignore
    }
  }, [entry.id, isRealId]);

  const onMouseEnterLike = async () => {
    await fetchLikers();
    setShowLikers(true);
  };
  const onMouseLeaveLike = () => setShowLikers(false);

  const onTouchStartLike = () => {
    if (longPressTimer.current) window.clearTimeout(longPressTimer.current);
    longPressTimer.current = window.setTimeout(async () => {
  await fetchLikers();
  setShowLikers(true);
}, 1000); 
  };
  const clearLongPress = () => {
    if (longPressTimer.current) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };
  const onTouchEndLike = () => {
    clearLongPress();
    window.setTimeout(() => setShowLikers(false), 150);
  };

  React.useEffect(() => {
    return () => clearLongPress();
  }, []);

  return (
    <article className="group relative sticker rt">
      {/* 右上メニュー —— 常に表示（誰でも削除可） */}
      <div className="absolute right-3 top-3 z-10">
        <KebabMenu id={entry.id} onDeleted={onDeleted} />
      </div>

      {/* 画像 */}
      <div className="aspect-[16/9] w-full overflow-hidden bg-neutral-100 rounded-t-2xl">
        {isRealId ? (
          <Link href={`/entries/${entry.id}`}>
            <SafeImage
              src={entry.imageUrl || FALLBACK_IMG}
              alt={entry.title}
              className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform"
              fallbackSrc={FALLBACK_IMG}
              entryId={entry.id}
              priority={priority}
            />
          </Link>
        ) : (
          <SafeImage
            src={entry.imageUrl || FALLBACK_IMG}
            alt={entry.title}
            className="w-full h-full object-cover"
            fallbackSrc={FALLBACK_IMG}
            entryId={entry.id}
            priority={priority}
          />
        )}
      </div>

      <div className="p-4 grid gap-2">
        <h3 className="entry-title font-semibold leading-tight">
          {isRealId ? (
            <Link href={`/entries/${entry.id}`} className="hover:underline">
              {entry.title}
            </Link>
          ) : (
            entry.title
          )}
        </h3>

        <Expandable lines={2} className="text-sm text-neutral-700">
          {entry.episode}
        </Expandable>

        <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-600 pt-1">
          {entry.tags?.slice(0, 4).map((t) => (
            <Pill key={t}>{t}</Pill>
          ))}
        </div>

        <div className="mt-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={entry.contributor?.avatarUrl || 'https://i.pravatar.cc/100?img=1'}
              alt={entry.contributor?.name || 'unknown'}
              className="w-6 h-6 rounded-full object-cover"
            />
            <span className="text-xs text-neutral-600">
              by {entry.contributor?.name || 'unknown'}
            </span>
          </div>

          {/* 右側アクション（コメント数＋いいね） */}
          <div className="flex items-center gap-4">
            {/* コメント数（詳細ページへのリンク） */}
            <Link
              href={`/entries/${entry.id}`}
              className="inline-flex items-center text-neutral-700 hover:text-black text-[13px]"
              title="コメントを見る"
            >
              {/* 軽量吹き出しSVG */}
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
                className="mr-1"
              >
                <path
                  d="M4 5h16a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H8l-4 4V6a1 1 0 0 1 1-1Z"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinejoin="round"
                />
              </svg>
              <span className="tabular-nums">{entry.commentCount ?? 0}</span>
            </Link>

            {/* いいね（ホバー/長押しでユーザー一覧） */}
            <div
              className="relative"
              onMouseEnter={onMouseEnterLike}
              onMouseLeave={onMouseLeaveLike}
              onTouchStart={onTouchStartLike}
              onTouchEnd={onTouchEndLike}
              onTouchCancel={onTouchEndLike}
            >
              <LikeButton id={entry.id} count={entry.likes} />
              {showLikers && (
                <div className="absolute right-0 bottom-full mb-1.5 z-50">
                  <LikesPopover users={likers} />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
