"use client";
import { useEffect, useRef, useState } from "react";
import { signIn, signOut, useSession } from "next-auth/react";

function useClickOutside<T extends HTMLElement>(onOutside: () => void) {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) onOutside();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOutside();
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [onOutside]);
  return ref;
}

export default function HeaderAuth() {
  const { data: session, status } = useSession();
  const [open, setOpen] = useState(false);
  const menuRef = useClickOutside<HTMLDivElement>(() => setOpen(false));

  if (status === "loading") {
    return <span className="text-xs opacity-80">…</span>;
  }

  // 未ログイン → 「ログイン」ボタン（見やすい緑）
  if (!session) {
    return (
      <button
        onClick={() => signIn("discord")}
        className="px-3 h-8 rounded-lg text-sm font-medium text-white bg-[var(--retro-green)] hover:brightness-95 active:scale-95 shadow-sm"
      >
        ログイン
      </button>
    );
  }

  // ログイン中 → アバターをタップでメニュー
  const user = session.user as any;
  return (
    <div className="relative" ref={menuRef}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="rounded-full border border-black/10 shadow-sm"
        title={user?.name || "account"}
      >
        <img
          src={user?.image || "https://i.pravatar.cc/100?img=1"}
          alt={user?.name || "user"}
          className="h-8 w-8 rounded-full object-cover"
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-36 rounded-xl border border-neutral-200 bg-white text-neutral-800 shadow-lg overflow-hidden z-50"
        >
          <div className="px-3 py-2 text-xs text-neutral-600 truncate bg-neutral-50">
            {user?.name || "user"}
          </div>
          <button
            onClick={() => signOut()}
            className="w-full text-left px-3 py-2 text-sm hover:bg-neutral-100"
            role="menuitem"
          >
            ログアウト
          </button>
        </div>
      )}
    </div>
  );
}
