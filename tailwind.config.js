/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./public/**/*.html",
    "./src/**/*.{js,jsx,ts,tsx,html}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          bg: "var(--bg-primary)",
          text: "var(--text-primary)",
        },
        secondary: {
          bg: "var(--bg-secondary)",
          text: "var(--text-secondary)",
        },
        border: "var(--border)",
        accent: {
          DEFAULT: "var(--accent)",
          hover: "var(--accent-hover)",
        },
      },
      ringColor: {
        accent: "var(--accent)",
      },
    },
  },
  plugins: [],
};
