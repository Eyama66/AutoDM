/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "#0a0908", // 深玄色
        surface: "#1c1917", // 墨岩色
        primary: "#a3845b", // 羊皮金
        secondary: "#78350f", // 琥珀棕
        accent: "#991b1b", // 朱砂红
        parchment: {
          50: "#fdfbf7",
          100: "#f2ece2",
          200: "#e5d9c5",
          300: "#d1c0a2",
          400: "#b8a07c",
          500: "#a3845b",
          600: "#8c6d4a",
          700: "#755a3f",
          800: "#614a36",
          900: "#503d2e",
        },
      },
      fontFamily: {
        serif: ['"Crimson Pro"', "Noto Serif SC", "serif"],
        sans: ['"Inter"', "Noto Sans SC", "sans-serif"],
      },
      backgroundImage: {
        "paper-texture":
          "url('https://www.transparenttextures.com/patterns/p6.png')",
      },
    },
  },
  plugins: [],
};
