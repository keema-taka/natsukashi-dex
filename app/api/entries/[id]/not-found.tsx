// app/api/entries/[id]/not-found.tsx
import Link from "next/link";

export default function NotFound() {
  return (
    <div className="container-page py-10">
      <p className="text-neutral-600">この投稿は見つかりませんでした。</p>
      <Link href="/" className="text-blue-600 underline mt-2 inline-block">
        トップへ戻る
      </Link>
    </div>
  );
}
