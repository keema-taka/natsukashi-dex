// app/components/EntryCard.tsx
'use client';

import Link from 'next/link';
import Expandable from '@/app/components/Expandable';
import SafeImage from '@/app/components/SafeImage';
import LikeButton from './LikeButton';
import KebabMenu from './KebabMenu';
import React from 'react';
import { motion } from 'framer-motion';

type Contributor = { id: string; name: string; avatarUrl: string };
type Entry = {
  id: string;
  title: string;
  episode: string;
  tags: string[];
  imageUrl: string;
  contributor: Contributor;
  likes: number;
  commentCount: number;
  createdAt?: string | Date;
  age?: number | null;
};

const FALLBACK_IMG = 'https://placehold.co/800x450?text=No+Image';

const TAG_COLORS = [
  'mac-tag-blue', 'mac-tag-purple', 'mac-tag-green', 'mac-tag-orange'
];

function getTagColor(index: number) {
  return TAG_COLORS[index % TAG_COLORS.length];
}

// 新着かどうかを判定（24時間以内）
function isNew(createdAt?: string | Date): boolean {
  if (!createdAt) return false;
  const created = new Date(createdAt);
  const now = new Date();
  const diff = now.getTime() - created.getTime();
  return diff < 24 * 60 * 60 * 1000;
}

/** いいねしたユーザー表示用のポップオーバー */
function LikesPopover({
  users,
}: {
  users: { userId: string; userName: string; userAvatar?: string | null }[];
}) {
  if (!users?.length) {
    return (
      <div style={{
        background: 'var(--platinum)',
        border: '1px solid var(--window-border-dark)',
        padding: '12px',
        boxShadow: '2px 2px 8px rgba(0,0,0,0.2)',
        fontSize: '12px',
        color: 'var(--text-muted)'
      }}>
        まだ「いいね」した人はいません
      </div>
    );
  }
  return (
    <div style={{
      minWidth: '180px',
      maxWidth: '240px',
      background: 'var(--window-bg)',
      border: '1px solid var(--window-border-dark)',
      boxShadow: '2px 2px 8px rgba(0,0,0,0.2)',
    }}>
      <div style={{
        fontSize: '11px',
        fontWeight: '600',
        padding: '8px 12px',
        background: 'var(--platinum)',
        borderBottom: '1px solid var(--platinum-dark)'
      }}>
        ♥ いいねしたユーザー
      </div>
      <ul style={{ listStyle: 'none', padding: '8px', margin: 0, display: 'grid', gap: '6px' }}>
        {users.slice(0, 10).map((u) => (
          <li key={u.userId} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={u.userAvatar || 'https://i.pravatar.cc/100?img=1'}
              alt={u.userName}
              className="mac-avatar"
              style={{ width: '24px', height: '24px' }}
            />
            <span style={{ fontSize: '12px' }}>{u.userName}</span>
          </li>
        ))}
      </ul>
      {users.length > 10 && (
        <div style={{ padding: '4px 12px 8px', fontSize: '11px', color: 'var(--text-muted)' }}>
          ほか {users.length - 10} 名
        </div>
      )}
    </div>
  );
}

export default function EntryCard({
  entry,
  currentUserId: _currentUserId,
  onDeleted,
  forceKebab: _forceKebab,
  priority = false,
}: {
  entry: Entry;
  currentUserId?: string;
  onDeleted?: (id: string) => void;
  forceKebab?: boolean;
  priority?: boolean;
}) {
  const isRealId =
    entry.id && !String(entry.id).startsWith('tmp-') && String(entry.id).length > 12;

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

  const showNewBadge = isNew(entry.createdAt);

  return (
    <motion.article
      className="mac-card"
      style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-30px" }}
      transition={{ duration: 0.2, ease: "easeOut" }}
    >
      {/* NEWバッジ */}
      {showNewBadge && <div className="mac-badge-new">NEW</div>}

      {/* 右上メニュー */}
      <div style={{ position: 'absolute', right: '8px', top: '8px', zIndex: 10 }}>
        <KebabMenu id={entry.id} onDeleted={onDeleted} />
      </div>

      {/* 画像エリア */}
      <div className="mac-card-image">
        {isRealId ? (
          <Link href={`/entries/${entry.id}`}>
            <SafeImage
              src={entry.imageUrl || FALLBACK_IMG}
              alt={entry.title}
              className="w-full h-full object-cover"
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

      {/* コンテンツ */}
      <div className="mac-card-body" style={{ display: 'flex', flexDirection: 'column', flexGrow: 1, gap: '10px' }}>
        <div style={{ flexGrow: 1 }}>
          <h3 className="mac-card-title">
            {isRealId ? (
              <Link href={`/entries/${entry.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                {entry.title}
              </Link>
            ) : (
              entry.title
            )}
          </h3>

          <Expandable lines={3} className="mac-card-text">
            {entry.episode}
          </Expandable>
        </div>

        {/* タグ */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
          {entry.tags?.slice(0, 4).map((t, i) => (
            <span key={t} className={`mac-tag ${getTagColor(i)}`}>
              {t}
            </span>
          ))}
        </div>

        {/* セパレータ */}
        <div className="mac-separator" />

        {/* フッター */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          {/* 投稿者 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={entry.contributor?.avatarUrl || 'https://i.pravatar.cc/100?img=1'}
              alt={entry.contributor?.name || 'unknown'}
              className="mac-avatar"
              style={{ width: '28px', height: '28px' }}
            />
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', maxWidth: '70px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {entry.contributor?.name || 'unknown'}
            </span>
          </div>

          {/* アクション */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {/* コメント */}
            <Link
              href={`/entries/${entry.id}`}
              className="mac-like-btn"
              title="コメントを見る"
            >
              💬
              {entry.commentCount > 0 && (
                <span style={{ fontWeight: '600' }}>{entry.commentCount}</span>
              )}
            </Link>

            {/* いいね */}
            <div
              style={{ position: 'relative' }}
              onMouseEnter={onMouseEnterLike}
              onMouseLeave={onMouseLeaveLike}
              onTouchStart={onTouchStartLike}
              onTouchEnd={onTouchEndLike}
              onTouchCancel={onTouchEndLike}
            >
              <LikeButton id={entry.id} count={entry.likes} />
              {showLikers && (
                <div style={{ position: 'absolute', right: 0, bottom: '100%', marginBottom: '6px', zIndex: 50 }}>
                  <LikesPopover users={likers} />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </motion.article>
  );
}
