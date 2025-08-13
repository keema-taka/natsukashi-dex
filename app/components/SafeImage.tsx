// app/components/SafeImage.tsx
"use client";
import React from "react";

export default function SafeImage({
  src,
  alt,
  className,
  fallbackSrc,
}: {
  src?: string | null;
  alt: string;
  className?: string;
  fallbackSrc: string;
}) {
  const initial =
    src && src.trim() !== "" ? src : fallbackSrc;
  const [current, setCurrent] = React.useState(initial);

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={current}
      alt={alt}
      className={className}
      onError={() => {
        if (current !== fallbackSrc) setCurrent(fallbackSrc);
      }}
    />
  );
}
