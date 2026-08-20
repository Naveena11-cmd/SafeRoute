/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        // Mirrors the CSS vars already used in theme.css (--safe/--medium/--risk)
        // so Tailwind utility classes and the existing plain-CSS classes agree.
        safe: "#1f9d55",
        medium: "#d97706",
        risk: "#dc2626",
      },
    },
  },
  plugins: [],
}


