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
    <div ref={ref} className="relative">
      <button
        className="w-8 h-8 rounded-full bg-white/95 border border-neutral-200 shadow hover:bg-white"
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
          className="absolute right-0 mt-2 w-36 rounded-xl border bg-white shadow-lg overflow-hidden z-20"
        >
          <button
            className="w-full text-left px-3 py-2 text-sm hover:bg-neutral-50"
            onClick={confirmDelete}
          >
            削除する
          </button>
        </div>
      )}
    </div>
  );
}
