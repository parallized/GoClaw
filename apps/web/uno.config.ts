import { defineConfig, presetIcons, presetUno, presetTypography } from "unocss";

export default defineConfig({
  presets: [presetUno(), presetIcons(), presetTypography()],
  theme: {
    colors: {
      primary: "var(--notion-text)",
      secondary: "var(--notion-text-secondary)",
      tertiary: "var(--notion-text-tertiary)",
      "accent-blue": "var(--notion-accent-blue)",
      "accent-orange": "var(--notion-accent-orange)",
      "accent-green": "var(--notion-accent-green)",
      "accent-pink": "var(--notion-accent-pink)",
      surface: "var(--notion-bg)",
      "surface-hover": "var(--notion-bg-hover)",
      "surface-gray": "var(--notion-bg-gray)",
      edge: "var(--notion-border)",
      "edge-light": "var(--notion-border-light)",
      "error-bg": "var(--notion-error-bg)",
      "error-border": "var(--notion-error-border)",
      "error-text": "var(--notion-error-text)",
    },
    fontFamily: {
      serif: '"Noto Serif SC", "Source Han Serif SC", "Songti SC", Georgia, "Times New Roman", serif',
    },
  },
});
