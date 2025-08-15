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

export default function EntryCard({
  entry,
  currentUserId,
  onDeleted,
}: {
  entry: Entry;
  currentUserId?: string;
  onDeleted?: (id: string) => void;
}) {
  const isOwner =
    currentUserId &&
    entry.contributor?.id &&
    String(entry.contributor.id) === String(currentUserId);

  const isRealId =
    entry.id && !String(entry.id).startsWith('tmp-') && String(entry.id).length > 12;

  return (
    <article className="group relative sticker rt overflow-hidden">
      {/* 右上メニュー（オーナーのみ） */}
      {isOwner ? (
        <div className="absolute right-3 top-3 z-10">
          <KebabMenu id={entry.id} onDeleted={onDeleted} />
        </div>
      ) : null}

      {/* 画像 */}
      <div className="aspect-[16/9] w-full overflow-hidden bg-neutral-100 rounded-t-2xl">
        {isRealId ? (
          <Link href={`/entries/${entry.id}`}>
            <SafeImage
              src={entry.imageUrl || FALLBACK_IMG}
              alt={entry.title}
              className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform"
              fallbackSrc={FALLBACK_IMG}
            />
          </Link>
        ) : (
          <SafeImage
            src={entry.imageUrl || FALLBACK_IMG}
            alt={entry.title}
            className="w-full h-full object-cover"
            fallbackSrc={FALLBACK_IMG}
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

          <LikeButton id={entry.id} count={entry.likes} />
        </div>
      </div>
    </article>
  );
}
