"use client";
import useSWR from "swr";
import EntryCard from "./EntryCard";
import { SkeletonGrid } from "./Skeletons";

const fetcher = (url: string) => fetch(url, { cache: "no-store" }).then(r => r.json());

export default function EntriesList() {
  const { data, error, isLoading, mutate } = useSWR<{ entries: any[] }>(
    "/api/entries",
    fetcher,
    {
      refreshInterval: 15000, // 自動再検証（15秒）
      revalidateOnFocus: true,
    }
  );

  if (isLoading) return <SkeletonGrid count={9} />;
  if (error) return <p className="text-red-600">読み込みに失敗しました</p>;

  const entries = data?.entries ?? [];
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {entries.map((e) => (
        <EntryCard key={e.id} entryId={e.id} entry={e} onMutate={mutate} />
      ))}
    </div>
  );
}
