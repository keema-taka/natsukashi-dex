// app/entries/[id]/page.tsx
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import CommentBox from "./CommentBox";
import Expandable from "@/app/components/Expandable";
import SafeImage from "@/app/components/SafeImage";
import type { Metadata } from "next";
import { headers } from "next/headers";

const FALLBACK_IMG = "https://placehold.co/800x450?text=No+Image";

type Contributor = { id: string; name: string; avatarUrl: string };
type EntryView = {
  id: string;
  title: string;
  episode: string;
  imageUrl: string;
  tags: string[];
  contributor: Contributor;
  likes: number;
  createdAt: Date;
  age: number | null;
};

// CSV or JsonValue -> array
function toTagArray(input: unknown): string[] {
  if (Array.isArray(input)) return input.map(String).map(s => s.trim()).filter(Boolean);
  if (typeof input === "string") return input.split(",").map(s => s.trim()).filter(Boolean);
  return [];
}

// JsonValue -> Contributor
function toContributor(input: any): Contributor {
  return {
    id: String(input?.id ?? "guest"),
    name: String(input?.name ?? "guest"),
    avatarUrl: String(input?.avatarUrl ?? "https://i.pravatar.cc/100?img=1"),
  };
}

/** ベースURL解決（NEXT_PUBLIC_APP_URL > リクエストヘッダ） */
async function resolveBaseUrl(): Promise<string> {
  const env = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (env) return env.replace(/\/+$/, "");
  const h = await headers(); // ← Promise を await
  const host = h.get("x-forwarded-host") || h.get("host") || "";
  const proto = (h.get("x-forwarded-proto") || "https").split(",")[0];
  return `${proto}://${host}`.replace(/\/+$/, "");
}

/** 相対URLを絶対化 */
function absolutize(url?: string | null, base?: string): string | undefined {
  if (!url) return undefined;
  if (/^https?:\/\//i.test(url)) return url;
  if (!base) return undefined;
  const path = url.startsWith("/") ? url : `/${url}`;
  return `${base}${path}`;
}

// ---- OGP メタデータを動的生成 ------------------------------
export async function generateMetadata(
  { params }: { params: Promise<{ id: string }> }
): Promise<Metadata> {
  const { id } = await params;
  const row = await prisma.entry.findUnique({ where: { id } });

  if (!row) {
    return {
      title: "投稿が見つかりませんでした | 平成レトロ図鑑",
      description: "指定された投稿は存在しません。",
      robots: { index: false },
    };
  }

  const base = await resolveBaseUrl(); // ← await を追加
  const title = `${row.title} | 平成レトロ図鑑`;
  const description = row.episode?.slice(0, 120) || "平成レトロの思い出を集めるみんなの図鑑。";
  const image = absolutize((row as any).imageUrl, base) || FALLBACK_IMG;
  const url = `${base}/entries/${row.id}`;

  return {
    title,
    description,
    openGraph: {
      type: "article",
      title,
      description,
      url,
      images: [{ url: image }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
    alternates: { canonical: url },
  };
}
// -----------------------------------------------------------

export default async function EntryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const row = await prisma.entry.findUnique({ where: { id } });
  if (!row) {
    return (
      <div className="container-page py-10">
        <p className="text-neutral-600">この投稿は見つかりませんでした。</p>
        <Link href="/" className="text-blue-600 underline mt-2 inline-block">
          トップへ戻る
        </Link>
      </div>
    );
  }

  const e: EntryView = {
    id: row.id,
    title: row.title,
    episode: row.episode,
    imageUrl: row.imageUrl,
    tags: toTagArray((row as any).tags),
    contributor: toContributor((row as any).contributor),
    likes: row.likes,
    createdAt: row.createdAt,
    age: (row as any).age ?? null,
  };

  return (
    <div className="container-mac py-8">
      <div className="mb-4">
        <Link href="/" className="mac-button inline-flex items-center gap-1" style={{ textDecoration: 'none' }}>
          <span>←</span> Back to Index
        </Link>
      </div>

      <article className="mac-window animate-window mb-8">
        <div className="mac-titlebar">
          <div className="mac-controls">
            <div className="mac-close" />
          </div>
          <div className="mac-title">{e.title}</div>
        </div>

        <div className="mac-content">
          {/* 画像エリア */}
          <div className="border-2 border-black mb-6 bg-[var(--platinum)]">
            <div className="aspect-[16/9] w-full relative">
              <SafeImage
                src={e.imageUrl}
                alt={e.title}
                className="w-full h-full object-contain"
                fallbackSrc={FALLBACK_IMG}
                entryId={e.id}
              />
            </div>
          </div>

          <div className="grid gap-4">
            <div className="flex items-start justify-between gap-4">
              <h1 className="text-xl font-bold font-['Silkscreen'] tracking-wide">{e.title}</h1>
              <div className="flex items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={e.contributor.avatarUrl || "https://i.pravatar.cc/100?img=1"}
                  alt={e.contributor.name || "unknown"}
                  className="mac-avatar"
                />
                <div className="text-xs">
                  <div className="font-bold">{e.contributor.name || "unknown"}</div>
                  <div className="text-[var(--text-muted)] text-[10px]">{new Date(e.createdAt).toLocaleDateString()}</div>
                </div>
              </div>
            </div>

            <div className="mac-separator" />

            <div className="text-[var(--text-primary)] leading-relaxed font-['DotGothic16'] text-sm p-4 bg-[var(--platinum-light)] border-2 border-[var(--window-border-dark)] border-inset shadow-inner">
              <Expandable lines={5}>{e.episode}</Expandable>
            </div>

            {/* 年齢・タグ */}
            <div className="flex flex-wrap gap-2 mt-2">
              {e.age != null && <span className="mac-tag mac-tag-blue">当時 {e.age} 歳</span>}
              {e.tags.map((t) => (
                <span key={t} className="mac-tag">
                  {t}
                </span>
              ))}
            </div>
          </div>
        </div>
      </article>

      {/* コメントフォーム＋一覧（クライアント） */}
      <CommentBox entryId={e.id} />
    </div>
  );
}
