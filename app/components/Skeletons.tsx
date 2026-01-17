'use client';

import React from 'react';

export function CardSkeleton() {
  return (
    <div className="mac-card" style={{ overflow: 'hidden' }}>
      <div style={{
        aspectRatio: '4/3',
        width: '100%',
        background: 'linear-gradient(90deg, var(--platinum) 0%, var(--platinum-light) 50%, var(--platinum) 100%)',
        backgroundSize: '200% 100%',
        animation: 'shimmer 1.5s infinite'
      }} />
      <div className="mac-card-body" style={{ display: 'grid', gap: '12px' }}>
        <div style={{ height: '14px', width: '60%', background: 'var(--platinum)', borderRadius: '2px' }} />
        <div style={{ height: '12px', width: '100%', background: 'var(--platinum)', borderRadius: '2px' }} />
        <div style={{ height: '12px', width: '80%', background: 'var(--platinum)', borderRadius: '2px' }} />
        <div className="mac-separator" />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '28px', height: '28px', borderRadius: '4px', background: 'var(--platinum)' }} />
            <div style={{ width: '60px', height: '10px', background: 'var(--platinum)', borderRadius: '2px' }} />
          </div>
          <div style={{ width: '50px', height: '24px', background: 'var(--platinum)', borderRadius: '4px' }} />
        </div>
      </div>
      <style jsx>{`
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  );
}

export function ListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <section className="container-mac mac-grid">
      {Array.from({ length: rows }).map((_, i) => (
        <CardSkeleton key={i} />
      ))}
    </section>
  );
}
