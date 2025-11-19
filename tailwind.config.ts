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
          yellow: "#FFF500", // POPEYE Yellow
          red: "#FF4444",    // POPEYE Red
          blue: "#4488FF",   // POPEYE Blue
          green: "#2f7d32",  // Existing Green (keep for retro feel)
          cream: "#FFFAFA",  // Background Cream
          dark: "#1a1a1a",   // Text Black
        },
      },
      fontFamily: {
        // 日本語をドット文字に (Retro)
        dot: ['"DotGothic16"', "ui-sans-serif", "system-ui", "sans-serif"],
        // 英数/UI 用 (Pop & Bold)
        sans: ['"M PLUS Rounded 1c"', '"Pixelify Sans"', "ui-sans-serif", "system-ui", "sans-serif"],
      },
      borderRadius: {
        '4xl': '2rem',
        '5xl': '2.5rem',
      },
      boxShadow: {
        'pop': '4px 4px 0 0 #1a1a1a',
        'pop-hover': '6px 6px 0 0 #1a1a1a',
        'pop-sm': '2px 2px 0 0 #1a1a1a',
      }
    },
  },
  plugins: [],
};
