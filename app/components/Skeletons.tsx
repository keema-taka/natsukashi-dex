'use client';

import React from 'react';

export function CardSkeleton() {
  return (
    <div className="sticker rt overflow-hidden animate-pulse">
      <div className="aspect-[16/9] w-full bg-neutral-200" />
      <div className="p-4 space-y-3">
        <div className="h-4 w-2/3 bg-neutral-200 rounded" />
        <div className="h-4 w-full bg-neutral-200 rounded" />
        <div className="h-4 w-5/6 bg-neutral-200 rounded" />
        <div className="flex items-center justify-between pt-2">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-neutral-200" />
            <div className="h-3 w-24 bg-neutral-200 rounded" />
          </div>
          <div className="h-8 w-16 bg-neutral-200 rounded-full" />
        </div>
      </div>
    </div>
  );
}

export function ListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <section className="container-page pb-16 pt-4 space-y-8">
      {Array.from({ length: rows }).map((_, i) => (
        <CardSkeleton key={i} />
      ))}
    </section>
  );
}
