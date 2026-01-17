// app/layout.tsx
import type { Metadata } from "next";
import "./globals.css";
import Providers from "./providers";
import HeaderAuth from "./HeaderAuth";

export const metadata: Metadata = {
  title: "レトロ図鑑 - 平成の思い出コレクション",
  description: "平成レトロの思い出を集める図鑑。ゲーム、アニメ、おもちゃ、お菓子...みんなで懐かしいアイテムを登録しよう。",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>

      <body>
        <Providers>
          {/* Mac風メニューバー - System 7 */}
          <header className="menubar">
            <span className="menubar-logo">なつかし図鑑</span>
            <nav style={{ display: 'flex', gap: '0' }}>
              <span className="menubar-item">File</span>
              <span className="menubar-item">Edit</span>
              <span className="menubar-item">View</span>
            </nav>
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <HeaderAuth />
            </div>
          </header>

          {/* メインコンテンツ */}
          <main style={{ minHeight: 'calc(100vh - 80px)' }}>{children}</main>

          {/* フッター */}
          <footer className="mac-footer">
            <p className="mac-footer-text">
              © {new Date().getFullYear()} なつかし図鑑 — 平成の思い出をみんなで集めよう ✨
            </p>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
