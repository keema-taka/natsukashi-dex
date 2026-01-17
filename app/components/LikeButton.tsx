'use client';

import React from 'react';
import { useSWRConfig } from 'swr';

export default function LikeButton({ id, count }: { id: string; count: number }) {
  const { mutate } = useSWRConfig();
  const keyMain = '/api/entries';
  const keyFast = '/api/entries?fast=1';

  const [liked, setLiked] = React.useState(false);
  const [popping, setPopping] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const cooldownRef = React.useRef<number>(0);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    setLiked(!!localStorage.getItem(`liked:${id}`));
  }, [id]);

  const optimistic = async (delta: 1 | -1) => {
    await Promise.all([
      mutate(keyFast, (cur: any) => {
        const next = (cur?.entries ?? []).map((e: any) =>
          String(e.id) === String(id) ? { ...e, likes: Math.max(0, Number(e.likes ?? 0) + delta) } : e
        );
        return { entries: next };
      }, { revalidate: false }),
      mutate(keyMain, (cur: any) => {
        const next = (cur?.entries ?? []).map((e: any) =>
          String(e.id) === String(id) ? { ...e, likes: Math.max(0, Number(e.likes ?? 0) + delta) } : e
        );
        return { entries: next };
      }, { revalidate: false }),
    ]);
  };

  const revalidateAll = () => {
    mutate(keyFast);
    mutate(keyMain);
    window.dispatchEvent(new CustomEvent('entries:refresh'));
  };

  const toggle = async () => {
    const now = Date.now();
    if (busy || now - cooldownRef.current < 400) return; // 連打ガード
    cooldownRef.current = now;

    const wasLiked = liked;
    setBusy(true);

    // 楽観反映
    await optimistic(wasLiked ? -1 : 1);
    setLiked(!wasLiked);
    setPopping(true);
    setTimeout(() => setPopping(false), 380);

    try {
      const res = await fetch(`/api/entries/${id}/like`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: wasLiked ? 'unlike' : 'like' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error('patch failed');

      // サーバーの正値で補正
      if (typeof data.likes === 'number') {
        await Promise.all([
          mutate(keyFast, (cur: any) => {
            const next = (cur?.entries ?? []).map((e: any) =>
              String(e.id) === String(id) ? { ...e, likes: data.likes } : e
            );
            return { entries: next };
          }, { revalidate: false }),
          mutate(keyMain, (cur: any) => {
            const next = (cur?.entries ?? []).map((e: any) =>
              String(e.id) === String(id) ? { ...e, likes: data.likes } : e
            );
            return { entries: next };
          }, { revalidate: false }),
        ]);
      }

      // localStorage 記録
      if (typeof window !== 'undefined') {
        if (wasLiked) localStorage.removeItem(`liked:${id}`);
        else localStorage.setItem(`liked:${id}`, '1');
      }
    } catch {
      // 失敗時ロールバック
      await optimistic(wasLiked ? 1 : -1);
      setLiked(wasLiked);
      alert('いいねの更新に失敗しました。時間をおいて再度お試しください。');
    } finally {
      setBusy(false);
      revalidateAll();
    }
  };

  return (
    <button
      onClick={toggle}
      disabled={busy}
      aria-pressed={liked}
      aria-label={liked ? 'いいねを取り消す' : 'いいねする'}
      title={liked ? 'いいね解除' : 'いいね！'}
      className={`mac-like-btn ${liked ? 'liked' : ''}`}
      style={{ opacity: busy ? 0.6 : 1, cursor: busy ? 'wait' : 'pointer', position: 'relative' }}
    >
      <span>{liked ? '❤️' : '🤍'}</span>
      <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{count}</span>
      {liked && popping && <span style={{ position: 'absolute', top: '-6px', right: '0', fontSize: '10px' }}>✦</span>}
    </button>
  );
}
