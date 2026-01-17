'use client';

import React from 'react';
import { useSWRConfig } from 'swr';

export default function KebabMenu({
  id,
  onDeleted,
}: {
  id: string;
  onDeleted?: (id: string) => void;
}) {
  const { mutate } = useSWRConfig();
  const key = '/api/entries';
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const confirmDelete = async () => {
    setOpen(false);
    const ok = confirm('この投稿を削除しますか？（元に戻せません）');
    if (!ok) return;

    // 楽観削除
    await mutate(
      key,
      (cur: any) => {
        const next = (cur?.entries ?? []).filter((e: any) => String(e.id) !== String(id));
        return { entries: next };
      },
      { revalidate: false }
    );

    try {
      const res = await fetch(`/api/entries/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('delete failed');
      onDeleted?.(id);
    } catch {
      alert('削除に失敗しました。時間をおいて再度お試しください。');
    } finally {
      mutate(key); // 再検証
    }
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        className="mac-button"
        style={{
          width: '28px',
          height: '28px',
          padding: 0,
          fontSize: '12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="メニュー"
      >
        ⋯
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
            width: '120px',
            background: 'var(--window-bg)',
            border: '1px solid var(--window-border-dark)',
            boxShadow: '2px 2px 8px rgba(0,0,0,0.2)',
            zIndex: 20
          }}
        >
          <button
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
            onClick={confirmDelete}
            onMouseOver={(e) => {
              e.currentTarget.style.background = 'var(--accent-blue)';
              e.currentTarget.style.color = 'white';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = 'var(--window-bg)';
              e.currentTarget.style.color = 'var(--text-primary)';
            }}
          >
            削除する
          </button>
        </div>
      )}
    </div>
  );
}
