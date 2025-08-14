// app/loading.tsx
export default function Loading() {
  return (
    <div className="mx-auto max-w-5xl p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: 9 }).map((_, i) => (
        <div key={i} className="animate-pulse rounded-xl border p-4 space-y-3">
          <div className="h-40 w-full rounded-lg bg-gray-200" />
          <div className="h-5 w-3/5 bg-gray-200 rounded" />
          <div className="h-4 w-full bg-gray-200 rounded" />
          <div className="h-4 w-4/5 bg-gray-200 rounded" />
          <div className="h-6 w-24 bg-gray-200 rounded" />
        </div>
      ))}
    </div>
  );
}
