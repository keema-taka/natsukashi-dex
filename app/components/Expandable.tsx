"use client";
import React from "react";

type Props = {
  children: React.ReactNode;
  /** 折りたたみ時の最大行数 */
  lines?: number;
  /** 何文字を超えたらボタンを表示するか（以下ならボタン非表示 & 常に全文） */
  threshold?: number;
  className?: string;
};

export default function Expandable({
  children,
  lines = 2,
  threshold = 50,
  className = "",
}: Props) {
  const text =
    typeof children === "string"
      ? children
      : // 子が文字列以外でも、簡易的にテキストに寄せる
        React.Children.toArray(children).join("");

  const needsClamp = text.length > threshold;
  const [open, setOpen] = React.useState(!needsClamp);

  const clampStyle: React.CSSProperties = open
    ? {}
    : {
        display: "-webkit-box",
        WebkitBoxOrient: "vertical",
        WebkitLineClamp: String(lines) as unknown as number,
        overflow: "hidden",
      };

  return (
  <div className={className} role="group" aria-expanded={open}>
    <div style={clampStyle}>{children}</div>
    {needsClamp && (
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mt-1 text-[#2f7d32] hover:underline text-sm font-medium"
      >
        {open ? "閉じる" : "さらに表示"}
      </button>
    )}
  </div>
);
}
