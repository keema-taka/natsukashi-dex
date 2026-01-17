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
          yellow: "#EEFF00", // POPEYE Yellow (brighter!)
          red: "#FF4444",    // POPEYE Red
          blue: "#0068b7",   // POPEYE Blue
          sky: "#00c5ff",    // POPEYE Sky Blue
          green: "#2f7d32",  // Retro Green
          cream: "#ffffd6",  // Warm Cream Background
          dark: "#1a1a1a",   // Text Black
          orange: "#FF8C00", // Accent Orange
          pink: "#FF69B4",   // Accent Pink
          mint: "#98FF98",   // Accent Mint
        },
      },
      fontFamily: {
        dot: ['"DotGothic16"', "ui-sans-serif", "system-ui", "sans-serif"],
        sans: ['"M PLUS Rounded 1c"', '"Pixelify Sans"', "ui-sans-serif", "system-ui", "sans-serif"],
      },
      borderRadius: {
        '4xl': '2rem',
        '5xl': '2.5rem',
      },
      borderWidth: {
        '3': '3px',
      },
      boxShadow: {
        'pop': '6px 6px 0 0 #1a1a1a',
        'pop-hover': '10px 10px 0 0 #1a1a1a',
        'pop-sm': '3px 3px 0 0 #1a1a1a',
        'pop-xs': '2px 2px 0 0 #1a1a1a',
      },
      animation: {
        'bounce-slow': 'bounce 3s infinite',
        'pulse-slow': 'pulse 3s infinite',
        'wiggle': 'wiggle 1s ease-in-out infinite',
        'float': 'float 3s ease-in-out infinite',
      },
      keyframes: {
        wiggle: {
          '0%, 100%': { transform: 'rotate(-3deg)' },
          '50%': { transform: 'rotate(3deg)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
      },
    },
  },
  plugins: [],
};
