import { defineConfig, presetIcons, presetUno, presetTypography } from "unocss";

export default defineConfig({
  presets: [presetUno(), presetIcons(), presetTypography()],
  theme: {
    colors: {
      primary: "var(--color-primary)",
      secondary: "var(--color-secondary)",
      tertiary: "var(--color-tertiary)",
      "accent-blue": "var(--color-accent-blue)",
      "accent-orange": "var(--color-accent-orange)",
      "accent-green": "var(--color-accent-green)",
      "accent-pink": "var(--color-accent-pink)",
      "accent-indigo": "var(--color-accent-indigo)",
      surface: "var(--color-surface)",
      "surface-hover": "var(--color-surface-hover)",
      "surface-gray": "var(--color-surface-gray)",
      edge: "var(--color-edge)",
      "edge-light": "var(--color-edge-light)",
      "error-bg": "var(--color-error-bg)",
      "error-border": "var(--color-error-border)",
      "error-text": "var(--color-error-text)",
    },
    fontFamily: {
      sans: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, "PingFang SC", "Microsoft YaHei", Arial, sans-serif',
      serif: 'Lyon-Text, Georgia, ui-serif, "Nimbus Roman No9 L", "Songti SC", "Noto Serif SC", "Source Han Serif SC", "Source Han Serif CN", STSong, "AR PL New Sung", "AR PL UMing CN", SimSun, "WenQuanYi Bitmap Song", "AR PL UKai CN", serif',
      display: 'Lyon-Text, Georgia, serif',
    },
  },
});
