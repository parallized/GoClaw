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
      "tag-blue-bg": "var(--color-tag-blue-bg)",
      "tag-blue-text": "var(--color-tag-blue-text)",
      "tag-orange-bg": "var(--color-tag-orange-bg)",
      "tag-orange-text": "var(--color-tag-orange-text)",
      "tag-green-bg": "var(--color-tag-green-bg)",
      "tag-green-text": "var(--color-tag-green-text)",
      "tag-pink-bg": "var(--color-tag-pink-bg)",
      "tag-pink-text": "var(--color-tag-pink-text)",
      "tag-gray-bg": "var(--color-tag-gray-bg)",
      "tag-gray-text": "var(--color-tag-gray-text)",
      "tag-indigo-bg": "var(--color-tag-indigo-bg)",
      "tag-indigo-text": "var(--color-tag-indigo-text)",
      "tag-cyan-bg": "var(--color-tag-cyan-bg)",
      "tag-cyan-text": "var(--color-tag-cyan-text)",
      "tag-teal-bg": "var(--color-tag-teal-bg)",
      "tag-teal-text": "var(--color-tag-teal-text)",
      "tag-amber-bg": "var(--color-tag-amber-bg)",
      "tag-amber-text": "var(--color-tag-amber-text)",
      "tag-purple-bg": "var(--color-tag-purple-bg)",
      "tag-purple-text": "var(--color-tag-purple-text)",
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
    ["n-tag", "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold border border-transparent"],
    ["n-tag--blue", "bg-tag-blue-bg text-tag-blue-text"],
    ["n-tag--orange", "bg-tag-orange-bg text-tag-orange-text"],
    ["n-tag--green", "bg-tag-green-bg text-tag-green-text"],
    ["n-tag--pink", "bg-tag-pink-bg text-tag-pink-text"],
    ["n-tag--gray", "bg-tag-gray-bg text-tag-gray-text"],
    ["n-tag--indigo", "bg-tag-indigo-bg text-tag-indigo-text"],
    ["n-tag--cyan", "bg-tag-cyan-bg text-tag-cyan-text"],
    ["n-tag--teal", "bg-tag-teal-bg text-tag-teal-text"],
    ["n-tag--amber", "bg-tag-amber-bg text-tag-amber-text"],
    ["n-tag--purple", "bg-tag-purple-bg text-tag-purple-text"],
    // Buttons
    [
      "n-btn-primary",
      "bg-primary text-[var(--color-base-bg)] px-8 py-3 text-sm font-bold uppercase tracking-[0.15em] rounded-xl transition-all duration-200 hover:opacity-90 active:scale-95 cursor-pointer border-0 shadow-sm",
    ],
    [
      "n-btn-ghost",
      "bg-surface/50 hover:bg-surface border border-white/10 px-8 py-3 text-sm font-bold text-primary transition-all uppercase tracking-[0.2em] shadow-sm hover:shadow-md cursor-pointer rounded-lg",
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
