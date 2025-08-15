'use client';

import useSWR from 'swr';
import React, { useMemo } from 'react';
import EntryCard from './EntryCard';
import { ListSkeleton } from './Skeletons';

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
  age?: number | null;
};

const fetcher = (url: string) =>
  fetch(url, { cache: 'no-store' }).then((r) => {
    if (!r.ok) throw new Error('fetch failed');
    return r.json();
  });

function toTags(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String).map(s => s.trim()).filter(Boolean);
  if (typeof v === 'string') return v.split(',').map(s => s.trim()).filter(Boolean);
  return [];
}
function toContributor(v: any): Contributor {
  return {
    id: String(v?.id ?? 'guest'),
    name: String(v?.name ?? 'guest'),
    avatarUrl: String(v?.avatarUrl ?? 'https://i.pravatar.cc/100?img=1'),
  };
}

export default function EntriesList(props: {
  query?: string;
  selectedTags?: string[];
  selectedUserId?: string;
  sort?: 'new' | 'likes';
  refreshIntervalMs?: number;
  currentUserId?: string;
  onCountChange?: (n: number) => void;                // ← 追加
  onAllTags?: (tags: string[]) => void;               // ← 追加
  onContributors?: (users: {                         // ← 追加
    id: string; name: string; avatarUrl: string;
  }[]) => void;
}) {
  const {
    query = '',
    selectedTags = [],
    selectedUserId = '',
    sort = 'new',
    refreshIntervalMs = 0,
    currentUserId,
    onCountChange,
    onAllTags,
    onContributors,
  } = props;

  const { data, error, isLoading, mutate } = useSWR<{ entries: any[] }>(
    '/api/entries',
    fetcher,
    {
    refreshInterval: refreshIntervalMs,
    revalidateOnFocus: false,
   }
  );

  const normalized: Entry[] = useMemo(() => {
    const raw = data?.entries ?? [];
    return raw.map((d) => ({
      id: String(d.id),
      title: String(d.title ?? ''),
      episode: String(d.episode ?? ''),
      tags: toTags(d.tags),
      imageUrl: String(d.imageUrl ?? ''),
      contributor: toContributor(d.contributor),
      likes: Number.isFinite(d.likes) ? Number(d.likes) : 0,
      createdAt: d.createdAt,
      age: (d as any).age ?? null,
    }));
  }, [data]);

// ここで一意タグと投稿者一覧を算出してページへ通知
  React.useEffect(() => {
    const tags = Array.from(new Set(normalized.flatMap(e => e.tags))).filter(Boolean);
    onAllTags?.(tags);

    const map = new Map<string, { id: string; name: string; avatarUrl: string }>();
    normalized.forEach(e => {
      if (e.contributor?.id) map.set(String(e.contributor.id), e.contributor);
    });
    onContributors?.(Array.from(map.values()));
  }, [normalized, onAllTags, onContributors]);

  const filtered = useMemo(() => {
    let list = normalized.slice();

    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter(
        (e) =>
          e.title.toLowerCase().includes(q) ||
          e.episode.toLowerCase().includes(q)
      );
    }
    if (selectedTags.length) {
      list = list.filter((e) => selectedTags.every((t) => e.tags.includes(t)));
    }
    if (selectedUserId) {
      list = list.filter((e) => String(e.contributor.id) === String(selectedUserId));
    }

    if (sort === 'likes') {
      list.sort((a, b) => b.likes - a.likes);
    } else {
      list.sort((a, b) => {
        const da = a.createdAt ? new Date(a.createdAt as any).getTime() : 0;
        const db = b.createdAt ? new Date(b.createdAt as any).getTime() : 0;
        return db - da;
      });
    }
    return list;
  }, [normalized, query, selectedTags, selectedUserId, sort]);

// 件数の通知
  React.useEffect(() => {
  onCountChange?.(filtered.length);
}, [filtered, onCountChange]);

  // EntriesList 経由での削除（楽観→再検証）
  const optimisticRemove = async (id: string) => {
    await mutate(
      (cur) => {
        const next = (cur?.entries ?? []).filter((e: any) => String(e.id) !== String(id));
        return { entries: next };
      },
      { revalidate: false }
    );
    try {
      await fetch(`/api/entries/${id}`, { method: 'DELETE' });
    } finally {
      mutate();
    }
  };

  if (isLoading) return <ListSkeleton rows={6} />;
  if (error) {
    return (
      <div className="container-page py-8">
        <p className="text-sm text-red-600">
          読み込みに失敗しました。時間をおいて再度お試しください。
        </p>
      </div>
    );
  }

  if (!filtered.length) {
    return (
      <section className="container-page py-10">
        <p className="text-neutral-600">条件に一致する思い出がありません。</p>
      </section>
    );
  }

  return (
    <section className="container-page pb-16 pt-4 space-y-8">
      {filtered.map((e) => (
        <EntryCard
          key={e.id}
          entry={e}
          currentUserId={currentUserId}
          onDeleted={optimisticRemove}
        />
      ))}
    </section>
  );
}
