// app/components/LikesPopover.tsx
"use client";
import React from "react";

type Liker = { userId: string; userName: string; userAvatar?: string | null };

export default function LikesPopover({ users }: { users: Liker[] }) {
  if (!users?.length) return null;
  return (
    <div className="pointer-events-none absolute bottom-10 right-0 z-20 w-56 rounded-xl border bg-white/95 shadow-lg p-2">
      <p className="text-xs text-neutral-500 px-1 pb-1">いいねした人</p>
      <ul className="max-h-56 overflow-auto">
        {users.map((u) => (
          <li key={u.userId} className="flex items-center gap-2 px-1.5 py-1.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={u.userAvatar ?? "https://i.pravatar.cc/60"} alt={u.userName} className="w-5 h-5 rounded-full" />
            <span className="text-sm">{u.userName}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
