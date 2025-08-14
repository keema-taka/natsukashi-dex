export default function Loading() {
  return (
    <div className="mx-auto max-w-3xl p-4 animate-pulse space-y-4">
      <div className="h-8 w-2/3 bg-gray-200 rounded" />
      <div className="h-72 w-full bg-gray-200 rounded-xl" />
      <div className="h-5 w-1/2 bg-gray-200 rounded" />
      <div className="h-4 w-full bg-gray-200 rounded" />
      <div className="h-4 w-5/6 bg-gray-200 rounded" />
    </div>
  );
}
