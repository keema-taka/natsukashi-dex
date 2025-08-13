/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{ts,tsx,js,jsx}",
    "./components/**/*.{ts,tsx,js,jsx}",
    "./pages/**/*.{ts,tsx,js,jsx}",
  ],
  theme: {
    extend: {
      colors: {
        popeye: {
          green: "#2f7d32",  // POPEYEっぽい濃いグリーン
          light: "#e8f5e9",
          cream: "#fffaf0",
        },
      },
      fontFamily: {
        // 日本語をドット文字に
        dot: ['"DotGothic16"', "ui-sans-serif", "system-ui", "sans-serif"],
        // 英数/UI 用（必要な箇所に .font-sans を付けて上書き）
        sans: ['"Pixelify Sans"', "ui-sans-serif", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [
    require('@tailwindcss/line-clamp'), // ← これを追加
  ],
};
