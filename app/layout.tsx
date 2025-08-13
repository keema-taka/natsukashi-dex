// app/layout.tsx
import type { Metadata } from "next";
import "./globals.css";
import Providers from "./providers";
import HeaderAuth from "./HeaderAuth";

export const metadata: Metadata = {
  title: "レトロ図鑑",
  description: "平成レトロの思い出を集める図鑑",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=DotGothic16&family=Pixelify+Sans:wght@400;700&display=swap"
          rel="stylesheet"
        />
      </head>

      {/* ✅ ここでアプリ全体を SessionProvider で包む */}
      <body className="min-h-screen font-[DotGothic16] bg-paper">
        <Providers>
          {/* 追従ヘッダー（中で useSession してOKになる） */}
          <header className="header-retro">
  <div className="container-page py-3 flex items-center gap-3">
    <div className="flex items-center gap-2 min-w-0">
      <span className="text-xl leading-none">🕹️</span>
      <h1 className="text-[15px] sm:text-base font-bold whitespace-nowrap">
        レトロ図鑑 <span className="opacity-80 text-xs font-normal">- Heisei Retro Dex</span>
      </h1>
    </div>
    <div className="ml-auto flex items-center gap-2">
      {/* ← ここに HeaderAuth */}
      <HeaderAuth />
    </div>
  </div>
</header>

          {/* 本文 */}
          <main className="flex-1">{children}</main>

          {/* フッター */}
          <footer className="mt-12 border-t">
            <div className="container-page py-10 text-sm text-neutral-600 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <p>© {new Date().getFullYear()} RetroDex — レトロ図鑑</p>
              <div className="flex items-center gap-2 text-neutral-500">
                <span className="pill">#ゲーム</span>
                <span className="pill">#おもちゃ</span>
                <span className="pill">#アニメ</span>
                <span className="pill">#駄菓子</span>
                <span className="pill">#学校</span>
              </div>
            </div>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
