import type { Config } from "tailwindcss";

// ============================================================
// Tailwind lê os tokens do design system (globals.css).
// NÃO defina cores aqui — mude as variáveis CSS e o app
// inteiro acompanha. `<alpha-value>` preserva bg-primary/20 etc.
// ============================================================
const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "rgb(var(--color-bg) / <alpha-value>)",
        surface: "rgb(var(--color-surface) / <alpha-value>)",
        "surface-2": "rgb(var(--color-surface-2) / <alpha-value>)",
        line: "rgb(var(--color-border) / <alpha-value>)",
        primary: "rgb(var(--color-primary) / <alpha-value>)",
        "primary-hover": "rgb(var(--color-primary-hover) / <alpha-value>)",
        secondary: "rgb(var(--color-secondary) / <alpha-value>)",
        content: "rgb(var(--color-text) / <alpha-value>)",
        muted: "rgb(var(--color-text-muted) / <alpha-value>)",
        subtle: "rgb(var(--color-text-subtle) / <alpha-value>)",
        success: "rgb(var(--color-success) / <alpha-value>)",
        error: "rgb(var(--color-error) / <alpha-value>)",
        warning: "rgb(var(--color-warning) / <alpha-value>)",
      },
      fontSize: {
        display: ["var(--text-display)", { lineHeight: "1.25", fontWeight: "700" }],
        title: ["var(--text-title)", { lineHeight: "1.35", fontWeight: "600" }],
        body: ["var(--text-body)", { lineHeight: "1.55" }],
        caption: ["var(--text-caption)", { lineHeight: "1.4", fontWeight: "500" }],
        micro: ["var(--text-micro)", { lineHeight: "1.3", fontWeight: "600" }],
      },
      borderRadius: {
        card: "var(--radius-card)",
        control: "var(--radius-control)",
      },
      boxShadow: {
        card: "var(--shadow-card)",
        modal: "var(--shadow-modal)",
        glow: "var(--glow-primary)",
      },
      transitionTimingFunction: {
        out: "var(--ease-out)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "sans-serif"],
        title: ["var(--font-title)", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
