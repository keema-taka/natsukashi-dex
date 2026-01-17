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
    return <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>…</span>;
  }

  if (!session) {
    return (
      <button onClick={() => signIn("discord")} className="mac-button" style={{ padding: '2px 12px', fontSize: '11px' }}>
        ログイン
      </button>
    );
  }

  const user = session.user as any;
  return (
    <div style={{ position: 'relative' }} ref={menuRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={user?.name || "account"}
        className="mac-button"
        style={{ padding: '2px 8px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px' }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={user?.image || "https://i.pravatar.cc/100?img=1"}
          alt={user?.name || "user"}
          className="mac-avatar"
          style={{ width: '16px', height: '16px', borderRadius: '2px' }}
        />
        <span style={{ maxWidth: '80px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {user?.name || "user"}
        </span>
        <span style={{ fontSize: '8px' }}>▼</span>
      </button>

      {open && (
        <div
          role="menu"
          className="animate-window"
          style={{
            position: 'absolute',
            right: 0,
            top: '100%',
            marginTop: '4px',
            width: '160px',
            background: 'var(--platinum)',
            border: '1px solid var(--window-border-dark)',
            boxShadow: '2px 2px 8px rgba(0,0,0,0.3)',
            zIndex: 50
          }}
        >
          <div style={{
            padding: '8px 12px',
            fontSize: '12px',
            fontWeight: '600',
            background: 'var(--platinum-light)',
            borderBottom: '1px solid var(--platinum-dark)'
          }}>
            {user?.name || "user"}
          </div>
          <button
            onClick={() => signOut()}
            role="menuitem"
            style={{
              width: '100%',
              textAlign: 'left',
              padding: '8px 12px',
              fontSize: '12px',
              background: 'var(--window-bg)',
              border: 'none',
              cursor: 'pointer',
              transition: 'background 0.1s'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.background = 'var(--accent-blue)';
              e.currentTarget.style.color = 'white';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = 'var(--window-bg)';
              e.currentTarget.style.color = 'var(--text-primary)';
            }}
          >
            ログアウト
          </button>
        </div>
      )}
    </div>
  );
}
