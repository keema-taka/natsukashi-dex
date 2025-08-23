// app/components/SafeImage.tsx
"use client";
import React from "react";

export default function SafeImage({
  src,
  alt,
  className,
  fallbackSrc,
  priority = false,
  entryId,
}: {
  src?: string | null;
  alt: string;
  className?: string;
  fallbackSrc: string;
  priority?: boolean;
  entryId?: string;
}) {
  const initial =
    src && src.trim() !== "" ? src : fallbackSrc;
  const [current, setCurrent] = React.useState(initial);
  const [loaded, setLoaded] = React.useState(false);
  const [refreshAttempted, setRefreshAttempted] = React.useState(false);

  // Discord画像URLの更新を試行
  const refreshDiscordImage = async (originalUrl: string) => {
    if (!entryId || refreshAttempted) return;
    
    // Discord CDNのURLかチェック
    if (!originalUrl.includes('cdn.discordapp.com')) return;
    
    setRefreshAttempted(true);
    
    try {
      const response = await fetch('/api/refresh-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          messageId: entryId,
          currentUrl: originalUrl 
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.refreshed && data.newImageUrl) {
          console.log(`[SafeImage] Refreshed image URL for ${entryId}`);
          setCurrent(data.newImageUrl);
          setLoaded(false); // リロードのため
          return;
        }
      }
    } catch (error) {
      console.error('[SafeImage] Failed to refresh image URL:', error);
    }
    
    // リフレッシュに失敗した場合はフォールバック
    if (current !== fallbackSrc) setCurrent(fallbackSrc);
  };

  // currentURL変更時の再読み込み処理
  React.useEffect(() => {
    if (!current || current === fallbackSrc) return;
    
    const img = new Image();
    img.src = current;
    img.onload = () => setLoaded(true);
    img.onerror = () => {
      if (current.includes('cdn.discordapp.com') && entryId && !refreshAttempted) {
        refreshDiscordImage(current);
      } else {
        setCurrent(fallbackSrc);
        setLoaded(true);
      }
    };
  }, [current, entryId, refreshAttempted, fallbackSrc]);

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={current}
      alt={alt}
      className={`${className} ${loaded ? 'opacity-100' : 'opacity-75'} transition-opacity duration-200`}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      onLoad={() => setLoaded(true)}
      onError={() => {
        if (src && src.includes('cdn.discordapp.com') && entryId && !refreshAttempted) {
          refreshDiscordImage(src);
        } else if (current !== fallbackSrc) {
          setCurrent(fallbackSrc);
        }
      }}
    />
  );
}
