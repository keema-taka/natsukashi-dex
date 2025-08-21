// app/components/SafeImage.tsx
"use client";
import React from "react";

export default function SafeImage({
  src,
  alt,
  className,
  fallbackSrc,
  priority = false,
}: {
  src?: string | null;
  alt: string;
  className?: string;
  fallbackSrc: string;
  priority?: boolean;
}) {
  const initial =
    src && src.trim() !== "" ? src : fallbackSrc;
  const [current, setCurrent] = React.useState(initial);
  const [loaded, setLoaded] = React.useState(false);

  // 優先度の高い画像はプリロード
  React.useEffect(() => {
    if (priority && src && src.trim() !== "") {
      const img = new Image();
      img.src = src;
      img.onload = () => setLoaded(true);
    }
  }, [src, priority]);

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
        if (current !== fallbackSrc) setCurrent(fallbackSrc);
      }}
    />
  );
}
