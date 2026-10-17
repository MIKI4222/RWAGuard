/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: { 950: "#080D18", 900: "#0B1220", 800: "#111B2D", 700: "#162238" },
        fg: { DEFAULT: "#F3F6FC", mute: "#94A3B8" },
        cyan: { brand: "#53D8E8" }, ok: "#45D6A1", warn: "#F5B942", crit: "#FF647C",
      },
      fontFamily: { sans: ["Inter", "ui-sans-serif", "system-ui", "Segoe UI", "sans-serif"], mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"] },
    },
  },
  plugins: [],
};
