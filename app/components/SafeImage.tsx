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
  const [isRefreshing, setIsRefreshing] = React.useState(false);

  // Discord画像URLの更新を試行
  const refreshDiscordImage = React.useCallback(async (originalUrl: string) => {
    if (!entryId || refreshAttempted || isRefreshing) return;
    
    // Discord CDNのURLかチェック
    if (!originalUrl.includes('cdn.discordapp.com')) return;
    
    console.log(`[SafeImage] Attempting to refresh Discord image for entry ${entryId}, URL: ${originalUrl}`);
    setRefreshAttempted(true);
    setIsRefreshing(true);
    
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
        console.log(`[SafeImage] Refresh response for ${entryId}:`, data);
        if (data.success && data.refreshed && data.newImageUrl) {
          console.log(`[SafeImage] Successfully refreshed image URL for ${entryId}: ${data.newImageUrl}`);
          setCurrent(data.newImageUrl);
          return;
        }
      } else {
        console.log(`[SafeImage] Refresh API failed for ${entryId}: ${response.status}`);
      }
    } catch (error) {
      console.error('[SafeImage] Failed to refresh image URL:', error);
    } finally {
      setIsRefreshing(false);
    }
    
    // リフレッシュに失敗した場合はフォールバック
    console.log(`[SafeImage] Using fallback image for ${entryId}`);
    setCurrent(fallbackSrc);
  }, [entryId, refreshAttempted, isRefreshing, fallbackSrc]);

  // 積極的な画像チェック（priority=trueかDiscordの画像URLの場合）
  React.useEffect(() => {
    if (!current || current === fallbackSrc || isRefreshing || refreshAttempted) return;
    
    // Discord画像は常にチェック、その他はpriorityの場合のみ
    if (current.includes('cdn.discordapp.com') || priority) {
      console.log(`[SafeImage] Checking image for entryId: ${entryId}, URL: ${current}, priority: ${priority}`);
      const img = new Image();
      img.src = current;
      img.onload = () => {
        console.log(`[SafeImage] Image loaded successfully for ${entryId}`);
        setLoaded(true);
      };
      img.onerror = () => {
        console.log(`[SafeImage] Image failed to load for ${entryId}, URL: ${current}`);
        if (current.includes('cdn.discordapp.com') && entryId && !refreshAttempted && !isRefreshing) {
          refreshDiscordImage(current);
        } else {
          setCurrent(fallbackSrc);
          setLoaded(true);
        }
      };
    }
  }, [current, entryId, refreshAttempted, fallbackSrc, isRefreshing, refreshDiscordImage, priority]);

  const handleImageError = React.useCallback(() => {
    if (current !== fallbackSrc) {
      setCurrent(fallbackSrc);
    }
  }, [current, fallbackSrc]);

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={current}
      alt={alt}
      className={`${className} ${loaded ? 'opacity-100' : 'opacity-75'} transition-opacity duration-200`}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      onLoad={() => setLoaded(true)}
      onError={handleImageError}
    />
  );
}
