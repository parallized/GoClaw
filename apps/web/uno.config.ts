import { defineConfig, presetIcons, presetUno, presetTypography } from "unocss";

export default defineConfig({
  presets: [presetUno(), presetIcons(), presetTypography()],
  theme: {
    colors: {
      primary: "var(--color-primary)",
      secondary: "var(--color-secondary)",
      tertiary: "var(--color-tertiary)",
      "base-bg": "var(--color-base-bg)",
      surface: "var(--color-surface)",
      "surface-hover": "var(--color-surface-hover)",
      "surface-gray": "var(--color-surface-gray)",
      "accent-blue": "var(--color-accent-blue)",
      "accent-orange": "var(--color-accent-orange)",
      "accent-green": "var(--color-accent-green)",
      "accent-pink": "var(--color-accent-pink)",
      "accent-indigo": "var(--color-accent-indigo)",
      edge: "var(--color-edge)",
      "edge-light": "var(--color-edge-light)",
      "error-bg": "var(--color-error-bg)",
      "error-border": "var(--color-error-border)",
      "error-text": "var(--color-error-text)",
    },
    fontFamily: {
      sans: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, "PingFang SC", "Microsoft YaHei", Arial, sans-serif',
      serif: 'Lyon-Text, Georgia, ui-serif, "Nimbus Roman No9 L", "Songti SC", "Noto Serif SC", "Source Han Serif SC", "Source Han Serif CN", STSong, "AR PL New Sung", "AR PL UMing CN", SimSun, "WenQuanYi Bitmap Song", "AR PL UKai CN", serif',
      display: "Lyon-Text, Georgia, serif",
    },
  },
  shortcuts: [
    // Glass surfaces
    ["n-glass", "bg-surface backdrop-blur-[40px] border border-white/[0.03]"],
    // Form inputs
    [
      "n-input",
      "w-full rounded border border-white/5 bg-surface-gray text-primary px-3 py-2 text-sm outline-none transition-all duration-200 placeholder:text-tertiary focus:border-accent-blue focus:bg-[var(--color-base-bg)]",
    ],
    // Toggle buttons
    ["n-toggle", "rounded border border-edge cursor-pointer transition-all duration-200"],
    ["n-toggle--active", "border-accent-indigo/60"],
    // Tags (color variants)
    ["n-tag", "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold border border-solid border-edge opacity-60 transition-all"],
    // Buttons
    [
      "n-btn-primary",
      "bg-primary text-base-bg px-8 py-3 text-sm font-bold uppercase tracking-[0.2em] rounded-xl transition-all duration-300 hover:bg-primary/85 active:scale-95 cursor-pointer border-0 shadow-lg shadow-black/20",
    ],
    [
      "n-btn-ghost",
      "bg-surface/30 hover:bg-surface/60 border border-white/5 px-8 py-3 text-sm font-bold text-primary transition-all uppercase tracking-[0.2em] shadow-sm hover:shadow-md cursor-pointer rounded-xl backdrop-blur-md",
    ],
    // Section headers
    ["n-section-label", "text-sm font-bold uppercase tracking-widest text-primary flex items-center gap-2"],
    // Card layout
    [
      "n-card",
      "bg-surface-gray rounded-2xl p-8 border border-edge",
    ],
    // Execution stage indicator
    ["n-stage-dot", "w-2 h-2 rounded-full shrink-0"],
    ["n-stage-dot--pending", "bg-tertiary/40"],
    ["n-stage-dot--running", "bg-accent-indigo animate-pulse"],
    ["n-stage-dot--completed", "bg-accent-green"],
    ["n-stage-dot--failed", "bg-error-text"],
    ["n-stage-dot--skipped", "bg-tertiary/40"],
  ],
  rules: [
    // Animate fade-in
    ["animate-fade-in", { animation: "fadeIn 0.4s ease forwards" }],
    ["animate-slide-up", { animation: "slideUp 0.5s cubic-bezier(0.19,1,0.22,1) forwards" }],
  ],
  preflights: [
    {
      getCSS: () => `
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `,
    },
  ],
});
